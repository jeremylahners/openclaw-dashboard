// OpenClaw Dashboard - Chat System
// Handles WebSocket communication and chat functionality

import { Storage } from './storage.js';
import { agentChannels, parseNaturalLanguage, startMeeting, endMeeting, showMovementNotification } from './agents.js';

// API endpoint
const API_BASE = '/api';

// Gateway WebSocket config
const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const GATEWAY_WS_URL = `${wsProto}//${window.location.host}/gw`;

// WebSocket state
let gwSocket = null;
let gwConnected = false;
let gwRequestId = 0;
let gwPendingRequests = new Map();
export let gwChatCallbacks = new Map();

// Chat state
let currentAgentKey = null;
let selectedAgent = null;
let chatMessagesCache = [];
let messageDrafts = Storage.getDrafts();

// Per-agent streaming state
const agentStreamingState = new Map();

// Unread messages per agent
const unreadMessages = new Map();

// DOM elements (set via init)
let chatMessages = null;
let chatInput = null;

// Get gateway token from config
function getGatewayToken() {
  return window.config?.gatewayToken || '';
}

// Extract text from an OpenClaw message object
export function extractMessageText(message) {
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

function gwNextId() { return `req-${++gwRequestId}`; }

function gwSendRaw(data) {
  if (gwSocket && gwSocket.readyState === 1) {
    gwSocket.send(JSON.stringify(data));
  }
}

export function gwRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!gwSocket || gwSocket.readyState !== 1) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    const id = gwNextId();
    gwPendingRequests.set(id, { resolve, reject });
    gwSendRaw({ type: 'req', id, method, params });
    setTimeout(() => {
      if (gwPendingRequests.has(id)) {
        gwPendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 60000);
  });
}

export function gwConnect() {
  if (gwSocket && gwSocket.readyState <= 1) return;

  console.log('[GW] Connecting to', GATEWAY_WS_URL);
  gwSocket = new WebSocket(GATEWAY_WS_URL);

  gwSocket.onopen = () => {
    console.log('[GW] WebSocket open, sending connect...');
    const connId = gwNextId();
    gwSendRaw({
      type: 'req', id: connId, method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        auth: { token: getGatewayToken() }
      }
    });
    gwPendingRequests.set(connId, {
      resolve: (payload) => {
        gwConnected = true;
        console.log('[GW] Connected!', payload.server?.version);
        const wsEl = document.getElementById('wsStatus');
        if (wsEl) { wsEl.textContent = 'Live'; wsEl.style.color = '#22c55e'; }
      },
      reject: (err) => console.error('[GW] Connect failed:', err)
    });
  };

  gwSocket.onmessage = (event) => {
    let frame;
    try { frame = JSON.parse(event.data); } catch { return; }

    if (frame.type === 'res' && frame.id) {
      const pending = gwPendingRequests.get(frame.id);
      if (pending) {
        gwPendingRequests.delete(frame.id);
        if (frame.ok) pending.resolve(frame.payload);
        else pending.reject(frame.error);
      }
    }

    if (frame.type === 'event' && frame.event === 'chat') {
      const p = frame.payload;
      for (const [key, cb] of gwChatCallbacks) {
        if (p.sessionKey && p.sessionKey === key) {
          if (p.state === 'delta' && p.message) {
            const text = extractMessageText(p.message);
            if (text) cb.onDelta(text, p);
          }
          else if (p.state === 'final') {
            if (p.message) {
              const text = extractMessageText(p.message);
              if (text) cb.onDelta(text, p);
            }
            cb.onFinal(p);
          }
          else if (p.state === 'error' || p.state === 'aborted') cb.onError(p);
        }
      }
    }
  };

  gwSocket.onclose = () => {
    gwConnected = false;
    console.log('[GW] WebSocket closed, reconnecting in 3s...');
    const wsEl = document.getElementById('wsStatus');
    if (wsEl) { wsEl.textContent = 'Reconnecting...'; wsEl.style.color = '#f59e0b'; }
    setTimeout(gwConnect, 3000);
  };

  gwSocket.onerror = (e) => {
    console.error('[GW] WebSocket error:', e);
  };
}

export function isGwConnected() {
  return gwConnected;
}

// Session key for an agent
function agentSessionKey(agentKey) {
  return `agent:${agentKey}:webchat:user`;
}

// Escape HTML
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format markdown for messages
export function formatMarkdown(text) {
  if (!text) return '';
  if (typeof marked === 'undefined') {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
    return html;
  }
  
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
  
  return marked.parse(text);
}

// Mark agent as having unread messages
export function markUnread(agentKey) {
  if (agentKey === currentAgentKey) return;
  
  const count = (unreadMessages.get(agentKey) || 0) + 1;
  unreadMessages.set(agentKey, count);
  
  const agentEl = document.querySelector(`.agent.${agentKey}`);
  if (agentEl) {
    agentEl.classList.add('has-unread');
  }
}

// Clear unread for an agent
export function clearUnread(agentKey) {
  unreadMessages.set(agentKey, 0);
  
  const agentEl = document.querySelector(`.agent.${agentKey}`);
  if (agentEl) {
    agentEl.classList.remove('has-unread');
  }
}

// Render messages in chat panel
function renderChatMessages(messages) {
  if (!chatMessages) return;
  
  if (messages.length === 0) {
    chatMessages.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Start a conversation...</div>';
    return;
  }

  chatMessages.innerHTML = messages.map((m) => {
    const isUser = !m.isBot;
    const bubbleClass = isUser ? 'you' : 'them';
    const avatarClass = isUser ? 'jeremy' : 'bot';
    const avatarEmoji = isUser ? '👑' : (selectedAgent?.dataset?.emoji || '🤖');

    return `
      <div class="message-bubble ${bubbleClass}">
        <div class="bubble-avatar ${avatarClass}">${avatarEmoji}</div>
        <div class="bubble-content">
          <div class="bubble-text">${formatMarkdown(m.content || '')}</div>
          <div class="bubble-time">${m.timestampFormatted || ''}</div>
        </div>
      </div>`;
  }).join('');

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Append a user message bubble to the chat
function appendUserMessage(text) {
  if (!chatMessages) return;
  
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const placeholder = chatMessages.querySelector('.chat-loading, div[style*="text-align: center"]');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = 'message-bubble you';
  el.innerHTML = `
    <div class="bubble-avatar jeremy">👑</div>
    <div class="bubble-content">
      <div class="bubble-text">${escapeHtml(text)}</div>
      <div class="bubble-time">${ts}</div>
    </div>`;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Streaming state management
function getStreamingState(agentKey) {
  if (!agentStreamingState.has(agentKey)) {
    agentStreamingState.set(agentKey, { el: null, text: '' });
  }
  return agentStreamingState.get(agentKey);
}

function getStreamingEl(agentKey) {
  const state = getStreamingState(agentKey);
  if (state.el) return state.el;

  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const emoji = selectedAgent?.dataset?.emoji || '🤖';

  const el = document.createElement('div');
  el.className = 'message-bubble them';
  el.innerHTML = `
    <div class="bubble-avatar bot">${emoji}</div>
    <div class="bubble-content">
      <div class="bubble-text streaming-text"><span class="typing-indicator">Thinking...</span></div>
      <div class="bubble-time">${ts}</div>
    </div>`;
  
  if (currentAgentKey === agentKey && chatMessages) {
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  state.el = el;
  state.text = '';
  return el;
}

function updateStreamingText(agentKey, text) {
  const state = getStreamingState(agentKey);
  state.text = text;
  const el = getStreamingEl(agentKey);
  const textEl = el.querySelector('.streaming-text');
  if (textEl) textEl.innerHTML = formatMarkdown(state.text);
  
  if (currentAgentKey === agentKey && chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function finalizeStreaming(agentKey) {
  const state = getStreamingState(agentKey);
  if (state.el) {
    const textEl = state.el.querySelector('.streaming-text');
    if (textEl && state.text) {
      textEl.innerHTML = formatMarkdown(state.text);
    } else if (textEl && !state.text) {
      textEl.innerHTML = '<span style="color: #888; font-style: italic;">No response</span>';
    }
  }
  state.el = null;
  state.text = '';
}

// Save draft message for current agent
function saveDraftForCurrentAgent() {
  if (currentAgentKey && chatInput?.value.trim()) {
    messageDrafts[currentAgentKey] = chatInput.value;
  } else if (currentAgentKey) {
    delete messageDrafts[currentAgentKey];
  }
  Storage.saveDrafts(messageDrafts);
}

// Load draft message for agent
function loadDraftForAgent(agentKey) {
  if (chatInput) {
    chatInput.value = messageDrafts[agentKey] || '';
  }
}

// Load chat for an agent
export async function loadAgentChat(agentKey, agentEl) {
  if (currentAgentKey === agentKey) return;
  
  saveDraftForCurrentAgent();
  
  currentAgentKey = agentKey;
  selectedAgent = agentEl;
  
  loadDraftForAgent(agentKey);
  clearUnread(agentKey);

  const channelName = agentChannels[agentKey]?.name || `#${agentKey}`;
  document.getElementById('chatChannelName').textContent = channelName;

  if (chatMessages) {
    chatMessages.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Loading messages...</div>';
  }

  // Try loading history from Gateway
  if (gwConnected) {
    try {
      const history = await gwRequest('chat.history', {
        sessionKey: agentSessionKey(agentKey),
        limit: 50
      });
      if (history && history.messages && history.messages.length > 0) {
        const gwMessages = history.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => {
            const content = extractMessageText(m);
            const isBot = m.role === 'assistant';
            return {
              id: m.id || `gw-${Date.now()}-${Math.random()}`,
              content,
              author: isBot ? (agentKey.charAt(0).toUpperCase() + agentKey.slice(1)) : 'Jeremy',
              authorId: isBot ? agentKey : 'user',
              isBot,
              timestamp: m.timestamp || Date.now(),
              timestampFormatted: m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : ''
            };
          })
          .filter(m => m.content.trim());

        if (gwMessages.length > 0) {
          chatMessagesCache = gwMessages;
          renderChatMessages(gwMessages);
        }
      }
    } catch (e) {
      console.log('[GW] History fetch failed:', e.message || e);
    }
  }
  
  // Cache fallback
  if (chatMessagesCache.length === 0) {
    try {
      const response = await fetch(`${API_BASE}/chat/${agentKey}`);
      const data = await response.json();
      if (data.ok && data.messages && data.messages.length > 0) {
        chatMessagesCache = data.messages;
        renderChatMessages(data.messages);
      } else if (chatMessages) {
        chatMessages.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Start a conversation...</div>';
      }
    } catch (e) {
      console.log('Cache fetch failed:', e);
      if (chatMessages) {
        chatMessages.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Start a conversation...</div>';
      }
    }
  }

  // Append pending streaming message
  const state = getStreamingState(agentKey);
  if (state.el && !state.el.parentElement && chatMessages) {
    chatMessages.appendChild(state.el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Register streaming callback
  const sessionKey = agentSessionKey(agentKey);
  gwChatCallbacks.set(sessionKey, {
    onDelta: (text, payload) => {
      updateStreamingText(agentKey, text);
    },
    onFinal: (payload) => {
      const state = getStreamingState(agentKey);
      if (state.text) {
        fetch(`${API_BASE}/messages/${agentKey}/agent-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: state.text })
        }).catch(() => {});
        
        markUnread(agentKey);
      }
      finalizeStreaming(agentKey);
    },
    onError: (payload) => {
      console.error('[GW] Chat error:', payload);
      finalizeStreaming(agentKey);
    }
  });
}

// Check for special commands
function handleSpecialCommands(text) {
  const cmd = text.toLowerCase().trim();
  
  if (cmd === '/standup' || cmd === '/meeting') {
    startMeeting('standup');
    return { handled: true, response: '📅 Starting standup - everyone to the conference room!' };
  }
  
  if (cmd === '/endmeeting' || cmd === '/desks') {
    endMeeting();
    return { handled: true, response: '✅ Meeting ended - back to your desks!' };
  }
  
  if (cmd === '/help' || cmd === '/commands') {
    return { 
      handled: true, 
      response: `**Office Controls:**

**Natural Language:**
- "Go talk to Isla about XYZ"
- "Everyone gather for standup"
- "Meeting time"
- "Back to your desks"
- "See Marcus about the PR"

**Slash Commands:**
/standup - Start a meeting
/endmeeting - End meeting
/help - Show this help` 
    };
  }
  
  return { handled: false };
}

// Send message via Gateway WebSocket
export async function sendMessage() {
  const text = chatInput?.value.trim();
  if (!text || !currentAgentKey) return;

  // Check for natural language movement triggers
  parseNaturalLanguage(text, currentAgentKey);
  
  // Check for special slash commands
  const cmdResult = handleSpecialCommands(text);
  if (cmdResult.handled) {
    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = 'auto';
    }
    delete messageDrafts[currentAgentKey];
    const sysEl = document.createElement('div');
    sysEl.style.cssText = 'text-align: center; padding: 12px; margin: 8px 0; background: rgba(14, 165, 233, 0.1); border-radius: 8px; font-size: 0.85rem;';
    sysEl.innerHTML = formatMarkdown(cmdResult.response);
    if (chatMessages) {
      chatMessages.appendChild(sysEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    chatInput?.focus();
    return;
  }

  if (chatInput) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
  
  delete messageDrafts[currentAgentKey];

  appendUserMessage(text);

  // Save to server cache
  fetch(`${API_BASE}/chat/${currentAgentKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, cacheOnly: true })
  }).catch(e => console.log('Failed to cache message:', e));

  // Send via Gateway WebSocket
  if (gwConnected) {
    try {
      const sessionKey = agentSessionKey(currentAgentKey);
      const idempKey = `office-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await gwRequest('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey: idempKey
      });
    } catch (e) {
      console.error('[GW] chat.send failed:', e);
      const errEl = document.createElement('div');
      errEl.style.cssText = 'text-align: center; color: #f59e0b; padding: 8px; font-size: 0.8rem;';
      errEl.textContent = `Failed to send: ${e.message || 'WebSocket not connected'}`;
      if (chatMessages) {
        chatMessages.appendChild(errEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  } else {
    const errEl = document.createElement('div');
    errEl.style.cssText = 'text-align: center; color: #f59e0b; padding: 8px; font-size: 0.8rem;';
    errEl.textContent = 'Gateway not connected. Reconnecting...';
    if (chatMessages) chatMessages.appendChild(errEl);
    gwConnect();
  }
  
  chatInput?.focus();
}

// Initialize chat module
export function initChat(messagesEl, inputEl) {
  chatMessages = messagesEl;
  chatInput = inputEl;
  messageDrafts = Storage.getDrafts();
  gwConnect();
}

// Get current agent key
export function getCurrentAgentKey() {
  return currentAgentKey;
}

// Save draft on input change
export function onChatInputChange() {
  saveDraftForCurrentAgent();
}
