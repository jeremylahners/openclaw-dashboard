# Office Dashboard Service Management

## Services

### Backend (Gateway API WebSocket)
- **Label:** `com.openclaw.office-backend`
- **Program:** `/opt/homebrew/bin/node /Users/jeremylahners/.openclaw/workspace/office/gateway-api.js`
- **Port:** 8081
- **Logs:** 
  - stdout: `/tmp/office-backend.log`
  - stderr: `/tmp/office-backend.err`
- **Config:** `~/Library/LaunchAgents/com.openclaw.office-backend.plist`

### Frontend (HTTP Server)
- **Label:** `com.openclaw.office-frontend`
- **Program:** `/opt/homebrew/bin/node /Users/jeremylahners/.openclaw/workspace/office/serve.js`
- **Port:** 3001
- **URL:** http://localhost:3001
- **Logs:**
  - stdout: `/tmp/office-frontend.log`
  - stderr: `/tmp/office-frontend.err`
- **Config:** `~/Library/LaunchAgents/com.openclaw.office-frontend.plist`

## Restart Commands

### Restart Backend
```bash
launchctl kickstart -k gui/$UID/com.openclaw.office-backend
```

### Restart Frontend
```bash
launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
```

### Restart Both
```bash
launchctl kickstart -k gui/$UID/com.openclaw.office-backend && \
launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
```

## Stop/Start Commands

### Stop Backend
```bash
launchctl stop com.openclaw.office-backend
```

### Start Backend
```bash
launchctl start com.openclaw.office-backend
```

### Stop Frontend
```bash
launchctl stop com.openclaw.office-frontend
```

### Start Frontend
```bash
launchctl start com.openclaw.office-frontend
```

## Check Status

### List All Office Services
```bash
launchctl list | grep office
```

### Check Backend Details
```bash
launchctl print gui/$UID/com.openclaw.office-backend
```

### Check Frontend Details
```bash
launchctl print gui/$UID/com.openclaw.office-frontend
```

## View Logs

### Backend Logs
```bash
# Errors
tail -f /tmp/office-backend.err

# Output
tail -f /tmp/office-backend.log
```

### Frontend Logs
```bash
# Errors
tail -f /tmp/office-frontend.err

# Output
tail -f /tmp/office-frontend.log
```

## Common Issues

### Port Already in Use
If backend fails with `EADDRINUSE` on port 8081:
```bash
# Find process using port 8081
lsof -i :8081

# Kill it (replace PID)
kill -9 <PID>

# Then restart backend
launchctl kickstart -k gui/$UID/com.openclaw.office-backend
```

### Service Won't Start
```bash
# Unload and reload the service
launchctl unload ~/Library/LaunchAgents/com.openclaw.office-backend.plist
launchctl load ~/Library/LaunchAgents/com.openclaw.office-backend.plist
```

## Notes
- Both services have `KeepAlive=true`, so launchd will auto-restart them if they crash
- Use `kickstart -k` to kill and immediately restart
- Use `stop`/`start` for more controlled restarts
