import webpush from "web-push";
import { storage } from "./storage";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:lyfeos@replit.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function checkAndSendNotifications() {
  try {
    const results = await storage.getAllPushSubscriptionsForNotification();

    for (const { subscription, quests } of results) {
      for (const quest of quests) {
        const payload = JSON.stringify({
          title: "Mission Reminder",
          body: `Time for: ${quest.title}`,
          tag: `mission-${quest.id}`,
          url: "/quests",
          questId: quest.id,
        });

        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload
          );
        } catch (err: any) {
          if (err?.statusCode === 410) {
            await storage.deletePushSubscription(subscription.endpoint);
          }
        }
      }
    }
  } catch (err) {
    console.error("Notification scheduler error:", err);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler() {
  if (schedulerInterval) return;
  console.log("Notification scheduler started (checking every 60s)");
  schedulerInterval = setInterval(checkAndSendNotifications, 60_000);
  checkAndSendNotifications();
}

export function stopNotificationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
