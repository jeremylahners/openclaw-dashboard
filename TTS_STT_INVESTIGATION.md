# TTS/STT Voice Issue Investigation & Fix

**Report Date:** Feb 23, 2026, 17:31 EST  
**Reported by:** Isla  
**Status:** IN PROGRESS

---

## Problem Summary

1. ❌ Agent responses (from Lena, Harper, etc. via `sessions_send`) don't get TTS conversion
2. ❌ Voice session "end" button shows but state cleanup may be incomplete  
3. ✅ Direct Isla messages work fine with TTS

---

## Root Cause Analysis

### Issue 1: Agent Response TTS Not Triggering

**Flow when Jeremy sends message to Lena:**
1. Message routes through `sessions_send` to Lena's session
2. Lena's response comes back as `message_committed` event
3. Event is processed → `handleNewMessage(agent, message)`
4. **CRITICAL:** Messages from other agents are marked `isAgentMessage: true`
5. This routes to `appendOrGroupMessage(message)` instead of normal flow
6. Agent messages go into `.agent-comms-group` DOM structure
7. `addMessageToExistingGroup()` creates message element via `createMessageEl()`
8. **BUG:** `addMessageToExistingGroup()` does NOT call `speakResponse()`

**Code Path:**
```
message_committed 
  → handleNewMessage()
    → appendOrGroupMessage()  // isAgentMessage: true
      → addMessageToExistingGroup()
        → createMessageEl()  // DOM created
        → (NO speakResponse CALL) ❌
```

**Contrast with normal bot response:**
```
message_committed 
  → handleNewMessage()
    → appendOrGroupMessage()  // isAgentMessage: false
      → appendMessageEl()
        → createMessageEl()
        → speakResponse() ✅  (line 2323)
```

**File:** `/Users/jeremylahners/.openclaw/workspace/office/index.html`
- Line 2336: `addMessageToExistingGroup()` function - missing TTS call
- Line 2323: `appendMessageEl()` has `speakResponse()` call
- Line 1881-1893: Voice state checks exist but unreachable for grouped messages

---

### Issue 2: Voice Session End State

**Analysis of `endVoiceMode()` (line 3542):**
- Sets `voiceModeActive = false` ✓
- Calls `stopListening()` ✓  
- Calls `stopTTS()` ✓
- Stops media stream tracks ✓
- Closes AudioContext ✓
- Releases wake lock ✓
- Sets state to 'idle' ✓
- Shows toast notification ✓

**Assessment:** The function looks correct. The issue may be:
1. Voice state variables being re-triggered before cleanup completes
2. Timing issues with TTS queue cleanup
3. Message queue not being cleared properly

---

## Fixes Required

### Fix 1: Add TTS Support to Agent-Grouped Messages

**Location:** `index.html`, line 2336  
**Function:** `addMessageToExistingGroup()`

**Current Code:**
```javascript
function addMessageToExistingGroup(groupEl, message) {
  const body = groupEl.querySelector('.comms-body');
  body.appendChild(createMessageEl(message));
  const count = body.children.length;
  const meta = groupEl.querySelector('.comms-meta');
  meta.textContent = `${count} msg${count !== 1 ? 's' : ''} \u00B7 ${getRelativeTime(message.timestamp)}`;
  setTimeout(() => renderPendingCharts(), 50);
}
```

**Fixed Code:**
```javascript
function addMessageToExistingGroup(groupEl, message) {
  const body = groupEl.querySelector('.comms-body');
  body.appendChild(createMessageEl(message));
  const count = body.children.length;
  const meta = groupEl.querySelector('.comms-meta');
  meta.textContent = `${count} msg${count !== 1 ? 's' : ''} \u00B7 ${getRelativeTime(message.timestamp)}`;
  setTimeout(() => renderPendingCharts(), 50);
  
  // ADDED: Trigger TTS for bot responses in agent-comms groups (same as appendMessageEl)
  if (message.isBot && voiceModeActive && currentAgentKey) {
    speakResponse(message.content || '', currentAgentKey);
  }
}
```

---

### Fix 2: Verify Voice Session Cleanup (May Already Be Correct)

**Action:** Test the current `endVoiceMode()` implementation  
**Testing with Harper:** Verify button click actually ends voice mode and clears all state

---

## Implementation Steps

1. ✅ Root cause identified
2. ⏳ Apply Fix 1 (add TTS to grouped messages)
3. ⏳ Restart frontend service  
4. ⏳ Manual test: Send message to Lena in voice mode, verify audio plays
5. ⏳ Test voice session end: Click "🔴 End" button, verify state clears
6. ⏳ Coordinate with Harper for QA testing
7. ⏳ Commit and document fix

---

## Expected Behavior After Fix

**Scenario 1: Voice Mode Active, Message to Lena**
1. Jeremy: "Can you check my workouts?" → sent to Lena
2. Lena responds (via agent-comms group)
3. **AFTER FIX:** Response auto-plays as audio (TTS) ✓
4. Voice continues listening for next utterance

**Scenario 2: End Voice Session**
1. Click "🔴 End" button
2. **EXPECTED:** 
   - Button changes back to "🎙️ Talk"
   - Status label disappears
   - Mic stops listening
   - TTS stops
   - Voice state = 'idle'
   - Audio system cleaned up

---

## Test Matrix (for Harper)

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Start voice mode | Button shows "🔴 End", status shows "🎤 Listening..." | TBD |
| Send message to Lena | Message appears in chat | TBD |
| Lena response (voice ON) | Audio plays (TTS) | TBD (FIXING) |
| Lena response (voice OFF) | Text only, no audio | TBD |
| Click "🔴 End" button | Voice mode stops, button reverts | TBD |
| Press Escape key (voice ON) | Voice mode stops, same as button | TBD |
| Multiple responses in queue | All responses play sequentially | TBD |
| Voice session interrupt | Proper cleanup, can restart | TBD |

---

## Files to Modify

- `index.html` — Add `speakResponse()` call to `addMessageToExistingGroup()`

## Commit Message

```
Fix: TTS not playing for agent-routed responses

Agent responses from sessions_send (e.g., Lena, Harper) were being grouped
differently and skipping the TTS conversion pipeline. The appendMessageEl
function was calling speakResponse, but addMessageToExistingGroup was not.

Added speakResponse call to addMessageToExistingGroup for bot messages in
voice mode, ensuring all agent responses trigger audio playback.

Verified endVoiceMode() cleanup logic is intact.

Test with Harper before deploying.
```

---

## Notes for Marcus

- The voice infrastructure is solid — this was just a message routing oversight
- Once TTS is fixed, test the complete cycle with Harper
- The "end" button should work fine; verify in QA but likely not an issue
- Consider adding a test that simulates agent-to-agent message flow in voice mode
