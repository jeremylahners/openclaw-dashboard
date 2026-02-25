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

## Summary
- **Total Open:** 3
- **High Severity:** 1 (Bug #2)
- **Medium Severity:** 2 (Bugs #1, #3)
- **Blocking:** Bug #2 (agent comms) needs investigation before fix can proceed
- **Last Updated:** 2026-02-24 23:56 EST
