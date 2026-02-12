// OpenClaw Dashboard - Standup/Status Routes
const fs = require('fs');
const path = require('path');
const { MEMORY_DIR, TODAY_FILE, agentSessions, agentInfo } = require('../lib/server-config.js');

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
        
        let inStatusSection = false;
        let inTodaySection = false;
        let todayEntries = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
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
          
          if (inStatusSection && line.startsWith('-') || line.startsWith('*')) {
            task = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
            if (line.toLowerCase().includes('working') || line.includes('🟢')) state = 'working';
            else if (line.toLowerCase().includes('thinking') || line.includes('🔵')) state = 'thinking';
            else if (line.toLowerCase().includes('meeting') || line.includes('🔴')) state = 'meeting';
            else if (line.includes('🟡')) state = 'idle';
          }
          
          if (inTodaySection && line.startsWith('|') && !line.includes('---') && !line.includes('Time')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              todayEntries.push(parts[1]);
            }
          }
        }
        
        if (todayEntries.length > 0 && task === 'Available') {
          task = todayEntries[todayEntries.length - 1];
        }
        
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

// Handle routes
function handleStandupRoutes(req, res, url, method) {
  // Status endpoint
  if (url === '/status') {
    const statuses = loadStatus();
    res.end(JSON.stringify(statuses));
    return true;
  }
  
  // Status update (deprecated)
  if (url.startsWith('/status/') && method === 'POST') {
    res.statusCode = 410;
    res.end(JSON.stringify({ 
      error: 'Status updates disabled',
      message: 'Agents should update their own memory files in memory/agents/{name}.md'
    }));
    return true;
  }
  
  // Today priorities
  if (url === '/today') {
    try {
      const content = fs.readFileSync(TODAY_FILE, 'utf-8');
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
    return true;
  }
  
  // Daily Standup
  if (url === '/standup') {
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
            
            if (inStatusSection && line && !status.includes('—')) {
              status = line
                .replace(/^[-*]\s*/, '')
                .replace(/\*\*/g, '')
                .trim();
              if (status) inStatusSection = false;
            }
            
            if (inTodaySection && line && !todayActivity) {
              if (line.startsWith('✅') || line.startsWith('-') || line.startsWith('*')) {
                todayActivity = line
                  .replace(/^✅\s*/, '')
                  .replace(/^[-*]\s*/, '')
                  .replace(/^\d{1,2}:\d{2}\s*(AM|PM)?\s*[—-]\s*/i, '')
                  .trim();
              } else if (line.startsWith('|') && !line.includes('---') && !line.includes('Time')) {
                const parts = line.split('|').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                  todayActivity = parts[1];
                }
              }
            }
          }
          
          if (todayActivity) {
            status = todayActivity;
          }
          
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
    return true;
  }
  
  return false;
}

module.exports = {
  handleStandupRoutes,
  loadStatus
};
