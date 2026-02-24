# Voice Phase 3 — Implementation Status

## Phase 3A ✅ COMPLETE
- Session keepalive (30s ping) — prevents cold-start penalty
- Barge-in detection — interrupt TTS when user speaks
- Server-side streaming TTS — gapless WebSocket audio

## Phase 3B — Filler Audio ✅ COMPLETE
- Pre-generated WAV clips: "Hmm...", "Let me think...", "One moment...", "Sure..."
- Stored in `/office/audio/fillers/`
- Play instantly when LLM thinking starts (sub-100ms feedback)
- Auto-stop when actual response audio begins
- Uses Web Audio API for instant playback (no network latency)

## Phase 3C — Smart Routing ✅ COMPLETE
- Regex classifier in gateway-api.js `/chat/:agent/send` endpoint
- Intercepts voice-mode messages before they hit Claude
- Handles:
  - Greetings ("hi", "hello", "hey") → instant friendly response
  - Gratitude ("thanks", "thank you") → instant acknowledgment
  - Farewells ("bye", "goodbye") → instant farewell
  - Time queries ("what time is it") → actual time
  - Date queries ("what day is it") → actual date
  - Simple math ("2+2", "5 times 3") → calculated result
- Response time: <200ms (no LLM latency)
- Falls through to Claude for anything complex

## Phase 3D — Local LLM Fast-Path (DEFERRED)
**Status:** Requires environment setup — not installed yet.

**What's needed:**
1. Install MLX: `pip3 install mlx mlx-lm`
2. Download Llama 3.2 3B: `mlx_lm.convert --hf-path meta-llama/Llama-3.2-3B-Instruct`
3. ~2GB disk space for model weights
4. Integration: Add `/api/voice/fast-llm` endpoint in gateway-api.js
5. Client routing: Extend smart router to classify "conversational but complex" queries

**Expected benefit:** <500ms response for simple conversational queries (vs 2-3s for Claude)
**Recommendation:** Test Phases 3B+3C first. If latency is already satisfactory, 3D may not be needed.

## Architecture

```
User speaks → VAD detects end-of-utterance
  → Whisper STT (local, ~200ms)
  → Smart Router check (Phase 3C, <5ms)
    → Match? → Instant response + TTS → Done (<200ms total)
    → No match? → Play filler audio (Phase 3B, <10ms)
                → Send to Claude via Gateway
                → Stream response → Streaming TTS → Stop filler
                → Total: ~1.5-3s (but user hears filler immediately)
```

## Service Management
- Gateway: `launchctl stop/start ai.openclaw.gateway`
- Office backend: `com.openclaw.office-backend`
- Whisper server: `com.openclaw.whisper-server`
- Kokoro TTS: `com.openclaw.kokoro-server`
