import { useState, useCallback } from "react";

// TODO: Push notifications need a non-Firebase solution (e.g., Web Push with VAPID keys directly, or a third-party service)

export function usePushNotifications() {
  const [isSupported_] = useState(false);
  const [permission] = useState<NotificationPermission>("default");
  const [loading] = useState(false);
  const [subscribeError] = useState<string | null>(null);
  const [tokenRegistered] = useState(false);

  const isSubscribed = false;

  const subscribe = useCallback(async (): Promise<boolean | string> => {
    return 'Push notifications are not yet configured. A non-Firebase solution is needed.';
  }, []);

  const unsubscribe = useCallback(async () => {
    return true;
  }, []);

  const sendTestNotification = useCallback(async (): Promise<true | string> => {
    return 'Push notifications are not yet configured.';
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
