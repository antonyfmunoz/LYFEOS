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
  const [isSubscribed, setIsSubscribed] = useState(() => localStorage.getItem('lyfeos-push-subscribed') === 'true');
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  const setSubscribed = useCallback((val: boolean) => {
    setIsSubscribed(val);
    localStorage.setItem('lyfeos-push-subscribed', val ? 'true' : 'false');
  }, []);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'Notification' in window && !!firebaseApp;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkExistingToken();
    }
  }, []);

  const checkExistingToken = async () => {
    try {
      if (!firebaseApp) return;
      const supported = await isSupported();
      if (!supported) return;

      if (Notification.permission === 'granted') {
        const swRegistration = await ensureFCMServiceWorker();
        if (!swRegistration) return;

        const messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });
        if (token) {
          setCurrentToken(token);
          setSubscribed(true);
        }
      }
    } catch {
      setSubscribed(false);
    }
  };

  const subscribe = useCallback(async () => {
    if (!firebaseApp) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      const swRegistration = await ensureFCMServiceWorker();
      if (!swRegistration) {
        setLoading(false);
        return false;
      }

      const messaging = getMessaging(firebaseApp);
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        setLoading(false);
        return false;
      }

      await apiRequest('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ fcmToken: token }),
      });

      setCurrentToken(token);
      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('FCM subscription failed:', err);
      setLoading(false);
      return false;
    }
  }, [setSubscribed]);

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
      setSubscribed(false);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('FCM unsubscribe failed:', err);
      setLoading(false);
      return false;
    }
  }, [currentToken, setSubscribed]);

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
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
