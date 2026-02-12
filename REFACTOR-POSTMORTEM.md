# Refactor Post-Mortem: Why It Failed

**Date:** 2026-02-12  
**Refactor Agent:** Opus (spawned via cron at 8:00 AM EST)  
**Time to Failure:** ~30 minutes of debugging before rollback

---

## Executive Summary

The Opus-powered refactor agent successfully split the monolithic codebase into modular files but introduced **multiple cascading failures** that broke the dashboard. The root causes were:

1. **ES Module loading issues** with browser globals
2. **Config.js compatibility break** between Node.js and browser
3. **My debugging attempts** made things worse by modifying serve.js
4. **No testing before commit** — changes were committed and deployed simultaneously

---

## What the Refactor Did

| Before | After |
|--------|-------|
| `index.html` (114KB) | `index.html` (13KB) + `css/styles.css` (28KB) + `js/*.js` (54KB total) |
| `gateway-api.js` (26KB) | `server.js` + `routes/*.js` + `lib/*.js` |

**Files Created:**
- `css/styles.css` — All CSS extracted
- `js/app.js` — Main application entry point (ES module)
- `js/agents.js` — Agent data, positions, movements
- `js/chat.js` — WebSocket/chat functionality
- `js/ui.js` — UI utilities, panels, modals
- `js/storage.js` — localStorage utilities
- `server.js` — New backend entry point
- `routes/chat.js`, `routes/files.js`, `routes/standup.js`, `routes/actions.js`
- `lib/gateway.js`, `lib/server-config.js`

---

## Failure Chain Analysis

### Failure #1: Config.js Browser/Node Incompatibility

**Original `config.js`:**
```javascript
const config = {
  gatewayToken: '...',
  gatewayPort: 18789,
  dashboardPort: 3000
};

module.exports = config;
```

**Problem:** 
- Used `module.exports` which is Node.js CommonJS syntax
- In browser, `module` is undefined → script error
- Original monolithic code loaded config.js as a regular `<script>` tag, creating a global `config` variable
- Refactored code expected `window.config` but config.js didn't set it

**Impact:** `getGatewayToken()` returned empty string → WebSocket auth failed

### Failure #2: ES Module Execution Timing

**Refactored `index.html`:**
```html
<script src="config.js"></script>
<script type="module" src="js/app.js"></script>
```

**Problem:**
- ES modules (`type="module"`) are deferred by default
- `const config = {...}` in a non-module script creates a script-scoped variable in strict environments
- The `window.config` might not be set when the module runs
- Variable scoping differs between `<script>` and `<script type="module">`

**Impact:** Race condition where modules loaded before config was available

### Failure #3: WebSocket Status Showed "Reconnecting"

The refactored `chat.js` connected to WebSocket, got "device identity required" error, and entered reconnect loop.

**Root Cause Analysis (Incorrect):**
- I initially thought the Gateway protocol had changed
- Spent time investigating device pairing requirements
- This was a **red herring** — the real issue was auth token being empty

**Actual Root Cause:**
- `getGatewayToken()` returned `''` because `window.config` was undefined
- Gateway received empty token → rejected with "device identity required"
- The error message was misleading

### Failure #4: My serve.js Modifications Made It Worse

While debugging, I modified `serve.js`:
1. Changed WebSocket proxy path from `req.url` to `/`
2. Filtered and replaced Host header
3. Added debug logging

**Impact:**
- The original WebSocket proxy worked fine
- My changes broke the proxy handshake
- Even after fixing config.js, WebSocket still failed

### Failure #5: No Staged Rollout or Testing

**What Should Have Happened:**
1. Create refactored files in a separate branch
2. Test in isolation before committing
3. Deploy behind a feature flag
4. Gradual rollout with monitoring

**What Actually Happened:**
1. Refactor agent modified files directly
2. Committed all changes in one commit
3. launchd auto-restarted services with new code
4. Dashboard immediately broken for users

---

## Timeline of Cascading Failures

| Time | Event |
|------|-------|
| 8:00 AM | Cron spawns Opus refactor agent |
| 8:01 AM | Agent starts reading files |
| 8:03 AM | Agent creates `js/`, `css/`, `lib/`, `routes/` directories |
| 8:04-8:07 AM | Agent extracts code into modular files |
| 8:10 AM | Agent modifies `index.html` to use ES modules |
| 8:11 AM | Agent commits all changes |
| 8:32 AM | Jeremy reports dashboard shows "Reconnecting" |
| 8:35 AM | Jeremy reports conversations won't load |
| 8:36-8:46 AM | I debug WebSocket, modify serve.js (making it worse) |
| 8:46 AM | I incorrectly conclude Gateway requires device pairing |
| 8:52 AM | I disable WebSocket entirely (wrong fix) |
| 8:53 AM | Chats completely broken ("Loading messages...") |
| 8:54 AM | Jeremy asks WTF |
| 8:55 AM | Jeremy suggests using browser to debug |
| 8:55 AM | I restore original serve.js, discover WebSocket works |
| 8:56 AM | Dashboard working again with original monolithic code |

---

## Lessons Learned

### 1. Browser vs Node.js JavaScript Differences
- `module.exports` doesn't work in browsers
- ES modules have different scoping and timing
- Always test in actual browser environment

### 2. Config Files Need Universal Syntax
```javascript
// Universal config pattern
var config = { ... };
if (typeof window !== 'undefined') window.config = config;
if (typeof module !== 'undefined') module.exports = config;
```

### 3. Don't Debug Production While Users Are Waiting
- My "fixes" made things worse
- Should have immediately rolled back, THEN investigated

### 4. Misleading Error Messages
- "device identity required" sounded like a protocol issue
- Actually meant "auth token was empty"
- Always check the simplest explanation first

### 5. Refactors Need Testing Infrastructure
- Unit tests for each module
- Integration tests for the full stack
- Staging environment before production

### 6. The Refactor Itself Was Sound
- The modular structure is good architecture
- The separation of concerns is correct
- The problem was execution, not design

---

## Recommendations for Future Refactor

### Phase 1: Preparation
- [ ] Set up a test environment (different port)
- [ ] Create automated tests for critical paths
- [ ] Document all global variables and their sources

### Phase 2: Incremental Migration
- [ ] Fix config.js to work in both environments
- [ ] Test config loading in browser console
- [ ] Migrate one module at a time (start with storage.js)
- [ ] Test after each module migration

### Phase 3: WebSocket Testing
- [ ] Verify WebSocket connects with auth token
- [ ] Test full message send/receive flow
- [ ] Test reconnection behavior

### Phase 4: Full Migration
- [ ] Switch index.html to use modules
- [ ] Test all features end-to-end
- [ ] Keep monolithic version as rollback option

---

## Files to Keep

The refactored files are still in the repo and are architecturally sound:
- `css/styles.css` ✓
- `js/app.js` ✓
- `js/agents.js` ✓
- `js/chat.js` ✓ (needs config fix)
- `js/ui.js` ✓
- `js/storage.js` ✓
- `lib/` and `routes/` ✓

**Do NOT delete them** — they can be properly integrated later with testing.

---

## Current State

- **Active:** Original monolithic `index.html` (114KB)
- **Active:** Original `serve.js` with port changed to 3001
- **Standby:** Modular files in `js/`, `css/`, `lib/`, `routes/`
- **Git:** Refactor commit exists but working tree has original files

To properly complete the refactor later:
```bash
git checkout 6a99e1d -- css/ js/ lib/ routes/ server.js
# Then fix config.js and test thoroughly
```
