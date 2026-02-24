# Phase 3: Sub-Second Voice Latency — Implementation Plan

**Author:** Dev Team Lead (Opus review)  
**Date:** Feb 23, 2026  
**Status:** PLANNED — Pending Phase 2 completion  
**Target:** <1s perceived latency

---

## Prerequisites
- Phase 2 WebSocket TTS pipeline must be shipped and validated
- Harper's QA report confirms 1-3s latency achieved

---

## 3A. Session Keepalive During Voice Mode

**Problem:** When Isla's session goes cold (no messages for 60s+), the Gateway needs to re-initialize it. This adds 200-500ms to the first response.

**Solution:** Send a lightweight session ping every 30s while voice mode is active.

### Implementation

**File: `index.html`**

```javascript
// In startVoiceMode():
voiceKeepAlive = setInterval(() => {
  if (chatWs && chatWs.readyState === 1) {
    chatWs.send(JSON.stringify({ 
      type: 'voice_keepalive', 
      agent: currentAgentKey 
    }));
  }
}, 30000);

// In endVoiceMode():
if (voiceKeepAlive) { clearInterval(voiceKeepAlive); voiceKeepAlive = null; }
```

**File: `gateway-api.js`**

```javascript
// In WS message handler:
if (msg.type === 'voice_keepalive' && msg.agent) {
  // Send a lightweight ping to keep the agent session warm
  gwRequest('session.ping', { sessionKey: agentSessions[msg.agent] })
    .catch(() => {}); // Fire and forget
}
```

**Effort:** 30 minutes  
**Impact:** Eliminates 200-500ms cold-start on subsequent voice turns

---

## 3B. Optimistic Audio Feedback (Filler Phrases)

**Problem:** Even with all optimizations, LLM TTFT is 1-3s for Haiku. The user sits in silence during this time.

**Solution:** When a voice utterance is submitted, immediately play a brief acknowledgment sound or filler TTS while the LLM generates the real response.

### Approach: Pre-generated Audio Fillers

Pre-synthesize 3-4 short filler phrases via Kokoro at startup:
- "Hmm..." 
- "Let me think..."
- "Sure..."
- "One moment..."

Store as base64 data URIs in the client. Play a random one immediately on voice submission, then crossfade to the real response.

### Implementation

```javascript
// Pre-generate on voice mode start
const FILLER_PHRASES = ['Hmm...', 'Let me think...', 'Sure...'];
let fillerBuffers = []; // AudioBuffer[]

async function pregenFillers() {
  for (const phrase of FILLER_PHRASES) {
    const resp = await fetch(`/api/voice/speak?agent=${currentAgentKey}&text=${encodeURIComponent(phrase)}`);
    const ab = await resp.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(ab);
    fillerBuffers.push(buffer);
  }
}

// On voice submit, play random filler
function playFiller() {
  if (!fillerBuffers.length) return;
  const buf = fillerBuffers[Math.floor(Math.random() * fillerBuffers.length)];
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start();
  // Will be interrupted when real TTS arrives
}
```

**Effort:** 1-2 hours  
**Impact:** Perceived latency drops to ~200ms (filler plays immediately)  
**Risk:** Filler might sound awkward if real response contradicts it. Mitigate by using neutral fillers.

---

## 3C. Smart Response Routing (Future)

**Problem:** Claude Haiku still takes 1-3s TTFT even with warm sessions. Simple queries don't need a full LLM.

**Solution:** Route simple voice queries to a local model for instant responses.

### Query Classification

```
Simple (route to local):
- Greetings: "Hey Isla", "Good morning"
- Acknowledgments: "Thanks", "Got it", "OK"
- Time/date: "What time is it?"
- Yes/no confirmations

Complex (route to Claude):
- Anything involving workspace knowledge
- Multi-step tasks
- Code or technical questions
- Anything > 10 words
```

### Local Model Options

1. **MLX + Llama 3.2 3B** — Runs on Apple Silicon, ~200ms TTFT for short responses
2. **Ollama + Mistral 7B** — Already potentially available, ~500ms TTFT
3. **Rule-based** — For greetings/acknowledgments, no LLM needed at all

### Recommended: Hybrid Approach

```
Voice input → Classifier (regex + word count)
  ├── Simple greeting → Canned response (0ms TTFT)
  ├── Simple query → Local LLM (200ms TTFT)  
  └── Complex query → Claude Haiku (1-3s TTFT)
```

**Effort:** 2-3 days for full implementation  
**Impact:** <500ms for 40% of voice interactions  
**Risk:** Misclassification could send complex queries to a weak model

---

## 3D. WebSocket Audio Input Streaming (Future)

**Problem:** Currently we record the full utterance, then upload the WebM blob for Whisper transcription. This adds ~200-400ms after VAD detects end-of-utterance.

**Solution:** Stream audio chunks over WebSocket to the server continuously during recording. Server runs incremental Whisper as audio arrives. When VAD fires, transcription is already partially complete.

This is architecturally complex and depends on whisper-server supporting incremental input. **Deferred to Phase 4.**

---

## Priority Order

| # | Feature | Impact | Effort | Priority |
|---|---------|--------|--------|----------|
| 1 | Session Keepalive | -200-500ms | 30 min | P0 |
| 2 | Optimistic Fillers | -1-2s perceived | 1-2 hr | P1 |
| 3 | Smart Routing (regex) | -1-3s for simple | 4 hr | P2 |
| 4 | Local LLM | -1-3s for moderate | 2-3 days | P3 |
| 5 | Audio streaming | -200-400ms | Days | P4 |

---

## Success Criteria

- Session keepalive: No cold-start penalty on 2nd+ voice turn
- Optimistic fillers: Audio feedback within 200ms of speaking
- Overall: <1s perceived latency for simple queries, <2s for complex
- Jeremy confirms it "feels like a conversation"
