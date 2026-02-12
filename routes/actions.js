// OpenClaw Dashboard - Action Items Routes
const fs = require('fs');
const { ACTION_ITEMS_FILE, agentSessions } = require('../lib/server-config.js');
const { gatewayCall } = require('../lib/gateway.js');

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

// Handle routes
function handleActionsRoutes(req, res, url, method) {
  // Get action items
  if (url === '/action-items' && method === 'GET') {
    const items = loadActionItems();
    res.end(JSON.stringify({ ok: true, items }));
    return true;
  }
  
  // Add action item
  if (url === '/action-items/add' && method === 'POST') {
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
        
        const items = loadActionItems();
        
        const newItem = {
          text,
          completed: false,
          createdAt: Date.now(),
          addedBy: agent || 'System'
        };
        items.push(newItem);
        
        saveActionItems(items);
        
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
    return true;
  }
  
  // Update action item
  if (url.startsWith('/action-items/') && method === 'PUT') {
    const idx = parseInt(url.split('/')[2]);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { completed } = JSON.parse(body);
        const items = loadActionItems();
        
        if (items[idx]) {
          const wasCompleted = items[idx].completed;
          items[idx].completed = completed;
          
          // Notify agent who added it when completed
          if (completed && !wasCompleted && items[idx].addedBy) {
            const agentName = items[idx].addedBy.toLowerCase();
            const sessionKey = agentSessions[agentName];
            
            if (sessionKey) {
              const taskText = items[idx].text;
              const message = `✅ Jeremy completed your action item: "${taskText}"`;
              
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
    return true;
  }
  
  // Clear completed action items
  if (url === '/action-items/clear-completed' && method === 'DELETE') {
    const items = loadActionItems();
    const remaining = items.filter(item => !item.completed);
    saveActionItems(remaining);
    res.end(JSON.stringify({ ok: true, removed: items.length - remaining.length }));
    return true;
  }
  
  return false;
}

module.exports = {
  handleActionsRoutes,
  loadActionItems,
  saveActionItems
};
