importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyC3bxVpzyTn4sa23QCIcI3-KGGPR1XSHfY',
  authDomain: 'lyfeos-a55f4.firebaseapp.com',
  projectId: 'lyfeos-a55f4',
  storageBucket: 'lyfeos-a55f4.firebasestorage.googleapis.com',
  messagingSenderId: '76858514072',
  appId: '1:76858514072:web:bce43144623e8aa0388eed',
};

let messagingInitialized = false;

function initFirebase() {
  if (messagingInitialized) return;
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const notification = payload.notification || {};

      const title = notification.title || data.title || 'LYFEOS';
      const body = notification.body || data.body || 'You have a notification!';

      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || 'lyfeos-notification',
        renotify: true,
        data: {
          url: data.url || '/',
          questId: data.questId,
        },
      });
    });

    messagingInitialized = true;
  } catch (err) {
    console.error('Firebase SW init error:', err);
  }
}

initFirebase();

self.addEventListener('push', (event) => {
  if (messagingInitialized) return;

  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'LYFEOS';
  const body = notification.body || data.body || 'You have a notification!';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'lyfeos-push-fallback',
      renotify: true,
      data: {
        url: data.url || '/',
        questId: data.questId,
      },
    })
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
