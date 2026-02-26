# Bug Log

## Bug #1: iPad Office Layout Squished
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** Medium  
**Device:** iPad PWA  
**Description:** Office space gets squished on iPad; agent avatars and panels overlap when viewport is wider but shorter.  
**Expected:** Office layout should maintain a fixed minimum size; components don't overlap.  
**Current:** Layout collapses/squishes, components stack/overlap.  
**Root Cause:** `.office` container has fixed `height: 600px` with absolutely positioned zones/agents. On iPad (esp. portrait/landscape changes), fixed container doesn't scale with viewport, causing overlaps.
**Code Location:** `/office/css/all-styles.css` lines 77-79  
**Suggested Fix:** Remove fixed height or make responsive; consider moving zones from absolute to responsive grid.  
**Status:** 🔴 Open | **Assigned:** Marcus

---

## Bug #2: Agent-to-Agent Communications Not Displayed  
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** High  
**Device:** PWA (all platforms)  
**Description:** Agent comms groups render as only a "thin line" instead of showing full message bubbles.  
**Expected:** Agent-to-agent messages display in collapsible `.agent-comms-group` containers.  
**Current:** Only thin border/line visible; header/body either hidden or missing.
**Root Cause:** **NEEDS INVESTIGATION** — CSS rules for `.agent-comms-group` exist and look correct. Either:
  - Messages don't have `isAgentMessage` flag set (JS issue)
  - CSS overflow/sizing is cutting off content
  - Elements exist but are invisible (display/height issue)
**Code Location:** 
  - JS: `/office/index.html` lines 2520-2560 (createCommsGroupEl)
  - CSS: `/office/css/all-styles.css` lines 1057-1165 (.agent-comms-group styles)
**Next Step:** Inspect live DOM to confirm comms groups exist and check their computed styles.  
**Status:** 🔴 Open | **Assigned:** Marcus | **Blocking:** YES

---

## Bug #3: Chat Auto-Scroll Jumping
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** Medium  
**Device:** PWA (all platforms)  
**Description:** Chat jumps to bottom repeatedly, overriding user's intentional scroll-up to read history.  
**Expected:** Chat only auto-scrolls when user is at bottom or when new message first arrives.  
**Current:** Chat jumps ~10+ times during streaming messages, even when user is actively reading above.
**Root Cause:** `updateStreaming()` calls `autoScroll()` on every text character (~100ms debounce). Flag `userHasScrolled` resets to false after each auto-scroll, allowing rapid successive scrolls.
**Code Location:** `/office/index.html` lines 2675-2700 (scroll logic), line 3020 (streaming calls)
**Fix Approach:** 
  - Don't reset `userHasScrolled` after auto-scroll, OR
  - Only auto-scroll on initial message arrival, not every stream update, OR
  - Increase debounce + threshold, OR
  - Require explicit user action to re-enable auto-scroll
**Status:** 🔴 Open | **Assigned:** Marcus

---

## Bug #4: Chat Messages Displayed Out of Order
**Reporter:** Jeremy | **Date:** 2026-02-25 15:20 EST | **Severity:** Critical 🚨  
**Device:** PWA & Desktop  
**Description:** Messages display out of order, especially during streaming. E.g., prompt shows correctly, response streams, then final response appears *before* the prompt. Hard refresh fixes it temporarily.
**Expected:** Messages always display in sequence order (oldest → newest).  
**Current:** Messages appear out of order; order changes between render cycles.
**Root Cause:** Race condition between `message_committed` (appends new message) and `sync_update`/`history_update` (full re-render from cache). 
  - `appendOrGroupMessage()` blindly appends without checking if message is in correct order
  - `message_committed` fires with one message; `sync_update` fires immediately after with full history
  - If sync arrives before append completes, or if append puts message in wrong DOM position, re-render shows out-of-order
  - Cache is sorted by `seq` but DOM might not match cache order if append bypasses sort
**Code Location:** 
  - `/office/index.html` line 2322-2365 (handleNewMessage → appendOrGroupMessage)
  - `/office/index.html` line 2646-2671 (appendOrGroupMessage)
  - `/office/index.html` line 2285-2310 (handleHistoryUpdate → renderAllMessages)
**Fix Approach:**
  - Option A: Before appending, check if message.seq > lastMessage.seq. If not, trigger full renderAllMessages instead
  - Option B: Always use full renderAllMessages for any cache update (safer but slower)
  - Option C: Use a message queue with ordered insertion (find correct position before appending)
**Status:** 🔴 Open | **Assigned:** Marcus | **Blocking:** YES — affects all agent conversations

---

## Summary
- **Total Open:** 4
- **Critical Severity:** 1 (Bug #4 — Out of order, affects all users)
- **High Severity:** 1 (Bug #2 — Comms not displaying)
- **Medium Severity:** 2 (Bugs #1, #3)
- **Blocking:** Bugs #2 & #4
- **Last Updated:** 2026-02-25 15:25 EST
