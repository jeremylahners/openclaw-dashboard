# Chat Panel v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the triple-cache polling chat architecture with SQLite + server WebSocket push + incremental DOM rendering to eliminate duplicate messages, late deliveries, out-of-order messages, and visual flicker.

**Architecture:** Server-side SQLite database is the single source of truth for all chat messages. A WebSocket server on the backend pushes new messages to all connected frontends instantly. The OpenClaw Gateway WebSocket is used only for real-time streaming transport — once a message is finalized, it's committed to SQLite and pushed to clients. The frontend renders incrementally via `appendChild`, never full `innerHTML` replacement except on agent switch.

**Tech Stack:** Node.js 25.5 built-in `node:sqlite` (DatabaseSync), `ws` npm package (already installed), vanilla JS frontend.

**Design doc:** `docs/plans/2026-02-13-chat-panel-v2-design.md`

---

## Task 1: Create SQLite Database Module

**Files:**
- Create: `office/db.js`

**Step 1: Create the database module**

```js
// office/db.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chat.db');

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.exec('PRAGMA journal_mode=WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    idempotency_key TEXT UNIQUE,
    metadata TEXT
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_agent
  ON messages(agent, seq)
`);

// Prepared statements
const insertMsg = db.prepare(
  'INSERT INTO messages (agent, role, content, timestamp, idempotency_key, metadata) VALUES (?, ?, ?, ?, ?, ?)'
);

const getByAgent = db.prepare(
  'SELECT * FROM messages WHERE agent = ? ORDER BY seq'
);

const getByAgentSince = db.prepare(
  'SELECT * FROM messages WHERE agent = ? AND seq > ? ORDER BY seq'
);

const checkIdempotency = db.prepare(
  'SELECT seq FROM messages WHERE idempotency_key = ?'
);

function addMessage(agent, role, content, timestamp, idempotencyKey = null, metadata = null) {
  // If idempotency key provided, check for duplicate first
  if (idempotencyKey) {
    const existing = checkIdempotency.get(idempotencyKey);
    if (existing) {
      return { seq: existing.seq, duplicate: true };
    }
  }

  try {
    const result = insertMsg.run(agent, role, content, timestamp, idempotencyKey, metadata ? JSON.stringify(metadata) : null);
    return { seq: Number(result.lastInsertRowid), duplicate: false };
  } catch (e) {
    // UNIQUE constraint violation on idempotency_key = duplicate
    if (e.message.includes('UNIQUE constraint')) {
      const existing = checkIdempotency.get(idempotencyKey);
      return { seq: existing?.seq, duplicate: true };
    }
    throw e;
  }
}

function getMessages(agent) {
  return getByAgent.all(agent);
}

function getMessagesSince(agent, sinceSeq) {
  return getByAgentSince.all(agent, sinceSeq);
}

module.exports = { addMessage, getMessages, getMessagesSince, db };
```

**Step 2: Verify the module loads without errors**

Run: `cd /Users/jeremylahners/.openclaw/workspace/office && node -e "const db = require('./db.js'); console.log('DB loaded, tables created'); const result = db.addMessage('test', 'user', 'hello', Date.now(), 'test-key-1'); console.log('Insert result:', result); const msgs = db.getMessages('test'); console.log('Messages:', msgs.length); const dupe = db.addMessage('test', 'user', 'hello', Date.now(), 'test-key-1'); console.log('Dupe result:', dupe);"`
Expected: DB loads, insert succeeds with seq=1, duplicate detected with duplicate=true

**Step 3: Clean up test data and commit**

Run: `rm -f /Users/jeremylahners/.openclaw/workspace/office/chat.db`

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add office/db.js
git commit -m "feat(chat-v2): add SQLite message store module

Single source of truth for chat messages with auto-increment
sequence numbers, idempotency key deduplication, and prepared
statements for efficient queries."
```

---

## Task 2: Migrate Existing messages.json to SQLite

**Files:**
- Create: `office/migrate-messages.js`

**Step 1: Create migration script**

```js
// office/migrate-messages.js
const fs = require('fs');
const path = require('path');
const { addMessage } = require('./db.js');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

function migrate() {
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.log('No messages.json found, nothing to migrate');
    return;
  }

  const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  let total = 0;
  let skipped = 0;

  for (const [agent, messages] of Object.entries(data)) {
    for (const msg of messages) {
      const role = msg.isBot ? 'assistant' : 'user';
      const content = msg.content || '';
      const timestamp = msg.timestamp || Date.now();
      // Use original ID as idempotency key to prevent re-import
      const idempotencyKey = msg.id || `legacy-${agent}-${timestamp}-${total}`;

      if (!content.trim()) {
        skipped++;
        continue;
      }

      const result = addMessage(agent, role, content, timestamp, idempotencyKey);
      if (result.duplicate) {
        skipped++;
      } else {
        total++;
      }
    }
  }

  console.log(`Migration complete: ${total} messages imported, ${skipped} skipped`);

  // Rename old file as backup
  const backupPath = MESSAGES_FILE + '.bak';
  fs.renameSync(MESSAGES_FILE, backupPath);
  console.log(`Original messages.json backed up to ${backupPath}`);
}

migrate();
```

**Step 2: Run migration**

Run: `cd /Users/jeremylahners/.openclaw/workspace/office && node migrate-messages.js`
Expected: Messages imported, messages.json renamed to messages.json.bak

**Step 3: Verify migrated data**

Run: `cd /Users/jeremylahners/.openclaw/workspace/office && node -e "const db = require('./db.js'); const agents = ['isla','marcus','harper','eli','sage','dash','julie','remy','lena','val','atlas','nova']; agents.forEach(a => { const msgs = db.getMessages(a); if(msgs.length) console.log(a + ':', msgs.length, 'messages'); });"`
Expected: Message counts per agent matching what was in messages.json

**Step 4: Commit**

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add office/migrate-messages.js office/chat.db
git commit -m "feat(chat-v2): add migration script and migrate existing messages

Imports messages.json into SQLite with idempotency keys to
prevent re-import. Backs up original file."
```

---

## Task 3: Add Server WebSocket for Frontend Push

**Files:**
- Modify: `office/gateway-api.js`

This task adds a WebSocket server to gateway-api.js that frontends connect to for real-time message push. It runs on the same HTTP server (port 8081) using the `ws` library's server upgrade handling.

**Step 1: Add WebSocket server setup**

At the top of `gateway-api.js`, after the existing requires (line ~5), add:

```js
const { WebSocketServer } = require('ws');
const chatDb = require('./db.js');
```

After `server.listen(...)` at the bottom (after line 983), add the WebSocket server:

```js
// --- Chat v2: WebSocket server for frontend push ---
const wss = new WebSocketServer({ server });

// Track connected clients and their subscriptions
// Each client: { ws, subscribedAgent: string|null }
const wsClients = new Set();

wss.on('connection', (ws) => {
  const client = { ws, subscribedAgent: null };
  wsClients.add(client);
  console.log('[WS-Chat] Client connected, total:', wsClients.size);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'subscribe' && msg.agent && agentSessions[msg.agent]) {
      client.subscribedAgent = msg.agent;
      // Send full history for this agent
      const messages = chatDb.getMessages(msg.agent);
      ws.send(JSON.stringify({
        type: 'history',
        agent: msg.agent,
        messages: messages.map(formatMessageForClient)
      }));
      console.log('[WS-Chat] Client subscribed to:', msg.agent, '- sent', messages.length, 'messages');
    }

    if (msg.type === 'unsubscribe') {
      client.subscribedAgent = null;
    }
  });

  ws.on('close', () => {
    wsClients.delete(client);
    console.log('[WS-Chat] Client disconnected, total:', wsClients.size);
  });
});

// Broadcast a committed message to all clients subscribed to that agent
function broadcastMessage(agent, message) {
  for (const client of wsClients) {
    if (client.subscribedAgent === agent && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({
        type: 'message_committed',
        agent,
        message
      }));
    }
  }
}

// Format a SQLite row for the frontend
function formatMessageForClient(row) {
  return {
    seq: row.seq,
    agent: row.agent,
    content: row.content,
    isBot: row.role === 'assistant',
    author: row.role === 'user' ? 'Jeremy' : (row.agent.charAt(0).toUpperCase() + row.agent.slice(1)),
    authorId: row.role === 'user' ? 'user' : row.agent,
    timestamp: row.timestamp,
    timestampFormatted: new Date(row.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
}
```

**Step 2: Replace the old chat REST endpoints**

Replace the existing `GET /chat/:agentKey` handler (lines ~444-456) with:

```js
// Chat v2: Get messages from SQLite
else if (req.url.startsWith('/chat/') && req.method === 'GET') {
  const agentKey = req.url.split('/')[2];
  if (!agentSessions[agentKey]) {
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
    return;
  }
  const messages = chatDb.getMessages(agentKey);
  res.end(JSON.stringify({ ok: true, messages: messages.map(formatMessageForClient) }));
}
```

Replace the existing `POST /chat/:agentKey` handler (lines ~460-502) with:

```js
// Chat v2: Commit a message to SQLite and broadcast
else if (req.url.startsWith('/chat/') && req.method === 'POST') {
  const agentKey = req.url.split('/')[2];
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { content, role, idempotencyKey, timestamp } = JSON.parse(body);
      if (!content || !role) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'Missing content or role' }));
        return;
      }
      if (!agentSessions[agentKey]) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
        return;
      }

      const ts = timestamp || Date.now();
      const result = chatDb.addMessage(agentKey, role, content, ts, idempotencyKey || null);

      if (!result.duplicate) {
        const clientMsg = formatMessageForClient({
          seq: result.seq, agent: agentKey, role, content, timestamp: ts
        });
        broadcastMessage(agentKey, clientMsg);

        // Push notification for agent replies
        if (role === 'assistant') {
          sendPushNotification(agentKey, content).catch(err => {
            console.error(`Push notification failed for ${agentKey}:`, err.message);
          });
        }
      }

      res.end(JSON.stringify({ ok: true, seq: result.seq, duplicate: result.duplicate }));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
  return;
}
```

**Step 3: Remove the old `/messages/:agentKey/agent-reply` endpoint**

Delete the entire `POST /messages/:agentKey/agent-reply` handler (lines ~505-563). It's replaced by the unified `POST /chat/:agentKey` above.

**Step 4: Remove old message file functions**

Delete these functions (they're replaced by `db.js`):
- `loadMessages()` (~lines 294-303)
- `saveMessages()` (~lines 306-312)
- `addMessage()` (~lines 315-322)
- `getMessages()` (~lines 325-328)

Also remove the `MESSAGES_FILE` constant (~line 13).

**Step 5: Verify the server starts**

Run: `cd /Users/jeremylahners/.openclaw/workspace/office && node -e "require('./gateway-api.js')" &; sleep 2; curl -s http://localhost:8081/status | head -c 200; kill %1 2>/dev/null`
Expected: Server starts without errors, status endpoint responds

**Step 6: Commit**

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add office/gateway-api.js
git commit -m "feat(chat-v2): add WebSocket push server, replace REST endpoints with SQLite

- WebSocket server on same port for subscribe/unsubscribe/push
- Single POST /chat/:agent endpoint commits to SQLite and broadcasts
- Remove old messages.json file operations and /agent-reply endpoint"
```

---

## Task 4: Add WebSocket Proxy for Chat Channel in serve.js

**Files:**
- Modify: `office/serve.js`

The frontend needs to reach the new chat WebSocket on the backend. We'll proxy `/ws` requests to the backend's WebSocket server (port 8081), similar to how `/gw` proxies to the Gateway.

**Step 1: Add /ws upgrade handler**

In `serve.js`, modify the existing `server.on('upgrade', ...)` handler to also handle `/ws`:

```js
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/gw') {
    // Existing Gateway proxy - keep as-is
    console.log('[WS] Proxying WebSocket to Gateway on port', GATEWAY_PORT);
    const gatewaySocket = net.createConnection(GATEWAY_PORT, 'localhost', () => {
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      gatewaySocket.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        `${headers}\r\n\r\n`
      );
      if (head && head.length) {
        gatewaySocket.write(head);
      }
      socket.pipe(gatewaySocket);
      gatewaySocket.pipe(socket);
    });
    gatewaySocket.on('error', (e) => {
      console.error('[WS] Gateway connection error:', e.message);
      socket.end();
    });
    socket.on('error', (e) => {
      console.error('[WS] Client socket error:', e.message);
      gatewaySocket.end();
    });
  } else if (req.url === '/ws') {
    // Chat v2: proxy to backend WebSocket server
    console.log('[WS] Proxying chat WebSocket to backend on port', BACKEND_PORT);
    const backendSocket = net.createConnection(BACKEND_PORT, 'localhost', () => {
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      backendSocket.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        `${headers}\r\n\r\n`
      );
      if (head && head.length) {
        backendSocket.write(head);
      }
      socket.pipe(backendSocket);
      backendSocket.pipe(socket);
    });
    backendSocket.on('error', (e) => {
      console.error('[WS] Backend chat WS error:', e.message);
      socket.end();
    });
    socket.on('error', (e) => {
      console.error('[WS] Client socket error:', e.message);
      backendSocket.end();
    });
  } else {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
  }
});
```

**Step 2: Commit**

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add office/serve.js
git commit -m "feat(chat-v2): add /ws proxy in serve.js for chat WebSocket

Proxies frontend WebSocket connections on /ws to backend
port 8081 for real-time chat push."
```

---

## Task 5: Rewrite Frontend Chat — Message Manager & WebSocket Client

**Files:**
- Modify: `office/index.html` (lines ~1591-2832)

This is the largest task. It replaces the entire frontend chat infrastructure. The changes are all within the `<script>` section of index.html.

**Step 1: Replace the cache/state variables (lines ~1591-1620)**

Find and replace the existing cache variables block. Remove:
- `chatLoadGeneration`
- `chatMessagesCache`
- `agentMessageCaches` Map
- `getAgentCache()` / `setAgentCache()`
- `agentStreamingState` Map
- `unreadMessages` Map

Replace with:

```js
// --- Chat v2: State ---
let currentAgentKey = null;
const messageCache = new Map(); // agentKey -> Message[] (populated from server only)
const streamingState = new Map(); // agentKey -> { el, text }
const unreadCounts = new Map(); // agentKey -> number

// Chat v2: WebSocket to backend for message push
let chatWs = null;
let chatWsReconnectTimer = null;

function chatWsConnect() {
  if (chatWs && chatWs.readyState <= 1) return;
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${wsProto}//${window.location.host}/ws`;
  console.log('[Chat-WS] Connecting to', url);
  chatWs = new WebSocket(url);

  chatWs.onopen = () => {
    console.log('[Chat-WS] Connected');
    // Re-subscribe to current agent if we had one
    if (currentAgentKey) {
      chatWs.send(JSON.stringify({ type: 'subscribe', agent: currentAgentKey }));
    }
  };

  chatWs.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === 'history') {
      handleHistory(msg.agent, msg.messages);
    }

    if (msg.type === 'message_committed') {
      handleNewMessage(msg.agent, msg.message);
    }
  };

  chatWs.onclose = () => {
    console.log('[Chat-WS] Disconnected, reconnecting in 3s');
    chatWsReconnectTimer = setTimeout(chatWsConnect, 3000);
  };

  chatWs.onerror = (e) => {
    console.error('[Chat-WS] Error:', e);
  };
}

chatWsConnect();
```

**Step 2: Add the message handler functions**

Add these right after the WebSocket client code:

```js
// Handle full history from server (on subscribe)
function handleHistory(agent, messages) {
  messageCache.set(agent, messages);

  // Only render if we're viewing this agent
  if (agent === currentAgentKey) {
    renderAllMessages(agent, messages);
  }
}

// Handle a single new committed message from server
function handleNewMessage(agent, message) {
  // Append to cache
  if (!messageCache.has(agent)) messageCache.set(agent, []);
  const cache = messageCache.get(agent);

  // Dedupe by seq (server may re-send on reconnect)
  if (cache.length > 0 && cache[cache.length - 1].seq >= message.seq) return;
  cache.push(message);

  if (agent === currentAgentKey) {
    // Remove streaming element if this is the committed version of a streamed message
    if (message.isBot) {
      clearStreamingEl(agent);
    }
    appendMessageEl(message);
    autoScroll();
  } else {
    // Increment unread for other agents
    unreadCounts.set(agent, (unreadCounts.get(agent) || 0) + 1);
    const agentEl = document.querySelector(`.agent.${agent}`);
    if (agentEl) agentEl.classList.add('has-unread');
  }
}
```

**Step 3: Add DOM rendering functions**

Replace the old `renderChatMessages()` function (lines ~1654-1707) with:

```js
// Create a single message DOM element
function createMessageEl(m) {
  const isUser = !m.isBot;
  const agentEl = document.querySelector(`.agent.${currentAgentKey}`);
  const agentEmoji = agentEl?.dataset?.emoji || '🤖';

  const el = document.createElement('div');
  el.className = `message-bubble ${isUser ? 'you' : 'them'}`;
  el.dataset.seq = m.seq;
  el.innerHTML = `
    <div class="bubble-avatar ${isUser ? 'jeremy' : 'bot'}">${isUser ? '👑' : agentEmoji}</div>
    <div class="bubble-content">
      <div class="bubble-text">${isUser ? escapeHtml(m.content || '') : formatMarkdown(m.content || '')}</div>
      <div class="bubble-time">${m.timestampFormatted || ''}</div>
    </div>`;
  return el;
}

// Render full message list (on agent switch)
function renderAllMessages(agent, messages) {
  const filtered = messages.filter(m => {
    if (!m.isBot) return true;
    const content = (m.content || '').trim();
    return !/^(NO_REPLY|NO_?|HEARTBEAT_OK|HEARTBEAT_?|ANNOUNCE_SKIP|ANNOUNCE_?)\s*$/i.test(content);
  });

  if (filtered.length === 0) {
    chatMessages.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Start a conversation...</div>';
    return;
  }

  chatMessages.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const m of filtered) {
    fragment.appendChild(createMessageEl(m));
  }
  chatMessages.appendChild(fragment);

  // Re-attach streaming element if agent has one in progress
  const ss = streamingState.get(agent);
  if (ss?.el) {
    chatMessages.appendChild(ss.el);
  }

  // Render any charts
  setTimeout(() => renderPendingCharts(), 50);

  // Scroll to bottom
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// Append a single message element (for live updates)
function appendMessageEl(message) {
  // Filter coordination signals
  if (message.isBot) {
    const content = (message.content || '').trim();
    if (/^(NO_REPLY|NO_?|HEARTBEAT_OK|HEARTBEAT_?|ANNOUNCE_SKIP|ANNOUNCE_?)\s*$/i.test(content)) return;
  }

  // Remove placeholder if present
  const placeholder = chatMessages.querySelector('div[style*="text-align: center"]');
  if (placeholder) placeholder.remove();

  chatMessages.appendChild(createMessageEl(message));
  setTimeout(() => renderPendingCharts(), 50);
}

// Auto-scroll only if user is near the bottom
function autoScroll() {
  const threshold = 150; // px from bottom
  const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
  if (distFromBottom < threshold) {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }
}
```

**Step 4: Simplify streaming layer**

Replace `getStreamingState`, `getStreamingEl`, `updateStreamingText`, `finalizeStreaming` with:

```js
// --- Streaming (visual only, not persisted) ---

function getOrCreateStreamingEl(agentKey) {
  let ss = streamingState.get(agentKey);
  if (ss?.el) return ss.el;

  const agentEl = document.querySelector(`.agent.${agentKey}`);
  const emoji = agentEl?.dataset?.emoji || '🤖';
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const el = document.createElement('div');
  el.className = 'message-bubble them streaming';
  el.innerHTML = `
    <div class="bubble-avatar bot">${emoji}</div>
    <div class="bubble-content">
      <div class="bubble-text streaming-text"><span class="typing-indicator">Thinking...</span></div>
      <div class="bubble-time">${ts}</div>
    </div>`;

  ss = { el, text: '' };
  streamingState.set(agentKey, ss);

  if (currentAgentKey === agentKey) {
    chatMessages.appendChild(el);
    autoScroll();
  }

  return el;
}

function updateStreaming(agentKey, text) {
  const ss = streamingState.get(agentKey);
  if (!ss) {
    getOrCreateStreamingEl(agentKey);
    return updateStreaming(agentKey, text);
  }
  // Only accept text >= current length (deltas are cumulative)
  if (text.length < ss.text.length) return;
  ss.text = text;
  const textEl = ss.el.querySelector('.streaming-text');
  if (textEl) {
    textEl.innerHTML = formatMarkdown(text);
    setTimeout(() => renderPendingCharts(), 50);
  }
  if (currentAgentKey === agentKey) autoScroll();
}

function clearStreamingEl(agentKey) {
  const ss = streamingState.get(agentKey);
  if (ss?.el?.parentElement) ss.el.remove();
  streamingState.delete(agentKey);
}
```

**Step 5: Rewrite `loadAgentChat()`**

Replace the entire `loadAgentChat()` function (lines ~2107-2332) with:

```js
async function loadAgentChat(agentKey) {
  if (currentAgentKey === agentKey) return;

  // Save draft for previous agent
  saveDraftForCurrentAgent();

  currentAgentKey = agentKey;

  // Load draft for new agent
  loadDraftForAgent(agentKey);

  // Clear unread
  unreadCounts.set(agentKey, 0);
  const agentEl = document.querySelector(`.agent.${agentKey}`);
  if (agentEl) agentEl.classList.remove('has-unread');

  // Update channel name
  const channelName = agentChannels[agentKey]?.name || `#${agentKey}`;
  document.getElementById('chatChannelName').textContent = channelName;

  // Show loading state
  chatMessages.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Loading messages...</div>';

  // If we have cached messages, render immediately while subscribe refreshes
  const cached = messageCache.get(agentKey);
  if (cached && cached.length > 0) {
    renderAllMessages(agentKey, cached);
  }

  // Subscribe via chat WebSocket — server will send fresh history
  if (chatWs && chatWs.readyState === 1) {
    chatWs.send(JSON.stringify({ type: 'subscribe', agent: agentKey }));
  }

  // Register Gateway streaming callback for this agent
  const sessionKey = agentSessionKey(agentKey);
  // Clear any existing callback
  gwChatCallbacks.clear();

  gwChatCallbacks.set(sessionKey, {
    onDelta: (text) => {
      updateStreaming(agentKey, text);
    },
    onFinal: () => {
      const ss = streamingState.get(agentKey);
      if (!ss?.text) {
        clearStreamingEl(agentKey);
        return;
      }

      const trimmed = ss.text.trim();
      // Skip coordination signals
      if (/^(NO_REPLY|NO_?|HEARTBEAT_OK|HEARTBEAT_?|ANNOUNCE_SKIP|ANNOUNCE_?)\s*$/i.test(trimmed)) {
        clearStreamingEl(agentKey);
        return;
      }

      // Commit to server — server will broadcast back to us via chat WebSocket
      const idempotencyKey = `agent-${agentKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      fetch(`${API_BASE}/chat/${agentKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: ss.text,
          role: 'assistant',
          idempotencyKey,
          timestamp: Date.now()
        })
      }).catch(e => console.error('[Chat-v2] Failed to commit agent reply:', e));

      // Streaming element will be removed when message_committed arrives via WS
    },
    onError: (payload) => {
      console.error('[GW] Chat error:', payload);
      clearStreamingEl(agentKey);
    }
  });
}
```

**Step 6: Rewrite `sendMessage()`**

Replace the existing `sendMessage()` function (lines ~2456-2558). Keep the same structure but simplify the caching logic:

```js
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentAgentKey) return;

  // Check for special commands (keep existing logic)
  const nlResult = parseNaturalLanguage(text, currentAgentKey);
  const cmdResult = handleSpecialCommands(text);
  if (cmdResult.handled) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
    clearTimeout(draftSaveTimer);
    delete messageDrafts[currentAgentKey];
    localStorage.setItem('messageDrafts', JSON.stringify(messageDrafts));
    const sysEl = document.createElement('div');
    sysEl.style.cssText = 'text-align: center; padding: 12px; margin: 8px 0; background: rgba(14, 165, 233, 0.1); border-radius: 8px; font-size: 0.85rem;';
    sysEl.innerHTML = formatMarkdown(cmdResult.response);
    chatMessages.appendChild(sysEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.focus();
    return;
  }

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  clearTimeout(draftSaveTimer);
  delete messageDrafts[currentAgentKey];
  localStorage.setItem('messageDrafts', JSON.stringify(messageDrafts));

  // Commit user message to server — server broadcasts back to us
  const idempotencyKey = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fetch(`${API_BASE}/chat/${currentAgentKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: text,
      role: 'user',
      idempotencyKey,
      timestamp: Date.now()
    })
  }).catch(e => console.error('[Chat-v2] Failed to commit user message:', e));

  // Send via Gateway WebSocket for agent delivery
  if (gwConnected) {
    try {
      const sessionKey = agentSessionKey(currentAgentKey);
      await gwRequest('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey
      });
    } catch (e) {
      console.error('[GW] chat.send failed:', e);
      const errEl = document.createElement('div');
      errEl.style.cssText = 'text-align: center; color: #f59e0b; padding: 8px; font-size: 0.8rem;';
      errEl.textContent = `Failed to send: ${e.message || 'WebSocket not connected'}`;
      chatMessages.appendChild(errEl);
      autoScroll();
    }
  } else {
    const errEl = document.createElement('div');
    errEl.style.cssText = 'text-align: center; color: #f59e0b; padding: 8px; font-size: 0.8rem;';
    errEl.textContent = 'Gateway not connected. Reconnecting...';
    chatMessages.appendChild(errEl);
    gwConnect();
  }

  chatInput.focus();
}
```

**Step 7: Remove all old polling/cache code**

Delete entirely:
- `pollChatMessages()` function (~lines 2733-2804)
- `startChatPolling()` function (~lines 2807-2820)
- `stopChatPolling()` function (~lines 2823-2829)
- `lastMessageIds` variable (~line 2731)
- `chatPollInterval` variable (~line 2730)
- Any comments referencing `startChatPolling` (~line 2831)
- The old `markUnread()` / `clearUnread()` functions (~lines 1626-1646) — replaced by inline logic in `handleNewMessage` and `loadAgentChat`
- The old `appendUserMessage()` function (~lines 1979-1996) — replaced by server push
- The old `renderChatMessages()` function — replaced by `renderAllMessages`

**Step 8: Verify the page loads and chat works**

Start both servers and open the dashboard in a browser:
```bash
cd /Users/jeremylahners/.openclaw/workspace/office
node gateway-api.js &
node serve.js &
# Open http://localhost:3001 and test:
# 1. Click an agent — should see message history
# 2. Send a message — should appear instantly
# 3. Switch agents — should show correct history
# 4. Agent response should stream then appear as committed message
```

**Step 9: Commit**

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add office/index.html
git commit -m "feat(chat-v2): rewrite frontend chat with WebSocket push + incremental DOM

- Single message cache populated from server WebSocket
- Subscribe/unsubscribe model replaces polling
- Incremental appendChild replaces innerHTML replacement
- Remove all polling, fingerprinting, generation counters, dual caches
- Streaming is visual-only, messages committed to server on finalize"
```

---

## Task 6: Cleanup & Verification

**Files:**
- Modify: `office/gateway-api.js` (remove dead code)
- Modify: `office/index.html` (remove dead code)

**Step 1: Remove any remaining references to old system**

Search for and remove any remaining references to:
- `messages.json` (except in migrate script)
- `loadMessages` / `saveMessages` (old file functions)
- `chatMessagesCache`
- `chatLoadGeneration`
- `lastMessageIds`
- `chatPollInterval`
- `pollChatMessages`
- `startChatPolling` / `stopChatPolling`
- `/messages/:agentKey/agent-reply`

Run: `grep -rn "messages\.json\|loadMessages\|saveMessages\|chatMessagesCache\|chatLoadGeneration\|lastMessageIds\|chatPollInterval\|pollChatMessages\|startChatPolling\|stopChatPolling\|agent-reply" /Users/jeremylahners/.openclaw/workspace/office/gateway-api.js /Users/jeremylahners/.openclaw/workspace/office/index.html /Users/jeremylahners/.openclaw/workspace/office/serve.js`

Expected: No matches (only migrate script should reference messages.json)

**Step 2: Add chat.db to .gitignore**

```bash
echo "office/chat.db" >> /Users/jeremylahners/.openclaw/workspace/.gitignore
echo "office/messages.json.bak" >> /Users/jeremylahners/.openclaw/workspace/.gitignore
```

**Step 3: Test full flow end-to-end**

Manual test checklist:
1. Start servers (`node gateway-api.js` + `node serve.js`)
2. Open dashboard in browser
3. Click on Isla — history loads from SQLite
4. Send a message — appears instantly (via server push, not optimistic)
5. Agent responds — streaming shows, then committed message replaces it
6. Switch to Marcus — Isla's history preserved in cache, Marcus history loads
7. Switch back to Isla — history restored instantly from cache, then refreshed from server
8. Send duplicate message rapidly — only one appears (idempotency key)
9. Open in second tab — both tabs show same messages, new messages appear in both

**Step 4: Commit**

```bash
cd /Users/jeremylahners/.openclaw/workspace
git add -A
git commit -m "chore(chat-v2): cleanup dead code, add gitignore entries

Remove all references to old polling/cache system.
Add chat.db and messages.json.bak to gitignore."
```

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | SQLite database module (`db.js`) | None |
| 2 | Migrate `messages.json` → SQLite | Task 1 |
| 3 | Backend WebSocket server + new REST endpoints | Task 1 |
| 4 | WebSocket proxy in `serve.js` | Task 3 |
| 5 | Frontend rewrite (biggest task) | Tasks 3, 4 |
| 6 | Cleanup & verification | Task 5 |
