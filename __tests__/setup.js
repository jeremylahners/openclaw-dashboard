/**
 * Jest Setup File
 * Configures global test environment
 */

// Mock fetch for Node.js environment
global.fetch = async (url, options = {}) => {
  const http = require('http');
  const https = require('https');
  const urlParsed = new URL(url);
  const protocol = urlParsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.request(
      {
        hostname: urlParsed.hostname,
        port: urlParsed.port,
        path: urlParsed.pathname + urlParsed.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: async () => JSON.parse(data),
            text: async () => data
          });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
};

// Mock WebSocket for Node.js environment
const WebSocketLib = require('ws');
global.WebSocket = WebSocketLib;

// Set test timeout
jest.setTimeout(10000);
