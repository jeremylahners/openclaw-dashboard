// OpenClaw Dashboard - Main Server
// API Backend for the OpenClaw Native Web Interface
const http = require('http');
const { PORT, GATEWAY_URL, agentSessions } = require('./lib/server-config.js');
const { handleChatRoutes } = require('./routes/chat.js');
const { handleFilesRoutes } = require('./routes/files.js');
const { handleStandupRoutes } = require('./routes/standup.js');
const { handleActionsRoutes } = require('./routes/actions.js');

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = req.url;
  const method = req.method;
  
  // Try each route handler
  if (handleStandupRoutes(req, res, url, method)) return;
  if (handleChatRoutes(req, res, url, method)) return;
  if (handleActionsRoutes(req, res, url, method)) return;
  if (handleFilesRoutes(req, res, url, method)) return;
  
  // 404 fallback
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ OpenClaw Native Web Interface API running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`📡 Connected to ${Object.keys(agentSessions).length} agents`);
});
