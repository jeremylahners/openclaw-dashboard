// OpenClaw Native Web Interface - Gateway API Backend
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load config
const config = require('./config.js');

const MEMORY_DIR = path.join(__dirname, '..', 'memory', 'agents');
const STATUS_FILE = path.join(__dirname, '..', 'memory', 'agent-status.json');
const INTERACTIONS_FILE = path.join(__dirname, '..', 'memory', 'agent-interactions.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const ACTION_ITEMS_FILE = path.join(__dirname, 'action-items.json');
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
  val: "agent:val:webchat:user"
};

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
  val: { name: "#finance" }
};

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

// Load messages cache
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load messages:', e.message);
  }
  return {};
}

// Save messages cache
function saveMessages(messages) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (e) {
    console.error('Failed to save messages:', e.message);
  }
}

// Add message to cache
function addMessage(agentKey, message) {
  const messages = loadMessages();
  if (!messages[agentKey]) {
    messages[agentKey] = [];
  }
  messages[agentKey].push(message);
  saveMessages(messages);
}

// Get messages for an agent
function getMessages(agentKey) {
  const messages = loadMessages();
  return messages[agentKey] || [];
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
  
  // Chat - get messages from cache
  else if (req.url.startsWith('/chat/') && req.method === 'GET') {
    const agentKey = req.url.split('/')[2];
    
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return;
    }
    
    // Get messages from cache
    const messages = getMessages(agentKey);
    res.end(JSON.stringify({ ok: true, messages }));
  }
  
  // Chat - send message via Gateway
  // Chat POST — cache only, message delivery handled by frontend WebSocket
  else if (req.url.startsWith('/chat/') && req.method === 'POST') {
    const agentKey = req.url.split('/')[2];

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { message } = JSON.parse(body);
        if (!message) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing message' }));
          return;
        }

        if (!agentSessions[agentKey]) {
          res.statusCode = 404;
          res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
          return;
        }

        // Store user message in cache (for cross-device sync)
        const userMessage = {
          id: `user-${Date.now()}`,
          content: message,
          author: 'Jeremy',
          authorId: 'user',
          isBot: false,
          timestamp: Date.now(),
          timestampFormatted: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          })
        };
        addMessage(agentKey, userMessage);

        res.end(JSON.stringify({ ok: true, message: 'Message cached' }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
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
  
  // Daily Standup - Parse from agent memory files
  else if (req.url === '/standup') {
    const agentInfo = {
      isla: { emoji: '🏝️', name: 'Isla' },
      marcus: { emoji: '🔧', name: 'Marcus' },
      julie: { emoji: '📣', name: 'Julie' },
      remy: { emoji: '🍳', name: 'Remy' },
      lena: { emoji: '💪', name: 'Lena' },
      harper: { emoji: '🔍', name: 'Harper' },
      sage: { emoji: '🔭', name: 'Sage' },
      val: { emoji: '💰', name: 'Val' },
      eli: { emoji: '🏗️', name: 'Eli' },
      dash: { emoji: '🎨', name: 'Dash' }
    };
    
    const updates = [];
    
    for (const [agentKey, info] of Object.entries(agentInfo)) {
      const memoryPath = path.join(MEMORY_DIR, `${agentKey}.md`);
      
      if (fs.existsSync(memoryPath)) {
        try {
          const content = fs.readFileSync(memoryPath, 'utf-8');
          const lines = content.split('\n');
          
          let status = 'Available';
          let inStatusSection = false;
          let inTodaySection = false;
          let todayActivity = '';
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Track sections
            if (line.startsWith('## Current Status')) {
              inStatusSection = true;
              inTodaySection = false;
              continue;
            } else if (line.startsWith("## Today's Activity") || line.startsWith('## Recent Work')) {
              inTodaySection = true;
              inStatusSection = false;
              continue;
            } else if (line.startsWith('##')) {
              inStatusSection = false;
              inTodaySection = false;
              continue;
            }
            
            // Extract from Current Status section - take first non-empty line
            if (inStatusSection && line && !status.includes('—')) {
              // Handle formats like "🟢 Active — Workout plan ready" or "- Status text"
              status = line
                .replace(/^[-*]\s*/, '')  // Remove bullet points
                .replace(/\*\*/g, '')      // Remove bold markers
                .trim();
              if (status) inStatusSection = false;  // Got status, stop looking
            }
            
            // Extract from Today's Activity section - take first activity line
            if (inTodaySection && line && !todayActivity) {
              // Handle formats like "✅ 7:00 AM — Did something" or table rows
              if (line.startsWith('✅') || line.startsWith('-') || line.startsWith('*')) {
                todayActivity = line
                  .replace(/^✅\s*/, '')
                  .replace(/^[-*]\s*/, '')
                  .replace(/^\d{1,2}:\d{2}\s*(AM|PM)?\s*[—-]\s*/i, '')  // Remove time prefix
                  .trim();
              } else if (line.startsWith('|') && !line.includes('---') && !line.includes('Time')) {
                const parts = line.split('|').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                  todayActivity = parts[1];
                }
              }
            }
          }
          
          // Prefer today's activity over general status
          if (todayActivity) {
            status = todayActivity;
          }
          
          // Clean up status text (remove status emojis, trim)
          status = status.replace(/🟢|🔵|🟡|🔴|✅/g, '').replace(/^Active\s*[—-]\s*/i, '').trim();
          
          updates.push({
            agent: agentKey,
            emoji: info.emoji,
            name: info.name,
            status: status
          });
        } catch (e) {
          console.error(`Failed to parse ${agentKey} memory:`, e.message);
          updates.push({
            agent: agentKey,
            emoji: info.emoji,
            name: info.name,
            status: 'Status unavailable'
          });
        }
      } else {
        updates.push({
          agent: agentKey,
          emoji: info.emoji,
          name: info.name,
          status: 'No memory file'
        });
      }
    }
    
    // Format date
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    res.end(JSON.stringify({ 
      ok: true, 
      date: dateStr,
      updates: updates 
    }));
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
          // Only include markdown, text, html files
          if (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.html')) {
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const preview = lines.slice(0, 3).join('\n').substring(0, 150);
            
            items.push({
              type: 'file',
              name: entry.name,
              path: relPath,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              modifiedFormatted: stats.mtime.toLocaleString('en-US', { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
              }),
              preview: preview + (content.length > 150 ? '...' : '')
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
    const filePath = req.url.replace('/file/', '');
    const fullPath = path.join(__dirname, '..', filePath);
    
    if (!fullPath.startsWith(path.join(__dirname, '..'))) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.end(JSON.stringify({ ok: true, content, path: filePath }));
    } catch (e) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'File not found' }));
    }
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
