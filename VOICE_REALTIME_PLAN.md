# Real-Time Voice Conversation System — Architecture & Implementation Plan

**Authors:** Eli (Chief Architect) + Marcus (Dev Manager)  
**Date:** Feb 23, 2026  
**Status:** PLAN — Ready for review  
**Priority:** P0 — Current voice UX is broken for conversation

---

## Executive Summary

Jeremy's voice experience is broken: Whisper transcription is fast, but waiting minutes for audio responses back makes voice mode unusable. After analyzing every layer of the stack, we've identified the bottlenecks and designed a phased fix that goes from "usable today" to "feels like talking to someone."

---

## Current Architecture & Latency Breakdown

### The Full Voice Round-Trip (Current)

```
[Speak] → [VAD detects silence] → [MediaRecorder stop] → [Upload WebM]
   0ms        ~500-1500ms              ~100ms               ~50ms

→ [Whisper transcribe] → [POST /chat/isla/send] → [Gateway chat.send]
      ~200-400ms              ~50ms                    ~100ms

→ [OpenClaw Gateway routes to Isla session] → [Isla's LLM inference starts]
              ~200-500ms (session wake)              ~2-15s TTFT*

→ [stream_delta fires] → [extractSentences waits for complete sentence]
      ~immediate                    ~500-2000ms more tokens

→ [/voice/speak?text=sentence] → [Kokoro TTS synthesize] → [Audio plays]
         ~50ms                      ~650-1300ms TTFB           ~immediate
```

**\*TTFT = Time To First Token** — this is model-dependent:
- Haiku 4.5: ~1-3s TTFT (fast, but context window loading adds overhead)
- Opus 4.5/4.6: ~5-15s TTFT (much slower, used for subagent tasks)

### Where the Minutes Go

| Stage | Latency | Fixable? |
|-------|---------|----------|
| VAD silence detection | 500-1500ms | ✅ Tune thresholds |
| Whisper transcription | 200-400ms | ✅ Already fast |
| Gateway routing + session wake | 200-500ms | ⚠️ Partially |
| **LLM TTFT (cold session)** | **3-15s** | **🔴 Primary bottleneck** |
| Sentence accumulation | 500-2000ms | ✅ Send partial sentences |
| **Kokoro TTS TTFB** | **650-1300ms** | **🔴 Secondary bottleneck** |
| Audio playback start | ~50ms | ✅ Already fast |

**Total realistic round-trip: 5-20+ seconds** (not minutes, but feels like minutes when you're waiting in silence)

The "minutes" Jeremy experiences likely comes from:
1. **Session cold-start**: If Isla's session is idle, Gateway needs to initialize it
2. **Large context window**: Isla has 200K context, workspace files loaded — every turn re-processes this
3. **Kokoro TTS blocking**: 650ms-1.3s TTFB per sentence chunk means first audio is delayed
4. **Sentence boundary wait**: `extractSentences()` waits for punctuation — first sentence might be 20+ words

---

## Architecture Plan: Three Phases

### Phase 1: Quick Wins (Today — No Infra Changes) 
**Target: 3-5s round-trip → "Usable"**

#### 1A. Reduce VAD Silence Duration
Currently the silence threshold that triggers end-of-utterance is likely too conservative.

```javascript
// Current: hasSpeech && (Date.now() - lastSoundTime) > SILENCE_DURATION
// SILENCE_DURATION should be ~800ms for voice mode (shorter = snappier)
```

**Change:** Add a voice-mode-specific silence duration of 800ms (vs the current default).

#### 1B. Stream TTS from First Clause, Not First Sentence
The current `extractSentences()` requires a period/!/? followed by a capital letter. This means a response like "Sure, I can help with that. Let me check..." won't trigger TTS until after "that." is fully streamed.

**Change:** Add clause-level extraction — split on commas, semicolons, em-dashes, colons for voice mode. Queue 5-8 word chunks for TTS instead of full sentences.

```javascript
// New: extractClausesForVoice(text) — splits on natural pause points
// "Sure, I can help with that" → ["Sure,", "I can help with that"]
// Queue the first clause for TTS as soon as it's complete (6+ words OR punctuation)
```

#### 1C. Kokoro Chunk-Level Streaming Fix
Kokoro's `split_into_chunks()` already splits into 3-5 word phrases, but the TTFB is still 650ms because the first chunk synthesis takes time.

**Benchmark finding:** Kokoro TTFB = 650ms for "Sure thing!" (4 words). This is the ONNX model load overhead per request.

**Fix:** Keep the Kokoro ONNX session warm by sending periodic heartbeat syntheses (silent/empty). More importantly, reduce the text sent per TTS request — shorter text = faster synthesis.

#### 1D. Pre-flight TTS Connection
Currently each `/voice/speak` request is independent. For streaming voice, open a persistent connection and pipeline chunks.

**Change in gateway-api.js:** Add a WebSocket-based TTS endpoint that accepts text chunks and streams audio back continuously, avoiding per-request HTTP overhead.

---

### Phase 2: Streaming Pipeline (This Week)
**Target: 1-3s round-trip → "Responsive"**

#### 2A. WebSocket Voice Channel

Replace the current HTTP request/response flow with a dedicated WebSocket channel for voice:

```
Browser                    gateway-api.js                OpenClaw Gateway
  │                              │                              │
  │──── WS: voice.start ────────>│                              │
  │                              │──── chat.subscribe ─────────>│
  │                              │                              │
  │──── WS: audio_chunk ────────>│                              │
  │      (streaming webm)        │──── whisper transcribe ─────>│
  │                              │                              │
  │                              │──── chat.send ──────────────>│
  │                              │                              │
  │                              │<──── stream_delta ───────────│
  │                              │                              │
  │<──── WS: tts_audio ─────────│──── Kokoro TTS ─────────────>│
  │      (streaming PCM/WAV)     │     (sentence chunk)         │
  │                              │                              │
  │<──── WS: tts_audio ─────────│<─── more stream_delta ───────│
  │      (next sentence)         │                              │
```

**Benefits:**
- No HTTP request overhead per TTS chunk
- Audio can stream continuously (AudioContext + AudioWorklet)
- Barge-in detection happens in the same stream
- Eliminates the `<audio>` element play/load cycle per sentence

#### 2B. AudioWorklet Playback (Browser)

Replace the current `<audio>` element approach with Web Audio API's AudioWorklet:

```javascript
// Current: el.src = url; el.load(); el.play(); // per-sentence, creates new request each time
// New: AudioWorklet receives PCM chunks over WebSocket, plays them seamlessly
```

This eliminates:
- Per-sentence HTTP request latency
- Audio element load/play cycle (~50-100ms each)
- Gap between sentences

#### 2C. Parallel TTS + Streaming

Start TTS synthesis for the first clause while the LLM is still generating:

```
LLM tokens:  "Sure, | I can | help | with | that. | Let | me |..."
                 ↓
              Clause detected: "Sure, I can help with that."
                 ↓
              Kokoro synthesis starts (650ms)
                 ↓
LLM tokens:  "...check | your | schedule | right | now."
              Meanwhile audio for clause 1 is playing
```

The key insight: **LLM generation and TTS synthesis can overlap**. While the user hears clause 1, clause 2 is being synthesized, and clause 3 is being generated.

---

### Phase 3: Sub-Second (Next Sprint)
**Target: <1s perceived latency → "Natural Conversation"**

#### 3A. Warm Session Keepalive

Keep Isla's session warm with a lightweight ping every 30s when voice mode is active. This avoids the cold-start penalty.

```javascript
// When voice mode starts:
voiceKeepAlive = setInterval(() => {
  // Send lightweight keepalive to prevent session going cold
  gwRequest('session.ping', { sessionKey: agentSessions['isla'] });
}, 30000);
```

#### 3B. Voice-Optimized System Prompt

When voice mode is active, inject a voice-specific instruction:

```
[Voice Mode] Keep responses concise and conversational. 
Aim for 1-3 sentences. Don't use markdown, lists, or code blocks.
Speak naturally as in a phone conversation.
```

This dramatically reduces response length → faster TTFT, less TTS work.

#### 3C. Kokoro Batch Warm-Up Pipeline

Pre-warm the Kokoro model with a silent request when voice mode starts, so the first real TTS request doesn't pay the cold-start penalty.

#### 3D. Consider: Local LLM for Voice (Future)

For true sub-second latency, a local model (Llama 3.3 70B on MLX, or even 8B for quick replies) could provide <500ms TTFT. This would be a separate "voice fast-path" that handles simple queries locally while routing complex ones to Claude.

**Not recommended for Phase 1-2** — Haiku 4.5 is already fast enough if we fix the pipeline.

---

## Implementation Details (Marcus)

### Phase 1 Changes — Files to Modify

#### 1. `index.html` — Voice Mode Improvements

**1A. Faster silence detection:**
```javascript
// Add at top of voice mode section:
const SILENCE_DURATION_VOICE = 800;  // ms — faster cutoff for voice mode
const SILENCE_DURATION_DEFAULT = 1500; // ms — conservative for non-voice

// In startListening(), VAD loop:
const silenceDuration = voiceModeActive ? SILENCE_DURATION_VOICE : SILENCE_DURATION_DEFAULT;
if (hasSpeech && (Date.now() - lastSoundTime) > silenceDuration) {
```

**1B. Clause-level TTS triggering:**
```javascript
function extractClausesForVoice(text) {
  // Split on natural pause points: comma + space, semicolon, colon, em-dash
  // But only if the clause is at least 4 words
  const clauses = [];
  const re = /[^,;:\u2014\u2013]+[,;:\u2014\u2013]|[^,;:\u2014\u2013]+$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const clause = m[0].trim();
    if (clause.split(/\s+/).length >= 4) {
      clauses.push(clause);
    }
  }
  return clauses;
}

// In onStreamDeltaVoice(): use extractClausesForVoice instead of extractSentences
// when voiceModeActive
```

**1C. Voice-mode system prompt injection:**
```javascript
// In sendMessageText(), prepend voice hint:
const voiceHint = voiceModeActive 
  ? '[Voice conversation - keep response brief, conversational, no markdown] ' 
  : '';
await fetch(`${API_BASE}/chat/${currentAgentKey}/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: voiceHint + text })
});
```

#### 2. `gateway-api.js` — TTS Pipeline Improvements

**New endpoint: WebSocket voice stream (Phase 2):**
```javascript
// In the WS message handler, add voice channel:
if (msg.type === 'voice_subscribe') {
  client.voiceMode = true;
  client.voiceAgent = msg.agent;
}

// When stream_delta arrives and client.voiceMode:
// Instead of broadcasting text, synthesize TTS and send audio chunks
```

**Kokoro warm-up on voice start:**
```javascript
// When voice_subscribe received:
if (kokoroAvailable) {
  // Warm-up request to ensure model is hot
  http.request(KOKORO_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, () => {}).end(JSON.stringify({ 
    model: 'kokoro', input: '.', voice: 'af_heart', response_format: 'wav' 
  }));
}
```

#### 3. `kokoro-server.py` — Streaming Improvements

**Add WebSocket endpoint for persistent streaming:**
```python
from fastapi import WebSocket

@app.websocket("/ws/speech")
async def ws_speech(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_json()
        text = data.get("input", "").strip()
        voice = data.get("voice", "af_heart")
        if not text:
            continue
        # Stream PCM chunks for this text
        for chunk_pcm in stream_speech_pcm(text, voice, 1.0):
            await websocket.send_bytes(chunk_pcm)
        # Send end-of-utterance marker
        await websocket.send_json({"done": True})
```

---

## Priority Order

| # | Change | Impact | Effort | Phase |
|---|--------|--------|--------|-------|
| 1 | Voice-mode prompt injection ("keep it brief") | HIGH | 15 min | 1 |
| 2 | Clause-level TTS triggering | HIGH | 1 hr | 1 |
| 3 | Reduce VAD silence duration | MED | 15 min | 1 |
| 4 | Kokoro warm-up on voice start | MED | 30 min | 1 |
| 5 | WebSocket voice channel | HIGH | 4 hr | 2 |
| 6 | AudioWorklet playback | HIGH | 3 hr | 2 |
| 7 | Parallel TTS + streaming | HIGH | 2 hr | 2 |
| 8 | Session keepalive | MED | 1 hr | 3 |
| 9 | Local LLM fast-path | LOW | Days | 3+ |

---

## Expected Outcomes

| Phase | Round-Trip Latency | User Experience |
|-------|-------------------|-----------------|
| Current | 5-20+ seconds | "Broken" — waiting in silence |
| Phase 1 | 3-5 seconds | "Usable" — noticeable but tolerable delay |
| Phase 2 | 1-3 seconds | "Responsive" — feels like a slow phone call |
| Phase 3 | <1 second | "Natural" — conversational flow |

---

## Eli's Architecture Notes

The fundamental insight is that the current system is **request-response at every layer**: HTTP request for transcription, HTTP request for chat send, HTTP request for TTS. Each one adds overhead and prevents pipelining.

The fix isn't replacing components — Whisper, Haiku 4.5, and Kokoro are all individually fast enough. It's **eliminating the gaps between them** by streaming through the entire pipeline.

The WebSocket voice channel (Phase 2) is the architectural keystone. It turns the pipeline from:

```
[Discrete Request] → wait → [Discrete Request] → wait → [Discrete Request]
```

into:

```
[Continuous Audio Stream] → [Continuous Text Stream] → [Continuous Audio Stream]
```

This is the same pattern used by Google Duplex, GPT-4o voice, and every real-time voice system. The components are fine — the plumbing between them is what's broken.

---

## Marcus's Implementation Notes

Phase 1 can be shipped today — it's all frontend changes to `index.html` plus a minor gateway-api.js tweak. No infrastructure changes.

Phase 2 requires the WebSocket voice channel, which is a bigger change but builds on the existing WS infrastructure in gateway-api.js. The WebSocketServer is already there — we just need a new message type.

I'll start with items 1-4 (Phase 1) and have them ready for Jeremy to test within the hour.
