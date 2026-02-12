// OpenClaw Dashboard - Chat Routes
const fs = require('fs');
const path = require('path');
const { MESSAGES_FILE, MEMORY_DIR, INTERACTIONS_FILE, agentSessions } = require('../lib/server-config.js');

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

// Handle routes
function handleChatRoutes(req, res, url, method) {
  // Chat - get messages from cache
  if (url.startsWith('/chat/') && method === 'GET') {
    const agentKey = url.split('/')[2];
    
    if (!agentSessions[agentKey]) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
      return true;
    }
    
    const messages = getMessages(agentKey);
    res.end(JSON.stringify({ ok: true, messages }));
    return true;
  }
  
  // Chat - send message (cache only)
  if (url.startsWith('/chat/') && method === 'POST') {
    const agentKey = url.split('/')[2];

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
    return true;
  }
  
  // Agent memory
  if (url.startsWith('/agent/')) {
    const name = url.split('/')[2];
    const filePath = path.join(MEMORY_DIR, `${name}.md`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.end(JSON.stringify(parseAgentMemory(content)));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Agent not found' }));
    }
    return true;
  }
  
  // Interactions
  if (url === '/interactions/active') {
    const interactions = loadInteractions();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const active = interactions.recent.filter(i => 
      new Date(i.timestamp).getTime() > fiveMinAgo
    );
    res.end(JSON.stringify(active));
    return true;
  }
  
  return false;
}

module.exports = {
  handleChatRoutes,
  addMessage,
  getMessages,
  logInteraction
};
