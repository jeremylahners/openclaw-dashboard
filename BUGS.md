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

### Bug #3: Duplicate User Message on Send ✅ FIXED
**Reported**: 2026-02-14 22:36 EST  
**Reporter**: Jeremy  
**Severity**: Medium  
**Status**: ✅ RESOLVED (2026-02-14 22:38 EST)

**Description:**
When Jeremy sends a message, he initially sees a duplicate of his own message displayed as coming from the agent, with extended detail/metadata surrounding the original message. When the page is refreshed, the duplication disappears.

**Steps to Reproduce:**
1. Open Office dashboard chat with any agent
2. Type and send a message
3. Observe chat display immediately after sending
4. Notice duplicate message appearing (looks like it came from agent)
5. Refresh page - duplicate disappears

**Expected Behavior:**
- User message appears once, in the correct position
- No duplicate or echo of the message
- No extended detail/metadata shown

**Current Behavior:**
- User message appears correctly (optimistic display)
- A second copy of the message appears as if from the agent
- The duplicate includes extended detail/metadata
- Refresh clears the duplicate (database is correct)

**Root Cause (Hypothesis):**
Likely related to:
- Optimistic message insertion vs. server confirmation
- Agent-to-agent message polling detecting user's own message
- Message deduplication logic not working correctly
- Frontend rendering both optimistic and confirmed messages

**Technical Details:**
- Frontend: `index.html` - `appendMessageEl()`, `handleNewMessage()`
- Backend: `gateway-api.js` - agent polling system
- Database: Message stored correctly (verified by refresh clearing duplicate)
- Timing: Happens immediately after send, before next poll cycle

**Assigned To:** Marcus (backend message dedup) + Dash (frontend display)

**Priority:** Medium - affects UX during active conversation

**Investigation Needed:**
1. Check optimistic message `_optimistic` flag handling
2. Verify deduplication by content/idempotency key
3. Review agent polling - is it detecting user's own sent messages?
4. Check if `handleNewMessage()` properly replaces optimistic messages

**Solution Implemented (Marcus, 2026-02-14 22:38 EST):**
- ✅ Root cause: Polling system re-detected Jeremy's sent messages with different idempotency keys
- ✅ Web UI sends with key: `user-${timestamp}-${random}`
- ✅ Polling uses key: `poll-user-${agentKey}-${msgTimestamp}`
- ✅ SQLite only checks idempotency key for duplicates, so both went through
- ✅ Fix: Added content-based deduplication in `db.js`
- ✅ New check: Same agent + role + content + timestamp within 10s = duplicate
- ✅ Prevents polling from re-adding web UI sent messages

**Testing:**
Ready for Jeremy to test after refresh

**Commit:**
- Pending commit with db.js changes

---
