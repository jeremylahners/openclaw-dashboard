# Office Dashboard — QA Checklist (Feb 25, 2026)

**All 4 bugs are code-complete.** Ready for manual testing on real devices.

---

## Bug #3: Chat auto-scroll jumping ✅ DEPLOYED
**Status:** Fix in place (commit 1429fc3), awaiting manual verification  
**Commit:** `1429fc3`

### Test Steps:
1. Open dashboard chat on desktop
2. Click an agent (e.g., "lena")
3. Send a message to the agent (e.g., "hello")
4. **While agent is responding:** Scroll up in the chat to read history
5. **Expected:** Chat should stay where you scrolled (no auto-jump to bottom)
6. **After response completes:** Scroll to bottom manually
7. **Expected:** Future messages auto-scroll to show newest messages

### Acceptance:
- [ ] Chat doesn't jump while you're manually scrolling
- [ ] Auto-scroll still works when at bottom after response ends
- [ ] No console errors

---

## Bug #4: Messages out of order ✅ DEPLOYED
**Status:** Fix in place (commit 5527817), awaiting verification  
**Commit:** `5527817`

### Test Steps:
1. Open dashboard with multiple agents
2. Send 5+ rapid messages to 2+ agents simultaneously
3. Watch chat history for each agent
4. **Expected:** Messages always appear in correct time order

### Acceptance:
- [ ] Messages never appear out of sequence
- [ ] Seq numbers in DOM match storage order
- [ ] No console errors

---

## Bug #2: Agent-to-agent comms not displaying ⚠️ NEEDS TESTING
**Status:** Fix in place (commit dcf711a), awaiting verification  
**Commit:** `dcf711a` (latest)

### Root Cause:
- Messages from `sessions_send()` included metadata `{ source: 'agent', ... }`
- Gateway fetch endpoints hardcoded `metadata: null`
- Without metadata, UI couldn't set `isAgentMessage: true` flag
- **Fix:** All 3 fetch endpoints now retrieve metadata from messageStore

### Test Steps:
1. Open dashboard on any device
2. Look at chat history for any agent
3. **Identify agent-to-agent messages** (e.g., messages from "marcus" or "eli" to "lena")
4. **Expected:** Agent messages group together with light background/badge indicating "Agent to Agent"
5. **Expected:** Agent message content displays in the chat UI

### Acceptance:
- [ ] Agent-to-agent messages display with visual grouping
- [ ] Agent messages have metadata preserved
- [ ] No "undefined" or missing content in agent messages
- [ ] No console errors

---

## Bug #1: iPad office layout squished ⚠️ NEEDS TESTING
**Status:** Fix in place (commit dcf711a), awaiting verification on iPad  
**Commit:** `dcf711a` (latest)

### Root Cause:
- `.office` container had `min-height: 500px` on iPad
- Absolute-positioned zones (desks, conference, kitchen, finance, adventure, isla-desk) stacked vertically
- Container wasn't tall enough for all zones without overlap

### Test Steps:
1. **On an iPad (landscape or portrait):**
2. Navigate to dashboard office view
3. **Expected:** All 6 zones visible without overlap:
   - "Desks" (top-left)
   - "Conference" (below desks)
   - "Kitchen" (top-right)
   - "Finance" (middle-right)
   - "Adventure" (bottom-right)
   - "Isla Desk" (bottom-center)

### Acceptance:
- [ ] All zones visible on iPad portrait
- [ ] All zones visible on iPad landscape
- [ ] No zones overlap or squish
- [ ] Zones are readable (text not cut off)
- [ ] No horizontal scroll needed

---

## Deployment
- **Branch:** `main`
- **Live at:** http://localhost:3001
- **Last commit:** `dcf711a` (Feb 25, 21:44 EST)

---

## Notes for Tester
- Use real devices (iPad, iPhone) for layout tests
- Use multiple browsers on desktop (Chrome, Safari, Firefox)
- Screenshot before/after if possible
- Report any console errors with context
- If a bug still exists, note reproduction steps and any error messages
