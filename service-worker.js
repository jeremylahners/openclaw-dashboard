// OpenClaw Office - Service Worker
// Handles push notifications, offline caching, and PWA functionality

const CACHE_NAME = 'openclaw-office-v6';
const CACHE_VERSION = '6.0.0';

// Files to cache for offline access
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/all-styles.css',
  '/css/toast.css',
  '/css/loading.css',
  // External dependencies
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] Installed successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((err) => {
        console.error('[Service Worker] Install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
    .then(() => {
      console.log('[Service Worker] Activated successfully');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip ALL backend API requests (localhost:8081 or any /api/ endpoints)
  if (event.request.url.includes('localhost:8081') || event.request.url.includes('/api/')) {
    return;
  }
  
  // NEVER cache index.html - always fetch fresh
  if (event.request.url.endsWith('/') || event.request.url.endsWith('/index.html')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For CSS/JS files with cache-busting params, strip query string for cache matching
  const requestUrl = new URL(event.request.url);
  const isCacheBusted = requestUrl.search.includes('v=');
  const cacheKey = isCacheBusted ? requestUrl.origin + requestUrl.pathname : event.request.url;
  
  event.respondWith(
    // Always fetch fresh for cache-busted resources
    (isCacheBusted ? fetch(event.request) : caches.match(event.request))
      .then((response) => {
        if (response && !isCacheBusted) {
          // console.log('[Service Worker] Serving from cache:', event.request.url);
          return response;
        }
        
        // Not in cache or cache-busted, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not successful
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone response (can only be consumed once)
            const responseToCache = response.clone();
            
            // Don't cache cache-busted resources
            if (!isCacheBusted) {
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            
            return response;
          })
          .catch((err) => {
            console.error('[Service Worker] Fetch failed:', err);
            // Could return offline page here
            throw err;
          });
      })
  );
});

// Push event - show notification
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');
  
  let data = {};
  
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('[Service Worker] Push data parse error:', e);
    data = {
      title: 'OpenClaw Office',
      body: event.data ? event.data.text() : 'New message'
    };
  }
  
  const title = data.title || 'OpenClaw Office';
  const options = {
    body: data.body || 'New message from agent',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.agentKey || 'openclaw-notification',
    data: {
      agentKey: data.agentKey,
      messageId: data.messageId,
      timestamp: Date.now(),
      url: data.url || `/?agent=${data.agentKey || ''}`
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/icon-96.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true, // Keep notification until user interacts (better visibility)
    renotify: true, // Re-notify if same tag
    silent: false,
    persistent: true // Request persistent notification
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[Service Worker] Notification shown:', title);
      })
      .catch((err) => {
        console.error('[Service Worker] Notification failed:', err);
      })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    // Just close notification
    return;
  }
  
  // Handle 'view' action or default click
  const url = event.notification.data.url || '/';
  const agentKey = event.notification.data.agentKey;
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          console.log('[Service Worker] Focusing existing window');
          
          // Send message to client to switch to agent
          client.postMessage({
            type: 'SWITCH_AGENT',
            agentKey: agentKey
          });
          
          return client.focus();
        }
      }
      
      // No open window found, open new one
      if (clients.openWindow) {
        console.log('[Service Worker] Opening new window:', url);
        return clients.openWindow(url);
      }
    })
    .catch((err) => {
      console.error('[Service Worker] Notification click failed:', err);
    })
  );
});

// Notification close event (for analytics)
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event.notification.tag);
  // Could track dismissal analytics here
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    self.clients.claim();
  }
  
  if (event.data && event.data.type === 'CACHE_VERSION') {
    event.ports[0].postMessage({
      cacheVersion: CACHE_VERSION,
      cacheName: CACHE_NAME
    });
  }
});

// Background sync event (future feature)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // Sync offline messages when back online
      Promise.resolve()
    );
  }
});

// Periodic background sync (future feature - requires permission)
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync:', event.tag);
  
  if (event.tag === 'check-updates') {
    event.waitUntil(
      // Check for updates periodically
      Promise.resolve()
    );
  }
});

console.log('[Service Worker] Loaded, version:', CACHE_VERSION);
