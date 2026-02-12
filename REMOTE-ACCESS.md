# OpenClaw Dashboard - Remote Access Guide

## Quick Access

**Dashboard URL (Tailscale):** `http://100.95.128.66:3001`

**Local URL:** `http://localhost:3001`

## Port Configuration

| Service | Port | Purpose |
|---------|------|---------|
| Dashboard Frontend | **3001** | Main entry point - serves HTML/JS/CSS, proxies API and WebSocket |
| Backend API | 8081 | Internal API (proxied through 3001) |
| OpenClaw Gateway | 18789 | WebSocket (proxied through 3001) |

**You only need to access port 3001.** All other services are proxied automatically.

## Starting the Dashboard

```bash
cd ~/.openclaw/workspace/office

# Start backend API
node gateway-api.js &

# Start frontend server
node serve.js &
```

Or use the existing running processes (they auto-start).

## Mobile Interface

The dashboard is fully mobile-responsive:
- **Chat-first interface** on mobile (< 768px width)
- **Bottom navigation** with all agents (scroll horizontally)
- **Hamburger menu** (top-left) opens the sidebar
- **Touch-optimized** input fields

## Multi-Session Sync

Messages sync across all devices/tabs viewing the same agent:
- Phone + Computer see the same conversation
- 3-second polling interval
- No refresh needed - updates appear automatically

## Troubleshooting

### Dashboard not loading
1. Check servers are running: `ps aux | grep -E "serve.js|gateway-api"`
2. Restart if needed: `pkill -f serve.js && node serve.js &`

### WebSocket disconnected
- The "Reconnecting..." status is normal - it auto-reconnects every 3 seconds
- Gateway must be running: `openclaw gateway status`

### Messages not syncing
- Ensure both devices are viewing the same agent
- Check browser console for `[Sync]` logs
- Try refreshing the page

## Architecture

```
[Mobile/Remote] → Tailscale → [Mac Mini:3001]
                                    ↓
                            [serve.js proxy]
                              ↓         ↓
                      [API:8081]   [Gateway:18789]
                              ↓
                      [messages.json]  ← sync cache
```
