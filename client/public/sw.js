const CACHE_NAME = 'lyfeos-v25';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/fonts.css',
  '/theme-init.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/__/')) return;
  if (url.origin !== self.location.origin) return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});

self.addEventListener('push', (event) => {
  let title = 'LYFEOS';
  let body = 'You have a mission reminder!';
  let tag = 'lyfeos-notification';
  let url = '/';
  let questId;
  let actions = [];

  if (event.data) {
    try {
      const parsed = event.data.json();
      const notification = parsed.notification || {};
      const d = parsed.data || parsed;
      title = notification.title || d.title || 'LYFEOS';
      body = notification.body || d.body || 'You have a notification!';
      tag = d.tag || tag;
      url = d.url || url;
      questId = d.questId;
      actions = d.actions || [];
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag,
    renotify: true,
    data: { url, questId },
    actions
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (urlToOpen !== '/') {
            client.navigate(urlToOpen);
          }
          return;
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
