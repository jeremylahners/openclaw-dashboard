# Office Dashboard - Known Bugs

## Critical Issues

### Bug #1: Agent-to-Agent Messages Not Visible in Chat UI
**Reported**: 2026-02-14 20:23 EST  
**Reporter**: Jeremy  
**Severity**: High  
**Status**: Open

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

**Investigation Status (Marcus, 2026-02-14 20:30 EST):**
- ✅ Root cause identified: Incoming agent messages not stored in SQLite
- ✅ Current flow only handles agent responses (`role: 'assistant'`)
- ✅ Three solution options documented in `AGENT_TO_AGENT_FIX.md`
- ⏳ Waiting on Harper: Does Gateway emit incoming message events?
- ⏳ Need to choose solution based on Gateway capabilities

**Next Steps:**
1. Confirm Gateway event capabilities with Harper
2. Choose solution (Option A or B)
3. Implement backend storage for agent-to-agent messages
4. Update frontend to display with sender attribution

---

## Other Known Issues

*(Add additional bugs below as discovered)*
