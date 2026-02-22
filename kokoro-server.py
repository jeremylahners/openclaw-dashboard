#!/usr/bin/env python3
"""OpenClaw Kokoro TTS Server — local neural TTS on port 8880.

Streams audio chunk-by-chunk (3-5 word phrases) so first audio arrives in
~100ms instead of waiting for the full sentence to generate.

Install:
  python3.12 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile fastapi uvicorn

Run:
  .venv/bin/python kokoro-server.py
"""

import io
import re
import struct
import numpy as np
import soundfile as sf
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro

app = FastAPI(title="OpenClaw Kokoro TTS")

# Load model once at startup
print("[Kokoro] Loading model...")
kokoro = Kokoro("kokoro-v1.0.fp16.onnx", "voices-v1.0.bin")
# Warm-up pass so first real request isn't slow
try:
    kokoro.create("ready", voice="af_heart", speed=1.0, lang="en-us")
    print("[Kokoro] Model loaded and warmed up, ready to serve.")
except Exception as e:
    print(f"[Kokoro] Warm-up failed (non-fatal): {e}")


class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str
    voice: str = "af_heart"
    response_format: str = "wav"
    speed: float = 1.0


def split_into_chunks(text: str, max_words: int = 4) -> list[str]:
    """Split text into small chunks for low-latency streaming synthesis.

    Splits on natural pause points (commas, dashes, conjunctions) first,
    then by word count. Chunks of 3-5 words synthesize in ~80-150ms each.
    """
    # First split on strong pause markers
    parts = re.split(r'(?<=[,;:\-—])\s+', text.strip())
    chunks = []
    for part in parts:
        words = part.split()
        # Sub-split long parts by word count
        for i in range(0, len(words), max_words):
            chunk = ' '.join(words[i:i + max_words]).strip()
            if chunk:
                chunks.append(chunk)
    return chunks or [text.strip()]


def wav_header(sample_rate: int, num_channels: int = 1, bits: int = 16) -> bytes:
    """Write a streaming WAV header with 0xFFFFFFFF size (open-ended stream).
    Most browsers handle this correctly and start playing immediately.
    """
    byte_rate = sample_rate * num_channels * bits // 8
    block_align = num_channels * bits // 8
    # RIFF chunk — 0xFFFFFFFF means unknown/streaming length
    header = struct.pack('<4sI4s', b'RIFF', 0xFFFFFFFF, b'WAVE')
    # fmt  chunk
    header += struct.pack('<4sIHHIIHH',
        b'fmt ', 16,          # chunk size
        1,                    # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits
    )
    # data chunk — 0xFFFFFFFF = streaming
    header += struct.pack('<4sI', b'data', 0xFFFFFFFF)
    return header


def samples_to_pcm16(samples: np.ndarray) -> bytes:
    """Convert float32 numpy samples to 16-bit PCM bytes."""
    pcm = np.clip(samples, -1.0, 1.0)
    return (pcm * 32767).astype(np.int16).tobytes()


def stream_speech(text: str, voice: str, speed: float):
    """Generator: synthesize in small chunks and yield PCM data progressively."""
    chunks = split_into_chunks(text)
    sample_rate = None

    for i, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        try:
            samples, sr = kokoro.create(chunk, voice=voice, speed=speed, lang="en-us")
            if sample_rate is None:
                sample_rate = sr
                yield wav_header(sr)
            yield samples_to_pcm16(samples)
        except Exception as e:
            print(f"[Kokoro] Chunk synthesis failed ({chunk!r}): {e}")
            continue

    if sample_rate is None:
        # Nothing was synthesized — emit silence header to avoid hanging client
        yield wav_header(24000)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/audio/speech")
async def audio_speech(req: SpeechRequest):
    text = req.input.strip()
    if not text:
        return JSONResponse({"error": "input required"}, status_code=400)

    voice = req.voice or "af_heart"
    speed = max(0.5, min(2.0, req.speed))

    return StreamingResponse(
        stream_speech(text, voice, speed),
        media_type="audio/wav",
        headers={
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
            "X-TTS-Engine": "kokoro-local",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8880, log_level="warning")
