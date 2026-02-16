# Development Workflow

Quick reference for efficient Office Dashboard development.

## When to Restart Services

### ❌ NO RESTART NEEDED - Just Hard Refresh Browser

**CSS changes** (`css/all-styles.css`, etc.)
- `serve.js` reads files from disk on each request
- Browser hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux)
- No service restart required

**HTML changes** (`index.html`)
- Same as CSS - files served fresh on each request
- Just hard refresh browser

**Static files** (images, icons, JSON data files)
- Served from disk on each request
- Hard refresh browser

### ✅ FRONTEND RESTART NEEDED

**JavaScript code changes** (embedded `<script>` in HTML that gets cached)
- Only if you suspect aggressive browser caching
- Usually hard refresh is enough

```bash
./restart-services.sh frontend
```

### ✅ BACKEND RESTART NEEDED

**Backend code changes** (`gateway-api.js`, `db.js`, `workspace-config.js`)
- Backend runs as Node.js process - code loaded into memory
- Must restart to reload code changes

**Config changes** (`workspace.config.json`)
- Backend loads config into memory at startup
- Must restart to reload config

```bash
./restart-services.sh backend
```

**⚠️ Backend restart interrupts WebSocket connections temporarily**

### ✅ BOTH RESTARTS NEEDED

**Dependency changes** (`package.json`, new `npm install`)
- Backend needs restart to load new modules
- Frontend usually fine (unless new modules affect serve.js)

```bash
./restart-services.sh
```

## Efficient Development Loop

### For CSS/Layout Work
1. Make CSS changes in `css/all-styles.css`
2. Save file
3. Hard refresh browser (**Cmd+Shift+R**)
4. Repeat

**No service restarts needed!**

### For Backend Logic Work
1. Make changes to `gateway-api.js`
2. Save file
3. `./restart-services.sh backend`
4. Wait for backend to reload (~2 seconds)
5. Refresh browser (normal refresh, not hard)
6. Repeat

### For Mobile Testing
See [MOBILE_TESTING.md](./MOBILE_TESTING.md) for mobile emulation workflow.

## Common Mistakes

### ❌ Restarting frontend for CSS changes
- **Problem**: Wastes time, unnecessary
- **Solution**: Just hard refresh browser

### ❌ Restarting backend for CSS changes
- **Problem**: Interrupts WebSocket, wastes time, causes brief dashboard outage
- **Solution**: Just hard refresh browser

### ❌ Normal browser refresh after CSS changes
- **Problem**: Browser cache serves old CSS
- **Solution**: Use **hard refresh** (Cmd+Shift+R)

### ❌ Forgetting to restart backend after config changes
- **Problem**: Changes to `workspace.config.json` don't appear
- **Solution**: Backend restart required to reload config

## Service Architecture

```
Browser (port 3001)
  ↓ HTTP requests
serve.js (Frontend - port 3001)
  ├─ Serves static files (HTML, CSS, JS, images) from disk
  ├─ Proxies /api/* to backend
  └─ Proxies /ws WebSocket to backend
     ↓
gateway-api.js (Backend - port 8081)
  ├─ Loads workspace.config.json into memory
  ├─ Connects to OpenClaw Gateway via WebSocket
  ├─ Manages chat database (SQLite)
  └─ Serves API endpoints
```

**Key insight:** Frontend (`serve.js`) just serves files from disk - no caching. Backend (`gateway-api.js`) loads code and config into memory - requires restart.

## Hard Refresh Shortcuts

- **macOS**: Cmd + Shift + R
- **Windows/Linux**: Ctrl + Shift + R
- **Chrome DevTools open**: Right-click refresh button → "Empty Cache and Hard Reload"

## Verifying Changes Applied

### CSS Changes
1. Open browser DevTools (F12)
2. Go to Network tab
3. Hard refresh
4. Find `all-styles.css` in network log
5. Check response - should show your changes

### Backend Changes
1. Check terminal for "✓ Backend restarted" message
2. Look for backend startup logs
3. Test API endpoint or WebSocket reconnection

## Git Workflow

After making changes:

```bash
git add -A
git commit -m "Description of changes"
git push origin main
```

For CSS-only changes, you can batch commits instead of committing after every tweak.

## Debugging Tips

### CSS not updating after hard refresh?
- Check browser cache settings (might be aggressive)
- Try incognito/private window
- Check DevTools Network tab - is old CSS being served?
- Worst case: `./restart-services.sh frontend` (though shouldn't be needed)

### Backend changes not applying?
- Did you restart backend?
- Check terminal for error messages
- Look for syntax errors in changed files

### WebSocket keeps disconnecting?
- Did someone restart backend? It interrupts WebSocket temporarily
- Check backend terminal for errors
- Frontend auto-reconnects within 3 seconds

## Performance Notes

- Frontend serves files directly from disk - no build step, instant updates
- Backend restart takes ~2 seconds
- WebSocket reconnects automatically after backend restart
- Hard refresh forces browser to bypass cache - slight delay vs normal refresh

## Quick Reference

| Change Type | Action Required |
|-------------|----------------|
| CSS | Hard refresh browser |
| HTML | Hard refresh browser |
| Images/icons | Hard refresh browser |
| Backend code | Restart backend |
| Config file | Restart backend |
| Dependencies | Restart both (or just backend usually) |

---

**Remember:** Hard refresh browser = Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)

This will save you a lot of unnecessary service restarts! 🚀
