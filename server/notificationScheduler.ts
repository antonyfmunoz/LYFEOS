import webpush from "web-push";
import { storage } from "./storage";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:lyfeos@replit.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  questId?: number;
  actions?: { action: string; title: string }[];
}

export async function sendPushToUser(userId: number, payload: NotificationPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const subs = await storage.getPushSubscriptions(userId);
    const payloadStr = JSON.stringify(payload);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr
        );
      } catch (err: any) {
        if (err?.statusCode === 410) {
          await storage.deletePushSubscription(sub.endpoint);
        }
      }
    }
  } catch (err) {
    console.error("sendPushToUser error:", err);
  }
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

async function sendStreakReminders() {
  try {
    const allSubs = await storage.getAllPushSubscriptionsForNotification();
    const now = new Date();
    const hour = now.getHours();

    if (hour !== 20) return;

    const seenUsers = new Set<number>();
    for (const { subscription } of allSubs) {
      if (seenUsers.has(subscription.userId)) continue;
      seenUsers.add(subscription.userId);

      try {
        const stats = await storage.getUserStats(subscription.userId);
        if (!stats || (stats.streakDays || 0) < 1) continue;

        const userQuests = await storage.getQuests(subscription.userId);
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayQuests = userQuests.filter(q => !q.deletedAt && q.startDate === todayStr);
        if (todayQuests.length === 0) continue;

        const todayCompleted = todayQuests.filter(q => q.completed).length;

        if (todayCompleted < todayQuests.length) {
          await sendPushToUser(subscription.userId, {
            title: `${stats.streakDays}-Day Streak`,
            body: `You've completed ${todayCompleted}/${todayQuests.length} missions today. Keep going to maintain your streak!`,
            tag: "streak-reminder",
            url: "/quests",
          });
        }
      } catch {}
    }
  } catch (err) {
    console.error("Streak reminder error:", err);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let streakInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler() {
  if (schedulerInterval) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured - notification scheduler disabled");
    return;
  }
  console.log("Notification scheduler started (checking every 60s)");
  schedulerInterval = setInterval(checkAndSendNotifications, 60_000);
  checkAndSendNotifications();

  streakInterval = setInterval(sendStreakReminders, 60 * 60_000);
  sendStreakReminders();
}

export function stopNotificationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (streakInterval) {
    clearInterval(streakInterval);
    streakInterval = null;
  }
}
