#!/usr/bin/env python3
"""OpenClaw Kokoro TTS Server — local neural TTS on port 8880.

Provides an OpenAI-compatible /audio/speech endpoint using kokoro-onnx.
Eliminates edge-tts subprocess startup cost (~300ms saved per sentence).

Install:
  python3.12 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile fastapi uvicorn

Run:
  .venv/bin/python kokoro-server.py
"""

import io
import soundfile as sf
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro

app = FastAPI(title="OpenClaw Kokoro TTS")

# Load model once at startup (downloads ~350MB on first run)
print("[Kokoro] Loading model...")
kokoro = Kokoro("kokoro-v0_19.onnx", "voices.bin")
print("[Kokoro] Model loaded, ready to serve.")


class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str
    voice: str = "af_heart"
    response_format: str = "wav"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/audio/speech")
async def audio_speech(req: SpeechRequest):
    samples, sample_rate = kokoro.create(
        req.input, voice=req.voice, speed=1.0, lang="en-us"
    )
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8880)
