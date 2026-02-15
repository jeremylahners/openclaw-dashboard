/**
 * Dashboard Frontend Tests
 * Tests UI components and structure
 */

const fs = require('fs');
const path = require('path');

describe('Office Dashboard Frontend', () => {
  let html;

  beforeAll(() => {
    html = fs.readFileSync(
      path.join(__dirname, '..', 'index.html'),
      'utf-8'
    );
  });

  describe('Page Structure', () => {
    test('should have all required main sections', () => {
      expect(html).toContain('id="officeTime"');
      expect(html).toContain('class="left-info-panel"');
      expect(html).toContain('class="side-panel');
      expect(html).toContain('id="mobileBottomNav"');
    });

    test('should have all 10+ agent elements', () => {
      const agentMatches = html.match(/class="agent\s/g);
      expect(agentMatches).toBeTruthy();
      expect(agentMatches.length).toBeGreaterThanOrEqual(10);
    });

    test('should include core agent names', () => {
      const coreAgents = ['Isla', 'Marcus', 'Harper', 'Julie', 'Sage'];
      
      coreAgents.forEach(name => {
        expect(html).toContain(name);
      });
    });
  });

  describe('Tab System', () => {
    test('should have tab buttons for main features', () => {
      expect(html).toContain('data-tab="priorities"');
      expect(html).toContain('data-tab="standup"');
      expect(html).toContain('data-tab="interactions"');
    });

    test('should have corresponding tab content sections', () => {
      expect(html).toContain('id="tab-priorities"');
      expect(html).toContain('id="tab-standup"');
      expect(html).toContain('id="tab-interactions"');
    });

    test('should have panel tabs for agent details', () => {
      expect(html).toContain('data-tab="chat"');
      expect(html).toContain('data-tab="memory"');
      expect(html).toContain('data-tab="files"');
    });
  });

  describe('Chat Interface', () => {
    test('should have chat messages container', () => {
      expect(html).toContain('id="chatMessages"');
    });

    test('should have message input', () => {
      expect(html).toContain('id="chatInput"');
    });

    test('should have send button', () => {
      expect(html).toContain('id="chatSend"');
    });

    test('should have channel name display', () => {
      expect(html).toContain('id="chatChannelName"');
    });

    test('should have WebSocket status indicator', () => {
      expect(html).toContain('id="wsStatus"');
    });
  });

  describe('Mobile Navigation', () => {
    test('should have mobile bottom nav', () => {
      expect(html).toContain('id="mobileBottomNav"');
    });

    test('should have mobile agent selector', () => {
      expect(html).toContain('id="mobileAgentSelector"');
    });

    test('should have hamburger menu button', () => {
      expect(html).toContain('id="mobileMenuBtn"');
    });

    test('should have panel overlay for mobile', () => {
      expect(html).toContain('id="panelOverlay"');
    });
  });

  describe('File Management', () => {
    test('should have files list container', () => {
      expect(html).toContain('id="filesList"');
    });

    test('should have files fetch function', () => {
      expect(html).toContain('fetchFiles');
    });

    test('should have file viewer function', () => {
      expect(html).toContain('showFileViewer') || expect(html).toContain('viewFile');
    });
  });

  describe('Responsive Design', () => {
    test('should reference external CSS files', () => {
      expect(html).toContain('css/all-styles.css');
      expect(html).toContain('css/toast.css');
      expect(html).toContain('css/loading.css');
    });

    test('should have mobile-specific elements', () => {
      expect(html).toContain('mobile-menu-btn') || expect(html).toContain('mobileBottomNav');
    });
  });

  describe('WebSocket Integration', () => {
    test('should have WebSocket connection logic', () => {
      expect(html).toContain('WebSocket');
      expect(html).toContain('/ws');
    });

    test('should handle WebSocket messages', () => {
      expect(html).toContain('onmessage') || expect(html).toContain('addEventListener');
    });

    test('should have reconnection logic', () => {
      expect(html).toContain('onclose') || expect(html).toContain('reconnect');
    });
  });

  describe('Markdown Support', () => {
    test('should include marked.js CDN', () => {
      expect(html).toContain('marked');
    });

    test('should have markdown formatting function', () => {
      expect(html).toContain('formatMarkdown') || expect(html).toContain('marked.parse');
    });
  });

  describe('PWA Features', () => {
    test('should have manifest link', () => {
      expect(html).toContain('<link rel="manifest"');
    });

    test('should have service worker registration', () => {
      expect(html).toContain('serviceWorker');
    });

    test('should have meta viewport tag', () => {
      expect(html).toContain('<meta name="viewport"');
    });

    test('should have theme color meta tag', () => {
      expect(html).toContain('<meta name="theme-color"');
    });

    test('should have apple touch icon', () => {
      expect(html).toContain('apple-touch-icon');
    });

    test('should have push notification setup', () => {
      expect(html).toContain('PushManager') || expect(html).toContain('pushManager');
    });
  });

  describe('Conference Table', () => {
    test('should have conference zone', () => {
      expect(html).toContain('conference');
    });

    test('should have movement functions', () => {
      expect(html).toContain('moveAgent') || expect(html).toContain('startMeeting');
    });
  });

  describe('JavaScript Functions', () => {
    test('should have sendMessage function', () => {
      expect(html).toContain('sendMessage');
    });

    test('should have loadAgentChat function', () => {
      expect(html).toContain('loadAgentChat');
    });

    test('should have API base URL defined', () => {
      expect(html).toContain('API_BASE');
    });
  });

  describe('LocalStorage Integration', () => {
    test('should use localStorage', () => {
      expect(html).toContain('localStorage');
    });

    test('should save message drafts', () => {
      expect(html).toContain('messageDrafts') || expect(html).toContain('draft');
    });
  });

  describe('Standup Section', () => {
    test('should have standup content container', () => {
      expect(html).toContain('id="standupContent"');
    });

    test('should fetch standup data', () => {
      expect(html).toContain('fetchStandup') || expect(html).toContain('/standup');
    });
  });

  describe('Interactions Tracking', () => {
    test('should have interactions feed', () => {
      expect(html).toContain('id="interactionFeed"');
    });

    test('should poll interactions', () => {
      expect(html).toContain('pollInteractions') || expect(html).toContain('/interactions');
    });
  });

  describe('Priorities/Action Items', () => {
    test('should have priorities content', () => {
      expect(html).toContain('id="prioritiesContent"');
    });

    test('should fetch priorities', () => {
      expect(html).toContain('fetchPriorities') || expect(html).toContain('/today');
    });

    test('should have action items support', () => {
      expect(html).toContain('action-item') || expect(html).toContain('getActionItems');
    });
  });

  describe('Agent-Specific Tabs', () => {
    test('should have custom tab configuration', () => {
      expect(html).toContain('AGENT_TABS');
    });

    test('should build tabs dynamically', () => {
      expect(html).toContain('buildTabsForAgent');
    });
  });

  describe('Charts Support', () => {
    test('should include ApexCharts library', () => {
      expect(html).toContain('apexcharts');
    });

    test('should have chart rendering functions', () => {
      expect(html).toContain('renderChart') || expect(html).toContain('chartIdCounter');
    });
  });

  describe('Settings Modal', () => {
    test('should have settings modal', () => {
      expect(html).toContain('id="settingsModal"');
    });

    test('should have notification settings', () => {
      expect(html).toContain('notificationSettings') || expect(html).toContain('id="notificationsEnabled"');
    });
  });

  describe('Code Quality', () => {
    test('should have proper HTML structure', () => {
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
    });

    test('should have UTF-8 charset', () => {
      expect(html).toContain('charset="UTF-8"');
    });

    test('should have page title', () => {
      expect(html).toContain('<title>');
    });
  });

  describe('Toast Notifications', () => {
    test('should have toast system', () => {
      expect(html).toContain('ToastManager') || expect(html).toContain('showToast');
    });
  });

  describe('Panel Resize', () => {
    test('should have resize handle', () => {
      expect(html).toContain('id="resizeHandle"');
    });

    test('should save panel width', () => {
      expect(html).toContain('sidePanelWidth');
    });
  });
});
