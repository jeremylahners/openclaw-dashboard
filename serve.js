// Simple HTTP server to serve the dashboard frontend with API + WebSocket proxy
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const config = require('./config.js');

const PORT = 3001;
const BACKEND_PORT = 8081;
const GATEWAY_PORT = config.gatewayPort || 18789;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Proxy /api/* requests to backend
  if (req.url.startsWith('/api/')) {
    const backendPath = req.url.replace('/api', '');
    const options = {
      hostname: 'localhost',
      port: BACKEND_PORT,
      path: backendPath,
      method: req.method,
      headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error('Proxy error:', e.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.code);
      }
    } else {
      // Add cache control headers
      const headers = { 'Content-Type': contentType };
      
      // Never cache HTML files (always fetch fresh)
      if (ext === '.html' || req.url === '/') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      
      res.writeHead(200, headers);
      res.end(content);
    }
  });
});

// Handle WebSocket upgrade for /gw path - proxy to OpenClaw Gateway
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/gw') {
    console.log('[WS] Proxying WebSocket to Gateway on port', GATEWAY_PORT);
    
    const gatewaySocket = net.createConnection(GATEWAY_PORT, 'localhost', () => {
      // Forward the original HTTP upgrade request
      const headers = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      
      gatewaySocket.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        `${headers}\r\n\r\n`
      );
      
      if (head && head.length) {
        gatewaySocket.write(head);
      }
      
      // Pipe data between client and gateway
      socket.pipe(gatewaySocket);
      gatewaySocket.pipe(socket);
    });

    gatewaySocket.on('error', (e) => {
      console.error('[WS] Gateway connection error:', e.message);
      socket.end();
    });

    socket.on('error', (e) => {
      console.error('[WS] Client socket error:', e.message);
      gatewaySocket.end();
    });
  } else {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎨 OpenClaw Dashboard Frontend serving on http://0.0.0.0:${PORT}`);
  console.log(`📡 API Backend: http://localhost:${BACKEND_PORT}`);
  console.log(`🔌 Gateway WS: ws://localhost:${GATEWAY_PORT}`);
});
