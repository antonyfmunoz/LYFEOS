import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from "firebase/messaging";
import { app as firebaseApp } from "@/lib/firebase";

async function ensureFCMServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    console.log('[Push] Registering firebase-messaging-sw.js...');
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;

    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lyfeos-a55f4'}.firebaseapp.com`,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lyfeos-a55f4',
      storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lyfeos-a55f4'}.firebasestorage.googleapis.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    if (registration.active) {
      registration.active.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
    }

    console.log('[Push] Service worker registered successfully');
    return registration;
  } catch (err) {
    console.error('[Push] Service worker registration failed:', err);
    return null;
  }
}

export function usePushNotifications() {
  const [isSupported_, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [tokenRegistered, setTokenRegistered] = useState(false);

  const isSubscribed = permission === 'granted' && localStorage.getItem('lyfeos-push-subscribed') !== 'false';

  const setSubscribedStorage = useCallback((val: boolean) => {
    localStorage.setItem('lyfeos-push-subscribed', val ? 'true' : 'false');
  }, []);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'Notification' in window && !!firebaseApp;
    setIsSupported(supported);
    console.log('[Push] Support check:', { serviceWorker: 'serviceWorker' in navigator, Notification: 'Notification' in window, firebaseApp: !!firebaseApp });

    if (supported) {
      const perm = Notification.permission;
      setPermission(perm);
      if (perm === 'granted') {
        setSubscribedStorage(true);
        tryGetToken();
      }
    }
  }, []);

  useEffect(() => {
    if (!firebaseApp || !tokenRegistered) return;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const supported = await isSupported();
        if (!supported) return;
        const messaging = getMessaging(firebaseApp);
        unsubscribe = onMessage(messaging, (payload) => {
          console.log('[Push] Foreground message received:', payload);
          const data = payload.data || {};
          const notification = payload.notification || {};
          const title = notification.title || data.title || 'LYFEOS';
          const body = notification.body || data.body || 'You have a notification!';

          if (Notification.permission === 'granted') {
            navigator.serviceWorker?.ready.then((reg) => {
              reg.showNotification(title, {
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: data.tag || 'lyfeos-foreground',
                renotify: true,
                data: { url: data.url || '/', questId: data.questId },
              } as NotificationOptions);
            }).catch(() => {
              new Notification(title, { body, icon: '/icon-192.png' });
            });
          }
        });
        console.log('[Push] Foreground message listener registered');
      } catch (err) {
        console.error('[Push] Failed to set up foreground listener:', err);
      }
    })();

    return () => { unsubscribe?.(); };
  }, [tokenRegistered]);

  const tryGetToken = async () => {
    try {
      if (!firebaseApp) {
        console.error('[Push] Firebase app not initialized');
        return;
      }
      const supported = await isSupported();
      if (!supported) {
        console.error('[Push] Firebase messaging not supported in this browser');
        return;
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      console.log('[Push] VAPID key available:', !!vapidKey, vapidKey ? `(${vapidKey.substring(0, 10)}...)` : '(missing)');
      console.log('[Push] Messaging sender ID:', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '(missing)');

      const swRegistration = await ensureFCMServiceWorker();
      if (!swRegistration) {
        console.error('[Push] Service worker not available, cannot get token');
        return;
      }

      console.log('[Push] Getting FCM token...');
      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        console.log('[Push] FCM token obtained:', token.substring(0, 20) + '...');
        setCurrentToken(token);
        setTokenRegistered(true);
        try {
          await apiRequest('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ fcmToken: token }),
          });
          console.log('[Push] Token registered with server');
        } catch (err) {
          console.error('[Push] Failed to register token with server:', err);
        }
      } else {
        console.error('[Push] getToken returned null — check VAPID key and Firebase Cloud Messaging setup');
      }
    } catch (err: any) {
      console.error('[Push] FCM token retrieval failed:', err?.code || err?.message || err);
      setSubscribeError(err?.message || 'Failed to get push notification token');
    }
  };

  const subscribe = useCallback(async (): Promise<boolean | string> => {
    if (!firebaseApp) return 'Firebase not initialized';
    setLoading(true);
    setSubscribeError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        if (perm === 'denied') {
          setSubscribeError('blocked');
        }
        return false;
      }

      setSubscribedStorage(true);

      const swRegistration = await ensureFCMServiceWorker();
      if (!swRegistration) {
        setLoading(false);
        return 'Service worker registration failed. Try refreshing the page.';
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.error('[Push] VITE_FIREBASE_VAPID_KEY is not set');
        setLoading(false);
        return 'Push notification configuration missing (VAPID key). Contact the developer.';
      }

      console.log('[Push] Subscribing — getting FCM token...');
      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        console.log('[Push] Subscribe: token obtained:', token.substring(0, 20) + '...');
        await apiRequest('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ fcmToken: token }),
        });
        setCurrentToken(token);
        setTokenRegistered(true);
        console.log('[Push] Subscribe: token registered with server');
      } else {
        console.error('[Push] Subscribe: getToken returned null');
        setLoading(false);
        return 'Could not generate push token. Make sure Firebase Cloud Messaging API is enabled.';
      }

      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('[Push] Subscribe failed:', err?.code || err?.message || err);
      setLoading(false);
      return err?.message || 'Failed to enable push notifications';
    }
  }, [setSubscribedStorage]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      if (currentToken) {
        await apiRequest('/api/push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ fcmToken: currentToken }),
        });
      }

      if (firebaseApp) {
        try {
          const messaging = getMessaging(firebaseApp);
          await deleteToken(messaging);
        } catch {}
      }

      setCurrentToken(null);
      setTokenRegistered(false);
      setSubscribedStorage(false);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
      setSubscribedStorage(false);
      setLoading(false);
      return true;
    }
  }, [currentToken, setSubscribedStorage]);

  const sendTestNotification = useCallback(async (): Promise<true | string> => {
    try {
      const res = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        return data.error || 'Failed to send test notification';
      }
      return true;
    } catch (err: any) {
      return err?.message || 'Failed to send test notification';
    }
  }, []);

  return {
    isSupported: isSupported_,
    isSubscribed,
    permission,
    loading,
    subscribeError,
    tokenRegistered,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
