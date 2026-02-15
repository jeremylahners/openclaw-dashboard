# Office Dashboard - Known Bugs

## Critical Issues

### Bug #1: Agent-to-Agent Messages Not Visible in Chat UI ✅ FIXED
**Reported**: 2026-02-14 20:23 EST  
**Reporter**: Jeremy  
**Severity**: High  
**Status**: ✅ RESOLVED (2026-02-14 20:50 EST)

**Description:**
When agents communicate via `sessions_send()`, the messages don't appear in the Office dashboard chat interface. This makes agent-to-agent communication invisible to users.

**Steps to Reproduce:**
1. Harper sends message to Marcus via `sessions_send({ sessionKey: "...", message: "..." })`
2. Marcus receives and responds
3. Open Harper's chat with Marcus in Office dashboard
4. Messages are missing - chat appears empty

**Expected Behavior:**
- Agent-to-agent messages should appear in both sender and receiver chat panels
- Messages should show proper sender attribution (agent emoji/name)
- Should integrate seamlessly with existing chat UI

**Current Workaround:**
Use `sessions_history()` to manually check agent communication

**Technical Details:**
- `sessions_send` messages go through Gateway backend
- Office dashboard chat currently only shows webchat channel messages
- Need to route agent-to-agent messages to webchat display
- Backend: `gateway-api.js` WebSocket handler
- Frontend: `index.html` chat message rendering

**Assigned To:** Marcus (backend routing) + Dash (frontend display)

**Priority:** High - affects core agent collaboration workflow

**Solution Implemented (Marcus, 2026-02-14 21:45 EST):**
- ✅ Polling solution: Poll `chat.history` every 3 seconds for all agents
- ✅ Detect new incoming messages (`role='user'`) by timestamp tracking
- ✅ Store in SQLite chat.db and broadcast to dashboard clients
- ✅ No Gateway modifications needed
- ✅ Tested and confirmed working by Jeremy

**Testing Results (Harper + Jeremy, 2026-02-14 20:50 EST):**
- ✅ Harper sent test messages via `sessions_send`
- ✅ Messages detected within 3 seconds
- ✅ Messages stored in database correctly
- ✅ Messages appear in Office dashboard UI
- ✅ Two-way visibility confirmed (sender and receiver both see messages)

**Performance:**
- Polling overhead: 4 req/sec to Gateway (12 agents × 3s interval)
- Message latency: < 3 seconds
- Minimal impact on Gateway

**Commits:**
- `256fcf2` - Bug analysis and documentation
- `39ef252` - Gateway capabilities investigation
- `d844ab5` - Working polling solution
- `c115ff6` - Implementation status documentation

---

## Other Known Issues

### Bug #2: Streaming Message Cleanup Issue
**Reported**: 2026-02-14 20:50 EST  
**Reporter**: Jeremy  
**Severity**: Low  
**Status**: Open

**Description:**
Partial streaming messages sometimes remain visible in chat after the final message has been committed. The streaming message element doesn't get properly removed/replaced.

**Example:**
In Marcus's chat, this partial message is stuck:
> "Perfect! Found it. The Gateway does support chat event subscriptions via chat.subscribe. Let me update my analysis"

The final committed message should have replaced it, but the streaming element remained.

**Root Cause:**
Likely an issue with `clearStreamingEl()` logic in the frontend or streaming state cleanup when final messages arrive.

**Investigation Needed:**
1. Check `clearStreamingEl()` function in `index.html`
2. Verify streaming elements are removed when `state='final'` event arrives
3. Check streaming state management per agent
4. Ensure DOM cleanup happens before final message render

**Assigned To:** Dash (frontend streaming) + Marcus (if backend involved)

**Priority:** Low - cosmetic issue, doesn't affect functionality

---
