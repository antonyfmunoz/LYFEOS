import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import { app as firebaseApp } from "@/lib/firebase";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

async function ensureFCMServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const worker = registration.active || registration.installing || registration.waiting;
    if (worker) {
      worker.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
    }
    return registration;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const [isSupported_, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const isSubscribed = permission === 'granted' && localStorage.getItem('lyfeos-push-subscribed') !== 'false';

  const setSubscribedStorage = useCallback((val: boolean) => {
    localStorage.setItem('lyfeos-push-subscribed', val ? 'true' : 'false');
  }, []);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'Notification' in window && !!firebaseApp;
    setIsSupported(supported);

    if (supported) {
      const perm = Notification.permission;
      setPermission(perm);
      if (perm === 'granted') {
        setSubscribedStorage(true);
        tryGetToken();
      }
    }
  }, []);

  const tryGetToken = async () => {
    try {
      if (!firebaseApp) return;
      const supported = await isSupported();
      if (!supported) return;

      const swRegistration = await ensureFCMServiceWorker();
      if (!swRegistration) return;

      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });
      if (token) {
        setCurrentToken(token);
        try {
          await apiRequest('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ fcmToken: token }),
          });
        } catch {}
      }
    } catch (err) {
      console.error('FCM token retrieval failed:', err);
    }
  };

  const subscribe = useCallback(async () => {
    if (!firebaseApp) return false;
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
        console.error('FCM: Service worker registration failed');
        setLoading(false);
        return true;
      }

      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        await apiRequest('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ fcmToken: token }),
        });
        setCurrentToken(token);
      } else {
        console.error('FCM: Could not get token');
      }

      setLoading(false);
      return true;
    } catch (err) {
      console.error('FCM subscription failed:', err);
      setLoading(false);
      return true;
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
      setSubscribedStorage(false);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('FCM unsubscribe failed:', err);
      setSubscribedStorage(false);
      setLoading(false);
      return true;
    }
  }, [currentToken, setSubscribedStorage]);

  const sendTestNotification = useCallback(async () => {
    try {
      await apiRequest('/api/push/test', { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    isSupported: isSupported_,
    isSubscribed,
    permission,
    loading,
    subscribeError,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
