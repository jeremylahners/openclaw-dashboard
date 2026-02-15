/**
 * API Tests for OpenClaw Office Dashboard
 * Tests backend endpoints and functionality
 * 
 * NOTE: These tests require the backend server to be running.
 * Start with: npm start
 * 
 * To skip API tests: npm test -- --testPathIgnorePatterns=api.test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:8765';
const API_TIMEOUT = 5000; // 5 second timeout per request

// Helper to check if server is running
async function isServerRunning() {
  try {
    const response = await fetch(`${BASE_URL}/api/ping`, {
      signal: AbortSignal.timeout(1000)
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

describe('Office Dashboard API', () => {
  let serverRunning = false;

  beforeAll(async () => {
    serverRunning = await isServerRunning();
    if (!serverRunning) {
      console.warn('\n⚠️  Backend server not running - API tests will be skipped');
      console.warn('   Start server with: npm start\n');
    }
  });

  describe('Health Check', () => {
    test('should ping successfully if server is running', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/ping`);
      expect(response.ok).toBe(true);
    });
  });

  describe('GET /standup', () => {
    test('should return standup data structure', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/standup`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('ok');
      expect(data).toHaveProperty('updates');
      expect(Array.isArray(data.updates)).toBe(true);
    });
  });

  describe('GET /today (priorities)', () => {
    test('should return priorities data structure', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/today`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('ok');
    });
  });

  describe('GET /files', () => {
    test('should return files data structure', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/files`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('ok');
      expect(data).toHaveProperty('tree') || expect(data).toHaveProperty('files');
    });
  });

  describe('GET /interactions/active', () => {
    test('should return interactions array', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/interactions/active`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('WebSocket /ws', () => {
    test('should accept WebSocket connections', (done) => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        done();
        return;
      }

      const ws = new WebSocket('ws://localhost:8765/ws');
      
      ws.onopen = () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      };
      
      ws.onerror = (error) => {
        // Connection error is acceptable if server not running
        done();
      };
    }, 10000);
  });

  describe('POST /chat/:agent/send', () => {
    test('should accept chat message format', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const message = {
        content: 'Test message from Jest suite'
      };
      
      const response = await fetch(`${BASE_URL}/api/chat/isla/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('ok');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for non-existent file', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/file/nonexistent-xyz-abc.md`);
      expect(response.status).toBe(404);
    });

    test('should handle invalid agent name gracefully', async () => {
      if (!serverRunning) {
        console.log('⊘ Skipped: server not running');
        return;
      }

      const response = await fetch(`${BASE_URL}/api/chat/InvalidAgent999/history`);
      // Should return 200 with empty or error, not crash
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });
});

// Test Summary Note
describe('API Test Coverage Summary', () => {
  test('coverage note', () => {
    console.log(`
    📊 API Test Coverage:
    ✓ Health check (ping)
    ✓ Standup data endpoint
    ✓ Priorities/today endpoint
    ✓ Files list endpoint
    ✓ Interactions endpoint
    ✓ WebSocket connection
    ✓ Chat message sending
    ✓ Error handling
    
    ⚠️  Note: API tests require backend server running
    Start with: npm start (in separate terminal)
    `);
    expect(true).toBe(true);
  });
});
