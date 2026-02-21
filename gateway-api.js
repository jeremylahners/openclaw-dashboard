// OpenClaw Native Web Interface - Gateway API Backend
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const webpush = require('web-push');
const { WebSocketServer, WebSocket } = require('ws');
const { EdgeTTS } = require('node-edge-tts');
const chatDb = require('./db.js');

// ============================================================
// VOICE - Agent TTS voice mapping (Microsoft Edge TTS neural voices)
// ============================================================
const AGENT_VOICES = {
  isla:   'en-US-JennyNeural',        // female, warm/friendly
  nova:   'en-US-AriaNeural',         // female, professional/confident
  lena:   'en-US-MichelleNeural',     // female, energetic/pleasant
  remy:   'en-US-GuyNeural',          // male, passionate/friendly
  marcus: 'en-US-EricNeural',         // male, rational/confident
  harper: 'en-US-EmmaNeural',         // female, cheerful/clear/precise
  eli:    'en-US-BrianNeural',        // male, approachable/casual
  sage:   'en-US-AvaNeural',          // female, expressive/caring/thoughtful
  julie:  'en-US-AnaNeural',          // female, cute/upbeat (cartoon style)
  val:    'en-US-RogerNeural',        // male, lively/measured
  atlas:  'en-US-ChristopherNeural',  // male, reliable/authoritative
};
const DEFAULT_VOICE = 'en-US-JennyNeural';
const WHISPER_MODEL = '/Users/jeremylahners/.cache/whisper-cpp/models/ggml-base.en.bin';
const WHISPER_BIN = '/opt/homebrew/bin/whisper-cli';

// Post-processing corrections for common Whisper misrecognitions.
// Handles names, local terms, and proper nouns that the model frequently mangles.
// Keys are regex patterns (case-insensitive), values are the correct replacement.
const TRANSCRIPT_CORRECTIONS = [
  // "Isla" — consistently misheard as variations of "Ila", "Eila", "Ayla", etc.
  [/\b(ila|eila|ayla|eye-?la|isla)\b/gi, 'Isla'],
  // Add more as discovered: [/\bpattern\b/gi, 'Replacement'],
];

function applyTranscriptCorrections(text) {
  let corrected = text;
  for (const [pattern, replacement] of TRANSCRIPT_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}
const FFMPEG_BIN  = '/opt/homebrew/bin/ffmpeg';
const WHISPER_SERVER_URL = 'http://127.0.0.1:8090/inference';
let whisperServerAvailable = false;

// Check if whisper-server is running on startup (and periodically)
function checkWhisperServer(onDone) {
  const req = http.get('http://127.0.0.1:8090/health', { timeout: 2000 }, (res) => {
    whisperServerAvailable = res.statusCode === 200;
    res.resume();
    if (onDone) onDone();
  });
  req.on('error', () => { whisperServerAvailable = false; if (onDone) onDone(); });
  req.on('timeout', () => { req.destroy(); whisperServerAvailable = false; if (onDone) onDone(); });
}
// Run initial check; setInterval for periodic re-checks every 30s
checkWhisperServer();
setInterval(checkWhisperServer, 30000);

// Load configs
const config = require('./config.js');
const { loadConfig, buildFrontendConfig } = require('./workspace-config.js');

// Load workspace config (agents, branding, owner, paths)
const wsConfig = loadConfig();
const { agentSessions, sessionToAgent: wsSessionToAgent, agentChannels, paths: wsPaths } = wsConfig;

// Prevent process crashes from unhandled errors — log and continue
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception (kept alive):', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection (kept alive):', reason);
});

const MEMORY_DIR = wsPaths.memoryDir;
const INTERACTIONS_FILE = wsPaths.interactionsFile;
const ACTION_ITEMS_FILE = path.join(__dirname, 'action-items.json');
const PUSH_SUBSCRIPTIONS_FILE = path.join(__dirname, 'push-subscriptions.json');
const STANDUP_FILE = path.join(__dirname, 'standup.json');
const PORT = 8081;

// OpenClaw Gateway config
const GATEWAY_URL = `http://127.0.0.1:${config.gatewayPort}`;
const GATEWAY_TOKEN = config.gatewayToken;

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
const sessionToAgent = wsSessionToAgent;

// ============================================================
// GATEWAY WEBSOCKET CLIENT (server-owned connection)
// ============================================================

let gwSocket = null;
let gwConnected = false;
let gwRequestId = 0;
let gwReconnectDelay = 3000; // starts at 3s, backs off on repeated failures
let gwReconnectTimer = null;
let gwPingInterval = null;
let agentPollInterval = null; // single polling interval — never stacked
const GW_PING_INTERVAL = 25000; // 25s keepalive ping
const GW_PONG_TIMEOUT = 10000; // 10s to receive pong before considering dead
const GW_RECONNECT_MIN = 3000;
const GW_RECONNECT_MAX = 30000;
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
          if (!text || NOISE_REPLIES.test(text.trim()) || isSystemContextMessage(text)) continue;

          // Check provenance for inter-session (agent-to-agent) messages
          const provenance = msg.provenance || msg.inputProvenance || null;
          const isInterSession = provenance?.kind === 'inter_session';

          // If no provenance or not inter-session, this is likely Jeremy's message
          // Skip if already stored from dashboard send
          if (!isInterSession) {
            const recentMsgs = chatDb.getRecentUserMessagesForAgent(agentKey, msgTimestamp - 60000);
            const normalizedText = text.replace(/\s+/g, ' ').trim();
            const alreadyStored = recentMsgs.some(m =>
              m.content.replace(/\s+/g, ' ').trim() === normalizedText &&
              Math.abs(m.timestamp - msgTimestamp) < 60000
            );
            if (alreadyStored) continue;
          }

          // Extract sender from provenance sourceSessionKey or fall back to text patterns
          let senderName = null;
          if (provenance?.sourceSessionKey) {
            const match = provenance.sourceSessionKey.match(/^agent:(\w+):/);
            if (match) senderName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
          }
          if (!senderName) {
            senderName = extractSenderFromText(text, wsConfig.agentKeys, agentKey);
          }

          if (provenance) {
            console.log(`[GW] Provenance for ${agentKey}: kind=${provenance.kind}, source=${provenance.sourceSessionKey || 'none'}`);
          }

          // Store in SQLite with metadata
          const idempotencyKey = `poll-user-${agentKey}-${msgTimestamp}`;
          const metadata = {
            source: isInterSession ? 'agent' : 'user',
            senderName: senderName || null,
            sourceSessionKey: provenance?.sourceSessionKey || null
          };
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

// Start polling for agent-to-agent messages (guarded — only one interval ever)
function startAgentMessagePolling() {
  if (agentPollInterval) {
    // Already polling — don't stack another interval
    return;
  }
  console.log('[GW] Starting agent message polling (every 3 seconds)...');

  // Initial sync
  pollAgentSessions();

  // Poll every 3 seconds — stored so we can clear on shutdown
  agentPollInterval = setInterval(pollAgentSessions, 3000);
}

function gwCleanup() {
  // Clear keepalive ping
  if (gwPingInterval) {
    clearInterval(gwPingInterval);
    gwPingInterval = null;
  }
  gwConnected = false;

  // Reject all pending requests so callers don't hang
  for (const [id, pending] of gwPendingRequests) {
    pending.reject(new Error('Gateway connection lost'));
  }
  gwPendingRequests.clear();
}

function gwScheduleReconnect() {
  if (gwReconnectTimer) return; // already scheduled
  console.log(`[GW] Reconnecting in ${gwReconnectDelay / 1000}s...`);
  gwReconnectTimer = setTimeout(() => {
    gwReconnectTimer = null;
    gwConnect();
  }, gwReconnectDelay);
  // Exponential backoff, capped
  gwReconnectDelay = Math.min(gwReconnectDelay * 1.5, GW_RECONNECT_MAX);
}

function gwStartPing() {
  if (gwPingInterval) clearInterval(gwPingInterval);
  let pongReceived = true;

  gwPingInterval = setInterval(() => {
    if (!gwSocket || gwSocket.readyState !== WebSocket.OPEN) return;
    if (!pongReceived) {
      console.warn('[GW] Pong timeout — connection appears dead, closing');
      gwSocket.terminate();
      return;
    }
    pongReceived = false;
    gwSocket.ping();
  }, GW_PING_INTERVAL);

  gwSocket.on('pong', () => { pongReceived = true; });
}

function gwConnect() {
  if (gwSocket && gwSocket.readyState <= WebSocket.CONNECTING) return;

  // Clean up any previous socket fully
  if (gwSocket) {
    gwSocket.removeAllListeners();
    if (gwSocket.readyState === WebSocket.OPEN || gwSocket.readyState === WebSocket.CONNECTING) {
      gwSocket.terminate();
    }
  }

  const url = `ws://127.0.0.1:${config.gatewayPort}`;
  console.log('[GW] Connecting to', url);
  gwSocket = new WebSocket(url, {
    headers: { Origin: `http://127.0.0.1:${config.gatewayPort}` }
  });

  gwSocket.on('open', () => {
    console.log('[GW] WebSocket open, sending connect...');
    // Reset backoff on successful open
    gwReconnectDelay = GW_RECONNECT_MIN;

    const connId = gwNextId();
    gwSendRaw({
      type: 'req', id: connId, method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        auth: { token: GATEWAY_TOKEN }
      }
    });
    gwPendingRequests.set(connId, {
      resolve: (payload) => {
        gwConnected = true;
        console.log('[GW] Connected!', payload.server?.version);

        // Start keepalive pings
        gwStartPing();

        // Start polling (idempotent — won't stack)
        startAgentMessagePolling();
      },
      reject: (err) => {
        console.error('[GW] Connect handshake failed:', err);
        gwSocket.close();
      }
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
    gwCleanup();
    gwScheduleReconnect();
  });

  gwSocket.on('error', (e) => {
    console.error('[GW] WebSocket error:', e.message);
    // 'close' will fire after 'error', so reconnect happens there
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

// Detect system context messages that shouldn't be displayed in chat
// These are Gateway-injected context (memory, system logs, timestamps) not real messages
function isSystemContextMessage(text) {
  if (!text) return true;
  const trimmed = text.trim();
  // System log entries: "System: [2026-02-15 ...]"
  if (/^System:\s*\[/m.test(trimmed)) return true;
  // Messages that are purely timestamp-prefixed context (memory injections)
  // e.g., "[Sun 2026-02-15 15:29 EST] ..."
  if (/^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/m.test(trimmed)) return true;
  // Multi-line context blocks with timestamp headers
  if (/^\[\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}\s+\w+\]/m.test(trimmed)) return true;
  return false;
}

// Try to extract sending agent name from message text
// Checks signatures, prefixes, and "Hey AgentName" / "Thanks, AgentName" addressing
// When an agent addresses another by name, the SENDER is NOT that name (it's the recipient).
// So we also check if the agent signs off or introduces themselves.
function extractSenderFromText(text, knownAgentKeys, recipientKey) {
  if (!text || !knownAgentKeys?.length) return null;
  const trimmed = text.trim();
  for (const key of knownAgentKeys) {
    // Skip the recipient — if someone addresses "Hey Remy", the sender isn't Remy
    if (key === recipientKey) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    // Pattern: message signed "—AgentName" or "- AgentName"
    if (new RegExp(`(?:^|\\n)\\s*[—–-]\\s*${name}\\s*$`, 'i').test(trimmed)) return name;
    // Pattern: starts with "[AgentName]"
    if (new RegExp(`^\\[${name}\\]`, 'i').test(trimmed)) return name;
    // Pattern: sender identifies themselves "This is AgentName" or "It's AgentName"
    if (new RegExp(`(?:this is|it'?s)\\s+${name}`, 'i').test(trimmed)) return name;
  }
  // Fallback: if only one other agent is mentioned by name addressing style
  // ("Hey X", "Thanks X", "Hi X"), and it matches the recipient, the sender
  // is likely the OTHER agent. Check which non-recipient agents could be sender
  // by elimination — if the message addresses the recipient, look for self-references.
  return null;
}

function handleGatewayChatEvent(payload) {
  const sessionKey = payload.sessionKey;
  const agent = sessionToAgent[sessionKey];
  if (!agent) return; // unknown session

  // Handle incoming messages (role="user") from chat.subscribe events
  // This captures agent-to-agent messages sent via sessions_send
  if (payload.state === 'final' && payload.message && payload.message.role === 'user') {
    const text = extractMessageText(payload.message);

    // Filter noise replies, empty messages, and system context injections
    if (!text || NOISE_REPLIES.test(text.trim()) || isSystemContextMessage(text)) {
      return;
    }

    // Extract provenance for sender attribution
    const provenance = payload.message.provenance || payload.message.inputProvenance || null;
    const isInterSession = provenance?.kind === 'inter_session';

    // Extract sender from provenance or fall back to text patterns
    let senderName = null;
    if (provenance?.sourceSessionKey) {
      const match = provenance.sourceSessionKey.match(/^agent:(\w+):/);
      if (match) senderName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    if (!senderName) {
      senderName = extractSenderFromText(text, wsConfig.agentKeys, agent);
    }

    if (provenance) {
      console.log(`[GW] Provenance for ${agent}: kind=${provenance.kind}, source=${provenance.sourceSessionKey || 'none'}`);
    }

    // Store incoming message in SQLite with agent-to-agent metadata
    const now = Date.now();
    const idempotencyKey = `gw-user-${agent}-${now}-${Math.random().toString(36).slice(2)}`;
    const metadata = {
      source: isInterSession ? 'agent' : 'agent',  // Both paths here are agent-originated
      senderName: senderName || null,
      sourceSessionKey: provenance?.sourceSessionKey || null
    };
    const result = chatDb.addMessage(agent, 'user', text, now, idempotencyKey, metadata);

    if (!result.duplicate) {
      console.log(`[GW] 📨 Incoming message for ${agent} from ${senderName || 'unknown agent'}: "${text.substring(0, 50)}..."`);

      const clientMsg = formatMessageForClient({
        seq: result.seq, agent, role: 'user', content: text, timestamp: now, metadata
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
  
  const agentName = wsConfig.agents[agentKey]?.name || (agentKey.charAt(0).toUpperCase() + agentKey.slice(1));
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

  // ============================================================
  // VOICE: Transcribe audio → text via Whisper
  // POST /voice/transcribe  (multipart: field "audio", webm/ogg blob)
  // ============================================================
  else if ((req.url === '/voice/transcribe' || req.url === '/api/voice/transcribe') && req.method === 'POST') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const rawPath  = path.join(tmpDir, 'input.webm');
    const wavPath  = path.join(tmpDir, 'input.wav');

    const cleanup = () => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    };

    try {
      // Parse multipart manually — extract first file part
      const chunks = [];
      req.on('data', d => chunks.push(d));
      await new Promise((resolve, reject) => {
        req.on('end', resolve);
        req.on('error', reject);
      });

      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1]?.trim();

      let audioData;
      if (boundary) {
        // Parse multipart/form-data
        const boundaryBuf = Buffer.from(`--${boundary}`);
        const parts = [];
        let start = 0;
        while (start < body.length) {
          const idx = body.indexOf(boundaryBuf, start);
          if (idx === -1) break;
          const end = body.indexOf(boundaryBuf, idx + boundaryBuf.length);
          if (end === -1) break;
          parts.push(body.slice(idx + boundaryBuf.length, end));
          start = end;
        }
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const header = part.slice(0, headerEnd).toString();
          if (header.includes('name="audio"') || header.includes('filename=')) {
            audioData = part.slice(headerEnd + 4, part.length - 2); // trim trailing \r\n
            break;
          }
        }
      } else {
        // Raw audio body (no multipart wrapper)
        audioData = body;
      }

      if (!audioData || audioData.length < 100) {
        cleanup();
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: 'No audio data received' }));
      }

      fs.writeFileSync(rawPath, audioData);

      let transcript;

      if (whisperServerAvailable) {
        // Fast path: whisper-server (model already loaded, handles conversion)
        transcript = await new Promise((resolve, reject) => {
          const boundary = '----WhisperBoundary' + Date.now();
          const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
          const fieldTemp = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0`;
          const fieldFmt = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson`;
          const footer = `\r\n--${boundary}--\r\n`;
          const payload = Buffer.concat([
            Buffer.from(header), audioData, Buffer.from(fieldTemp), Buffer.from(fieldFmt), Buffer.from(footer)
          ]);

          const req = http.request(WHISPER_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length },
            timeout: 30000
          }, (res) => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
              try {
                const json = JSON.parse(Buffer.concat(chunks).toString());
                resolve((json.text || '').trim());
              } catch (e) { reject(new Error('whisper-server: invalid JSON response')); }
            });
          });
          req.on('error', (e) => reject(new Error(`whisper-server: ${e.message}`)));
          req.on('timeout', () => { req.destroy(); reject(new Error('whisper-server: timeout')); });
          req.end(payload);
        });
      } else {
        // Fallback: whisper-cli subprocess (cold start per request)
        await new Promise((resolve, reject) => {
          execFile(FFMPEG_BIN, ['-i', rawPath, '-ar', '16000', '-ac', '1', wavPath, '-y'], (err, stdout, stderr) => {
            if (err) reject(new Error(`ffmpeg: ${stderr || err.message}`));
            else resolve();
          });
        });
        transcript = await new Promise((resolve, reject) => {
          execFile(WHISPER_BIN, [
            '-m', WHISPER_MODEL,
            '--no-prints',
            '-f', wavPath
          ], { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(`whisper: ${stderr || err.message}`));
            const text = stdout.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, '').trim();
            resolve(text);
          });
        });
      }

      cleanup();
      res.end(JSON.stringify({ ok: true, transcript: applyTranscriptCorrections(transcript) }));

    } catch (e) {
      cleanup();
      console.error('[Voice/Transcribe]', e.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ============================================================
  // VOICE: Text → speech — streaming via node-edge-tts (no Python subprocess)
  // GET /voice/speak?text=...&agent=...
  // Streams MP3 audio chunks directly from Edge TTS WebSocket to browser.
  // First audio chunk arrives in ~200ms (no file I/O, no subprocess startup).
  // ============================================================
  else if ((req.url.startsWith('/voice/speak') || req.url.startsWith('/api/voice/speak')) && req.method === 'GET') {
    const urlObj = new URL(req.url, 'http://localhost');
    const text   = urlObj.searchParams.get('text') || '';
    const agent  = urlObj.searchParams.get('agent') || '';
    const voice  = AGENT_VOICES[agent] || DEFAULT_VOICE;

    if (!text.trim()) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: 'text required' }));
    }

    try {
      const tts = new EdgeTTS({ voice, lang: 'en-US', outputFormat: 'audio-24khz-96kbitrate-mono-mp3' });
      const wsConnect = await tts._connectWebSocket();

      // Stream audio chunks directly to HTTP response as they arrive from Edge TTS
      res.removeHeader('Content-Type');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Voice', voice);
      res.statusCode = 200;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          try { wsConnect.close(); } catch {}
          if (!res.writableEnded) res.end();
          reject(new Error('TTS timeout after 15s'));
        }, 15000);

        wsConnect.on('message', (data, isBinary) => {
          if (isBinary) {
            // Binary frame: header + audio bytes. Strip the 'Path:audio\r\n' header.
            const separator = 'Path:audio\r\n';
            const idx = data.indexOf(separator) + separator.length;
            const audioData = data.subarray(idx);
            if (audioData.length > 0 && !res.writableEnded) res.write(audioData);
          } else {
            const msg = data.toString();
            if (msg.includes('Path:turn.end')) {
              clearTimeout(timeout);
              try { wsConnect.close(); } catch {}
              if (!res.writableEnded) res.end();
              resolve();
            }
          }
        });

        wsConnect.on('error', (err) => {
          clearTimeout(timeout);
          if (!res.writableEnded) res.end();
          reject(err);
        });

        // Send SSML synthesis request
        const requestId = crypto.randomBytes(16).toString('hex');
        const safeText  = text.replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[c]));
        wsConnect.send(
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
          `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
          `<voice name="${voice}"><prosody rate="default" pitch="default" volume="default">${safeText}</prosody></voice></speak>`
        );
      });

    } catch (e) {
      console.error('[Voice/Speak]', e.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  // Workspace config for frontend (agents, branding, owner — no secrets)
  else if (req.url === '/config' && req.method === 'GET') {
    const frontendConfig = buildFrontendConfig(wsConfig, config.vapid?.publicKey || null);
    res.end(JSON.stringify({ ok: true, ...frontendConfig }));
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
    const messages = chatDb.getMessages(agentKey)
      .filter(row => !isSystemContextMessage(row.content));
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

    const basePath = path.join(wsPaths.agentFilesDir, agentKey);
    const jsonPath = path.join(basePath, `${tabId}.json`);
    const mdPath = path.join(basePath, `${tabId}.md`);

    try {
      const jsonExists = fs.existsSync(jsonPath);
      const mdExists = fs.existsSync(mdPath);

      // When both formats exist, serve whichever was modified more recently
      let useJson = jsonExists;
      if (jsonExists && mdExists) {
        const jsonMtime = fs.statSync(jsonPath).mtimeMs;
        const mdMtime = fs.statSync(mdPath).mtimeMs;
        useJson = jsonMtime >= mdMtime;
      }

      if (useJson) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        res.end(JSON.stringify({ ok: true, format: 'json', data }));
      } else if (mdExists) {
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

  // Runtime Tab Registration API
  else if (req.url.match(/^\/agent-tabs\/[a-z]+$/) && req.method === 'POST') {
    const agentKey = req.url.split('/')[2];
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabs } = JSON.parse(body);
        if (!Array.isArray(tabs)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'tabs must be an array' }));
          return;
        }
        if (tabs.length > 10) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Max 10 runtime tabs per agent' }));
          return;
        }
        for (const t of tabs) {
          if (!t.id || !t.label || !t.source) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'Each tab needs id, label, and source' }));
            return;
          }
        }
        wsConfig.runtimeTabs[agentKey] = tabs;
        fs.writeFileSync(wsConfig.runtimeTabsPath, JSON.stringify(wsConfig.runtimeTabs, null, 2));
        // Broadcast tab update to all connected WebSocket clients
        broadcastTabsUpdated(agentKey);
        res.end(JSON.stringify({ ok: true, tabs }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  else if (req.url.match(/^\/agent-tabs\/[a-z]+$/) && req.method === 'GET') {
    const agentKey = req.url.split('/')[2];
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }
    const staticTabs = wsConfig.agents[agentKey]?.tabs || [];
    const runtimeTabs = wsConfig.runtimeTabs[agentKey] || [];
    const seenIds = new Set(staticTabs.map(t => t.id));
    const merged = [...staticTabs];
    for (const rt of runtimeTabs) {
      if (!seenIds.has(rt.id)) { merged.push(rt); seenIds.add(rt.id); }
    }
    res.end(JSON.stringify({ ok: true, tabs: merged }));
  }

  else if (req.url.match(/^\/agent-tabs\/[a-z]+\/[a-z0-9-]+$/) && req.method === 'DELETE') {
    const parts = req.url.split('/');
    const agentKey = parts[2];
    const tabId = parts[3];
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }
    const current = wsConfig.runtimeTabs[agentKey] || [];
    wsConfig.runtimeTabs[agentKey] = current.filter(t => t.id !== tabId);
    if (wsConfig.runtimeTabs[agentKey].length === 0) delete wsConfig.runtimeTabs[agentKey];
    fs.writeFileSync(wsConfig.runtimeTabsPath, JSON.stringify(wsConfig.runtimeTabs, null, 2));
    broadcastTabsUpdated(agentKey);
    res.end(JSON.stringify({ ok: true }));
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
    const todayPath = wsPaths.todayFile;
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
        broadcastToAllClients({ type: 'priorities_updated' });
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
              const message = `✅ ${wsConfig.owner.displayName} completed your action item: "${taskText}"`;
              
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
          broadcastToAllClients({ type: 'priorities_updated' });
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
    const workspaceDir = wsPaths.workspaceRoot;
    
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
    const baseDir = path.resolve(wsPaths.workspaceRoot);
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
    sendPushNotification(wsConfig.agentKeys[0], `This is a test notification from ${wsConfig.branding.name}! 🔔`)
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
  // Delay STT status log slightly so the async health check can resolve first
  setTimeout(() => {
    console.log(`🎙️ Whisper STT: ${whisperServerAvailable ? 'whisper-server/ggml-small.en (fast)' : 'whisper-cli fallback (no server on :8090)'}`);
  }, 1000);
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
        messages = chatDb.getMessagesSince(msg.agent, msg.lastSeq)
          .filter(row => !isSystemContextMessage(row.content));
        if (messages.length > 0) {
          ws.send(JSON.stringify({
            type: 'history_update',
            agent: msg.agent,
            messages: messages.map(formatMessageForClient)
          }));
        }
      } else {
        messages = chatDb.getMessages(msg.agent)
          .filter(row => !isSystemContextMessage(row.content));
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
        const newMessages = chatDb.getMessagesSince(agent, lastSeq)
          .filter(row => !isSystemContextMessage(row.content));
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

function broadcastToAllClients(payload) {
  const data = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

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

function broadcastTabsUpdated(agentKey) {
  const data = JSON.stringify({ type: 'tabs_updated', agent: agentKey });
  for (const client of wsClients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

function formatMessageForClient(row) {
  const metadata = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {};
  const isAgentMessage = metadata.source === 'agent';
  
  // Extract sender name: sourceSessionKey (from provenance), then senderName, then legacy sourceSession
  let senderName = null;
  if (isAgentMessage) {
    if (metadata.sourceSessionKey) {
      const match = metadata.sourceSessionKey.match(/^agent:(\w+):/);
      if (match) senderName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    if (!senderName && metadata.senderName) {
      senderName = metadata.senderName;
    }
    if (!senderName && metadata.sourceSession) {
      const match = metadata.sourceSession.match(/^agent:(\w+):/);
      if (match) senderName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
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
      ? (isAgentMessage ? (senderName || 'Agent') : wsConfig.owner.displayName)
      : (wsConfig.agents[row.agent]?.name || row.agent.charAt(0).toUpperCase() + row.agent.slice(1)),
    authorId: row.role === 'user' ? 'user' : row.agent,
    timestamp: row.timestamp,
    timestampFormatted: new Date(row.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    metadata: metadata
  };
}
