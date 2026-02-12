# The Office — OpenClaw Web Dashboard

A native web interface for OpenClaw that provides a visual agent dashboard and chat interface.

## Features

- **Visual Agent Dashboard**: See all your agents displayed as avatars in an office layout
- **Real-time Chat**: Direct messaging with agents through a native web interface
- **Agent Status**: Live status indicators showing when agents are thinking or idle
- **Multi-Agent Support**: Manage conversations with multiple agents simultaneously
- **Gateway Integration**: Direct connection to OpenClaw Gateway via WebSocket

## Architecture

This dashboard consists of three components:

1. **Frontend** (`index.html`) - The visual interface served on port 3000
2. **Backend API** (`gateway-api.js`) - Express server that proxies to OpenClaw Gateway
3. **Message Cache** (`messages.json`) - Persistent storage for conversations

## Prerequisites

- OpenClaw Gateway running with webchat plugin enabled
- Node.js (v18+ recommended)
- Your OpenClaw Gateway token

## Setup

1. **Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd office
   ```

2. **Create config file**
   ```bash
   cp config.example.js config.js
   ```

3. **Edit config.js with your Gateway token**
   ```javascript
   const config = {
     gatewayToken: 'your-actual-gateway-token-here',
     gatewayPort: 18789,
     dashboardPort: 3000
   };
   ```

4. **Install dependencies**
   ```bash
   npm install express ws
   ```

5. **Start the backend API**
   ```bash
   node gateway-api.js
   ```

6. **In a separate terminal, start the frontend server**
   ```bash
   node serve.js
   ```

7. **Open your browser**
   ```
   http://localhost:3000
   ```

## Configuration

### Finding Your Gateway Token

Your Gateway token can be found in your OpenClaw config:
```bash
openclaw config get | grep gatewayToken
```

Or check `~/.openclaw/config.yaml`:
```yaml
gateway:
  token: your-token-here
```

### Enabling the Webchat Plugin

The dashboard requires the OpenClaw webchat plugin. To enable it, add to your config:

```yaml
channels:
  - kind: webchat
    name: webchat
```

Then restart OpenClaw Gateway:
```bash
openclaw gateway restart
```

## Project Structure

```
office/
├── index.html          # Main dashboard UI
├── serve.js            # Static file server (port 3000)
├── gateway-api.js      # Gateway API proxy (port 8081)
├── messages.json       # Message cache (gitignored)
├── config.js           # Your config (gitignored)
├── config.example.js   # Config template
└── README.md           # This file
```

## Usage

### Chatting with Agents

1. Click an agent avatar to open the side panel
2. Switch to the "Chat" tab
3. Type your message and press Enter or click Send
4. Agent responses appear in real-time

### Agent Status

- **Pulsing green dot**: Agent is thinking/processing
- **Solid dot**: Agent is idle
- **Gray dot**: Agent is unavailable

## Development

### Message Cache

Conversations are stored in `messages.json` in this format:
```json
{
  "agentName": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": 1707614325000
    },
    {
      "role": "assistant", 
      "content": "Hi there!",
      "timestamp": 1707614326000
    }
  ]
}
```

To reset conversations, delete `messages.json` and restart the backend.

### API Endpoints

The backend (`gateway-api.js`) exposes:

- `GET /api/agent/:agentKey` - Fetch agent conversation history
- `POST /api/send` - Send message to agent
- `GET /api/status` - Check API health

### WebSocket Connection

The frontend connects to OpenClaw Gateway via WebSocket for real-time updates:
- Gateway WebSocket proxied through `/gw` endpoint
- Automatic reconnection on disconnect
- Token authentication

## Troubleshooting

**Agents not responding?**
- Check that OpenClaw Gateway is running: `openclaw gateway status`
- Verify webchat plugin is enabled in config
- Check Gateway logs: `tail -f ~/.openclaw/logs/gateway.log`

**Can't connect to dashboard?**
- Ensure both `gateway-api.js` and `serve.js` are running
- Check that ports 3000 and 8081 are available
- Verify config.js has correct Gateway token

**Messages not persisting?**
- Check that `messages.json` is writable
- Restart `gateway-api.js` to reload cache

## Contributing

This is an experimental dashboard built for personal use. Feel free to fork and adapt for your needs!

## License

MIT

## Credits

Built with OpenClaw - https://openclaw.ai
