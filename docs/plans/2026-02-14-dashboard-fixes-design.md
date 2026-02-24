# Dashboard Fixes Design — 2026-02-14

## Summary

Five fixes for the Office dashboard addressing per-agent custom tabs, file browser UX, mobile file viewing, and chat message reliability.

---

## Fix 1: Per-Agent Custom Tab Structures

### Requirement
Each agent gets a customizable set of tabs. Chat and Files are universal (always present). Custom tabs appear between them, sourced from structured data files.

### Design

**Tab config** — A `AGENT_TABS` object in `index.html` defines each agent's tabs:

```javascript
const AGENT_TABS = {
  isla:   [{ id: 'action-items', label: '📋 Action Items', source: 'action-items' },
           { id: 'sprint', label: '📊 Sprint', source: 'sprint' }],
  marcus: [{ id: 'prs', label: '🔀 PRs', source: 'prs' },
           { id: 'backlog', label: '📋 Backlog', source: 'backlog' }],
  harper: [{ id: 'bugs', label: '🐛 Bugs', source: 'bugs' },
           { id: 'testplans', label: '✅ Test Plans', source: 'testplans' }],
  eli:    [{ id: 'architecture', label: '🏗️ Architecture', source: 'architecture' },
           { id: 'techdebt', label: '🔧 Tech Debt', source: 'techdebt' }],
  sage:   [{ id: 'research', label: '📚 Research', source: 'research' },
           { id: 'findings', label: '🔍 Findings', source: 'findings' }],
  julie:  [{ id: 'campaigns', label: '📣 Campaigns', source: 'campaigns' },
           { id: 'analytics', label: '📊 Analytics', source: 'analytics' }],
  remy:   [{ id: 'recipes', label: '🍳 Recipes', source: 'recipes' },
           { id: 'mealplan', label: '📅 Meal Plan', source: 'mealplan' }],
  lena:   [{ id: 'workouts', label: '🏋️ Workouts', source: 'workouts' },
           { id: 'progress', label: '📈 Progress', source: 'progress' }],
  val:    [{ id: 'budget', label: '💰 Budget', source: 'budget' },
           { id: 'reports', label: '📊 Reports', source: 'reports' }],
  dash:   [{ id: 'components', label: '🖥️ Components', source: 'components' },
           { id: 'roadmap', label: '📋 Roadmap', source: 'roadmap' }],
  atlas:  [{ id: 'projects', label: '🗺️ Projects', source: 'projects' },
           { id: 'tasks', label: '📋 Tasks', source: 'tasks' }],
  nova:   [{ id: 'team', label: '👥 Team', source: 'team' },
           { id: 'policies', label: '📋 Policies', source: 'policies' }],
};
```

**Rendered tab bar** for any agent: `Chat | [custom tabs] | Memory | Files`

**Tab rendering on agent switch:**
1. Read agent key from selection
2. Look up `AGENT_TABS[agentKey]` (defaults to empty array if not configured)
3. Rebuild `.panel-tabs` HTML: Chat first, custom tabs in the middle, Memory and Files at the end
4. Create corresponding `.tab-pane` containers
5. Activate Chat tab by default

**Data files** — Stored at `files/agents/{agent}/{source}.json` or `.md`. The backend serves these via a new endpoint:
- `GET /api/agent-data/:agent/:tab` — reads from `files/agents/{agent}/{tab}.json` (or `.md`)
- Returns JSON content or markdown text
- Returns `{ empty: true }` if file doesn't exist (UI shows empty state)

**Custom tab pane rendering:**
- JSON data: rendered as a styled card/table view
- Markdown data: rendered as formatted HTML
- Empty state: "No data yet. Ask {agent name} to update this."

---

## Fix 2: Files Folders Collapsed by Default

### Current
`isFolderCollapsed()` returns `false` by default — all folders start expanded.

### Change
Flip default in `isFolderCollapsed()`:
```javascript
function isFolderCollapsed(folderPath) {
  const states = getFolderStates();
  if (folderPath in states) return states[folderPath];
  return true;  // collapsed by default
}
```

Existing localStorage preferences are preserved — only affects folders the user hasn't clicked yet.

---

## Fix 3: Folder Names Clickable to Expand/Collapse

### Current
Click handler is on `.folder-toggle` (the icon emoji only).

### Change
Move click handler from `.folder-toggle` to `.folder-header` (parent div containing both icon and name). The hover style is already on `.folder-header`, so no CSS changes needed.

```javascript
container.querySelectorAll('.folder-header').forEach(header => {
  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const folder = e.target.closest('.folder-item');
    const folderPath = folder.dataset.path;
    const isCollapsed = folder.classList.toggle('collapsed');
    saveFolderState(folderPath, isCollapsed);
  });
});
```

---

## Fix 4: Mobile File Viewing

### Current
The Files tab is accessible on mobile via the side panel tabs, but `viewFile()` behavior on mobile needs verification. File content may render behind other elements or not be properly sized.

### Change
Ensure `viewFile()` opens a full-screen mobile overlay when on mobile widths:
- Add mobile-specific CSS for the file viewer (full viewport, scrollable)
- Add a close/back button at the top of the file viewer on mobile
- Prevent body scroll when file viewer is open on mobile

---

## Fix 5: Chat Message Loss & Unread Indicators

### Root Cause
WebSocket messages are only delivered to the currently subscribed agent. When the user switches away or the connection drops (common on iPad/mobile when backgrounding), `message_committed` events are missed. The client cache is never updated, and dedup logic can reject messages on re-subscribe.

### Changes

**A. Clean history replacement on subscribe:**
When `handleHistory` is called, fully replace the cache for that agent and clear any stale dedup state. No partial merging.

**B. lastSeq tracking per agent:**
- Client tracks `lastSeq` per agent in the messageCache
- On subscribe, send `{ type: 'subscribe', agent, lastSeq }` to the server
- Server uses `getMessagesSince(agent, lastSeq)` if lastSeq is provided, or sends full history if not
- Eliminates dedup complexity on reconnect

**C. Periodic reconciliation (every 30s + on visibility change):**
- Client sends `{ type: 'sync', agents: { eli: 42, lena: 18, ... } }` with lastSeq per agent
- Server checks each agent and pushes any new messages
- This catches messages missed during brief disconnections
- Runs for ALL agents with sessions, not just the active one
- New messages for non-active agents trigger unread indicators

**D. Visibility change handler:**
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reconcileAllAgents();
  }
});
```
When the tab becomes visible again (e.g., switching back from another app on iPad), immediately reconcile.

**E. Unread indicator reliability:**
The existing `has-unread` class and badge logic is correct — it just never fires because messages are lost. With reconciliation checking all agents, unread badges will appear when any agent has new messages since last viewed.

---

## Files Changed

| File | Changes |
|------|---------|
| `office/index.html` | Tab config, dynamic tab rendering, folder click handler, mobile file viewer, message reconciliation |
| `office/gateway-api.js` | `/api/agent-data/:agent/:tab` endpoint, WebSocket sync handler, lastSeq support |
| `office/css/all-styles.css` | Mobile file viewer styles, custom tab pane styles |
| `files/agents/` | New directory for per-agent structured data files (initially empty/placeholder) |
