# Office Dashboard Refactoring Implementation Plan

**Created:** 2026-02-12  
**Based on:** CODE_REVIEW.md analysis  
**Estimated Total Time:** 3-4 days  
**Goal:** Transform monolithic 4,277-line index.html into maintainable, modular codebase

---

## Table of Contents

1. [Overview](#overview)
2. [Target Architecture](#target-architecture)
3. [Phase 1: CSS Extraction](#phase-1-css-extraction-2-3-hours)
4. [Phase 2: JavaScript Module Extraction](#phase-2-javascript-module-extraction-1-day)
5. [Phase 3: Error Handling & Loading States](#phase-3-error-handling--loading-states-4-6-hours)
6. [Phase 4: Input Validation](#phase-4-input-validation-3-4-hours)
7. [Phase 5: State Management Refactor](#phase-5-state-management-refactor-4-6-hours)
8. [Phase 6: Constants & Configuration](#phase-6-constants--configuration-1-2-hours)
9. [Dependency Graph](#dependency-graph)
10. [Testing Checkpoints](#testing-checkpoints)
11. [Potential Breaking Changes](#potential-breaking-changes)
12. [Rollback Strategy](#rollback-strategy)

---

## Overview

### Current State
```
office/
├── index.html          (4,277 lines - CSS + HTML + JS monolith)
├── gateway-api.js      (915 lines - backend API)
├── serve.js            (117 lines - static server)
└── config.js           (4 lines - gateway token)
```

### Problems Addressed
- **Maintainability:** Single file impossible to navigate
- **Testing:** Cannot unit test embedded code
- **Collaboration:** Multiple devs can't work simultaneously
- **Error Handling:** Crashes propagate silently
- **User Experience:** No loading states, no error feedback

---

## Target Architecture

```
office/
├── index.html              (~150 lines - structure only)
├── config.js               (existing - gateway token)
├── css/
│   ├── main.css            (~400 lines - base styles, variables)
│   ├── components.css      (~500 lines - UI components)
│   ├── layout.css          (~300 lines - office, panels)
│   └── responsive.css      (~300 lines - mobile/tablet)
├── js/
│   ├── app.js              (~100 lines - initialization, orchestration)
│   ├── constants.js        (~80 lines - timeouts, breakpoints, endpoints)
│   ├── state.js            (~150 lines - centralized state management)
│   ├── services/
│   │   ├── gateway.js      (~300 lines - WebSocket connection)
│   │   ├── api.js          (~200 lines - REST API calls)
│   │   └── storage.js      (~80 lines - localStorage wrapper)
│   ├── components/
│   │   ├── agents.js       (~200 lines - agent rendering, movement)
│   │   ├── chat.js         (~400 lines - chat panel, messages)
│   │   ├── files.js        (~200 lines - file browser)
│   │   ├── panels.js       (~250 lines - side/left panels, tabs)
│   │   └── mobile.js       (~150 lines - mobile nav, gestures)
│   └── utils/
│       ├── markdown.js     (~100 lines - formatting, charts)
│       ├── dom.js          (~60 lines - DOM helpers)
│       ├── time.js         (~40 lines - time formatting)
│       └── validation.js   (~80 lines - input validation)
├── gateway-api.js          (existing - backend)
└── serve.js                (existing - static server)
```

---

## Phase 1: CSS Extraction (2-3 hours)

### Overview
Extract ~1,500 lines of CSS from `<style>` tag into organized stylesheet files.

### Prerequisites
- None (first phase)

### Tasks

#### 1.1 Create CSS Directory Structure
**Time:** 5 minutes

```bash
mkdir -p office/css
```

#### 1.2 Extract Base Styles → `css/main.css`
**Time:** 30 minutes

Extract lines containing:
- CSS reset (`* { margin: 0; ... }`)
- Body styles
- Typography (font-family, colors)
- CSS variables (create new)

**File: `css/main.css`**
```css
/* CSS Custom Properties (new) */
:root {
  /* Colors */
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-panel: #0f0f1a;
  --color-bg-card: #1e1e2e;
  --color-bg-input: #2a2a2a;
  
  --color-text-primary: #fff;
  --color-text-secondary: #ccc;
  --color-text-muted: #888;
  --color-text-dim: #666;
  --color-text-faint: #555;
  
  --color-accent: #0ea5e9;
  --color-accent-hover: #0284c7;
  --color-accent-secondary: #8b5cf6;
  
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-error: #f43f5e;
  --color-info: #3b82f6;
  
  --color-border: #333;
  --color-border-light: #444;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 15px;
  --spacing-lg: 20px;
  --spacing-xl: 30px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-full: 50%;
  
  /* Transitions */
  --transition-fast: 0.2s ease;
  --transition-medium: 0.3s ease;
  --transition-slow: 1s ease-out;
  
  /* Z-index layers */
  --z-panel: 900;
  --z-overlay: 1000;
  --z-modal: 1100;
  --z-mobile-menu: 1200;
  
  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* Reset */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Base */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%);
  min-height: 100vh;
  color: var(--color-text-primary);
  display: flex;
  overflow: hidden;
}
```

#### 1.3 Extract Component Styles → `css/components.css`
**Time:** 45 minutes

Extract styles for:
- `.agent`, `.avatar`, `.status-dot`, `.unread-badge`
- `.message-bubble`, `.bubble-*`
- `.panel-tab`, `.panel-header`
- `.memory-section`, `.status-section`
- `.file-item`, `.folder-item`
- `.standup-card`, `.priority-*`
- `.legend`, `.zone-label`
- Buttons (`.chat-send`, `.refresh-btn`, `.panel-close`)
- Inputs (`.chat-input`)

**Key transformations:**
- Replace hardcoded colors with CSS variables
- Replace hardcoded spacing with variables
- Replace hardcoded z-index with variables

#### 1.4 Extract Layout Styles → `css/layout.css`
**Time:** 30 minutes

Extract styles for:
- `.office-container`, `.office`
- `.zone`, `.desks`, `.conference`, `.kitchen`, etc.
- `.side-panel`, `.resize-handle`
- `.left-info-panel`
- `.conference-table`
- `.file-viewer`

#### 1.5 Extract Responsive Styles → `css/responsive.css`
**Time:** 30 minutes

Extract all `@media` queries:
- `@media (max-width: 1200px)` - Tablet
- `@media (max-width: 768px)` - Mobile
- `.mobile-*` classes
- `.panel-overlay`

#### 1.6 Update index.html
**Time:** 15 minutes

Replace `<style>...</style>` block with:
```html
<link rel="stylesheet" href="css/main.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/responsive.css">
```

### Testing Checkpoint 1
- [ ] Page loads without visual changes
- [ ] All responsive breakpoints work
- [ ] Animations still function (pulse, slide)
- [ ] Dark theme intact
- [ ] Mobile layout correct

---

## Phase 2: JavaScript Module Extraction (1 day)

### Overview
Extract ~2,200 lines of JavaScript into modular files using ES6 modules.

### Prerequisites
- Phase 1 complete (CSS extracted)

### Module Dependency Order
```
constants.js     (no dependencies)
       ↓
state.js         (depends on constants)
       ↓
utils/*          (depends on state)
       ↓
services/*       (depends on utils, state)
       ↓
components/*     (depends on services, utils, state)
       ↓
app.js           (orchestrates all)
```

### Tasks

#### 2.1 Create Constants Module → `js/constants.js`
**Time:** 20 minutes

```javascript
// js/constants.js
export const TIMEOUTS = {
  RECONNECT: 3000,
  REQUEST: 60000,
  DEBOUNCE: 500,
  POLL_STATUS: 10000,
  POLL_INTERACTIONS: 5000,
  POLL_PRIORITIES: 30000,
  POLL_STANDUP: 120000,
  POLL_FILES: 30000,
  POLL_CHAT: 3000,
  AGENT_RETURN_TO_DESK: 8000,
  NOTIFICATION_DISPLAY: 3000,
};

export const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1200,
};

export const API_ENDPOINTS = {
  STATUS: '/api/status',
  INTERACTIONS: '/api/interactions/active',
  PRIORITIES: '/api/today',
  STANDUP: '/api/standup',
  FILES: '/api/files',
  FILE: (path) => `/api/file/${path}`,
  AGENT: (key) => `/api/agent/${key}`,
  CHAT: (key) => `/api/chat/${key}`,
  CHAT_REPLY: (key) => `/api/messages/${key}/agent-reply`,
  ACTION_ITEMS: '/api/action-items',
  ACTION_ITEM: (idx) => `/api/action-items/${idx}`,
  ACTION_ITEMS_ADD: '/api/action-items/add',
  ACTION_ITEMS_CLEAR: '/api/action-items/clear-completed',
};

export const WS_STATES = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

export const AGENT_STATUSES = {
  WORKING: 'working',
  THINKING: 'thinking',
  MEETING: 'meeting',
  IDLE: 'idle',
};

export const AGENT_CHANNELS = {
  isla: { name: '#hq' },
  marcus: { name: '#mhc' },
  harper: { name: '#qa' },
  eli: { name: '#cto-dev' },
  sage: { name: '#research' },
  julie: { name: '#marketing' },
  dash: { name: '#dash' },
  remy: { name: '#chef' },
  lena: { name: '#gym' },
  val: { name: '#finance' },
};

export const AGENT_GREETINGS = {
  isla: "Hey! What can I help you with?",
  marcus: "What's up? Got a PR for me to look at?",
  harper: "Testing something right now, but I can chat. What's up?",
  eli: "Thinking about patterns. What do you need?",
  sage: "Just found something interesting. What's on your mind?",
  julie: "Hey! Working on some copy. What do you need?",
  dash: "Building something cool. Want to see what I'm working on?",
  remy: "Kitchen's open. What can I help with?",
  lena: "Ready when you are. What's up?",
  val: "Numbers looking good. What do you need?",
};

export const DEFAULT_AGENT_POSITIONS = {
  marcus: { top: 50, left: 40 },
  harper: { top: 50, left: 160 },
  eli: { top: 50, left: 280 },
  sage: { top: 50, left: 400 },
  dash: { top: 170, left: 40 },
  julie: { top: 170, left: 220 },
  remy: { top: 60, right: 100 },
  lena: { top: 140, right: 100 },
  val: { top: 270, right: 100 },
  atlas: { bottom: 90, right: 120 },
  isla: { bottom: -10 },
};

export const CONFERENCE_SEATS = [
  { top: 350, left: 120 },
  { top: 350, left: 220 },
  { top: 350, left: 320 },
  { top: 350, left: 420 },
  { top: 430, left: 120 },
  { top: 430, left: 220 },
  { top: 430, left: 320 },
  { top: 430, left: 420 },
];
```

#### 2.2 Create State Module → `js/state.js`
**Time:** 30 minutes

```javascript
// js/state.js
import { TIMEOUTS } from './constants.js';

// Centralized application state
class AppState {
  constructor() {
    // UI State
    this.selectedAgent = null;
    this.currentAgentKey = null;
    this.currentMeeting = null;
    
    // Gateway State
    this.gateway = {
      socket: null,
      connected: false,
      requestId: 0,
      pendingRequests: new Map(),
      chatCallbacks: new Map(),
    };
    
    // Movement State
    this.seatAssignments = {};
    this.movedAgents = new Set();
    
    // Chat State
    this.chatMessagesCache = [];
    this.messageDrafts = this._loadDrafts();
    this.agentStreamingState = new Map();
    this.unreadMessages = new Map();
    this.lastMessageIds = new Set();
    
    // Cache
    this.agentMemoryCache = {};
    
    // UI Notifications
    this.activeNotification = null;
    
    // Polling Intervals
    this.intervals = {
      chat: null,
      status: null,
      interactions: null,
      priorities: null,
      standup: null,
      files: null,
      time: null,
    };
    
    // Resize State
    this.resize = {
      isResizing: false,
      startX: 0,
      startWidth: 0,
    };
    
    // Chart State
    this.chartIdCounter = 0;
    this.pendingCharts = new Map();
  }
  
  _loadDrafts() {
    try {
      const stored = localStorage.getItem('messageDrafts');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('[State] Failed to load drafts:', e);
      return {};
    }
  }
  
  saveDrafts() {
    try {
      localStorage.setItem('messageDrafts', JSON.stringify(this.messageDrafts));
    } catch (e) {
      console.error('[State] Failed to save drafts:', e);
    }
  }
  
  nextGatewayId() {
    return `req-${++this.gateway.requestId}`;
  }
  
  nextChartId() {
    return `chart-${++this.chartIdCounter}`;
  }
  
  getStreamingState(agentKey) {
    if (!this.agentStreamingState.has(agentKey)) {
      this.agentStreamingState.set(agentKey, { el: null, text: '', finalized: false });
    }
    return this.agentStreamingState.get(agentKey);
  }
  
  clearAgentMemoryCache() {
    this.agentMemoryCache = {};
  }
}

// Singleton instance
export const state = new AppState();
export default state;
```

#### 2.3 Create Utility Modules → `js/utils/`
**Time:** 45 minutes

**File: `js/utils/dom.js`**
```javascript
// js/utils/dom.js

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function $(selector) {
  return document.querySelector(selector);
}

export function $$(selector) {
  return document.querySelectorAll(selector);
}

export function createElement(tag, className, innerHTML) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

export function removeElement(el) {
  if (el && el.parentElement) {
    el.remove();
  }
}
```

**File: `js/utils/time.js`**
```javascript
// js/utils/time.js

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeWithDay(date = new Date()) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dayName} ${time}`;
}
```

**File: `js/utils/validation.js`**
```javascript
// js/utils/validation.js

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidAgentKey(key) {
  const validAgents = ['isla', 'marcus', 'harper', 'eli', 'sage', 'julie', 'dash', 'remy', 'lena', 'val', 'atlas'];
  return validAgents.includes(key);
}

export function sanitizeMessage(text) {
  if (!isNonEmptyString(text)) return '';
  // Remove potential script injection
  return text.trim().slice(0, 10000); // Max 10k chars
}

export function validateChatMessage(text) {
  if (!isNonEmptyString(text)) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (text.length > 10000) {
    return { valid: false, error: 'Message too long (max 10,000 characters)' };
  }
  return { valid: true, text: text.trim() };
}
```

**File: `js/utils/markdown.js`**
```javascript
// js/utils/markdown.js
import { escapeHtml } from './dom.js';
import state from '../state.js';

export function extractChartData(text) {
  const charts = [];
  const codeBlockPattern = /```(?:json|chart)?\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockPattern.exec(text)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const data = JSON.parse(jsonStr);
      if (data.type === 'chart' && data.chartType && data.data) {
        charts.push({
          raw: match[0],
          data: data,
          position: match.index,
        });
      }
    } catch (e) {
      // Not valid JSON or not a chart
    }
  }
  return charts;
}

export function renderChart(chartData) {
  const chartId = state.nextChartId();
  const { chartType, title, data, options = {} } = chartData;
  
  // Build ApexCharts options...
  const apexOptions = buildChartOptions(chartType, data, options);
  
  state.pendingCharts.set(chartId, apexOptions);
  
  const titleHtml = title ? `<div class="chart-title">${escapeHtml(title)}</div>` : '';
  return `
    <div class="chart-container">
      ${titleHtml}
      <div id="${chartId}" class="chart-wrapper" data-chart-pending="true"></div>
    </div>
  `;
}

function buildChartOptions(chartType, data, options) {
  // ... (existing chart building logic)
}

export function formatMarkdown(text) {
  if (!text) return '';
  
  const charts = extractChartData(text);
  let processedText = text;
  const chartPlaceholders = [];
  
  if (charts.length > 0) {
    charts.forEach((chart, idx) => {
      const placeholder = `<!--CHART_${idx}-->`;
      chartPlaceholders.push(renderChart(chart.data));
      processedText = processedText.replace(chart.raw, placeholder);
    });
  }
  
  let html;
  if (typeof marked === 'undefined') {
    // Fallback formatting
    html = escapeHtml(processedText);
    // ... basic formatting
  } else {
    marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
    html = marked.parse(processedText);
  }
  
  // Replace chart placeholders
  chartPlaceholders.forEach((chartHtml, idx) => {
    html = html.split(`<!--CHART_${idx}-->`).join(chartHtml);
  });
  
  return html;
}

export function renderPendingCharts() {
  if (typeof ApexCharts === 'undefined') return;
  
  const pending = document.querySelectorAll('[data-chart-pending="true"]');
  pending.forEach(container => {
    const chartId = container.id;
    const options = state.pendingCharts.get(chartId);
    
    if (options) {
      container.removeAttribute('data-chart-pending');
      const chart = new ApexCharts(container, options);
      chart.render();
      state.pendingCharts.delete(chartId);
    }
  });
}
```

#### 2.4 Create Services → `js/services/`
**Time:** 1.5 hours

**File: `js/services/storage.js`**
```javascript
// js/services/storage.js

const KEYS = {
  SIDE_PANEL_WIDTH: 'sidePanelWidth',
  LEFT_PANEL_TAB: 'leftPanelTab',
  FOLDER_STATES: 'folderStates',
  MESSAGE_DRAFTS: 'messageDrafts',
};

export function get(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? JSON.parse(value) : defaultValue;
  } catch (e) {
    console.error(`[Storage] Failed to get ${key}:`, e);
    return defaultValue;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[Storage] Failed to set ${key}:`, e);
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// Specific helpers
export const Storage = {
  getSidePanelWidth: () => get(KEYS.SIDE_PANEL_WIDTH, 400),
  setSidePanelWidth: (width) => set(KEYS.SIDE_PANEL_WIDTH, width),
  
  getLeftPanelTab: () => get(KEYS.LEFT_PANEL_TAB, 'priorities'),
  setLeftPanelTab: (tab) => set(KEYS.LEFT_PANEL_TAB, tab),
  
  getFolderStates: () => get(KEYS.FOLDER_STATES, {}),
  setFolderState: (path, collapsed) => {
    const states = get(KEYS.FOLDER_STATES, {});
    states[path] = collapsed;
    set(KEYS.FOLDER_STATES, states);
  },
  
  getDrafts: () => get(KEYS.MESSAGE_DRAFTS, {}),
  setDrafts: (drafts) => set(KEYS.MESSAGE_DRAFTS, drafts),
};

export default Storage;
```

**File: `js/services/api.js`**
```javascript
// js/services/api.js
import { API_ENDPOINTS } from '../constants.js';

class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      throw new ApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response
      );
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message, 0, null);
  }
}

export const Api = {
  // Status
  async getStatus() {
    return request(API_ENDPOINTS.STATUS);
  },
  
  // Interactions
  async getActiveInteractions() {
    return request(API_ENDPOINTS.INTERACTIONS);
  },
  
  // Priorities
  async getPriorities() {
    const data = await request(API_ENDPOINTS.PRIORITIES);
    return data.ok ? data : null;
  },
  
  // Standup
  async getStandup() {
    const data = await request(API_ENDPOINTS.STANDUP);
    return data.ok ? data : null;
  },
  
  // Files
  async getFiles() {
    const data = await request(API_ENDPOINTS.FILES);
    return data.ok ? (data.tree || data.files) : [];
  },
  
  async getFile(path) {
    const data = await request(API_ENDPOINTS.FILE(path));
    return data.ok ? data.content : null;
  },
  
  // Agent
  async getAgentMemory(agentKey) {
    return request(API_ENDPOINTS.AGENT(agentKey));
  },
  
  // Chat
  async getChatHistory(agentKey) {
    const data = await request(API_ENDPOINTS.CHAT(agentKey));
    return data.ok ? data.messages : [];
  },
  
  async sendChatMessage(agentKey, message, cacheOnly = false) {
    return request(API_ENDPOINTS.CHAT(agentKey), {
      method: 'POST',
      body: JSON.stringify({ message, cacheOnly }),
    });
  },
  
  async cacheAgentReply(agentKey, content) {
    return request(API_ENDPOINTS.CHAT_REPLY(agentKey), {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
  
  // Action Items
  async getActionItems() {
    const data = await request(API_ENDPOINTS.ACTION_ITEMS);
    return data.ok ? data.items : [];
  },
  
  async updateActionItem(index, completed) {
    return request(API_ENDPOINTS.ACTION_ITEM(index), {
      method: 'PUT',
      body: JSON.stringify({ completed }),
    });
  },
  
  async addActionItem(text, agent) {
    return request(API_ENDPOINTS.ACTION_ITEMS_ADD, {
      method: 'POST',
      body: JSON.stringify({ text, agent }),
    });
  },
  
  async clearCompletedActionItems() {
    return request(API_ENDPOINTS.ACTION_ITEMS_CLEAR, {
      method: 'DELETE',
    });
  },
};

export default Api;
```

**File: `js/services/gateway.js`**
```javascript
// js/services/gateway.js
import state from '../state.js';
import { TIMEOUTS, WS_STATES } from '../constants.js';
import { $ } from '../utils/dom.js';

function getWebSocketUrl() {
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${window.location.host}/gw`;
}

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

function sendRaw(data) {
  const { socket } = state.gateway;
  if (socket && socket.readyState === WS_STATES.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function updateStatusIndicator(connected) {
  const wsEl = $('#wsStatus');
  if (wsEl) {
    wsEl.textContent = connected ? 'Live' : 'Connecting...';
    wsEl.style.color = connected ? '#22c55e' : '#f59e0b';
  }
}

export function connect() {
  const { gateway } = state;
  if (gateway.socket && gateway.socket.readyState <= WS_STATES.OPEN) return;
  
  console.log('[GW] Connecting...');
  const socket = new WebSocket(getWebSocketUrl());
  gateway.socket = socket;
  
  socket.onopen = () => {
    console.log('[GW] WebSocket open, authenticating...');
    const connId = state.nextGatewayId();
    
    sendRaw({
      type: 'req',
      id: connId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        auth: { token: config.gatewayToken },
      },
    });
    
    gateway.pendingRequests.set(connId, {
      resolve: (payload) => {
        gateway.connected = true;
        console.log('[GW] Connected!', payload.server?.version);
        updateStatusIndicator(true);
      },
      reject: (err) => {
        console.error('[GW] Connect failed:', err);
        updateStatusIndicator(false);
      },
    });
  };
  
  socket.onmessage = (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      return;
    }
    
    // Handle response
    if (frame.type === 'res' && frame.id) {
      const pending = gateway.pendingRequests.get(frame.id);
      if (pending) {
        gateway.pendingRequests.delete(frame.id);
        frame.ok ? pending.resolve(frame.payload) : pending.reject(frame.error);
      }
    }
    
    // Handle streaming chat events
    if (frame.type === 'event' && frame.event === 'chat') {
      handleChatEvent(frame.payload);
    }
  };
  
  socket.onclose = () => {
    gateway.connected = false;
    console.log('[GW] WebSocket closed, reconnecting...');
    updateStatusIndicator(false);
    setTimeout(connect, TIMEOUTS.RECONNECT);
  };
  
  socket.onerror = (e) => {
    console.error('[GW] WebSocket error:', e);
  };
}

function handleChatEvent(payload) {
  const { gateway } = state;
  
  for (const [key, cb] of gateway.chatCallbacks) {
    if (payload.sessionKey && payload.sessionKey === key) {
      if (payload.state === 'delta' && payload.message) {
        const text = extractMessageText(payload.message);
        if (text) cb.onDelta(text, payload);
      } else if (payload.state === 'final') {
        if (payload.message) {
          const text = extractMessageText(payload.message);
          if (text) cb.onDelta(text, payload);
        }
        cb.onFinal(payload);
      } else if (payload.state === 'error' || payload.state === 'aborted') {
        cb.onError(payload);
      }
    }
  }
}

export function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const { gateway } = state;
    
    if (!gateway.socket || gateway.socket.readyState !== WS_STATES.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    
    const id = state.nextGatewayId();
    gateway.pendingRequests.set(id, { resolve, reject });
    
    sendRaw({ type: 'req', id, method, params });
    
    setTimeout(() => {
      if (gateway.pendingRequests.has(id)) {
        gateway.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, TIMEOUTS.REQUEST);
  });
}

export function registerChatCallback(sessionKey, callbacks) {
  state.gateway.chatCallbacks.set(sessionKey, callbacks);
}

export function unregisterChatCallback(sessionKey) {
  state.gateway.chatCallbacks.delete(sessionKey);
}

export function isConnected() {
  return state.gateway.connected;
}

export function agentSessionKey(agentKey) {
  return `agent:${agentKey}:webchat:user`;
}

export const Gateway = {
  connect,
  request,
  registerChatCallback,
  unregisterChatCallback,
  isConnected,
  agentSessionKey,
  extractMessageText,
};

export default Gateway;
```

#### 2.5 Create Components → `js/components/`
**Time:** 2.5 hours

**File: `js/components/agents.js`**
```javascript
// js/components/agents.js
import state from '../state.js';
import { DEFAULT_AGENT_POSITIONS, CONFERENCE_SEATS, TIMEOUTS } from '../constants.js';
import { $, $$ } from '../utils/dom.js';

let activeNotification = null;

export function showMovementNotification(text) {
  if (activeNotification) activeNotification.remove();
  
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 80px; right: 20px;
    background: rgba(14,165,233,0.95); color: #fff;
    padding: 12px 20px; border-radius: 8px;
    font-size: 0.85rem; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 200; opacity: 0; transition: opacity 0.3s;
  `;
  el.textContent = text;
  document.body.appendChild(el);
  activeNotification = el;
  
  requestAnimationFrame(() => el.style.opacity = '1');
  
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      if (activeNotification === el) activeNotification = null;
    }, 300);
  }, TIMEOUTS.NOTIFICATION_DISPLAY);
}

export function moveAgent(agentKey, position) {
  const el = $(`.agent.${agentKey}`);
  if (!el) return;
  
  el.style.transform = 'none';
  
  if (position.left !== undefined) {
    el.style.left = position.left + 'px';
    el.style.right = 'auto';
  }
  if (position.right !== undefined) {
    el.style.right = position.right + 'px';
    el.style.left = 'auto';
  }
  if (position.top !== undefined) {
    el.style.top = position.top + 'px';
    el.style.bottom = 'auto';
  }
  if (position.bottom !== undefined) {
    el.style.bottom = position.bottom + 'px';
    el.style.top = 'auto';
  }
}

export function returnToDesk(agentKey) {
  const el = $(`.agent.${agentKey}`);
  if (!el) return;
  
  // Clear inline styles - CSS class positions take over
  el.style.removeProperty('left');
  el.style.removeProperty('right');
  el.style.removeProperty('top');
  el.style.removeProperty('bottom');
  el.style.removeProperty('transform');
  
  delete state.seatAssignments[agentKey];
  state.movedAgents.delete(agentKey);
}

export function moveForChat(fromAgent, toAgent) {
  if (state.movedAgents.has(fromAgent)) return;
  
  const toPos = DEFAULT_AGENT_POSITIONS[toAgent];
  if (!toPos) return;
  
  const dest = {};
  if (toPos.left !== undefined) {
    dest.top = toPos.top;
    dest.left = toPos.left + 80;
  } else if (toPos.right !== undefined) {
    dest.top = toPos.top;
    dest.right = toPos.right + 80;
  } else {
    dest.bottom = (toPos.bottom || 35) + 60;
    dest.left = 280;
  }
  
  moveAgent(fromAgent, dest);
  state.movedAgents.add(fromAgent);
  
  const fromName = fromAgent.charAt(0).toUpperCase() + fromAgent.slice(1);
  const toName = toAgent.charAt(0).toUpperCase() + toAgent.slice(1);
  showMovementNotification(`${fromName} walked over to ${toName}'s desk`);
}

export function startMeeting(meetingType) {
  state.currentMeeting = meetingType;
  const allAgents = ['isla', 'marcus', 'harper', 'eli', 'sage', 'dash', 'julie', 'remy', 'lena', 'val'];
  
  allAgents.forEach((agent, idx) => {
    if (idx < CONFERENCE_SEATS.length) {
      moveAgent(agent, CONFERENCE_SEATS[idx]);
      state.seatAssignments[agent] = idx;
      state.movedAgents.add(agent);
    }
  });
}

export function endMeeting() {
  state.currentMeeting = null;
  ['isla', 'marcus', 'harper', 'eli', 'sage', 'dash', 'julie', 'remy', 'lena', 'val'].forEach(returnToDesk);
}

export function updateStatusIndicators(statuses) {
  for (const [agentKey, status] of Object.entries(statuses)) {
    const agentEl = $(`.agent.${agentKey}`);
    if (!agentEl) continue;
    
    const statusDot = agentEl.querySelector('.status-dot');
    const taskEl = agentEl.querySelector('.agent-task');
    
    if (statusDot) {
      statusDot.classList.remove('status-working', 'status-idle', 'status-thinking', 'status-meeting');
      
      switch (status.state) {
        case 'working':
          statusDot.classList.add('status-working');
          break;
        case 'thinking':
          statusDot.classList.add('status-thinking');
          break;
        case 'meeting':
          statusDot.classList.add('status-meeting');
          break;
        default:
          statusDot.classList.add('status-idle');
      }
    }
    
    if (taskEl && status.task) {
      taskEl.textContent = status.task;
    }
  }
}

export function animateAgentMovement(interactions) {
  if (state.currentMeeting) return;
  
  const interacting = new Set();
  for (const i of interactions) {
    interacting.add(i.from);
    interacting.add(i.to);
  }
  
  const handled = new Set();
  for (const i of interactions) {
    if (handled.has(i.from) || handled.has(i.to)) continue;
    moveForChat(i.from, i.to);
    handled.add(i.from);
    handled.add(i.to);
  }
  
  for (const agent of state.movedAgents) {
    if (!interacting.has(agent)) returnToDesk(agent);
  }
}

export const Agents = {
  showMovementNotification,
  moveAgent,
  returnToDesk,
  moveForChat,
  startMeeting,
  endMeeting,
  updateStatusIndicators,
  animateAgentMovement,
};

export default Agents;
```

*Continue with `chat.js`, `files.js`, `panels.js`, `mobile.js`...*

#### 2.6 Create Main App Entry → `js/app.js`
**Time:** 45 minutes

```javascript
// js/app.js
import state from './state.js';
import { TIMEOUTS, BREAKPOINTS } from './constants.js';
import { $, $$ } from './utils/dom.js';
import { formatTimeWithDay } from './utils/time.js';
import Storage from './services/storage.js';
import Api from './services/api.js';
import Gateway from './services/gateway.js';
import Agents from './components/agents.js';
import Chat from './components/chat.js';
import Files from './components/files.js';
import Panels from './components/panels.js';
import Mobile from './components/mobile.js';

// Initialize application
function init() {
  console.log('[App] Initializing Office Dashboard...');
  
  // Connect to Gateway
  Gateway.connect();
  
  // Initialize UI components
  Panels.init();
  Chat.init();
  Files.init();
  Mobile.init();
  
  // Setup event listeners
  setupAgentClickHandlers();
  setupResizeHandler();
  
  // Start polling
  startPolling();
  
  // Update office time
  updateOfficeTime();
  state.intervals.time = setInterval(updateOfficeTime, 60000);
  
  // Auto-open Isla on mobile
  if (window.innerWidth <= BREAKPOINTS.MOBILE) {
    setTimeout(() => {
      const islaAgent = $('.agent.isla');
      if (islaAgent) islaAgent.click();
    }, 500);
  }
  
  console.log('[App] Initialization complete');
}

function updateOfficeTime() {
  const timeEl = $('#officeTime');
  if (timeEl) {
    timeEl.textContent = `🏢 The Office - ${formatTimeWithDay()}`;
  }
}

function setupAgentClickHandlers() {
  $$('.agent').forEach(agent => {
    agent.addEventListener('click', () => handleAgentClick(agent));
  });
}

async function handleAgentClick(agent) {
  // Deselect previous
  if (state.selectedAgent) {
    state.selectedAgent.classList.remove('selected');
  }
  
  // Select new
  agent.classList.add('selected');
  state.selectedAgent = agent;
  
  const agentKey = agent.classList[1];
  const name = agent.dataset.name;
  const role = agent.dataset.role;
  const emoji = agent.dataset.emoji;
  const quote = agent.dataset.quote;
  
  // Update panel header
  $('#panelAvatar').textContent = emoji;
  $('#panelName').textContent = name;
  $('#panelRole').textContent = role;
  
  // Load chat and show panel
  await Chat.loadAgentChat(agentKey);
  Panels.showSidePanel();
  Panels.switchToTab('chat');
  
  // Load memory/status (async)
  const memoryData = await Api.getAgentMemory(agentKey).catch(() => ({}));
  Panels.renderMemorySection(memoryData, agentKey, quote);
  Panels.renderStatusSection(memoryData, quote);
  
  // Update mobile nav
  Mobile.updateActiveAgent(agentKey);
}

function startPolling() {
  // Status polling
  pollStatus();
  state.intervals.status = setInterval(pollStatus, TIMEOUTS.POLL_STATUS);
  
  // Interactions polling
  pollInteractions();
  state.intervals.interactions = setInterval(pollInteractions, TIMEOUTS.POLL_INTERACTIONS);
  
  // Priorities polling
  Panels.fetchPriorities();
  state.intervals.priorities = setInterval(() => Panels.fetchPriorities(), TIMEOUTS.POLL_PRIORITIES);
  
  // Standup polling
  Panels.fetchStandup();
  state.intervals.standup = setInterval(() => Panels.fetchStandup(), TIMEOUTS.POLL_STANDUP);
  
  // Files polling
  Files.fetch();
  state.intervals.files = setInterval(() => Files.fetch(), TIMEOUTS.POLL_FILES);
}

async function pollStatus() {
  try {
    const statuses = await Api.getStatus();
    Agents.updateStatusIndicators(statuses);
  } catch (e) {
    console.log('[Poll] Status failed:', e.message);
  }
}

async function pollInteractions() {
  try {
    const active = await Api.getActiveInteractions();
    Panels.updateInteractionFeed(active);
    Agents.animateAgentMovement(active);
  } catch (e) {
    console.log('[Poll] Interactions failed:', e.message);
  }
}

function setupResizeHandler() {
  const resizeHandle = $('#resizeHandle');
  const sidePanel = $('#sidePanel');
  
  // Load saved width
  const savedWidth = Storage.getSidePanelWidth();
  if (savedWidth) sidePanel.style.width = savedWidth + 'px';
  
  resizeHandle.addEventListener('mousedown', (e) => {
    state.resize.isResizing = true;
    state.resize.startX = e.clientX;
    state.resize.startWidth = sidePanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!state.resize.isResizing) return;
    const deltaX = state.resize.startX - e.clientX;
    const newWidth = Math.max(300, Math.min(800, state.resize.startWidth + deltaX));
    sidePanel.style.width = newWidth + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (state.resize.isResizing) {
      state.resize.isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      Storage.setSidePanelWidth(sidePanel.offsetWidth);
    }
  });
}

// Expose API for agents to add action items
window.addActionItemFromAgent = async function(text, agentName) {
  try {
    const result = await Api.addActionItem(text, agentName);
    if (result.ok) {
      console.log(`✅ Action item added by ${agentName || 'system'}: ${text}`);
      Panels.fetchPriorities();
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to add action item:', e);
    return false;
  }
};

// Start app when DOM ready
document.addEventListener('DOMContentLoaded', init);

export default { init };
```

#### 2.7 Update index.html Script Tags
**Time:** 15 minutes

Replace the entire `<script>` block with:
```html
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js"></script>
<script type="module" src="js/app.js"></script>
```

### Testing Checkpoint 2
- [ ] Page loads without JavaScript errors
- [ ] Gateway WebSocket connects
- [ ] Agent clicks open side panel
- [ ] Chat messages load and send
- [ ] Status indicators update
- [ ] All tabs function (Memory, Status, Files)
- [ ] Mobile navigation works
- [ ] Panel resize works
- [ ] Drafts persist across page reloads

---

## Phase 3: Error Handling & Loading States (4-6 hours)

### Overview
Add user-facing error messages, loading indicators, and retry logic.

### Prerequisites
- Phase 2 complete (JS modules extracted)

### Tasks

#### 3.1 Create Toast Notification System
**Time:** 30 minutes

**File: `js/utils/toast.js`**
```javascript
// js/utils/toast.js

const TOAST_DURATION = 4000;
const toastContainer = createToastContainer();

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = 'info') {
  const colors = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#0ea5e9',
  };
  
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: ${colors[type]};
    color: white;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;
  
  toast.innerHTML = `
    <span style="font-size: 1.1rem;">${icons[type]}</span>
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });
  
  // Auto-remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION);
  
  return toast;
}

export const Toast = {
  success: (msg) => showToast(msg, 'success'),
  error: (msg) => showToast(msg, 'error'),
  warning: (msg) => showToast(msg, 'warning'),
  info: (msg) => showToast(msg, 'info'),
};

export default Toast;
```

#### 3.2 Add Loading States to Components
**Time:** 1 hour

**Add to CSS (`css/components.css`):**
```css
/* Loading States */
.loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  border-top-color: var(--color-accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.skeleton {
  background: linear-gradient(90deg, #2a2a3e 25%, #3a3a4e 50%, #2a2a3e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-text {
  height: 14px;
  margin: 8px 0;
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 15, 26, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.btn-loading {
  position: relative;
  color: transparent !important;
}

.btn-loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.6s linear infinite;
}
```

**Update Chat Loading (`js/components/chat.js`):**
```javascript
function showChatLoading() {
  const chatMessages = $('#chatMessages');
  chatMessages.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner" style="width: 30px; height: 30px;"></div>
    </div>
  `;
}

function showChatSkeleton() {
  const chatMessages = $('#chatMessages');
  chatMessages.innerHTML = `
    <div style="padding: 20px;">
      ${Array(3).fill().map(() => `
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <div class="skeleton skeleton-avatar"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-text" style="width: 60%;"></div>
            <div class="skeleton skeleton-text" style="width: 80%;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
```

#### 3.3 Add Retry Logic to API Calls
**Time:** 45 minutes

**Update `js/services/api.js`:**
```javascript
async function requestWithRetry(url, options = {}, retries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await request(url, options);
    } catch (error) {
      lastError = error;
      console.log(`[API] Attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  throw lastError;
}

// Use in critical API calls
export const Api = {
  async getChatHistory(agentKey) {
    const data = await requestWithRetry(API_ENDPOINTS.CHAT(agentKey));
    return data.ok ? data.messages : [];
  },
  // ... etc
};
```

#### 3.4 Add Offline Detection
**Time:** 30 minutes

**Add to `js/app.js`:**
```javascript
import Toast from './utils/toast.js';

function setupOfflineDetection() {
  window.addEventListener('online', () => {
    Toast.success('Connection restored');
    Gateway.connect();
  });
  
  window.addEventListener('offline', () => {
    Toast.warning('You are offline. Changes may not be saved.');
  });
}

// Call in init()
setupOfflineDetection();
```

#### 3.5 Add Error Boundaries to Gateway
**Time:** 45 minutes

**Update `js/services/gateway.js`:**
```javascript
socket.onmessage = (event) => {
  let frame;
  try {
    frame = JSON.parse(event.data);
  } catch (parseError) {
    console.error('[GW] Failed to parse message:', parseError);
    return; // Don't crash
  }
  
  try {
    handleFrame(frame);
  } catch (handleError) {
    console.error('[GW] Error handling frame:', handleError);
    Toast.error('Connection error - some updates may be delayed');
  }
};

function handleFrame(frame) {
  // ... existing logic wrapped in try/catch
}
```

#### 3.6 Add Send Button Loading State
**Time:** 30 minutes

**Update `js/components/chat.js`:**
```javascript
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !state.currentAgentKey) return;
  
  const sendBtn = $('#chatSend');
  
  // Show loading state
  sendBtn.classList.add('btn-loading');
  sendBtn.disabled = true;
  
  try {
    // ... existing send logic
  } catch (error) {
    Toast.error('Failed to send message. Please try again.');
  } finally {
    sendBtn.classList.remove('btn-loading');
    sendBtn.disabled = false;
  }
}
```

### Testing Checkpoint 3
- [ ] Toast notifications appear for errors
- [ ] Loading spinners show while data loads
- [ ] Skeleton loaders display during chat load
- [ ] Send button shows loading state
- [ ] Offline banner appears when disconnected
- [ ] Failed requests retry automatically
- [ ] No uncaught exceptions in console

---

## Phase 4: Input Validation (3-4 hours)

### Overview
Add validation to all user inputs and API responses.

### Prerequisites
- Phase 3 complete (error handling in place)

### Tasks

#### 4.1 Frontend Input Validation
**Time:** 1 hour

**Update `js/utils/validation.js`:**
```javascript
export const Validation = {
  // Message validation
  chatMessage(text) {
    if (typeof text !== 'string') {
      return { valid: false, error: 'Invalid input type' };
    }
    
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Message cannot be empty' };
    }
    
    if (trimmed.length > 10000) {
      return { valid: false, error: 'Message too long (max 10,000 characters)' };
    }
    
    return { valid: true, value: trimmed };
  },
  
  // Agent key validation
  agentKey(key) {
    const validAgents = ['isla', 'marcus', 'harper', 'eli', 'sage', 'julie', 'dash', 'remy', 'lena', 'val', 'atlas'];
    
    if (!key || typeof key !== 'string') {
      return { valid: false, error: 'Invalid agent' };
    }
    
    if (!validAgents.includes(key.toLowerCase())) {
      return { valid: false, error: 'Unknown agent' };
    }
    
    return { valid: true, value: key.toLowerCase() };
  },
  
  // File path validation
  filePath(path) {
    if (!path || typeof path !== 'string') {
      return { valid: false, error: 'Invalid file path' };
    }
    
    // Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      return { valid: false, error: 'Invalid file path' };
    }
    
    return { valid: true, value: path };
  },
  
  // Action item validation
  actionItem(text) {
    if (typeof text !== 'string') {
      return { valid: false, error: 'Invalid input' };
    }
    
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Action item cannot be empty' };
    }
    
    if (trimmed.length > 500) {
      return { valid: false, error: 'Action item too long (max 500 characters)' };
    }
    
    return { valid: true, value: trimmed };
  },
};

export default Validation;
```

**Apply validation in chat.js:**
```javascript
import Validation from '../utils/validation.js';
import Toast from '../utils/toast.js';

async function sendMessage() {
  const result = Validation.chatMessage(chatInput.value);
  
  if (!result.valid) {
    Toast.warning(result.error);
    return;
  }
  
  const text = result.value;
  // ... continue with sending
}
```

#### 4.2 API Response Validation
**Time:** 1 hour

**Update `js/services/api.js`:**
```javascript
function validateResponse(data, schema) {
  for (const [key, validator] of Object.entries(schema)) {
    if (validator.required && !(key in data)) {
      throw new ApiError(`Missing required field: ${key}`, 0, null);
    }
    
    if (key in data && validator.type) {
      const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
      if (actualType !== validator.type) {
        console.warn(`[API] Field ${key} expected ${validator.type}, got ${actualType}`);
      }
    }
  }
  return true;
}

export const Api = {
  async getChatHistory(agentKey) {
    const data = await request(API_ENDPOINTS.CHAT(agentKey));
    
    // Validate response structure
    validateResponse(data, {
      ok: { required: true, type: 'boolean' },
      messages: { required: false, type: 'array' },
    });
    
    return data.ok ? (data.messages || []) : [];
  },
  // ... apply to other methods
};
```

#### 4.3 Add XSS Protection
**Time:** 45 minutes

**Update `js/utils/dom.js`:**
```javascript
// Enhanced HTML escaping
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Safe innerHTML setter
export function setInnerHTML(element, html) {
  // If DOMPurify is available, use it
  if (typeof DOMPurify !== 'undefined') {
    element.innerHTML = DOMPurify.sanitize(html);
  } else {
    element.innerHTML = html;
  }
}
```

**Add DOMPurify to index.html:**
```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>
```

#### 4.4 Backend Input Validation
**Time:** 1 hour

**Update `gateway-api.js`:**
```javascript
// Validation helpers
function validateString(value, maxLength = 10000) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function validateAgentKey(key) {
  const validAgents = ['isla', 'marcus', 'harper', 'eli', 'sage', 'julie', 'dash', 'remy', 'lena', 'val', 'atlas'];
  return typeof key === 'string' && validAgents.includes(key.toLowerCase());
}

// Apply validation to endpoints
if (url.startsWith('/chat/') && method === 'POST') {
  const agentKey = url.split('/')[2];
  
  if (!validateAgentKey(agentKey)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Invalid agent' }));
  }
  
  if (!validateString(body.message)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Invalid message' }));
  }
  
  // Continue processing...
}
```

### Testing Checkpoint 4
- [ ] Empty messages show validation error
- [ ] Very long messages are rejected
- [ ] Invalid agent keys are rejected
- [ ] File paths with ".." are blocked
- [ ] XSS payloads are sanitized
- [ ] Backend returns 400 for invalid input
- [ ] Malformed API responses don't crash UI

---

## Phase 5: State Management Refactor (4-6 hours)

### Overview
Consolidate global variables into proper state management with clear boundaries.

### Prerequisites
- Phase 4 complete (validation in place)

### Tasks

#### 5.1 Implement Observable State
**Time:** 1.5 hours

**Update `js/state.js`:**
```javascript
// Simple event emitter for state changes
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }
  
  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(data);
        } catch (e) {
          console.error(`[State] Event handler error for ${event}:`, e);
        }
      }
    }
  }
}

class AppState extends EventEmitter {
  constructor() {
    super();
    // ... existing state
  }
  
  // State setters with events
  setSelectedAgent(agent) {
    const previous = this.selectedAgent;
    this.selectedAgent = agent;
    this.emit('selectedAgentChanged', { previous, current: agent });
  }
  
  setCurrentAgentKey(key) {
    const previous = this.currentAgentKey;
    this.currentAgentKey = key;
    this.emit('currentAgentKeyChanged', { previous, current: key });
  }
  
  setGatewayConnected(connected) {
    const previous = this.gateway.connected;
    this.gateway.connected = connected;
    this.emit('gatewayConnectionChanged', { previous, current: connected });
  }
  
  updateChatCache(messages) {
    this.chatMessagesCache = messages;
    this.emit('chatCacheUpdated', messages);
  }
  
  addUnreadMessage(agentKey) {
    const count = (this.unreadMessages.get(agentKey) || 0) + 1;
    this.unreadMessages.set(agentKey, count);
    this.emit('unreadCountChanged', { agentKey, count });
  }
  
  clearUnread(agentKey) {
    this.unreadMessages.set(agentKey, 0);
    this.emit('unreadCountChanged', { agentKey, count: 0 });
  }
}
```

#### 5.2 Subscribe Components to State Changes
**Time:** 1.5 hours

**Update `js/components/agents.js`:**
```javascript
import state from '../state.js';

// Subscribe to unread changes
state.on('unreadCountChanged', ({ agentKey, count }) => {
  const agentEl = $(`.agent.${agentKey}`);
  if (agentEl) {
    if (count > 0) {
      agentEl.classList.add('has-unread');
      const badge = agentEl.querySelector('.unread-badge');
      if (badge) badge.textContent = count > 9 ? '9+' : count;
    } else {
      agentEl.classList.remove('has-unread');
    }
  }
});
```

**Update Gateway status indicator:**
```javascript
state.on('gatewayConnectionChanged', ({ current }) => {
  const wsEl = $('#wsStatus');
  if (wsEl) {
    wsEl.textContent = current ? 'Live' : 'Connecting...';
    wsEl.style.color = current ? '#22c55e' : '#f59e0b';
  }
});
```

#### 5.3 Add State Persistence
**Time:** 1 hour

**Update `js/state.js`:**
```javascript
class AppState extends EventEmitter {
  constructor() {
    super();
    // ... existing initialization
    
    // Load persisted state
    this._loadPersistedState();
  }
  
  _loadPersistedState() {
    // Restore UI preferences
    const leftTab = Storage.getLeftPanelTab();
    if (leftTab) this.leftPanelTab = leftTab;
    
    const panelWidth = Storage.getSidePanelWidth();
    if (panelWidth) this.sidePanelWidth = panelWidth;
    
    // Restore drafts
    this.messageDrafts = Storage.getDrafts();
  }
  
  _persistState() {
    Storage.setLeftPanelTab(this.leftPanelTab);
    Storage.setSidePanelWidth(this.sidePanelWidth);
    Storage.setDrafts(this.messageDrafts);
  }
  
  // Auto-persist on certain changes
  setLeftPanelTab(tab) {
    this.leftPanelTab = tab;
    Storage.setLeftPanelTab(tab);
  }
}
```

#### 5.4 Clean Up Global Variables
**Time:** 1 hour

Remove all remaining global `let` variables from any component files. Ensure all state is accessed through `state.*`:

```javascript
// BEFORE (scattered globals)
let selectedAgent = null;
let currentTargetId = null;
let gwSocket = null;
let gwConnected = false;

// AFTER (centralized state)
import state from '../state.js';
// Use state.selectedAgent, state.gateway.socket, etc.
```

### Testing Checkpoint 5
- [ ] State changes trigger UI updates
- [ ] Connection status updates automatically
- [ ] Unread badges update via state events
- [ ] UI preferences persist across reloads
- [ ] No global `let` variables outside state.js
- [ ] State is not mutated directly (use setters)

---

## Phase 6: Constants & Configuration (1-2 hours)

### Overview
Final cleanup of magic numbers and hardcoded values.

### Prerequisites
- Phase 5 complete

### Tasks

#### 6.1 Audit Remaining Magic Numbers
**Time:** 30 minutes

Search for hardcoded values in all JS files:
- `setTimeout(xxx, 8000)` → `TIMEOUTS.AGENT_RETURN_TO_DESK`
- `if (window.innerWidth < 768)` → `BREAKPOINTS.MOBILE`
- `width: 400px` → CSS variable or constant
- `#22c55e` → `var(--color-success)`

#### 6.2 Create Runtime Configuration
**Time:** 30 minutes

**Create `js/config.js`:**
```javascript
// Runtime configuration (can be overridden)
export const Config = {
  // API configuration
  api: {
    baseUrl: '/api',
    timeout: 60000,
    retries: 3,
  },
  
  // Gateway configuration
  gateway: {
    reconnectDelay: 3000,
    requestTimeout: 60000,
  },
  
  // UI configuration
  ui: {
    defaultPanelWidth: 400,
    minPanelWidth: 300,
    maxPanelWidth: 800,
    mobileBreakpoint: 768,
    tabletBreakpoint: 1200,
  },
  
  // Feature flags (for gradual rollouts)
  features: {
    enableCharts: true,
    enableOfflineMode: true,
    debugMode: false,
  },
};

export default Config;
```

#### 6.3 Environment-Specific Configuration
**Time:** 30 minutes

**Update `config.js` (root):**
```javascript
// config.js - Environment configuration
// This file is gitignored for sensitive values

window.config = {
  gatewayToken: 'YOUR_TOKEN_HERE',
  
  // Environment-specific overrides
  environment: 'development', // or 'production'
  
  // Debug settings
  debug: {
    logApiCalls: true,
    logStateChanges: false,
  },
};
```

### Testing Checkpoint 6
- [ ] No hardcoded timeouts in component code
- [ ] No hardcoded colors in JavaScript
- [ ] Configuration can be overridden
- [ ] Debug mode toggles logging
- [ ] Feature flags work correctly

---

## Dependency Graph

```
Phase 1 (CSS) ──────────────────────────────────────────────────────────┐
    │                                                                   │
    ↓                                                                   │
Phase 2 (JS Modules)                                                    │
    │                                                                   │
    ├── constants.js (no deps)                                          │
    │       ↓                                                           │
    ├── state.js ← constants                                            │
    │       ↓                                                           │
    ├── utils/* ← state                                                 │
    │       ↓                                                           │
    ├── services/* ← utils, state, constants                            │
    │       ↓                                                           │
    ├── components/* ← services, utils, state                           │
    │       ↓                                                           │
    └── app.js ← all modules                                            │
           │                                                            │
           ↓                                                            │
Phase 3 (Error Handling) ← Phases 1, 2                                  │
           │                                                            │
           ↓                                                            │
Phase 4 (Validation) ← Phase 3                                          │
           │                                                            │
           ↓                                                            │
Phase 5 (State Management) ← Phase 4                                    │
           │                                                            │
           ↓                                                            │
Phase 6 (Constants) ← Phase 5                                           │
           │                                                            │
           ↓                                                            │
    ✅ Refactor Complete ←──────────────────────────────────────────────┘
```

---

## Testing Checkpoints

### After Each Phase

| Phase | Checkpoint | Time |
|-------|------------|------|
| 1 | Visual parity, responsive works | 15 min |
| 2 | All features functional, no console errors | 30 min |
| 3 | Error toasts, loading states, offline detection | 20 min |
| 4 | Validation errors shown, XSS blocked | 20 min |
| 5 | State changes propagate, persistence works | 20 min |
| 6 | No magic numbers, config overrides work | 15 min |

### Full Regression Test Checklist

**Desktop:**
- [ ] Page loads without errors
- [ ] Office view displays correctly
- [ ] Agents show correct status colors
- [ ] Click agent → panel opens
- [ ] Chat loads messages
- [ ] Send message works (Gateway)
- [ ] Streaming response displays
- [ ] Memory tab shows data
- [ ] Status tab shows data
- [ ] Files tab lists files
- [ ] File viewer opens/closes
- [ ] Left panel tabs work
- [ ] Panel resize works
- [ ] Priorities display
- [ ] Standup displays
- [ ] Interactions animate agents

**Mobile:**
- [ ] Page loads without errors
- [ ] Chat is primary view
- [ ] Hamburger menu opens left panel
- [ ] Bottom nav switches agents
- [ ] Keyboard doesn't cause zoom
- [ ] Send button accessible

**Edge Cases:**
- [ ] Refresh during streaming
- [ ] Network disconnect/reconnect
- [ ] Very long messages
- [ ] Rapid agent switching
- [ ] Empty chat history

---

## Potential Breaking Changes

### Phase 1 (CSS)
- **Risk:** CSS specificity changes
- **Mitigation:** Test all responsive breakpoints
- **Rollback:** Restore inline styles

### Phase 2 (JS Modules)
- **Risk:** Script loading order issues
- **Mitigation:** Use `type="module"` (deferred by default)
- **Rollback:** Restore inline script

### Phase 3 (Error Handling)
- **Risk:** New UI elements (toasts) may overlap
- **Mitigation:** Test z-index stacking
- **Rollback:** Remove toast calls

### Phase 4 (Validation)
- **Risk:** Overly strict validation blocks valid input
- **Mitigation:** Start permissive, tighten gradually
- **Rollback:** Bypass validation temporarily

### Phase 5 (State)
- **Risk:** State events fire in wrong order
- **Mitigation:** Add event logging in debug mode
- **Rollback:** Use direct state access

---

## Rollback Strategy

### Quick Rollback
Keep the original `index.html` as `index.backup.html` until refactor is stable.

```bash
# Before starting
cp office/index.html office/index.backup.html

# If rollback needed
cp office/index.backup.html office/index.html
```

### Phase-Level Rollback
Each phase should be committed separately:

```bash
git add -A && git commit -m "Phase 1: Extract CSS"
git add -A && git commit -m "Phase 2: Extract JS modules"
# etc.

# Rollback to previous phase
git revert HEAD
```

### Feature Flags
Use feature flags for risky changes:

```javascript
if (Config.features.enableNewStateManagement) {
  // New code
} else {
  // Old code (keep temporarily)
}
```

---

## Summary

| Phase | Time | Dependencies | Risk |
|-------|------|--------------|------|
| 1. CSS Extraction | 2-3h | None | Low |
| 2. JS Modules | 8h | Phase 1 | Medium |
| 3. Error Handling | 4-6h | Phase 2 | Low |
| 4. Input Validation | 3-4h | Phase 3 | Low |
| 5. State Management | 4-6h | Phase 4 | Medium |
| 6. Constants | 1-2h | Phase 5 | Low |
| **Total** | **22-31h** | | |

**Recommended Order:** Execute phases sequentially. Each phase is independently testable and can be shipped incrementally.

**First Priority:** Phases 1-2 (CSS + JS extraction) provide 80% of the maintainability benefit.

**Can Defer:** Phases 5-6 (state management, constants) are polish and can be done after feature work if needed.

---

*Plan created by Eli (Chief Architect) - 2026-02-12*
