// OpenClaw Dashboard - UI Utilities
// Handles panels, modals, and UI interactions

import { Storage } from './storage.js';
import { escapeHtml, formatMarkdown } from './chat.js';

const API_BASE = '/api';

// Cache for agent data
let agentMemoryCache = {};

// Fetch agent memory from API
export async function fetchAgentMemory(agentKey) {
  if (agentMemoryCache[agentKey]) return agentMemoryCache[agentKey];
  try {
    const response = await fetch(`${API_BASE}/agent/${agentKey}`);
    if (response.ok) {
      const data = await response.json();
      agentMemoryCache[agentKey] = data;
      return data;
    }
  } catch (e) { console.log('Memory fetch failed:', e); }
  return { knowledge: [{ text: "Unable to load memory" }], learned: [], pending: [] };
}

// Clear cache to force refresh
export function clearMemoryCache() {
  agentMemoryCache = {};
}

// Render memory section
export function renderMemorySection(data, agentKey, quote) {
  const memoryPane = document.getElementById('tab-memory');
  if (!memoryPane) return;
  
  let knowledgeHtml = '';
  if (data.knowledge && data.knowledge.length > 0) {
    knowledgeHtml = data.knowledge.slice(0, 5).map(item => 
      `<div class="memory-item">${item.text}</div>`
    ).join('');
  }
  
  let learnedHtml = '';
  if (data.learned && data.learned.length > 0) {
    learnedHtml = data.learned.map(item => 
      `<div class="memory-item">
        ${item.text}
        <div class="source">${item.source} • ${item.when}</div>
      </div>`
    ).join('');
  } else {
    learnedHtml = '<div class="memory-item">No cross-agent learnings yet</div>';
  }
  
  memoryPane.innerHTML = `
    <div class="memory-section">
      <h3>Current Knowledge</h3>
      ${knowledgeHtml || '<div class="memory-item">No knowledge recorded</div>'}
    </div>
    
    <div class="memory-section">
      <h3>Learned From Others</h3>
      ${learnedHtml}
    </div>
    
    <div class="agent-quote">"${quote}"</div>
  `;
}

// Render status section
export function renderStatusSection(data, quote) {
  const statusPane = document.getElementById('tab-status');
  if (!statusPane) return;
  
  let todayHtml = '';
  if (data.today && data.today.length > 0) {
    todayHtml = `
      <div class="status-section recent-activity">
        <h3>📅 Today</h3>
        ${data.today.map(item => 
          `<div class="activity-item">
            <span class="activity-text">${item.text}</span>
          </div>`
        ).join('')}
      </div>
    `;
  }
  
  let pendingHtml = '';
  if (data.pending && data.pending.length > 0) {
    pendingHtml = `
      <div class="status-section recent-activity">
        <h3>Pending Tasks</h3>
        ${data.pending.map(item => 
          `<div class="activity-item">
            <span class="activity-time">${item.done ? '✅' : '⏳'}</span>
            <span class="activity-text">${item.text}</span>
          </div>`
        ).join('')}
      </div>
    `;
  } else if (!data.today || data.today.length === 0) {
    pendingHtml = `
      <div class="status-section recent-activity">
        <h3>Pending Tasks</h3>
        <div class="activity-item"><span class="activity-text">No pending tasks</span></div>
      </div>
    `;
  }
  
  statusPane.innerHTML = `
    <div class="status-section">
      <h3>Current Status</h3>
      <div class="status-grid">
        <div class="status-card">
          <div class="label">State</div>
          <div class="value green">Active</div>
        </div>
        <div class="status-card">
          <div class="label">Memory</div>
          <div class="value">${data.knowledge ? data.knowledge.length : 0} items</div>
        </div>
        <div class="status-card">
          <div class="label">Learned</div>
          <div class="value blue">${data.learned ? data.learned.length : 0}</div>
        </div>
        <div class="status-card">
          <div class="label">Today</div>
          <div class="value ${data.today && data.today.length > 0 ? 'green' : 'yellow'}">${data.today ? data.today.length : 0}</div>
        </div>
      </div>
    </div>
    
    ${todayHtml}
    ${pendingHtml}
    
    <div class="agent-quote">"${quote}"</div>
  `;
}

// Update office time display
export function updateOfficeTime() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[now.getDay()];
  const time = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  const el = document.getElementById('officeTime');
  if (el) {
    el.textContent = `🏢 The Office — ${dayName} ${time}`;
  }
}

// Update interaction feed
export function updateInteractionFeed(interactions) {
  const feed = document.getElementById('interactionFeed');
  if (!feed) return;
  
  if (interactions.length === 0) {
    feed.innerHTML = '<div class="no-interactions">No recent interactions</div>';
    return;
  }
  
  feed.innerHTML = interactions.slice(0, 5).map(i => `
    <div class="interaction-item">
      <span class="interaction-agents">${i.from} → ${i.to}</span>
      <span class="interaction-topic">${i.topic}</span>
    </div>
  `).join('');
}

// Render priorities
export async function renderPriorities(data, getActionItems, handleActionItemToggle, clearCompletedActionItems) {
  const container = document.getElementById('prioritiesContent');
  const updatedEl = document.getElementById('prioritiesUpdated');
  
  if (!container) return;
  
  if (data.updated) {
    updatedEl.textContent = data.updated;
  }
  
  let html = '';
  
  const actionItems = await getActionItems();
  if (actionItems.length > 0) {
    const hasCompleted = actionItems.some(item => item.completed);
    html += '<div class="priority-section">';
    html += '<div class="priority-section-title">';
    html += '<span>Action Items</span>';
    if (hasCompleted) {
      html += '<button class="clear-completed-btn" id="clearCompletedBtn">Clear Completed</button>';
    }
    html += '</div>';
    actionItems.forEach((item, idx) => {
      const checkedAttr = item.completed ? 'checked' : '';
      const completedClass = item.completed ? 'completed' : '';
      html += `
        <div class="action-item ${completedClass}">
          <input type="checkbox" ${checkedAttr} data-action-idx="${idx}">
          <span class="action-item-text">${escapeHtml(item.text)}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  if (data.focus && data.focus.length > 0) {
    html += '<div class="priority-section"><div class="priority-section-title">Focus</div>';
    data.focus.forEach(item => {
      html += `<div class="priority-item">${item}</div>`;
    });
    html += '</div>';
  }
  
  if (data.blocked && data.blocked.length > 0) {
    html += '<div class="priority-section"><div class="priority-section-title">Blocked</div>';
    data.blocked.forEach(item => {
      html += `<div class="priority-item blocked">${item}</div>`;
    });
    html += '</div>';
  }
  
  if (data.notes && data.notes.length > 0) {
    html += '<div class="priority-section"><div class="priority-section-title">Notes</div>';
    data.notes.forEach(item => {
      html += `<div class="priority-item note">${item}</div>`;
    });
    html += '</div>';
  }
  
  if (!html) {
    html = '<div class="no-interactions">No priorities set</div>';
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.action-item input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', handleActionItemToggle);
  });
  
  const clearBtn = document.getElementById('clearCompletedBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearCompletedActionItems);
  }
}

// Render standup
export function renderStandup(data) {
  const container = document.getElementById('standupContent');
  const dateEl = document.getElementById('standupDate');
  
  if (!container) return;
  
  if (data.date) {
    dateEl.textContent = `${data.date}`;
  }
  
  if (!data.updates || data.updates.length === 0) {
    container.innerHTML = '<div class="no-interactions">No updates</div>';
    return;
  }
  
  let html = '';
  data.updates.forEach(update => {
    html += `
      <div class="standup-item-expanded">
        <div class="standup-agent">
          <span class="agent-emoji">${update.emoji}</span>
          <span class="agent-name">${update.name}</span>
        </div>
        <div class="standup-status">${escapeHtml(update.status)}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Render files
export function renderFiles(items) {
  const container = document.getElementById('filesList');
  if (!container) return;
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="no-files">No files found</div>';
    return;
  }
  
  container.innerHTML = renderFileTree(items, 0);
  
  container.querySelectorAll('.folder-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const folder = e.target.closest('.folder-item');
      const folderPath = folder.dataset.path;
      const isCollapsed = folder.classList.toggle('collapsed');
      Storage.saveFolderState(folderPath, isCollapsed);
    });
  });
  
  container.querySelectorAll('.file-item').forEach(fileItem => {
    fileItem.addEventListener('click', () => {
      const filePath = fileItem.dataset.path;
      const fileName = fileItem.dataset.name;
      viewFile(filePath, fileName);
    });
  });
}

function renderFileTree(items, depth = 0) {
  return items.map(item => {
    if (item.type === 'folder') {
      const indent = depth * 15;
      const isCollapsed = Storage.isFolderCollapsed(item.path);
      const collapsedClass = isCollapsed ? 'collapsed' : '';
      return `
        <div class="folder-item ${collapsedClass}" style="margin-left: ${indent}px;" data-path="${item.path}">
          <div class="folder-header">
            <span class="folder-toggle">📁</span>
            <span class="folder-name">${escapeHtml(item.name)}</span>
          </div>
          <div class="folder-children">
            ${renderFileTree(item.children, depth + 1)}
          </div>
        </div>
      `;
    } else {
      const indent = depth * 15;
      return `
        <div class="file-item" style="margin-left: ${indent}px;" data-path="${item.path}" data-name="${escapeHtml(item.name)}">
          <div class="file-name">📄 ${escapeHtml(item.name)}</div>
          <div class="file-meta">
            <span>${item.modifiedFormatted}</span>
            <span>${Math.round(item.size / 1024) || 1} KB</span>
          </div>
          <div class="file-preview">${escapeHtml(item.preview)}</div>
        </div>
      `;
    }
  }).join('');
}

async function viewFile(filePath, fileName) {
  try {
    const response = await fetch(`${API_BASE}/file/${filePath}`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        showFileViewer(fileName, data.content);
      }
    }
  } catch (e) {
    alert('Failed to load file: ' + e.message);
  }
}

function showFileViewer(fileName, content) {
  const viewer = document.createElement('div');
  viewer.className = 'file-viewer';
  
  const isMarkdown = fileName.toLowerCase().endsWith('.md');
  const isHtml = fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm');
  let renderedContent;
  let viewerClass = '';
  let blobUrl = null;
  
  if (isHtml) {
    const blob = new Blob([content], { type: 'text/html' });
    blobUrl = URL.createObjectURL(blob);
    viewer.innerHTML = `
      <div class="file-viewer-header">
        <h2>📄 ${escapeHtml(fileName)}</h2>
        <button class="file-viewer-close">Close</button>
      </div>
      <iframe src="${blobUrl}" style="flex: 1; border: none; background: #fff; border-radius: 8px;"></iframe>
    `;
  } else if (isMarkdown && typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: true,
      mangle: false
    });
    renderedContent = marked.parse(content);
    viewerClass = 'markdown-view';
    viewer.innerHTML = `
      <div class="file-viewer-header">
        <h2>📄 ${escapeHtml(fileName)}</h2>
        <button class="file-viewer-close">Close</button>
      </div>
      <div class="file-viewer-content ${viewerClass}">${renderedContent}</div>
    `;
  } else {
    renderedContent = escapeHtml(content);
    viewer.innerHTML = `
      <div class="file-viewer-header">
        <h2>📄 ${escapeHtml(fileName)}</h2>
        <button class="file-viewer-close">Close</button>
      </div>
      <div class="file-viewer-content ${viewerClass}">${renderedContent}</div>
    `;
  }
  
  document.body.appendChild(viewer);
  
  const closeBtn = viewer.querySelector('.file-viewer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      viewer.remove();
    });
  }
}

// Setup panel resize
export function setupPanelResize(sidePanel, resizeHandle) {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const savedWidth = Storage.getSidePanelWidth();
  if (savedWidth) {
    sidePanel.style.width = savedWidth + 'px';
  }

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidePanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const deltaX = startX - e.clientX;
    const newWidth = Math.max(300, Math.min(800, startWidth + deltaX));
    sidePanel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      Storage.setSidePanelWidth(sidePanel.offsetWidth);
    }
  });
}

// Setup left panel tabs
export function setupLeftPanelTabs() {
  document.querySelectorAll('.left-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      document.querySelectorAll('.left-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.left-tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${targetTab}`).classList.add('active');
      
      Storage.setLeftPanelTab(targetTab);
    });
  });
  
  const savedTab = Storage.getLeftPanelTab();
  if (savedTab) {
    const tab = document.querySelector(`.left-tab[data-tab="${savedTab}"]`);
    if (tab) tab.click();
  }
}

// Setup mobile controls
export function setupMobileControls(leftInfoPanel, panelOverlay, sidePanel, selectedAgentRef) {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  
  if (window.innerWidth <= 768) {
    leftInfoPanel.classList.add('mobile-hidden');
    leftInfoPanel.classList.remove('mobile-visible');
    panelOverlay.classList.remove('active');
  }
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isVisible = leftInfoPanel.classList.contains('mobile-visible');
      
      if (isVisible) {
        leftInfoPanel.classList.remove('mobile-visible');
        leftInfoPanel.classList.add('mobile-hidden');
        panelOverlay.classList.remove('active');
      } else {
        leftInfoPanel.classList.remove('mobile-hidden');
        leftInfoPanel.classList.add('mobile-visible');
        panelOverlay.classList.add('active');
      }
    });
  }
  
  if (panelOverlay) {
    panelOverlay.addEventListener('click', () => {
      if (leftInfoPanel.classList.contains('mobile-visible')) {
        leftInfoPanel.classList.remove('mobile-visible');
        leftInfoPanel.classList.add('mobile-hidden');
      }
      if (!sidePanel.classList.contains('hidden')) {
        sidePanel.classList.add('hidden');
        if (selectedAgentRef.current) {
          selectedAgentRef.current.classList.remove('selected');
          selectedAgentRef.current = null;
        }
      }
      panelOverlay.classList.remove('active');
    });
  }
}

// Setup mobile bottom navigation
export function setupMobileNav(agents, sidePanel) {
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  
  mobileNavItems.forEach(navItem => {
    navItem.addEventListener('click', () => {
      const agentKey = navItem.dataset.agent;
      
      const agent = document.querySelector(`.agent.${agentKey}`);
      if (agent) {
        agent.click();
      }
      
      mobileNavItems.forEach(item => item.classList.remove('active'));
      navItem.classList.add('active');
      
      sidePanel.classList.remove('hidden');
    });
  });
}

// Update mobile nav active state
export function updateMobileNavActive(agentKey) {
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  mobileNavItems.forEach(item => {
    if (item.dataset.agent === agentKey) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}
