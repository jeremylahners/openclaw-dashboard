# Agent-to-Agent Message Bug - Fix Plan

## Problem Statement

When agents communicate via `sessions_send()`, messages don't appear in the Office dashboard chat UI.

## Root Cause Analysis

### Current Message Flow

**User → Agent:**
1. User sends message via `/chat/{agentKey}` endpoint
2. Backend stores in SQLite (`role: 'user'`, line 628)
3. Backend sends to Gateway via `chat.send`
4. Agent processes and responds
5. Gateway emits `chat` event (`state: 'final'`)
6. Backend stores response (`role: 'assistant'`, line 194)
7. Frontend displays both messages

**Agent → Agent (BROKEN):**
1. Agent A calls `sessions_send({ sessionKey: "agent:agentB:webchat:user", message: "..." })`
2. Gateway delivers to Agent B's session
3. Agent B processes and responds
4. ❌ **Agent A's message never stored** (no SQLite write)
5. Gateway emits `chat` event for Agent B's response
6. Backend stores Agent B's response (`role: 'assistant'`)
7. ❌ **Frontend only sees Agent B's response, not Agent A's message**

### Why It's Broken

The Office dashboard backend (`gateway-api.js`) only listens for `chat` events with `state: 'final'`, which are **agent responses**. It doesn't capture:
- Incoming messages TO agent sessions
- Who sent the message (all stored as `role: 'assistant'`)

## Proposed Solutions

### Option A: Gateway Event Subscription (PREFERRED)

**IF** the Gateway can emit events for incoming messages to subscribed sessions:

1. Subscribe to incoming message events for all agent sessions
2. Store incoming messages with `role: 'agent'` and `metadata: { sender: agentKey }`
3. Update frontend to display agent-to-agent messages with proper attribution

**Gateway API Addition Needed:**
```javascript
// Subscribe to incoming messages for agent sessions
gwRequest('subscribe.sessions', {
  sessionKeys: Object.values(agentSessions),
  events: ['message.incoming']
});

// Handle incoming message events
if (frame.type === 'event' && frame.event === 'message.incoming') {
  const { sessionKey, message, sender } = frame.payload;
  const targetAgent = sessionToAgent[sessionKey];
  const senderAgent = sessionToAgent[sender];
  
  // Store in SQLite
  chatDb.addMessage(targetAgent, 'agent', messageText, timestamp, null, {
    sender: senderAgent
  });
}
```

### Option B: Intercept at sessions_send Call (WORKAROUND)

If Gateway doesn't support incoming message events, intercept at the source:

1. When an agent calls `sessions_send` (detected in backend), store the message locally
2. Store with `role: 'agent'`, `metadata: { sender, target }`
3. Both sender and receiver see the message in their chat

**Implementation:**
```javascript
// In gateway-api.js, when handling sessions_send requests
// (currently line 946 - need to add storage before the call)

const targetAgent = sessionToAgent[sessionKey];
const senderAgent = getCurrentAgent(); // Need to track this

if (targetAgent && senderAgent) {
  // Store in both sender's and receiver's chat
  chatDb.addMessage(senderAgent, 'agent', message, Date.now(), null, {
    direction: 'sent',
    target: targetAgent
  });
  
  chatDb.addMessage(targetAgent, 'agent', message, Date.now(), null, {
    direction: 'received',
    sender: senderAgent
  });
}
```

### Option C: Poll sessions_history (INEFFICIENT)

Periodically poll `sessions_history` for each agent and sync missing messages. **NOT RECOMMENDED** - too slow, inefficient.

## Database Schema Changes

Add support for agent-to-agent messages:

```sql
-- messages.role can now be: 'user', 'assistant', 'agent'
-- messages.metadata (JSON) structure:
{
  "sender": "harper",      // For role='agent', who sent it
  "target": "marcus",      // For role='agent', who received it
  "direction": "sent"      // or "received"
}
```

## Frontend Changes

Update `renderChatMessages()` in `index.html`:

```javascript
// Handle agent-to-agent messages
if (m.role === 'agent') {
  const metadata = JSON.parse(m.metadata || '{}');
  const senderAgent = metadata.sender;
  const senderEmoji = agents[senderAgent]?.emoji || '🤖';
  const senderName = metadata.sender.charAt(0).toUpperCase() + metadata.sender.slice(1);
  
  // Show sender attribution for agent messages
  return `
    <div class="message-bubble them">
      <div class="bubble-avatar bot">${senderEmoji}</div>
      <div class="bubble-content">
        <div class="bubble-sender">${senderName}</div>
        <div class="bubble-text">${formatMarkdown(m.content)}</div>
        <div class="bubble-time">${m.timestampFormatted}</div>
      </div>
    </div>
  `;
}
```

## Implementation Steps

1. **Investigate Gateway capabilities** (ASK HARPER):
   - Does Gateway emit `message.incoming` events?
   - Can we subscribe to incoming messages for specific sessions?
   - Is there existing event data we're missing?

2. **Choose solution based on Gateway capabilities:**
   - If events available → Option A
   - If not → Option B (workaround)

3. **Update database schema** (already flexible - metadata is JSON)

4. **Implement backend storage**:
   - Add incoming message handling
   - Store with `role: 'agent'` and sender metadata

5. **Update frontend**:
   - Handle `role: 'agent'` messages
   - Show sender attribution (emoji + name)
   - Add visual distinction (e.g., different bubble color)

6. **Test**:
   - Harper sends to Marcus via `sessions_send`
   - Verify message appears in both Harper's and Marcus's chat
   - Verify sender attribution is correct
   - Verify responses still work

## Questions for Harper

1. ✅ Does the Gateway emit events when messages are sent to agent sessions? **YES - via `chat.subscribe`**
2. ✅ What event type/payload structure? **`event:"chat"` with state/message/sessionKey**
3. ✅ Can we subscribe to specific session events as an operator? **YES - `chat.subscribe({ sessionKey })`**
4. ✅ Is there existing functionality we're not using? **YES - we're not calling `chat.subscribe`**

## Gateway Investigation Results (2026-02-14 21:00 EST)

**✅ SOLUTION FOUND - NO GATEWAY MODIFICATIONS NEEDED**

The OpenClaw Gateway already supports chat subscriptions via `chat.subscribe` method:
- **Method:** `chat.subscribe({ sessionKey })`
- **Event:** `event:"chat"` (push updates for subscribed sessions)
- **Documentation:** `/opt/homebrew/lib/node_modules/openclaw/docs/platforms/android.md`

**Current gap:** Office dashboard connects to Gateway but never calls `chat.subscribe`, so it only receives events for messages it sends itself.

**Fix:** Call `chat.subscribe` for all agent sessions after connect, then capture incoming `role:"user"` messages in `handleGatewayChatEvent`.

See `GATEWAY_CAPABILITIES.md` for full investigation details.

## Status

- [x] Root cause identified
- [x] Solutions proposed
- [x] Gateway capabilities confirmed ✅ `chat.subscribe` exists
- [x] Solution chosen → **Option A (Gateway events)**
- [ ] Backend implementation (estimated 1 hour)
- [ ] Frontend implementation (no changes needed)
- [ ] Testing

---

*Created: 2026-02-14 20:30 EST*  
*Author: Marcus*
