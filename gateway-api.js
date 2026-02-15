// OpenClaw Native Web Interface - Gateway API Backend
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { WebSocketServer, WebSocket } = require('ws');
const chatDb = require('./db.js');

// Load config
const config = require('./config.js');

const MEMORY_DIR = path.join(__dirname, '..', 'memory', 'agents');
const STATUS_FILE = path.join(__dirname, '..', 'memory', 'agent-status.json');
const INTERACTIONS_FILE = path.join(__dirname, '..', 'memory', 'agent-interactions.json');
const ACTION_ITEMS_FILE = path.join(__dirname, 'action-items.json');
const PUSH_SUBSCRIPTIONS_FILE = path.join(__dirname, 'push-subscriptions.json');
const STANDUP_FILE = path.join(__dirname, 'standup.json');
const PORT = 8081;

// OpenClaw Gateway config
const GATEWAY_URL = `http://127.0.0.1:${config.gatewayPort}`;
const GATEWAY_TOKEN = config.gatewayToken;

// Agent session mapping - Webchat native sessions
const agentSessions = {
  isla: "agent:isla:webchat:user",
  marcus: "agent:marcus:webchat:user",
  harper: "agent:harper:webchat:user",
  eli: "agent:eli:webchat:user",
  sage: "agent:sage:webchat:user",
  julie: "agent:julie:webchat:user",
  dash: "agent:dash:webchat:user",
  remy: "agent:remy:webchat:user",
  lena: "agent:lena:webchat:user",
  val: "agent:val:webchat:user",
  atlas: "agent:atlas:webchat:user",
  nova: "agent:nova:webchat:user"
};

// Simple in-memory rate limiter
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);
  
  if (!record || (now - record.windowStart) > RATE_LIMIT_WINDOW) {
    rateLimits.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits) {
    if ((now - record.windowStart) > RATE_LIMIT_WINDOW * 2) {
      rateLimits.delete(ip);
    }
  }
}, 300000);

// Reverse lookup: session key -> agent name
const sessionToAgent = {};
for (const [agent, session] of Object.entries(agentSessions)) {
  sessionToAgent[session] = agent;
}

// ============================================================
// GATEWAY WEBSOCKET CLIENT (server-owned connection)
// ============================================================

let gwSocket = null;
let gwConnected = false;
let gwRequestId = 0;
const gwPendingRequests = new Map(); // id -> { resolve, reject }
const streamingAccumulator = new Map(); // sessionKey -> accumulated text

function gwNextId() { return `req-${++gwRequestId}`; }

// Track last known message timestamps per agent to detect new messages
const lastMessageTimestamps = new Map(); // agentKey -> timestamp

// Poll sessions.history to detect agent-to-agent messages
async function pollAgentSessions() {
  for (const [agentKey, sessionKey] of Object.entries(agentSessions)) {
    try {
      const history = await gwRequest('chat.history', {
        sessionKey,
        limit: 10
      });
      
      if (!history || !history.messages) continue;
      
      const lastKnownTimestamp = lastMessageTimestamps.get(agentKey) || 0;
      let newLatestTimestamp = lastKnownTimestamp;
      
      // Process messages newer than last known
      for (const msg of history.messages) {
        const msgTimestamp = msg.timestamp || 0;
        if (msgTimestamp <= lastKnownTimestamp) continue;
        
        // Found a new message!
        if (msg.role === 'user') {
          const text = extractMessageText(msg);
          if (!text || NOISE_REPLIES.test(text.trim())) continue;
          
          // Store in SQLite with metadata indicating it's an agent-to-agent message
          const idempotencyKey = `poll-user-${agentKey}-${msgTimestamp}`;
          const metadata = { source: 'agent' }; // Mark as agent-to-agent, not from Jeremy
          const result = chatDb.addMessage(agentKey, 'user', text, msgTimestamp, idempotencyKey, metadata);
          
          if (!result.duplicate) {
            console.log(`[GW] 📨 New incoming message for ${agentKey}: "${text.substring(0, 50)}..."`);
            
            const clientMsg = formatMessageForClient({
              seq: result.seq, agent: agentKey, role: 'user', content: text, timestamp: msgTimestamp, metadata
            });
            
            broadcastMessage(agentKey, clientMsg);
          }
        }
        
        newLatestTimestamp = Math.max(newLatestTimestamp, msgTimestamp);
      }
      
      if (newLatestTimestamp > lastKnownTimestamp) {
        lastMessageTimestamps.set(agentKey, newLatestTimestamp);
      }
    } catch (err) {
      console.error(`[GW] Failed to poll ${agentKey}:`, err.message);
    }
  }
}

// Start polling for agent-to-agent messages
function startAgentMessagePolling() {
  console.log('[GW] Starting agent message polling (every 3 seconds)...');
  
  // Initial sync
  pollAgentSessions();
  
  // Poll every 3 seconds
  setInterval(pollAgentSessions, 3000);
}

function gwConnect() {
  if (gwSocket && gwSocket.readyState <= WebSocket.CONNECTING) return;

  const url = `ws://127.0.0.1:${config.gatewayPort}`;
  console.log('[GW] Connecting to', url);
  gwSocket = new WebSocket(url, {
    headers: { Origin: `http://127.0.0.1:${config.gatewayPort}` }
  });

  gwSocket.on('open', () => {
    console.log('[GW] WebSocket open, sending connect...');
    const connId = gwNextId();
    gwSendRaw({
      type: 'req', id: connId, method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        auth: { token: GATEWAY_TOKEN }
      }
    });
    gwPendingRequests.set(connId, {
      resolve: (payload) => {
        gwConnected = true;
        console.log('[GW] Connected!', payload.server?.version);
        
        // Start polling for agent-to-agent messages
        startAgentMessagePolling();
      },
      reject: (err) => console.error('[GW] Connect failed:', err)
    });
  });

  gwSocket.on('message', (data) => {
    let frame;
    try { frame = JSON.parse(data.toString()); } catch { return; }

    // Response to a request
    if (frame.type === 'res' && frame.id) {
      const pending = gwPendingRequests.get(frame.id);
      if (pending) {
        gwPendingRequests.delete(frame.id);
        if (frame.ok) pending.resolve(frame.payload);
        else pending.reject(frame.error);
      }
    }

    // Streaming chat event
    if (frame.type === 'event' && frame.event === 'chat') {
      handleGatewayChatEvent(frame.payload);
    }
  });

  gwSocket.on('close', () => {
    gwConnected = false;
    console.log('[GW] WebSocket closed, reconnecting in 3s...');
    setTimeout(gwConnect, 3000);
  });

  gwSocket.on('error', (e) => {
    console.error('[GW] WebSocket error:', e.message);
  });
}

function gwSendRaw(data) {
  if (gwSocket && gwSocket.readyState === WebSocket.OPEN) {
    gwSocket.send(JSON.stringify(data));
  }
}

function gwRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!gwSocket || gwSocket.readyState !== WebSocket.OPEN) {
      reject(new Error('Gateway WebSocket not connected'));
      return;
    }
    const id = gwNextId();
    gwPendingRequests.set(id, { resolve, reject });
    gwSendRaw({ type: 'req', id, method, params });
    setTimeout(() => {
      if (gwPendingRequests.has(id)) {
        gwPendingRequests.delete(id);
        reject(new Error('Gateway request timeout'));
      }
    }, 60000);
  });
}

// Extract text from an OpenClaw message object
// Messages have shape: { role, content: string | [{ type: "text", text: "..." }, ...], timestamp }
function extractMessageText(message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('\n');
  }
  if (typeof message.text === 'string') return message.text;
  return '';
}

const NOISE_REPLIES = /^(NO_REPLY|NO_?|HEARTBEAT_OK|HEARTBEAT_?|ANNOUNCE_SKIP|ANNOUNCE_?)\s*$/i;

function handleGatewayChatEvent(payload) {
  const sessionKey = payload.sessionKey;
  const agent = sessionToAgent[sessionKey];
  if (!agent) return; // unknown session

  // Handle incoming messages (role="user") from chat.subscribe events
  // This captures agent-to-agent messages sent via sessions_send
  if (payload.state === 'final' && payload.message && payload.message.role === 'user') {
    const text = extractMessageText(payload.message);
    
    // Filter noise replies and empty messages
    if (!text || NOISE_REPLIES.test(text.trim())) {
      return;
    }

    // Store incoming message in SQLite
    const now = Date.now();
    const idempotencyKey = `gw-user-${agent}-${now}-${Math.random().toString(36).slice(2)}`;
    const result = chatDb.addMessage(agent, 'user', text, now, idempotencyKey);

    if (!result.duplicate) {
      console.log(`[GW] 📨 Incoming message for ${agent}: "${text.substring(0, 50)}..."`);
      
      const clientMsg = formatMessageForClient({
        seq: result.seq, agent, role: 'user', content: text, timestamp: now
      });

      // Broadcast to connected clients
      broadcastMessage(agent, clientMsg);
    }
    
    // Don't process further - this is just an incoming message
    return;
  }

  if (payload.state === 'delta' && payload.message) {
    const text = extractMessageText(payload.message);
    if (!text) return;
    streamingAccumulator.set(sessionKey, text);
    broadcastStreaming(agent, { type: 'stream_delta', agent, text });
  }

  else if (payload.state === 'final') {
    // Final event may carry the complete message
    if (payload.message) {
      const text = extractMessageText(payload.message);
      if (text) streamingAccumulator.set(sessionKey, text);
    }

    const accumulatedText = streamingAccumulator.get(sessionKey) || '';
    streamingAccumulator.delete(sessionKey);

    // Filter noise replies
    if (!accumulatedText || NOISE_REPLIES.test(accumulatedText.trim())) {
      broadcastStreaming(agent, { type: 'stream_final', agent, text: '', filtered: true });
      return;
    }

    // Commit to SQLite
    const now = Date.now();
    const idempotencyKey = `gw-${agent}-${now}-${Math.random().toString(36).slice(2)}`;
    const result = chatDb.addMessage(agent, 'assistant', accumulatedText, now, idempotencyKey);

    if (!result.duplicate) {
      const clientMsg = formatMessageForClient({
        seq: result.seq, agent, role: 'assistant', content: accumulatedText, timestamp: now
      });

      // Broadcast committed message to all subscribed clients
      broadcastMessage(agent, clientMsg);

      // Send push notification
      sendPushNotification(agent, accumulatedText).catch(err => {
        console.error(`Push notification failed for ${agent}:`, err.message);
      });
    }

    // Tell streaming clients to finalize
    broadcastStreaming(agent, { type: 'stream_final', agent, text: accumulatedText });
  }

  else if (payload.state === 'error' || payload.state === 'aborted') {
    streamingAccumulator.delete(sessionKey);
    broadcastStreaming(agent, { type: 'stream_error', agent, error: payload.error || 'Agent error' });
  }
}

// Send streaming events to all connected /ws clients subscribed to this agent
function broadcastStreaming(agent, payload) {
  const data = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.subscribedAgent === agent && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

// Start Gateway connection
gwConnect();

// Agent channel names for display
const agentChannels = {
  isla: { name: "#hq" },
  marcus: { name: "#mhc" },
  harper: { name: "#qa" },
  eli: { name: "#cto-dev" },
  sage: { name: "#research" },
  julie: { name: "#marketing" },
  dash: { name: "#dash" },
  remy: { name: "#chef" },
  lena: { name: "#gym" },
  val: { name: "#finance" },
  atlas: { name: "#travel" },
  nova: { name: "#hr" }
};

// ============================================================
// PWA PUSH NOTIFICATIONS
// ============================================================

// Configure VAPID for web push
if (config.vapid) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
  console.log('✅ Web Push configured with VAPID keys');
} else {
  console.warn('⚠️  VAPID keys not configured - push notifications disabled');
}

// Load push subscriptions from file
function loadPushSubscriptions() {
  try {
    if (fs.existsSync(PUSH_SUBSCRIPTIONS_FILE)) {
      const data = fs.readFileSync(PUSH_SUBSCRIPTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load push subscriptions:', e.message);
  }
  return [];
}

// Save push subscriptions to file
function savePushSubscriptions(subscriptions) {
  try {
    fs.writeFileSync(
      PUSH_SUBSCRIPTIONS_FILE,
      JSON.stringify(subscriptions, null, 2),
      'utf-8'
    );
  } catch (e) {
    console.error('Failed to save push subscriptions:', e.message);
  }
}

// In-memory storage of push subscriptions
let pushSubscriptions = loadPushSubscriptions();

// Send push notification to all subscribers
async function sendPushNotification(agentKey, message) {
  if (!config.vapid) {
    console.log('Push notifications disabled (no VAPID keys)');
    return;
  }
  
  if (pushSubscriptions.length === 0) {
    console.log('No push subscribers');
    return;
  }
  
  const agentName = agentKey.charAt(0).toUpperCase() + agentKey.slice(1);
  const messagePreview = message.substring(0, 100) + (message.length > 100 ? '...' : '');
  
  const payload = JSON.stringify({
    title: agentName, // iOS iMessage pattern: just the sender name
    body: messagePreview,
    agentKey: agentKey,
    url: `/?agent=${agentKey}`,
    timestamp: Date.now()
  });
  
  const results = await Promise.allSettled(
    pushSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        return { success: true };
      } catch (err) {
        // If subscription expired (410 Gone), remove it
        if (err.statusCode === 410) {
          console.log('Removing expired push subscription');
          pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== subscription.endpoint);
          savePushSubscriptions(pushSubscriptions);
        }
        throw err;
      }
    })
  );
  
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  console.log(`📤 Push notifications sent: ${succeeded} succeeded, ${failed} failed`);
}

// ============================================================

// Call Gateway API
async function gatewayCall(tool, args) {
  try {
    const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tool, args })
    });
    return await response.json();
  } catch (e) {
    console.error('Gateway call failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// Load status from each agent's memory file
function loadStatus() {
  const statuses = {};
  
  for (const agentKey of Object.keys(agentSessions)) {
    const memoryPath = path.join(MEMORY_DIR, `${agentKey}.md`);
    
    if (fs.existsSync(memoryPath)) {
      try {
        const content = fs.readFileSync(memoryPath, 'utf-8');
        const lines = content.split('\n');
        
        let state = 'idle';
        let task = 'Available';
        let lastActive = new Date().toISOString();
        
        // Look for "## Current Status" section
        let inStatusSection = false;
        let inTodaySection = false;
        let todayEntries = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Track sections
          if (line.startsWith('## Current Status')) {
            inStatusSection = true;
            inTodaySection = false;
          } else if (line.startsWith("## Today's Activity") || line.startsWith('## Recent Work')) {
            inTodaySection = true;
            inStatusSection = false;
          } else if (line.startsWith('##')) {
            inStatusSection = false;
            inTodaySection = false;
          }
          
          // Extract from Current Status section
          if (inStatusSection && line.startsWith('-') || line.startsWith('*')) {
            task = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
            // Detect state from keywords
            if (line.toLowerCase().includes('working') || line.includes('🟢')) state = 'working';
            else if (line.toLowerCase().includes('thinking') || line.includes('🔵')) state = 'thinking';
            else if (line.toLowerCase().includes('meeting') || line.includes('🔴')) state = 'meeting';
            else if (line.includes('🟡')) state = 'idle';
          }
          
          // Extract from Today's Activity section (table format)
          if (inTodaySection && line.startsWith('|') && !line.includes('---') && !line.includes('Time')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              todayEntries.push(parts[1]); // The "Action" column
            }
          }
        }
        
        // If we found today's activities, use the most recent one
        if (todayEntries.length > 0 && task === 'Available') {
          task = todayEntries[todayEntries.length - 1];
        }
        
        // Extract last modified time from file stats
        const stats = fs.statSync(memoryPath);
        lastActive = stats.mtime.toISOString();
        
        statuses[agentKey] = { state, task, lastActive };
      } catch (e) {
        console.error(`Failed to load status for ${agentKey}:`, e.message);
        statuses[agentKey] = {
          state: 'idle',
          task: 'Available',
          lastActive: new Date().toISOString()
        };
      }
    } else {
      statuses[agentKey] = {
        state: 'idle',
        task: 'No memory file',
        lastActive: new Date().toISOString()
      };
    }
  }
  
  return statuses;
}

// Save status is deprecated - agents update their own memory files
function saveStatus(status) {
  console.warn('⚠️ saveStatus() is deprecated - agents should update their own memory files');
  // No-op - agents manage their own memory
}

// Load interactions
function loadInteractions() {
  try {
    if (fs.existsSync(INTERACTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(INTERACTIONS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { recent: [], active: [] };
}

// Save interactions
function saveInteractions(interactions) {
  fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
}

// Load action items
function loadActionItems() {
  try {
    if (fs.existsSync(ACTION_ITEMS_FILE)) {
      return JSON.parse(fs.readFileSync(ACTION_ITEMS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load action items:', e.message);
  }
  return [];
}

// Save action items
function saveActionItems(items) {
  try {
    fs.writeFileSync(ACTION_ITEMS_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    console.error('Failed to save action items:', e.message);
  }
}

// Log interaction
function logInteraction(from, to, topic, type = 'message') {
  const interactions = loadInteractions();
  
  const interaction = {
    id: Date.now().toString(),
    from,
    to,
    topic,
    type,
    timestamp: new Date().toISOString()
  };
  
  interactions.recent.unshift(interaction);
  if (interactions.recent.length > 50) {
    interactions.recent = interactions.recent.slice(0, 50);
  }
  
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  interactions.active = interactions.recent.filter(i => 
    new Date(i.timestamp).getTime() > fiveMinAgo
  );
  
  saveInteractions(interactions);
  return interaction;
}

// Parse agent memory
function parseAgentMemory(content) {
  const sections = {
    knowledge: [],
    learned: [],
    pending: [],
    today: []
  };
  
  let currentSection = null;
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('## Today') || line.includes('## Current Status')) {
      currentSection = 'today';
    } else if (line.includes('## Current Knowledge') || line.includes('## Current')) {
      currentSection = 'knowledge';
    } else if (line.includes('## Learned From Others') || line.includes('## Learned From')) {
      currentSection = 'learned';
    } else if (line.includes('## Pending')) {
      currentSection = 'pending';
    } else if (line.startsWith('- ') && currentSection === 'today') {
      sections.today.push({ text: line.substring(2) });
    } else if (line.startsWith('**') && currentSection === 'today') {
      sections.today.push({ text: line });
    } else if (line.startsWith('| ') && !line.includes('---') && currentSection === 'learned') {
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3 && parts[0] !== 'What') {
        sections.learned.push({
          text: parts[0],
          source: `From ${parts[1]}`,
          when: parts[2]
        });
      }
    } else if (line.startsWith('- ') && currentSection === 'knowledge') {
      sections.knowledge.push({ text: line.substring(2) });
    } else if (line.startsWith('- [ ]') && currentSection === 'pending') {
      sections.pending.push({ text: line.substring(6), done: false });
    } else if (line.startsWith('- [x]') && currentSection === 'pending') {
      sections.pending.push({ text: line.substring(6), done: true });
    }
  }
  
  return sections;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Rate limiting
  const clientIp = req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.statusCode = 429;
    res.end(JSON.stringify({ error: 'Too many requests - try again later' }));
    return;
  }
  
  // Status endpoints - read-only, read from agent memory files
  if (req.url === '/status') {
    const statuses = loadStatus();
    res.end(JSON.stringify(statuses));
  } 
  else if (req.url.startsWith('/status/') && req.method === 'POST') {
    res.statusCode = 410; // Gone
    res.end(JSON.stringify({ 
      error: 'Status updates disabled',
      message: 'Agents should update their own memory files in memory/agents/{name}.md'
    }));
    return;
  }
  
  // Agent memory
  else if (req.url.startsWith('/agent/')) {
    const name = req.url.split('/')[2];
    const filePath = path.join(MEMORY_DIR, `${name}.md`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.end(JSON.stringify(parseAgentMemory(content)));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Agent not found' }));
    }
  }
  
  // Gateway status
  else if (req.url === '/gateway/status' && req.method === 'GET') {
    res.end(JSON.stringify({ ok: true, connected: gwConnected }));
  }

  // Chat v2: Send message to agent (commits user msg + forwards to Gateway)
  else if (req.url.match(/^\/chat\/[a-z]+\/send$/) && req.method === 'POST') {
    const agentKey = req.url.split('/')[2];
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { content } = JSON.parse(body);
        if (!content) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Missing content' }));
          return;
        }

        // 1. Commit user message to SQLite
        const now = Date.now();
        const idempotencyKey = `user-${now}-${Math.random().toString(36).slice(2)}`;
        const result = chatDb.addMessage(agentKey, 'user', content, now, idempotencyKey);

        // 2. DON'T broadcast - client already has optimistic message
        // (Broadcasts from Gateway for external sources still work via event handler)

        // 3. Send to Gateway for agent delivery
        if (!gwConnected) {
          res.end(JSON.stringify({ ok: false, error: 'Gateway not connected', seq: result.seq }));
          return;
        }

        const sessionKey = agentSessions[agentKey];
        await gwRequest('chat.send', { sessionKey, message: content, idempotencyKey });

        res.end(JSON.stringify({ ok: true, seq: result.seq }));
      } catch (e) {
        console.error('[Chat-Send] Error:', e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

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
        // Validate role to prevent injection
        const validRoles = ['user', 'assistant', 'system'];
        if (!validRoles.includes(role)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Invalid role - must be user, assistant, or system' }));
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
  
  // Agent custom tab data
  else if (req.url.match(/^\/agent-data\/[a-z]+\/[a-z-]+$/) && req.method === 'GET') {
    const parts = req.url.split('/');
    const agentKey = parts[2];
    const tabId = parts[3];

    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }

    const basePath = path.join(__dirname, '..', 'files', 'agents', agentKey);
    const jsonPath = path.join(basePath, `${tabId}.json`);
    const mdPath = path.join(basePath, `${tabId}.md`);

    try {
      if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        res.end(JSON.stringify({ ok: true, format: 'json', data }));
      } else if (fs.existsSync(mdPath)) {
        const content = fs.readFileSync(mdPath, 'utf8');
        res.end(JSON.stringify({ ok: true, format: 'markdown', content }));
      } else {
        res.end(JSON.stringify({ ok: true, empty: true }));
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // Interactions
  else if (req.url === '/interactions/active') {
    const interactions = loadInteractions();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const active = interactions.recent.filter(i => 
      new Date(i.timestamp).getTime() > fiveMinAgo
    );
    res.end(JSON.stringify(active));
  }
  
  // Today priorities
  else if (req.url === '/today') {
    const todayPath = path.join(__dirname, '..', 'TODAY.md');
    try {
      const content = fs.readFileSync(todayPath, 'utf-8');
      const sections = { focus: [], blocked: [], notes: [], updated: null };
      let currentSection = null;
      
      for (const line of content.split('\n')) {
        if (line.startsWith('*Updated:')) {
          sections.updated = line.replace('*Updated:', '').replace('*', '').trim();
        } else if (line.includes('## Focus')) {
          currentSection = 'focus';
        } else if (line.includes('## Blocked')) {
          currentSection = 'blocked';
        } else if (line.includes('## Notes')) {
          currentSection = 'notes';
        } else if (line.startsWith('- ') && currentSection) {
          sections[currentSection].push(line.substring(2));
        }
      }
      res.end(JSON.stringify({ ok: true, ...sections }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: 'TODAY.md not found' }));
    }
  }
  
  // Daily Standup - Read from standup.json file
  else if (req.url === '/standup') {
    try {
      // Check if standup file exists
      if (!fs.existsSync(STANDUP_FILE)) {
        // Return default empty state with current timestamp
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short', 
          day: 'numeric'
        });
        const timeStr = today.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
        
        res.end(JSON.stringify({ 
          ok: true, 
          date: dateStr,
          time: timeStr,
          updates: [],
          crossTeam: [],
          message: 'No standup data available. Run standup cron or create standup.json manually.'
        }));
        return;
      }
      
      // Read and parse standup JSON
      const standupData = JSON.parse(fs.readFileSync(STANDUP_FILE, 'utf-8'));
      
      // Check if data is stale (older than 24 hours)
      const now = Date.now();
      const dataTimestamp = standupData.timestamp || 0;
      const ageHours = (now - dataTimestamp) / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        standupData.stale = true;
        standupData.message = `Standup data is ${Math.floor(ageHours)} hours old`;
      }
      
      // Ensure required fields exist
      if (!standupData.date || !standupData.time) {
        const today = new Date(dataTimestamp || Date.now());
        standupData.date = standupData.date || today.toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short', 
          day: 'numeric'
        });
        standupData.time = standupData.time || today.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
      }
      
      standupData.ok = true;
      standupData.updates = standupData.updates || [];
      standupData.crossTeam = standupData.crossTeam || [];
      
      res.end(JSON.stringify(standupData));
      
    } catch (e) {
      console.error('[Standup] Failed to read standup.json:', e.message);
      
      // Return error state with current timestamp
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric'
      });
      const timeStr = today.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
      
      res.end(JSON.stringify({ 
        ok: false,
        error: 'Failed to load standup data',
        date: dateStr,
        time: timeStr,
        updates: [],
        crossTeam: []
      }));
    }
  }
  
  // Action Items - Get (GET)
  else if (req.url === '/action-items' && req.method === 'GET') {
    const items = loadActionItems();
    res.end(JSON.stringify({ ok: true, items }));
  }
  
  // Action Items - Add (POST)
  else if (req.url === '/action-items/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text, agent } = JSON.parse(body);
        if (!text) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Missing text field' }));
          return;
        }
        
        // Load existing items
        const items = loadActionItems();
        
        // Add new item
        const newItem = {
          text,
          completed: false,
          createdAt: Date.now(),
          addedBy: agent || 'System'
        };
        items.push(newItem);
        
        // Save
        saveActionItems(items);
        
        // Log who added it
        const logText = agent ? `${text} (added by ${agent})` : text;
        console.log(`📋 Action item added: ${logText}`);
        
        res.end(JSON.stringify({ 
          ok: true, 
          message: 'Action item added to dashboard checklist',
          item: newItem
        }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }
  
  // Action Items - Update (PUT)
  else if (req.url.startsWith('/action-items/') && req.method === 'PUT') {
    const idx = parseInt(req.url.split('/')[2]);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { completed } = JSON.parse(body);
        const items = loadActionItems();
        
        if (items[idx]) {
          const wasCompleted = items[idx].completed;
          items[idx].completed = completed;
          
          // If item was just completed (not uncompleted), notify the agent who added it
          if (completed && !wasCompleted && items[idx].addedBy) {
            const agentName = items[idx].addedBy.toLowerCase();
            const sessionKey = agentSessions[agentName];
            
            if (sessionKey) {
              const taskText = items[idx].text;
              const message = `✅ Jeremy completed your action item: "${taskText}"`;
              
              // Notify agent in background (fire and forget)
              gatewayCall('sessions_send', {
                sessionKey: sessionKey,
                message: message,
                timeoutSeconds: 1
              }).then(() => {
                console.log(`📬 Notified ${items[idx].addedBy} about completed task: ${taskText}`);
              }).catch(e => {
                console.error(`Failed to notify ${items[idx].addedBy}:`, e.message);
              });
            }
          }
          
          saveActionItems(items);
          res.end(JSON.stringify({ ok: true, item: items[idx] }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ ok: false, error: 'Item not found' }));
        }
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }
  
  // Action Items - Delete completed (DELETE)
  else if (req.url === '/action-items/clear-completed' && req.method === 'DELETE') {
    const items = loadActionItems();
    const remaining = items.filter(item => !item.completed);
    saveActionItems(remaining);
    res.end(JSON.stringify({ ok: true, removed: items.length - remaining.length }));
  }
  
  // Files - recursively scan workspace for files
  else if (req.url === '/files') {
    const workspaceDir = path.join(__dirname, '..');
    
    // Recursive function to scan directories
    function scanDirectory(dir, relativePath = '') {
      const items = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        // Skip hidden files/folders, node_modules, office folder, code repos, and internal agent files
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'office' ||
            entry.name === 'myHealthCopilot' ||
            entry.name === 'team' ||
            entry.name === 'memory') {
          continue;
        }
        
        // Skip root-level config files (agent internals)
        if (relativePath === '' && entry.isFile() && 
            (entry.name.endsWith('.md') || entry.name.endsWith('.html'))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const children = scanDirectory(fullPath, relPath);
          if (children.length > 0) {
            items.push({
              type: 'folder',
              name: entry.name,
              path: relPath,
              children: children
            });
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const textExts = new Set(['.md', '.txt', '.html', '.json', '.csv']);
          const binaryExts = new Set(['.pdf', '.pptx', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.svg']);

          if (textExts.has(ext) || binaryExts.has(ext)) {
            const stats = fs.statSync(fullPath);
            let preview = '';

            if (textExts.has(ext)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                preview = lines.slice(0, 3).join('\n').substring(0, 150);
                if (content.length > 150) preview += '...';
              } catch (e) { /* skip preview on read error */ }
            }

            items.push({
              type: 'file',
              name: entry.name,
              path: relPath,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              modifiedFormatted: stats.mtime.toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              }),
              preview
            });
          }
        }
      }
      
      // Sort: folders first, then by name
      return items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    try {
      const tree = scanDirectory(workspaceDir);
      res.end(JSON.stringify({ ok: true, tree }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }
  
  else if (req.url.startsWith('/file/') && req.method === 'GET') {
    const filePath = decodeURIComponent(req.url.replace('/file/', ''));
    const baseDir = path.resolve(__dirname, '..');
    const fullPath = path.resolve(baseDir, filePath);

    // Secure path traversal check using path.relative
    const relative = path.relative(baseDir, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Access denied - path traversal detected' }));
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'File not found' }));
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const binaryExts = new Set(['.pdf', '.pptx', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.svg']);

    if (binaryExts.has(ext)) {
      // Serve binary files with appropriate content type for download/display
      const mimeTypes = {
        '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileBuffer = fs.readFileSync(fullPath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length,
        'Content-Disposition': `inline; filename="${path.basename(fullPath)}"`
      });
      res.end(fileBuffer);
    } else {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        res.end(JSON.stringify({ ok: true, content, path: filePath }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: 'Failed to read file' }));
      }
    }
  }
  
  // Push Notifications - Subscribe
  else if (req.url === '/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const subscription = JSON.parse(body);
        
        // Validate subscription object
        if (!subscription.endpoint || !subscription.keys) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Invalid subscription' }));
          return;
        }
        
        // Check if already subscribed (avoid duplicates)
        const exists = pushSubscriptions.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
          pushSubscriptions.push(subscription);
          savePushSubscriptions(pushSubscriptions);
          console.log(`✅ New push subscriber (total: ${pushSubscriptions.length})`);
        } else {
          console.log('Push subscriber already exists');
        }
        
        res.end(JSON.stringify({ ok: true, subscribers: pushSubscriptions.length }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }
  
  // Push Notifications - Unsubscribe
  else if (req.url === '/push/unsubscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { endpoint } = JSON.parse(body);
        
        const before = pushSubscriptions.length;
        pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
        savePushSubscriptions(pushSubscriptions);
        
        const removed = before - pushSubscriptions.length;
        console.log(`❌ Push subscriber removed (total: ${pushSubscriptions.length})`);
        
        res.end(JSON.stringify({ ok: true, removed, subscribers: pushSubscriptions.length }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }
  
  // Push Notifications - Test
  else if (req.url === '/push/test' && req.method === 'POST') {
    sendPushNotification('isla', 'This is a test notification from OpenClaw Office! 🔔')
      .then(() => {
        res.end(JSON.stringify({ ok: true, message: 'Test notification sent' }));
      })
      .catch(err => {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
  }
  
  // Push Notifications - Get status
  else if (req.url === '/push/status' && req.method === 'GET') {
    res.end(JSON.stringify({
      ok: true,
      enabled: !!config.vapid,
      subscribers: pushSubscriptions.length,
      vapidConfigured: !!(config.vapid && config.vapid.publicKey)
    }));
  }
  
  else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ OpenClaw Native Web Interface API running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`📡 Connected to ${Object.keys(agentSessions).length} agents`);
});

// --- Chat v2: WebSocket server for frontend push ---
const wss = new WebSocketServer({ server });

// Track connected clients and their subscriptions
const wsClients = new Set();

// WebSocket heartbeat to clean up stale connections
const WS_HEARTBEAT_INTERVAL = 30000; // 30 seconds
setInterval(() => {
  for (const client of wsClients) {
    if (client.isAlive === false) {
      console.log('[WS-Chat] Terminating stale client');
      wsClients.delete(client);
      client.ws.terminate();
      continue;
    }
    client.isAlive = false;
    if (client.ws.readyState === 1) {
      client.ws.ping();
    }
  }
}, WS_HEARTBEAT_INTERVAL);

wss.on('connection', (ws) => {
  const client = { ws, subscribedAgent: null, isAlive: true };
  wsClients.add(client);
  
  // Handle pong responses
  ws.on('pong', () => { client.isAlive = true; });
  console.log('[WS-Chat] Client connected, total:', wsClients.size);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'subscribe' && msg.agent && agentSessions[msg.agent]) {
      client.subscribedAgent = msg.agent;

      // If client sends lastSeq, only send messages since then
      let messages;
      if (msg.lastSeq && typeof msg.lastSeq === 'number') {
        messages = chatDb.getMessagesSince(msg.agent, msg.lastSeq);
        if (messages.length > 0) {
          ws.send(JSON.stringify({
            type: 'history_update',
            agent: msg.agent,
            messages: messages.map(formatMessageForClient)
          }));
        }
      } else {
        messages = chatDb.getMessages(msg.agent);
        ws.send(JSON.stringify({
          type: 'history',
          agent: msg.agent,
          messages: messages.map(formatMessageForClient)
        }));
      }
      console.log('[WS-Chat] Client subscribed to:', msg.agent, '- sent', (messages || []).length, 'messages', msg.lastSeq ? `(since seq ${msg.lastSeq})` : '(full)');
    }

    if (msg.type === 'unsubscribe') {
      client.subscribedAgent = null;
    }

    // Multi-agent sync: client sends lastSeq per agent, server returns any new messages
    if (msg.type === 'sync' && msg.agents) {
      for (const [agent, lastSeq] of Object.entries(msg.agents)) {
        if (!agentSessions[agent]) continue;
        const newMessages = chatDb.getMessagesSince(agent, lastSeq);
        if (newMessages.length > 0) {
          ws.send(JSON.stringify({
            type: 'sync_update',
            agent,
            messages: newMessages.map(formatMessageForClient)
          }));
        }
      }
    }
  });

  ws.on('close', () => {
    wsClients.delete(client);
    console.log('[WS-Chat] Client disconnected, total:', wsClients.size);
  });
});

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

function formatMessageForClient(row) {
  const metadata = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {};
  const isAgentMessage = metadata.source === 'agent';
  
  // Extract sender name from sourceSession (e.g., "agent:harper:webchat:user" -> "Harper")
  let senderName = null;
  if (isAgentMessage && metadata.sourceSession) {
    const match = metadata.sourceSession.match(/^agent:(\w+):/);
    if (match) {
      senderName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
  }
  
  return {
    seq: row.seq,
    agent: row.agent,
    content: row.content,
    isBot: row.role === 'assistant',
    isAgentMessage: isAgentMessage,
    senderName: senderName,  // The actual agent who sent the message
    author: row.role === 'user' 
      ? (isAgentMessage ? (senderName || 'Agent') : 'Jeremy')
      : (row.agent.charAt(0).toUpperCase() + row.agent.slice(1)),
    authorId: row.role === 'user' ? 'user' : row.agent,
    timestamp: row.timestamp,
    timestampFormatted: new Date(row.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    metadata: metadata
  };
}
