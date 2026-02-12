// OpenClaw Dashboard - Main Application
// Entry point that ties all modules together

import { Storage } from './storage.js';
import { 
  agentChannels, 
  updateStatusIndicators, 
  animateAgentMovement 
} from './agents.js';
import { 
  initChat, 
  loadAgentChat, 
  sendMessage, 
  isGwConnected,
  escapeHtml 
} from './chat.js';
import {
  updateOfficeTime,
  updateInteractionFeed,
  renderPriorities,
  renderStandup,
  renderFiles,
  fetchAgentMemory,
  renderMemorySection,
  renderStatusSection,
  setupPanelResize,
  setupLeftPanelTabs,
  setupMobileControls,
  setupMobileNav,
  updateMobileNavActive
} from './ui.js';

const API_BASE = '/api';

// DOM elements
const sidePanel = document.getElementById('sidePanel');
const agents = document.querySelectorAll('.agent');
const panelClose = document.getElementById('panelClose');
const tabs = document.querySelectorAll('.panel-tab');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatMessages = document.getElementById('chatMessages');
const resizeHandle = document.getElementById('resizeHandle');
const leftInfoPanel = document.querySelector('.left-info-panel');
const panelOverlay = document.getElementById('panelOverlay');

// Shared state
let selectedAgent = null;
const selectedAgentRef = { current: null };

// Initialize chat module
initChat(chatMessages, chatInput);

// Update office time immediately and every minute
updateOfficeTime();
setInterval(updateOfficeTime, 60000);

// Status polling
async function pollStatus() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    if (response.ok) {
      const statuses = await response.json();
      updateStatusIndicators(statuses);
    }
  } catch (e) {
    console.log('Status poll failed:', e);
  }
}

setInterval(pollStatus, 10000);
pollStatus();

// Interactions polling
async function pollInteractions() {
  try {
    const response = await fetch(`${API_BASE}/interactions/active`);
    if (response.ok) {
      const active = await response.json();
      updateInteractionFeed(active);
      animateAgentMovement(active);
    }
  } catch (e) {
    console.log('Interactions poll failed:', e);
  }
}

setInterval(pollInteractions, 5000);
pollInteractions();

// Action Items
async function getActionItems() {
  try {
    const response = await fetch(`${API_BASE}/action-items`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return data.items;
      }
    }
  } catch (e) {
    console.error('Failed to fetch action items:', e);
  }
  return [];
}

async function handleActionItemToggle(e) {
  const idx = parseInt(e.target.dataset.actionIdx);
  const completed = e.target.checked;
  
  try {
    const response = await fetch(`${API_BASE}/action-items/${idx}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed })
    });
    
    if (response.ok) {
      const actionDiv = e.target.closest('.action-item');
      if (completed) {
        actionDiv.classList.add('completed');
      } else {
        actionDiv.classList.remove('completed');
      }
    }
  } catch (e) {
    console.error('Failed to update action item:', e);
    e.target.checked = !completed;
  }
}

async function clearCompletedActionItems() {
  try {
    const response = await fetch(`${API_BASE}/action-items/clear-completed`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`🗑️ Cleared ${data.removed} completed action items`);
      fetchPriorities();
    }
  } catch (e) {
    console.error('Failed to clear completed items:', e);
  }
}

// Priorities
async function fetchPriorities() {
  try {
    const response = await fetch(`${API_BASE}/today`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        renderPriorities(data, getActionItems, handleActionItemToggle, clearCompletedActionItems);
      }
    }
  } catch (e) {
    console.log('Priorities fetch failed:', e);
  }
}

setInterval(fetchPriorities, 30000);
fetchPriorities();

// Standup
async function fetchStandup() {
  try {
    const response = await fetch(`${API_BASE}/standup`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        renderStandup(data);
      }
    }
  } catch (e) {
    console.log('Standup fetch failed:', e);
  }
}

setInterval(fetchStandup, 120000);
fetchStandup();

// Files
async function fetchFiles() {
  try {
    const response = await fetch(`${API_BASE}/files`);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        renderFiles(data.tree || data.files);
      }
    }
  } catch (e) {
    console.log('Files fetch failed:', e);
  }
}

setInterval(fetchFiles, 30000);
fetchFiles();

// Expose fetchFiles globally for refresh button
window.fetchFiles = fetchFiles;

// API to add action items (called by agents or from console)
window.addActionItemFromAgent = async function(text, agentName) {
  try {
    const response = await fetch(`${API_BASE}/action-items/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, agent: agentName })
    });
    
    const result = await response.json();
    if (result.ok) {
      console.log(`✅ Action item added by ${agentName || 'system'}: ${text}`);
      fetchPriorities();
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to add action item:', e);
    return false;
  }
};

// Agent click handler
agents.forEach(agent => {
  agent.addEventListener('click', async () => {
    if (selectedAgent) {
      selectedAgent.classList.remove('selected');
    }
    
    agent.classList.add('selected');
    selectedAgent = agent;
    selectedAgentRef.current = agent;
    
    const name = agent.dataset.name;
    const role = agent.dataset.role;
    const emoji = agent.dataset.emoji;
    const quote = agent.dataset.quote;
    const agentKey = agent.classList[1];
    
    document.getElementById('panelAvatar').textContent = emoji;
    document.getElementById('panelName').textContent = name;
    document.getElementById('panelRole').textContent = role;
    
    document.getElementById('wsStatus').textContent = isGwConnected() ? 'Live' : 'Connecting...';
    document.getElementById('wsStatus').style.color = isGwConnected() ? '#22c55e' : '#f59e0b';
    
    loadAgentChat(agentKey, agent);
    
    sidePanel.classList.remove('hidden');
    
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tabs[0].classList.add('active');
    document.getElementById('tab-chat').classList.add('active');
    
    updateMobileNavActive(agentKey);
    
    if (window.innerWidth > 768 && window.innerWidth <= 1200) {
      panelOverlay.classList.add('active');
    }
    
    const memoryData = await fetchAgentMemory(agentKey);
    renderMemorySection(memoryData, agentKey, quote);
    renderStatusSection(memoryData, quote);
  });
});

// Close panel
panelClose.addEventListener('click', () => {
  sidePanel.classList.add('hidden');
  if (selectedAgent) {
    selectedAgent.classList.remove('selected');
    selectedAgent = null;
    selectedAgentRef.current = null;
  }
  if (window.innerWidth <= 1200) {
    panelOverlay.classList.remove('active');
  }
});

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Chat input handlers
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
}

chatInput.addEventListener('input', autoResizeTextarea);

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Setup UI components
setupPanelResize(sidePanel, resizeHandle);
setupLeftPanelTabs();
setupMobileControls(leftInfoPanel, panelOverlay, sidePanel, selectedAgentRef);
setupMobileNav(agents, sidePanel);

// Mobile: Auto-open Isla's chat on load
if (window.innerWidth <= 768) {
  setTimeout(() => {
    const islaAgent = document.querySelector('.agent.isla');
    if (islaAgent) {
      islaAgent.click();
    }
  }, 500);
}
