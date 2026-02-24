# TTS/STT Voice Issue Investigation & Fix

**Report Date:** Feb 23, 2026, 17:31 EST  
**Fixed by:** Marcus (Dev Manager)  
**Status:** ✅ FIXED — Awaiting QA validation

---

## Problem Summary

1. ❌→✅ Agent responses (from Lena, Harper, etc. via `sessions_send`) don't get TTS conversion
2. ❌→✅ Voice session "end" button — stale streaming state not cleaned up on restart
3. ✅ Direct Isla messages work fine with TTS (was already working)

---

## Root Cause Analysis

### Issue 1: Agent Response TTS Not Triggering

**Flow when Jeremy sends message to Lena:**
1. Message routes through `sessions_send` to Lena's session
2. Lena's response comes back as `message_committed` event (or `stream_delta`/`stream_final`)
3. For **streaming responses**: `onStreamDeltaVoice` fires only when `msg.agent === currentAgentKey` — this works correctly since all responses go through Isla's session
4. For **non-streaming responses**: `message_committed` → `handleNewMessage()` → `appendOrGroupMessage()`
5. Agent messages (`isBot: false, isAgentMessage: true`) route to `addMessageToExistingGroup()`
6. Bot responses following agent comms also route to `addMessageToExistingGroup()`
7. **BUG:** `addMessageToExistingGroup()` did NOT call `speakResponse()` — only `appendMessageEl()` did

**Fix:** Added `speakResponse()` call to `addMessageToExistingGroup()` for bot messages in voice mode (line 2346-2348).

### Issue 2: Voice Session End — Stale Streaming State

**Analysis of `endVoiceMode()`:**
- Core cleanup was correct: stops listening, stops TTS, closes AudioContext, releases wake lock, resets UI
- **BUG:** Did NOT clear `ttsStreamCursor` (Map) or `ttsStreamComplete` (Set)
- **Impact:** If voice mode was ended during a streaming response, stale cursor/completion data could cause:
  - Next voice session starting from wrong cursor position
  - First response after restart being incorrectly skipped by `speakResponse()`

**Fix:** Added `ttsStreamCursor.clear()` and `ttsStreamComplete.clear()` to `endVoiceMode()` (line 3558-3559).

---

## Changes Made

### File: `index.html`

**Change 1 — `addMessageToExistingGroup()` (line ~2346):**
```javascript
// ADDED: TTS for agent-routed responses (when in voice mode)
if (message.isBot && voiceModeActive && currentAgentKey) {
  speakResponse(message.content || '', currentAgentKey);
}
```

**Change 2 — `endVoiceMode()` (line ~3558):**
```javascript
// ADDED: Clear streaming TTS state to prevent stale cursors on restart
ttsStreamCursor.clear();
ttsStreamComplete.clear();
```

---

## How It Works Now

### Scenario 1: Voice Mode Active, Message to Agent (via routing)
1. Jeremy says "Can you check my workouts?" → sent to agent session
2. **Streaming path:** `stream_delta` fires → `onStreamDeltaVoice` queues sentences → TTS plays them ✅
3. **Committed path:** `message_committed` → `appendOrGroupMessage` → `addMessageToExistingGroup` → `speakResponse` ✅
4. `speakResponse` checks `ttsStreamComplete` to avoid double-play with streaming ✅

### Scenario 2: End Voice Session
1. Click "🔴 End" button (or press Escape)
2. `voiceModeActive = false` — all callbacks stop immediately
3. `stopListening()` — clears VAD timer, stops MediaRecorder
4. `stopTTS()` — clears queue, pauses audio element
5. Media stream tracks stopped, AudioContext closed
6. **NEW:** `ttsStreamCursor.clear()` + `ttsStreamComplete.clear()` — clean slate for next session
7. Wake lock released, UI reset to idle state

---

## Deployment Notes

- `index.html` served with `Cache-Control: no-cache, no-store, must-revalidate`
- **No server restart required** — browser page refresh picks up changes
- Voice infrastructure (Kokoro TTS on :8880, Whisper-server on :8090) unaffected

---

## Test Matrix (for Harper QA)

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Start voice mode | Button shows "🔴 End", status shows "🎤 Listening..." | TBD |
| Send message to Isla (voice ON) | Audio plays (streaming TTS) | TBD |
| Agent-routed response (voice ON) | Audio plays (TTS via addMessageToExistingGroup) | TBD |
| Agent-routed response (voice OFF) | Text only, no audio | TBD |
| Click "🔴 End" button | Voice mode stops, button reverts, state fully cleared | TBD |
| Press Escape key (voice ON) | Voice mode stops, same as button | TBD |
| End during active TTS | TTS stops immediately, no stale state | TBD |
| Restart voice after ending mid-stream | New session starts clean, no cursor artifacts | TBD |
| Multiple responses in queue | All responses play sequentially | TBD |

---

## Commit Summary

```
fix: TTS not playing for agent-routed responses + stale voice state on restart

1. addMessageToExistingGroup() now calls speakResponse() for bot messages
   in voice mode, ensuring agent-routed responses trigger TTS playback.

2. endVoiceMode() now clears ttsStreamCursor and ttsStreamComplete maps,
   preventing stale streaming state from affecting subsequent voice sessions.
```
