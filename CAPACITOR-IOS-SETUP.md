# Capacitor iOS Native Push Notifications Setup

## Overview

This guide sets up native iOS push notifications for the Office Dashboard using Capacitor. This enables notifications to work even when the app is closed or the phone is locked (unlike PWA web push).

## Prerequisites

- macOS with Xcode installed
- Apple Developer account ($99/year)
- Node.js and npm (already installed)

## What's Been Done

✅ **Capacitor installed and configured**
- `@capacitor/core`, `@capacitor/cli` installed
- `@capacitor/ios` platform added
- `@capacitor/push-notifications` plugin installed
- iOS project created in `/ios` directory

✅ **Build scripts created**
- `sync-web.sh` - Syncs web files to `www/` directory
- `native-push.js` - Native push notification bridge

✅ **Configuration files**
- `capacitor.config.json` - Capacitor configuration
- `.gitignore` - Updated to ignore Capacitor build artifacts

## Manual Setup Steps (TODO)

### 1. Apple Developer Account Setup

1. Log in to https://developer.apple.com
2. Create an App ID:
   - Identifier: `ai.openclaw.office`
   - Name: `OpenClaw Office`
   - Capabilities: Enable **Push Notifications**
3. Create an APNs Auth Key:
   - Keys → Create new key
   - Enable **Apple Push Notifications service (APNs)**
   - Download the `.p8` file (keep it safe!)
   - Note the Key ID and Team ID

### 2. Xcode Project Configuration

```bash
# Open the iOS project in Xcode
open ios/App/App.xcworkspace
```

In Xcode:
1. Select the App target
2. **Signing & Capabilities**:
   - Team: Select your Apple Developer team
   - Bundle Identifier: `ai.openclaw.office`
   - Add capability: **Push Notifications**
   - Add capability: **Background Modes** → Enable "Remote notifications"
3. **Info.plist**:
   - Already configured by Capacitor

### 3. Backend Setup (APNs Integration)

The current backend uses `web-push` for PWA notifications. For native iOS, we need APNs integration.

**Option A: Use Firebase Cloud Messaging (Recommended)**
- Simpler setup
- Handles both APNs and web push
- Free tier available

**Option B: Direct APNs Integration**
- More control
- Requires `node-apn` or similar library
- Need to manage certificates/keys

**TODO: Implement backend APNs support**

File: `gateway-api.js`

Add new endpoint:
```javascript
// Native push token registration
app.post('/api/push/subscribe-native', async (req, res) => {
  const { token, platform } = req.body;
  // Store native token separately from web push subscriptions
  // TODO: Implement APNs sending logic
});
```

### 4. Frontend Integration

Update `index.html` to initialize native push:

```javascript
// After existing service worker registration
if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
  import('./native-push.js').then(({ initNativePush }) => {
    initNativePush();
  });
}
```

### 5. Build and Test

```bash
# 1. Sync web files
./sync-web.sh

# 2. Sync Capacitor
npx cap sync ios

# 3. Open in Xcode
npx cap open ios

# 4. Build and run on device (simulator doesn't support push notifications)
```

**Important:** Push notifications ONLY work on physical devices, not simulators.

## Development Workflow

1. Make changes to web files (`index.html`, `css/`, `js/`, etc.)
2. Run `./sync-web.sh` to copy to `www/`
3. Run `npx cap sync ios` to update native project
4. Build in Xcode or run `npx cap run ios --target=<device-id>`

## Testing Push Notifications

### Option 1: Backend Test Endpoint
```bash
curl -X POST http://localhost:3001/api/push/test-native \
  -H "Content-Type: application/json" \
  -d '{"agentKey": "isla", "message": "Test notification"}'
```

### Option 2: Xcode Simulator (for debugging only)
Simulator shows notifications in foreground but won't deliver when app is closed.

### Option 3: Physical Device (required for full testing)
1. Build to device via Xcode
2. Send test notification from backend
3. Lock phone → notification should appear
4. Tap notification → app should open to correct agent

## Architecture

```
┌─────────────────────┐
│   iOS Native App    │
│  (Capacitor Shell)  │
│                     │
│  ┌───────────────┐  │
│  │  WebView      │  │
│  │  (Dashboard)  │  │
│  └───────────────┘  │
│         ↕           │
│  ┌───────────────┐  │
│  │ Push Plugin   │  │ ← Capacitor Plugin
│  └───────────────┘  │
└──────────↕──────────┘
           ↕
    ┌─────────────┐
    │   APNs      │ ← Apple Push Notification service
    └─────────────┘
           ↑
    ┌─────────────┐
    │   Backend   │
    │ (Node.js)   │
    └─────────────┘
```

## Web vs Native Push

| Feature | PWA (Web Push) | Native (Capacitor) |
|---------|----------------|-------------------|
| Works when app closed | ❌ No | ✅ Yes |
| Works on locked screen | ❌ No | ✅ Yes |
| Reliable delivery | ⚠️ iOS restrictions | ✅ Full support |
| Setup complexity | ✅ Simple | ⚠️ Moderate |
| Cost | ✅ Free | ⚠️ $99/year Dev account |

## File Structure

```
office/
├── capacitor.config.json    # Capacitor configuration
├── ios/                      # Native iOS project (Xcode)
│   └── App/
│       ├── App.xcworkspace   # Open this in Xcode
│       └── App/
│           └── public/       # Web files (auto-synced)
├── www/                      # Build output (gitignored)
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── icons/
├── sync-web.sh              # Build script
├── native-push.js           # Native push bridge
└── gateway-api.js           # Backend (needs APNs support)
```

## Next Steps

1. ✅ Capacitor setup complete
2. ⏳ Configure Apple Developer account (requires Jeremy)
3. ⏳ Setup Xcode signing (requires Apple Developer credentials)
4. ⏳ Implement APNs backend support (Marcus)
5. ⏳ Test on physical device (requires steps 2-4)

## Troubleshooting

**Issue: "No provisioning profiles found"**
- Solution: Configure signing in Xcode with your Apple Developer account

**Issue: Push notifications not appearing**
- Check: Did you enable Push Notifications capability in Xcode?
- Check: Are you testing on a physical device (not simulator)?
- Check: Did the device register successfully? (check backend logs)
- Check: Is the APNs certificate/key configured correctly?

**Issue: App won't build**
- Solution: Run `npx cap sync ios` to update dependencies
- Solution: Clean build folder in Xcode (Shift+Cmd+K)

**Issue: Web changes not appearing in app**
- Solution: Run `./sync-web.sh` then `npx cap sync ios`
- Solution: Hard refresh app or reinstall

## Resources

- Capacitor Docs: https://capacitorjs.com/docs
- Push Notifications Plugin: https://capacitorjs.com/docs/apis/push-notifications
- APNs Overview: https://developer.apple.com/documentation/usernotifications
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging

## Status

**Current State:** Infrastructure ready, manual Apple setup required

**Blocked By:** 
1. Apple Developer account configuration
2. APNs backend implementation

**Estimated Time to Production:** 
- If Jeremy does Apple setup: 2-3 hours (Marcus implements APNs backend)
- If Marcus handles everything: 1-2 days (including Apple account wait times)
