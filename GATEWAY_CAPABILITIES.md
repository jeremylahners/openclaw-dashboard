# OpenClaw Gateway Capabilities Investigation

**Date:** 2026-02-14  
**Investigator:** Marcus  
**Constraint:** No Gateway code modifications allowed

## Question

Does the Gateway support subscribing to incoming messages for agent sessions?

## Answer: ✅ YES

**Method:** `chat.subscribe`  
**Event:** `event:"chat"` (push updates for subscribed sessions)

## Documentation Sources

1. `/opt/homebrew/lib/node_modules/openclaw/docs/platforms/android.md`:
   ```
   Push updates (best-effort): `chat.subscribe` → `event:"chat"`
   ```

2. `/opt/homebrew/lib/node_modules/openclaw/docs/gateway/bridge-protocol.md`:
   ```
   - `event`: node signals (voice transcript, agent request, chat subscribe, exec lifecycle)
   - `event`: chat updates for subscribed sessions
   ```

## Current Implementation Gap

The Office dashboard (`gateway-api.js`) currently:
- ✅ Calls `chat.send` to send messages
- ✅ Listens for `event:"chat"` events (agent responses)
- ❌ **Does NOT call `chat.subscribe`** to register for chat updates

**Result:** Only receives chat events for messages sent via its own WebSocket connection, missing messages sent by other clients (e.g., `sessions_send` from other agents).

## Solution: Call chat.subscribe

### Implementation

```javascript
// In gateway-api.js, after successful connect:

// Subscribe to all agent chat sessions
for (const [agentKey, sessionKey] of Object.entries(agentSessions)) {
  gwRequest('chat.subscribe', { sessionKey })
    .then(() => console.log(`[GW] Subscribed to chat for ${agentKey}`))
    .catch(err => console.error(`[GW] Failed to subscribe to ${agentKey}:`, err));
}
```

### Expected Behavior

After subscribing, the Gateway will push `event:"chat"` frames for **all** messages to subscribed sessions, including:
- User messages (currently captured via `chat.send` response)
- Agent responses (currently captured)
- **Agent-to-agent messages** (currently missing) ← THIS FIXES THE BUG

## Event Payload Structure

Based on existing `handleGatewayChatEvent` implementation:

```javascript
{
  type: "event",
  event: "chat",
  payload: {
    sessionKey: "agent:marcus:webchat:user",
    state: "delta" | "final" | "error",
    message: { role, content, timestamp, ... },
    // ... other fields
  }
}
```

**Key field:** `payload.message.role`
- `"user"` = incoming message to agent
- `"assistant"` = agent response
- Both should be captured and stored

## Required Changes

### 1. Backend (gateway-api.js)

**A. Subscribe to chat sessions on connect:**

```javascript
// After gwSocket 'open' and successful connect response
for (const sessionKey of Object.values(agentSessions)) {
  gwRequest('chat.subscribe', { sessionKey });
}
```

**B. Update handleGatewayChatEvent to capture incoming messages:**

```javascript
function handleGatewayChatEvent(payload) {
  const sessionKey = payload.sessionKey;
  const agent = sessionToAgent[sessionKey];
  if (!agent) return;

  // NEW: Handle incoming messages (role="user")
  if (payload.state === 'final' && payload.message) {
    const text = extractMessageText(payload.message);
    const role = payload.message.role;
    
    if (role === 'user' && text && !NOISE_REPLIES.test(text.trim())) {
      // Determine sender (if from another agent)
      const metadata = {};
      // TODO: Extract sender info from message if available
      
      const now = Date.now();
      const idempotencyKey = `gw-msg-${agent}-${now}-${Math.random().toString(36).slice(2)}`;
      
      chatDb.addMessage(agent, 'user', text, now, idempotencyKey, metadata);
      
      // Broadcast to connected clients
      const clientMsg = formatMessageForClient({
        seq: result.seq, agent, role: 'user', content: text, timestamp: now
      });
      broadcastMessage(agent, clientMsg);
    }
  }

  // EXISTING: Handle agent responses (role="assistant")
  // ... rest of existing code
}
```

### 2. Frontend (index.html)

**No changes required** - frontend already handles `role: 'user'` messages correctly.

### 3. Database Schema

**No changes required** - existing schema already supports `role: 'user'` and metadata JSON.

## Testing Plan

1. **Subscribe verification:**
   ```bash
   # Check Gateway logs after restart
   tail -f ~/.openclaw/logs/gateway.log | grep "subscribe"
   ```

2. **Agent-to-agent message test:**
   ```javascript
   // Harper sends to Marcus
   sessions_send({
     sessionKey: "agent:marcus:webchat:user",
     message: "Test message from Harper"
   });
   ```

3. **Verify in dashboard:**
   - Open Marcus's chat in Office dashboard
   - Message should appear with `role: 'user'`
   - Marcus's response should appear with `role: 'assistant'`
   - Both stored in SQLite `chat.db`

## Estimated Implementation Time

- Backend changes: 30 minutes
- Testing: 30 minutes
- **Total: 1 hour**

## Additional Considerations

### Message Attribution

Chat events may not include sender information for agent-to-agent messages. If `payload.message` doesn't identify the sender:

**Option A:** Parse from message metadata (if available)  
**Option B:** Store as generic `role: 'user'` for now, enhance later  
**Option C:** Request sender info via Gateway enhancement (not allowed per constraint)

**Recommendation:** Start with Option B (store as `role: 'user'`), verify functionality, then explore attribution if message structure supports it.

### Subscribe Lifecycle

- Call `chat.subscribe` once per session after initial connect
- Re-subscribe after WebSocket reconnection
- No need to unsubscribe (connection close handles cleanup)

### Performance

- `chat.subscribe` is lightweight (best-effort push)
- No polling needed
- Minimal latency for message delivery

## Conclusion

✅ **Gateway supports the required functionality via `chat.subscribe`**  
✅ **No Gateway code modifications needed**  
✅ **Implementation is straightforward (1 hour)**  
✅ **Fixes agent-to-agent message visibility bug**

## Next Steps

1. Implement `chat.subscribe` calls in `gateway-api.js`
2. Update `handleGatewayChatEvent` to capture incoming messages
3. Test with agent-to-agent `sessions_send` calls
4. Verify messages appear in Office dashboard
5. Document sender attribution approach (if applicable)

---

*Investigation complete: 2026-02-14 21:00 EST*
