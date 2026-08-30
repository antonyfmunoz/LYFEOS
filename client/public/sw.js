const CACHE_NAME = 'lyfeos-v27';
const MAX_APP_SHELL_URLS = 200;
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
        const cacheControl = response.headers.get('cache-control') || '';
        if (response.ok && !/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl) && url.origin === self.location.origin) {
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

function safeAppShellUrl(value) {
  try {
    const url = new URL(String(value), self.location.origin);
    if (url.origin !== self.location.origin) return null;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function cacheCurrentAppShell(values) {
  const urls = [...new Set((Array.isArray(values) ? values : [])
    .slice(0, MAX_APP_SHELL_URLS)
    .map(safeAppShellUrl)
    .filter(Boolean))];
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(urls.map(async (url) => {
    const request = new Request(url, { method: 'GET', credentials: 'same-origin', cache: 'reload' });
    const response = await fetch(request);
    const cacheControl = response.headers.get('cache-control') || '';
    if (!response.ok || /(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl)) return false;
    await cache.put(request, response.clone());
    return true;
  }));
  return results.filter((result) => result.status === 'fulfilled' && result.value === true).length;
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_CURRENT_APP_SHELL') return;
  const operation = cacheCurrentAppShell(event.data.urls)
    .then((cached) => event.ports?.[0]?.postMessage({ type: 'CURRENT_APP_SHELL_CACHED', cached }))
    .catch(() => event.ports?.[0]?.postMessage({ type: 'CURRENT_APP_SHELL_CACHED', cached: 0 }));
  event.waitUntil(operation);
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
