# Mobile Testing Workflow

**ALWAYS test mobile changes in Chrome DevTools mobile emulation BEFORE deploying.**

## Why This Matters

Mobile-specific bugs (CSS breakpoints, layout issues, tab switching) can't be caught by desktop testing alone. Testing in mobile emulation catches 90% of mobile issues before they hit users.

**Real-world impact:** The mobile tab switching bug (Feb 15, 2025) took 3+ iterations to fix because it wasn't tested in mobile emulation first. Mobile emulation would have caught it immediately.

## Quick Workflow

### For CSS/Layout Changes

1. **Open the dashboard in Chrome**
   ```
   http://localhost:3000
   ```

2. **Enable Device Emulation**
   - Press `F12` or `Cmd+Option+I` to open DevTools
   - Click the device toolbar icon (or `Cmd+Shift+M`)
   - Select a device: iPhone 14 Pro, Pixel 5, or "Responsive"

3. **Test your changes**
   - Navigate through tabs, test touch interactions
   - Check CSS breakpoints: `@media (max-width: 768px)` and `@media (max-width: 1200px)`
   - Verify layouts at different viewport sizes

4. **Take screenshots if needed**
   - Chrome DevTools → Capture screenshot
   - Include in bug reports or documentation

### For Interactive Testing with OpenClaw Relay

If you need programmatic control (snapshots, form filling, complex interactions):

1. **Open dashboard in Chrome**

2. **Attach OpenClaw Browser Relay**
   - Click the OpenClaw toolbar extension
   - Badge shows "ON" when tab is attached

3. **Use browser tool with mobile emulation**
   ```javascript
   // From Marcus's session
   browser({ 
     action: "snapshot", 
     profile: "chrome",  // Uses relay-attached tab
     target: "host"
   })
   
   // Change viewport to mobile
   browser({
     action: "act",
     profile: "chrome",
     request: { kind: "resize", width: 390, height: 844 } // iPhone 14 Pro
   })
   
   // Take snapshot in mobile viewport
   browser({ action: "snapshot", profile: "chrome" })
   ```

4. **Test interactions**
   - Click tabs, buttons, inputs
   - Verify keyboard behavior
   - Check scroll behavior

## Common Mobile Testing Scenarios

### Tab Switching (Critical)
**Issue:** Tabs may not hide properly on mobile due to CSS `!important` rules

**Test:**
1. Open in mobile emulation (iPhone 14 Pro)
2. Click through all tabs (Chat → PRs → Memory → Files)
3. Verify ONLY the active tab content is visible (no stacked views)
4. Check that chat input disappears on non-Chat tabs

### Keyboard Behavior
**Issue:** Mobile keyboard may stay visible when switching tabs/panels

**Test:**
1. Mobile emulation
2. Focus chat input (keyboard appears)
3. Switch to different tab
4. Verify keyboard dismisses (input loses focus)

### Touch Targets
**Issue:** Buttons/links may be too small for mobile

**Test:**
1. Check touch targets are at least 44×44px (iOS recommended)
2. Verify adequate spacing between clickable elements
3. Test fat-finger scenarios

### Viewport Breakpoints
**Issue:** CSS breakpoints may not apply correctly

**Test in DevTools:**
- **Desktop:** > 1200px
- **Tablet:** 768px - 1200px
- **Mobile:** < 768px

Resize viewport to test each breakpoint transition.

## Tools

### Chrome DevTools Mobile Emulation
**Pros:**
- Built into Chrome, no setup
- Accurate viewport/CSS testing
- Device metrics, touch emulation
- Fast iteration

**Cons:**
- Not a real device (keyboard behavior may differ)
- Can't test native features (iOS specific bugs)

**When to use:** 95% of mobile testing (CSS, layout, breakpoints, basic interactions)

### OpenClaw Browser Relay + Chrome Emulation
**Pros:**
- Programmatic control via browser tool
- Can take snapshots, automate testing
- Works with mobile viewport

**Cons:**
- Requires Browser Relay setup
- More complex than manual testing

**When to use:** Automated testing, documentation screenshots, complex interaction flows

### Real Device Testing (via OpenClaw Nodes)
**Pros:**
- Tests actual device behavior (real keyboard, performance, Safari quirks)
- Can use `nodes screen_record` or `camera_snap` to see exact user view

**Cons:**
- Requires device pairing as OpenClaw node
- Slower iteration (deploy → test → feedback loop)

**When to use:** Final validation, iOS-specific bugs, keyboard/input behavior that emulation can't catch

## Pre-Deploy Checklist

Before pushing mobile-related changes:

- [ ] Tested in Chrome DevTools mobile emulation (iPhone 14 Pro or Pixel 5)
- [ ] Verified tab switching works (only active tab visible)
- [ ] Checked keyboard dismisses when leaving input fields
- [ ] Tested at all breakpoints (mobile, tablet, desktop)
- [ ] Touch targets are 44×44px minimum
- [ ] No horizontal scroll on mobile viewport
- [ ] CSS doesn't use viewport-specific `!important` that breaks tab switching

## Common Pitfalls

### ❌ Don't Do This
```css
/* Mobile-specific override that breaks tab switching */
@media (max-width: 768px) {
  #tab-chat {
    display: flex !important; /* Always visible, even when inactive */
  }
}
```

### ✅ Do This Instead
```css
/* Works for any active tab */
@media (max-width: 768px) {
  .tab-pane.active {
    display: flex !important;
  }
  .tab-pane:not(.active) {
    display: none !important;
  }
}
```

## Resources

- [Chrome DevTools Device Mode](https://developer.chrome.com/docs/devtools/device-mode/)
- [iOS Human Interface Guidelines - Touch Targets](https://developer.apple.com/design/human-interface-guidelines/layout)
- [OpenClaw Browser Relay Docs](https://docs.openclaw.ai/tools/browser/)
- [OpenClaw Nodes - Screen Recording](https://docs.openclaw.ai/tools/nodes/)

## Lessons Learned

**Feb 15, 2025 - Mobile Tab Switching Bug**
- **Issue:** Chat stayed visible (30% screen) when viewing PRs tab on mobile
- **Root Cause:** Mobile CSS forced `#tab-chat { display: flex !important }`
- **How It Could Have Been Caught:** 30 seconds of testing in Chrome mobile emulation
- **Iterations to Fix:** 3 (could have been 1 with emulation testing)
- **Lesson:** Always test mobile changes in DevTools before deploying

---

**Remember:** Mobile emulation catches 90% of mobile bugs instantly. Use it first, save real device testing for the edge cases.
