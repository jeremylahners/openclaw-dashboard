# Bug Log

## Bug #1: iPad Office Layout Squished
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** Medium  
**Device:** iPad PWA  
**Description:** Office space gets squished on iPad; agent avatars and panels overlap when viewport is wider but shorter.  
**Expected:** Office layout should maintain a fixed minimum size; components don't overlap.  
**Current:** ~~Layout collapses/squishes, components stack/overlap.~~ FIXED  
**Fix Applied:** Added min-width: 750px and height: 600px to .office container  
**Status:** ✅ FIXED | **Assigned:** Marcus | **Commit:** 8a4e2b5

---

## Bug #2: Agent-to-Agent Communications Not Displayed
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** High  
**Device:** PWA (all platforms)  
**Description:** Agent comms groups no longer render. User sees only a thin line instead of the full message bubbles/content.  
**Expected:** Agent-to-agent messages display in collapsible `.agent-comms-group` containers with full message content visible.  
**Current:** ~~Only a thin line visible; full comms content hidden or not rendering.~~ FIXED  
**Root Cause:** `.comms-body` had `overflow: hidden` without proper `display: flex`, causing content to collapse  
**Fix Applied:** Added `display: flex; flex-direction: column; gap: 4px;` to `.comms-body`  
**Status:** ✅ FIXED | **Assigned:** Marcus | **Commit:** b812158

---

## Bug #3: Chat Auto-Scroll Jumping
**Reporter:** Jeremy | **Date:** 2026-02-24 23:51 EST | **Severity:** Medium  
**Device:** PWA (all platforms)  
**Description:** Chat jumps to bottom repeatedly even when user is intentionally scrolling up to read history. Behavior is jarring and interrupts reading flow.  
**Expected:** Chat should only auto-scroll to bottom when user is already at the bottom or a new message arrives while they're at the bottom.  
**Current:** ~~Chat jumps/snaps to bottom frequently, overriding user scroll position.~~ FIXED  
**Root Cause:** Multiple rapid `autoScroll()` calls triggered by streaming, message commits, etc. overrode user scroll  
**Fix Applied:** Added `userHasScrolled` tracking, debounced rapid calls (max 100ms), reduced threshold (150→100px)  
**Status:** ✅ FIXED | **Assigned:** Marcus | **Commit:** d5dbbf4

---

## Summary
- **Total Open:** 0
- **Total Fixed:** 3 ✅
  - Bug #1 (Medium): iPad layout squish → FIXED
  - Bug #2 (High): Agent comms not displaying → FIXED
  - Bug #3 (Medium): Chat auto-scroll jumping → FIXED
- **All Deployed:** 2026-02-25 00:15 EST
