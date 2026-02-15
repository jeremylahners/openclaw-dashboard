/**
 * Service Worker Tests
 * Tests PWA offline capability and caching
 */

const fs = require('fs');
const path = require('path');

describe('Service Worker', () => {
  let serviceWorkerCode;

  beforeAll(() => {
    serviceWorkerCode = fs.readFileSync(
      path.join(__dirname, '..', 'service-worker.js'),
      'utf-8'
    );
  });

  describe('Cache Configuration', () => {
    test('should define CACHE_NAME', () => {
      expect(serviceWorkerCode).toContain('CACHE_NAME');
    });

    test('should define urlsToCache', () => {
      expect(serviceWorkerCode).toContain('urlsToCache');
    });

    test('should cache index.html', () => {
      expect(serviceWorkerCode).toContain('index.html');
    });

    test('should cache manifest.json', () => {
      expect(serviceWorkerCode).toContain('manifest.json');
    });

    test('should cache CSS files', () => {
      expect(serviceWorkerCode).toContain('all-styles.css');
    });
  });

  describe('Event Listeners', () => {
    test('should have install event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('install'");
    });

    test('should have activate event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('activate'");
    });

    test('should have fetch event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('fetch'");
    });

    test('should have push event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('push'");
    });

    test('should have notificationclick event listener', () => {
      expect(serviceWorkerCode).toContain("addEventListener('notificationclick'");
    });
  });

  describe('Install Behavior', () => {
    test('should cache assets on install', () => {
      expect(serviceWorkerCode).toContain('caches.open');
      expect(serviceWorkerCode).toContain('addAll');
    });

    test('should use event.waitUntil for install', () => {
      expect(serviceWorkerCode).toContain('event.waitUntil');
    });

    test('should skip waiting', () => {
      expect(serviceWorkerCode).toContain('skipWaiting');
    });
  });

  describe('Activate Behavior', () => {
    test('should clean old caches on activate', () => {
      expect(serviceWorkerCode).toContain('caches.keys');
      expect(serviceWorkerCode).toContain('caches.delete');
    });

    test('should claim clients', () => {
      expect(serviceWorkerCode).toContain('clients.claim');
    });
  });

  describe('Fetch Strategy', () => {
    test('should implement fetch handling', () => {
      expect(serviceWorkerCode).toContain('fetch(');
      expect(serviceWorkerCode).toContain('respondWith');
    });

    test('should skip API requests', () => {
      expect(serviceWorkerCode).toContain('/api/');
    });

    test('should handle cache misses', () => {
      expect(serviceWorkerCode).toContain('catch') || expect(serviceWorkerCode).toContain('.then(');
    });
  });

  describe('Push Notifications', () => {
    test('should handle push events', () => {
      const pushSection = serviceWorkerCode.match(
        /addEventListener\(['"]push['"],[\s\S]*?\}\);?/
      );
      expect(pushSection).toBeTruthy();
    });

    test('should show notifications on push', () => {
      expect(serviceWorkerCode).toContain('showNotification');
    });

    test('should parse push data', () => {
      expect(serviceWorkerCode).toContain('event.data');
    });
  });

  describe('Notification Click Handling', () => {
    test('should handle notification clicks', () => {
      const clickSection = serviceWorkerCode.match(
        /addEventListener\(['"]notificationclick['"],[\s\S]*?\}\);?/
      );
      expect(clickSection).toBeTruthy();
    });

    test('should handle window focus or opening', () => {
      expect(serviceWorkerCode).toContain('clients') && 
      (expect(serviceWorkerCode).toContain('openWindow') || 
       expect(serviceWorkerCode).toContain('focus'));
    });
  });

  describe('Code Quality', () => {
    test('should have error handling', () => {
      expect(serviceWorkerCode).toContain('catch') || 
      expect(serviceWorkerCode).toContain('error');
    });

    test('should have logging', () => {
      expect(serviceWorkerCode).toContain('console');
    });
  });

  describe('File Validation', () => {
    test('service worker file should exist', () => {
      expect(fs.existsSync(
        path.join(__dirname, '..', 'service-worker.js')
      )).toBe(true);
    });

    test('service worker should be valid JavaScript', () => {
      // Basic syntax check
      expect(() => {
        new Function(serviceWorkerCode);
      }).not.toThrow();
    });

    test('should have cache versioning', () => {
      expect(serviceWorkerCode).toContain('CACHE_VERSION') ||
      expect(serviceWorkerCode).toMatch(/openclaw-office-v\d+/);
    });
  });

  describe('Performance', () => {
    test('should handle cache-busted resources', () => {
      expect(serviceWorkerCode).toContain('v=') ||
      expect(serviceWorkerCode).toContain('cache-busting') ||
      expect(serviceWorkerCode).toContain('query');
    });

    test('should skip non-GET requests', () => {
      expect(serviceWorkerCode).toContain('GET') ||
      expect(serviceWorkerCode).toContain('method');
    });
  });
});
