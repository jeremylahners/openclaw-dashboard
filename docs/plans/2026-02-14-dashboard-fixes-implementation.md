# Dashboard Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 dashboard issues: per-agent custom tabs, files collapsed by default, folder name click, mobile file viewing, and chat message loss.

**Architecture:** Incremental changes to the single-file dashboard (index.html), backend API (gateway-api.js), and CSS (all-styles.css). Each fix is independent and can be committed separately. Fix 5 (message loss) is the most complex, involving both client and server WebSocket changes.

**Tech Stack:** Vanilla JS, Node.js HTTP server, SQLite (via node:sqlite), WebSocket (ws library), CSS media queries.

---

### Task 1: Files — Folders Collapsed by Default

**Files:**
- Modify: `office/index.html:1077-1081`

**Step 1: Change the default in isFolderCollapsed**

Find this code at line 1077:
```javascript
    function isFolderCollapsed(folderPath) {
      const states = getFolderStates();
      // Default to expanded (false) if not set
      return states[folderPath] === true;
    }
```

Replace with:
```javascript
    function isFolderCollapsed(folderPath) {
      const states = getFolderStates();
      if (folderPath in states) return states[folderPath];
      return true; // collapsed by default
    }
```

**Step 2: Verify manually**

Run: `cd /Users/jeremylahners/.openclaw/workspace/office && node serve.js`
- Open dashboard, click any agent, go to Files tab
- All folders should be collapsed by default
- Click a folder icon to expand — it should stay expanded on refresh (localStorage)

**Step 3: Commit**

```bash
git add office/index.html
git commit -m "fix: collapse file folders by default

Folders now start collapsed instead of expanded. User's explicit
expand/collapse choices are still persisted in localStorage."
```

---

### Task 2: Files — Folder Names Clickable

**Files:**
- Modify: `office/index.html:1108-1119`

**Step 1: Change click handler from .folder-toggle to .folder-header**

Find this code at line 1108:
```javascript
      // Add click handlers for folder toggles
      container.querySelectorAll('.folder-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const folder = e.target.closest('.folder-item');
          const folderPath = folder.dataset.path;
          const isCollapsed = folder.classList.toggle('collapsed');

          // Save the state
          saveFolderState(folderPath, isCollapsed);
        });
      });
```

Replace with:
```javascript
      // Add click handlers for folder headers (icon + name both clickable)
      container.querySelectorAll('.folder-header').forEach(header => {
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          const folder = e.target.closest('.folder-item');
          const folderPath = folder.dataset.path;
          const isCollapsed = folder.classList.toggle('collapsed');

          // Save the state
          saveFolderState(folderPath, isCollapsed);
        });
      });
```

**Step 2: Verify manually**

- Open Files tab, click on a folder NAME text — should expand/collapse
- Click on the folder ICON — should also still work (it's inside .folder-header)
- Hover state should highlight the full header row (already styled on .folder-header:hover)

**Step 3: Commit**

```bash
git add office/index.html
git commit -m "fix: make folder names clickable to expand/collapse

Move click handler from .folder-toggle (icon only) to .folder-header
(parent containing both icon and name). Hover style was already correct."
```

---

### Task 3: Files — Mobile File Viewing

**Files:**
- Modify: `office/css/all-styles.css` (add mobile file viewer rules after line ~1190)

**Step 1: Add mobile CSS for the file viewer**

The file viewer (`.file-viewer`) is already `position: fixed; top:0; left:0; right:0; bottom:0; z-index: 1000`. This should work on mobile, but the padding and header may need adjustment. Add after the existing `.file-viewer` CSS block (around line 1190):

```css
/* Mobile file viewer */
@media (max-width: 768px) {
  .file-viewer {
    padding: 0;
    z-index: 1300; /* Above everything including hamburger menu (1200) */
  }
  .file-viewer-header {
    padding: 12px 15px;
    margin-bottom: 0;
    position: sticky;
    top: 0;
    background: #0f0f1a;
    z-index: 1;
  }
  .file-viewer-header h2 {
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    margin-right: 10px;
  }
  .file-viewer-close {
    padding: 10px 20px;
    font-size: 1rem;
    min-height: 44px; /* iOS tap target */
  }
  .file-viewer-content {
    border-radius: 0;
    padding: 15px;
    font-size: 0.85rem;
  }
}
```

**Step 2: Prevent body scroll when file viewer is open**

In `office/index.html`, find `showFileViewer` function (line 1177). After `document.body.appendChild(viewer);` at line 1228, add:

```javascript
    // Prevent body scroll on mobile
    document.body.style.overflow = 'hidden';
```

And in the close handler (inside the click listener at line 1234), before `viewer.remove();` at line 1243, add:

```javascript
          document.body.style.overflow = '';
```

**Step 3: Verify manually on mobile**

- Open dashboard on phone/tablet (or Chrome DevTools mobile emulator)
- Navigate to Files tab, expand a folder, tap a file
- File viewer should open full-screen with no bleed-through
- Close button should be easy to tap (44px target)
- Scrolling should work inside the file content, not on the page behind it

**Step 4: Commit**

```bash
git add office/index.html office/css/all-styles.css
git commit -m "fix: enable mobile file viewing with full-screen overlay

Add mobile-specific CSS for file viewer (z-index above all panels,
proper tap targets, no padding). Prevent body scroll while viewer open."
```

---

### Task 4: Per-Agent Custom Tabs — Backend API

**Files:**
- Modify: `office/gateway-api.js` (add new endpoint, around line 462 after the chat POST handler)
- Create: `files/agents/` directory (empty, with a README)

**Step 1: Create the agent data directory structure**

```bash
mkdir -p files/agents/{isla,marcus,harper,eli,sage,julie,remy,lena,val,dash,atlas,nova}
```

**Step 2: Add the /agent-data endpoint to gateway-api.js**

Find the chat POST handler ending at line 461 (`return;`). After it, add this new endpoint:

```javascript
    // Agent custom tab data
    else if (req.url.match(/^\/agent-data\/[a-z]+\/[a-z-]+$/) && req.method === 'GET') {
      const parts = req.url.split('/');
      const agentKey = parts[2];
      const tabId = parts[3];

      // Validate agent
      if (!agentSessions[agentKey]) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
        return;
      }

      // Try .json first, then .md
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
```

**Step 3: Verify the endpoint works**

Run: `curl http://localhost:8081/agent-data/lena/workouts`
Expected: `{"ok":true,"empty":true}` (no data file yet)

**Step 4: Commit**

```bash
git add office/gateway-api.js files/agents/
git commit -m "feat: add /agent-data/:agent/:tab API endpoint

Serves structured data files (JSON or Markdown) from files/agents/{agent}/
for per-agent custom tabs. Returns {empty:true} when no file exists."
```

---

### Task 5: Per-Agent Custom Tabs — Frontend Tab Config & Rendering

**Files:**
- Modify: `office/index.html` (multiple sections)

**Step 1: Add AGENT_TABS config**

Find the `messageCache` declaration at line 1601. BEFORE it (around line 1598), add the tab configuration:

```javascript
    // Per-agent custom tab configuration
    // Chat is always first, Memory and Files are always last
    const AGENT_TABS = {
      isla:   [{ id: 'action-items', label: '📋 Actions', source: 'action-items' },
               { id: 'sprint', label: '📊 Sprint', source: 'sprint' }],
      marcus: [{ id: 'prs', label: '🔀 PRs', source: 'prs' },
               { id: 'backlog', label: '📋 Backlog', source: 'backlog' }],
      harper: [{ id: 'bugs', label: '🐛 Bugs', source: 'bugs' },
               { id: 'testplans', label: '✅ Tests', source: 'testplans' }],
      eli:    [{ id: 'architecture', label: '🏗️ Arch', source: 'architecture' },
               { id: 'techdebt', label: '🔧 Debt', source: 'techdebt' }],
      sage:   [{ id: 'research', label: '📚 Research', source: 'research' },
               { id: 'findings', label: '🔍 Findings', source: 'findings' }],
      julie:  [{ id: 'campaigns', label: '📣 Campaigns', source: 'campaigns' },
               { id: 'analytics', label: '📊 Analytics', source: 'analytics' }],
      remy:   [{ id: 'recipes', label: '🍳 Recipes', source: 'recipes' },
               { id: 'mealplan', label: '📅 Meals', source: 'mealplan' }],
      lena:   [{ id: 'workouts', label: '🏋️ Workouts', source: 'workouts' },
               { id: 'progress', label: '📈 Progress', source: 'progress' }],
      val:    [{ id: 'budget', label: '💰 Budget', source: 'budget' },
               { id: 'reports', label: '📊 Reports', source: 'reports' }],
      dash:   [{ id: 'components', label: '🖥️ UI', source: 'components' },
               { id: 'roadmap', label: '📋 Roadmap', source: 'roadmap' }],
      atlas:  [{ id: 'projects', label: '🗺️ Projects', source: 'projects' },
               { id: 'tasks', label: '📋 Tasks', source: 'tasks' }],
      nova:   [{ id: 'team', label: '👥 Team', source: 'team' },
               { id: 'policies', label: '📋 Policies', source: 'policies' }],
    };
```

**Step 2: Add the dynamic tab builder function**

Right after the AGENT_TABS config, add:

```javascript
    function buildTabsForAgent(agentKey) {
      const customTabs = AGENT_TABS[agentKey] || [];
      const panelTabsEl = document.querySelector('.panel-tabs');
      const tabContent = document.querySelector('.tab-content');

      // Build tab bar HTML: Chat + custom + Memory + Files
      let tabBarHtml = '<div class="panel-tab active" data-tab="chat">💬 Chat</div>';
      customTabs.forEach(t => {
        tabBarHtml += `<div class="panel-tab" data-tab="${t.id}" data-source="${t.source}">${t.label}</div>`;
      });
      tabBarHtml += '<div class="panel-tab" data-tab="memory">🧠 Memory</div>';
      tabBarHtml += '<div class="panel-tab" data-tab="files">📁 Files</div>';
      panelTabsEl.innerHTML = tabBarHtml;

      // Remove old custom tab panes (keep chat, memory, status, files)
      tabContent.querySelectorAll('.tab-pane[data-custom]').forEach(p => p.remove());

      // Create panes for custom tabs
      const chatPane = document.getElementById('tab-chat');
      customTabs.forEach(t => {
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `tab-${t.id}`;
        pane.dataset.custom = 'true';
        pane.dataset.source = t.source;
        pane.dataset.agent = agentKey;
        pane.innerHTML = '<div class="custom-tab-content" style="padding: 15px; overflow-y: auto; flex: 1;"><div style="text-align: center; color: #666; padding: 20px;">Loading...</div></div>';
        chatPane.after(pane);
      });

      // Re-attach tab click handlers
      panelTabsEl.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          panelTabsEl.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
          tabContent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

          tab.classList.add('active');
          const pane = document.getElementById('tab-' + tab.dataset.tab);
          if (pane) {
            pane.classList.add('active');

            // Lazy-load custom tab data on first click
            if (tab.dataset.source && !pane.dataset.loaded) {
              loadCustomTabData(agentKey, tab.dataset.source, pane);
            }
          }
        });
      });

      // Activate chat tab
      document.getElementById('tab-chat').classList.add('active');
    }

    async function loadCustomTabData(agentKey, source, pane) {
      const container = pane.querySelector('.custom-tab-content');
      try {
        const resp = await fetch(`${API_BASE}/agent-data/${agentKey}/${source}`);
        if (!resp.ok) throw new Error('Failed to fetch');
        const data = await resp.json();

        if (data.empty) {
          const agentName = agentKey.charAt(0).toUpperCase() + agentKey.slice(1);
          container.innerHTML = `<div style="text-align: center; color: #666; padding: 40px 20px;">
            <div style="font-size: 2rem; margin-bottom: 10px;">📭</div>
            <p>No data yet.</p>
            <p style="font-size: 0.85rem;">Ask ${agentName} to update this tab.</p>
          </div>`;
        } else if (data.format === 'markdown' && typeof marked !== 'undefined') {
          marked.setOptions({ breaks: true, gfm: true });
          container.innerHTML = `<div class="markdown-view" style="max-width: 800px;">${marked.parse(data.content)}</div>`;
        } else if (data.format === 'json') {
          container.innerHTML = renderAgentDataTable(data.data);
        } else {
          container.textContent = JSON.stringify(data, null, 2);
        }
        pane.dataset.loaded = 'true';
      } catch (e) {
        container.innerHTML = `<div style="text-align: center; color: #f59e0b; padding: 20px;">Failed to load: ${e.message}</div>`;
      }
    }

    function renderAgentDataTable(data) {
      // If data is an array of objects, render as a card list
      if (Array.isArray(data)) {
        if (data.length === 0) return '<div style="color: #666; text-align: center; padding: 20px;">No items</div>';
        return data.map(item => {
          const entries = Object.entries(item).map(([k, v]) => {
            return `<div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #222;">
              <span style="color: #888; min-width: 100px; font-size: 0.8rem;">${escapeHtml(k)}</span>
              <span style="color: #ddd; font-size: 0.85rem;">${escapeHtml(String(v))}</span>
            </div>`;
          }).join('');
          return `<div style="background: #1a1a2e; border-radius: 8px; padding: 12px; margin-bottom: 8px;">${entries}</div>`;
        }).join('');
      }
      // If data is a plain object, render key-value pairs
      if (typeof data === 'object' && data !== null) {
        const entries = Object.entries(data).map(([k, v]) => {
          const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
          return `<div style="display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid #222;">
            <span style="color: #888; min-width: 120px; font-weight: 600; font-size: 0.85rem;">${escapeHtml(k)}</span>
            <span style="color: #ddd; font-size: 0.85rem; white-space: pre-wrap;">${escapeHtml(val)}</span>
          </div>`;
        }).join('');
        return `<div style="background: #1a1a2e; border-radius: 8px; padding: 12px;">${entries}</div>`;
      }
      return `<pre style="color: #ddd;">${escapeHtml(String(data))}</pre>`;
    }
```

**Step 3: Call buildTabsForAgent in the agent click handler**

Find the agent click handler at line 1521. After `loadAgentChat(agentKey);` at line 1547, REPLACE lines 1552-1556 (the old "Reset to chat tab" block):

```javascript
        // Reset to chat tab
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tabs[0].classList.add('active');
        document.getElementById('tab-chat').classList.add('active');
```

With:

```javascript
        // Build agent-specific tabs and activate chat
        buildTabsForAgent(agentKey);
```

**Step 4: Remove the old static tab click handler**

The old tab switching logic at lines 1579-1587 references a `tabs` variable that pointed to the original static tabs. Since `buildTabsForAgent` now re-attaches click handlers dynamically, remove or comment out lines 1579-1587:

```javascript
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });
```

Replace with:
```javascript
    // Tab click handlers are now attached dynamically by buildTabsForAgent()
```

**Step 5: Add CSS for custom tab panes**

In `office/css/all-styles.css`, after the panel-tab styles (around line 662), add:

```css
/* Custom agent tab panes */
.tab-pane[data-custom] {
  padding: 0;
  overflow-y: auto;
}

.custom-tab-content {
  flex: 1;
  overflow-y: auto;
}

/* When many tabs, allow horizontal scroll and shrink tab text */
.panel-tabs {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.panel-tabs::-webkit-scrollbar {
  display: none;
}
.panel-tab {
  white-space: nowrap;
  font-size: 0.8rem;
  min-width: 0;
  flex-shrink: 0;
}
```

**Step 6: Verify manually**

- Click Lena — should see tabs: Chat | Workouts | Progress | Memory | Files
- Click Workouts tab — should show empty state: "No data yet. Ask Lena to update this tab."
- Click Eli — tabs should change to: Chat | Arch | Debt | Memory | Files
- Chat and Files tabs should work the same as before for all agents

**Step 7: Commit**

```bash
git add office/index.html office/css/all-styles.css
git commit -m "feat: per-agent custom tab structures

Each agent now has a unique tab bar: Chat + custom domain tabs + Memory + Files.
Custom tabs lazy-load data from /api/agent-data/:agent/:tab endpoint.
Supports JSON (rendered as card list) and Markdown content.
Shows empty state when no data file exists yet."
```

---

### Task 6: Chat Message Loss — Server-Side Sync Support

**Files:**
- Modify: `office/gateway-api.js:884-944` (WebSocket server section)

**Step 1: Add sync message handler to WebSocket server**

Find the WebSocket `ws.on('message')` handler at line 895. Replace the entire message handler (lines 895-912) with:

```javascript
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
```

**Step 2: Verify the server handles sync messages**

Restart gateway-api.js and check logs — no errors on startup.

**Step 3: Commit**

```bash
git add office/gateway-api.js
git commit -m "feat: add WebSocket sync and lastSeq support for message reliability

Subscribe now accepts lastSeq to return only new messages.
New 'sync' message type allows multi-agent reconciliation —
client sends lastSeq per agent, server returns any missed messages."
```

---

### Task 7: Chat Message Loss — Client-Side Reconciliation

**Files:**
- Modify: `office/index.html` (message handling section)

**Step 1: Add lastSeq tracking helper**

Find `const unreadCounts = new Map();` at line 1603. After it, add:

```javascript
    // Track last known seq per agent for reconciliation
    function getLastSeq(agentKey) {
      const cache = messageCache.get(agentKey);
      if (!cache || cache.length === 0) return 0;
      const realMessages = cache.filter(m => !m._optimistic);
      if (realMessages.length === 0) return 0;
      return realMessages[realMessages.length - 1].seq;
    }
```

**Step 2: Update handleHistory to cleanly replace cache**

Replace the `handleHistory` function at lines 1651-1656 with:

```javascript
    function handleHistory(agent, messages) {
      messageCache.set(agent, messages);
      if (agent === currentAgentKey) {
        renderAllMessages(agent, messages);
      }
    }

    // Incremental history update — append only new messages
    function handleHistoryUpdate(agent, messages) {
      if (!messageCache.has(agent)) messageCache.set(agent, []);
      const cache = messageCache.get(agent);

      let added = 0;
      for (const msg of messages) {
        // Skip if we already have this seq
        if (cache.some(m => !m._optimistic && m.seq === msg.seq)) continue;

        // Replace optimistic message if content matches
        const optIdx = cache.findIndex(m => m._optimistic && m.content === msg.content);
        if (optIdx !== -1) {
          cache[optIdx] = msg;
        } else {
          cache.push(msg);
          added++;
        }
      }

      // Sort by seq to maintain order
      if (added > 0) {
        cache.sort((a, b) => (a.seq || 0) - (b.seq || 0));

        if (agent === currentAgentKey) {
          renderAllMessages(agent, cache);
        } else {
          unreadCounts.set(agent, (unreadCounts.get(agent) || 0) + added);
          const agentEl = document.querySelector(`.agent.${agent}`);
          if (agentEl) agentEl.classList.add('has-unread');
        }
      }
    }
```

**Step 3: Update WebSocket onmessage to handle new message types**

Find the `chatWs.onmessage` handler at line 1626. Replace it with:

```javascript
      chatWs.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'history') {
          handleHistory(msg.agent, msg.messages);
        }

        if (msg.type === 'history_update') {
          handleHistoryUpdate(msg.agent, msg.messages);
        }

        if (msg.type === 'message_committed') {
          handleNewMessage(msg.agent, msg.message);
        }

        if (msg.type === 'sync_update') {
          handleHistoryUpdate(msg.agent, msg.messages);
        }
      };
```

**Step 4: Update subscribe to send lastSeq**

Find the subscribe call in `chatWs.onopen` at line 1622:
```javascript
          chatWs.send(JSON.stringify({ type: 'subscribe', agent: currentAgentKey }));
```

Replace with:
```javascript
          const lastSeq = getLastSeq(currentAgentKey);
          chatWs.send(JSON.stringify({ type: 'subscribe', agent: currentAgentKey, lastSeq }));
```

Find the subscribe call in `loadAgentChat` at line 2139:
```javascript
        chatWs.send(JSON.stringify({ type: 'subscribe', agent: agentKey }));
```

Replace with:
```javascript
        const lastSeq = getLastSeq(agentKey);
        chatWs.send(JSON.stringify({ type: 'subscribe', agent: agentKey, lastSeq }));
```

**Step 5: Add periodic reconciliation and visibility change handler**

After the `chatWsConnect()` call at line 1649, add:

```javascript
    // Periodic reconciliation — check all agents for missed messages every 30s
    function reconcileAllAgents() {
      if (!chatWs || chatWs.readyState !== 1) return;

      const agents = {};
      for (const [agent, cache] of messageCache) {
        agents[agent] = getLastSeq(agent);
      }

      if (Object.keys(agents).length > 0) {
        chatWs.send(JSON.stringify({ type: 'sync', agents }));
      }
    }

    setInterval(reconcileAllAgents, 30000);

    // Reconcile immediately when tab becomes visible (e.g., switching back from iPad app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let WebSocket reconnect if it dropped
        setTimeout(() => {
          reconcileAllAgents();
          // Also re-subscribe to current agent to get fresh state
          if (currentAgentKey && chatWs && chatWs.readyState === 1) {
            const lastSeq = getLastSeq(currentAgentKey);
            chatWs.send(JSON.stringify({ type: 'subscribe', agent: currentAgentKey, lastSeq }));
          }
        }, 500);
      }
    });
```

**Step 6: Verify manually**

1. Open dashboard, chat with an agent
2. Send a message, then quickly switch to a different tab/app before response completes
3. Switch back — the response should appear after a moment (visibility change triggers sync)
4. Chat with Agent A, switch to Agent B — when Agent A responds, unread badge should appear on Agent A's avatar

**Step 7: Commit**

```bash
git add office/index.html office/gateway-api.js
git commit -m "fix: resolve chat message loss and unread indicator reliability

- Track lastSeq per agent to enable incremental message sync
- Add periodic reconciliation (30s) checking all agents for missed messages
- Reconcile immediately on tab visibility change (handles iPad/mobile backgrounding)
- Server-side sync endpoint compares client lastSeq and pushes only new messages
- Unread indicators now fire reliably for non-active agent responses"
```

---

## Execution Order

Tasks 1-3 are independent quick fixes. Task 4 is a prerequisite for Task 5. Tasks 6-7 are the message fix (server then client).

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7**

Total estimated scope: 7 commits, touching 3 files + new directory.
