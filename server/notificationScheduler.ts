import webpush from "web-push";
import { storage } from "./storage";
import type { SmartReminder } from "@shared/schema";
import { formatLocalDate, logger } from "./utils";

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
    logger.error("sendPushToUser error:", err);
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
    logger.error("Notification scheduler error:", err);
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
        const todayStr = formatLocalDate(now);
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
    logger.error("Streak reminder error:", err);
  }
}

const REMINDER_MESSAGES: Record<string, { title: string; bodies: string[]; url: string; tag: string }> = {
  missions: {
    title: "Mission Check-In",
    bodies: [
      "Ready to tackle your missions? Now's a great time based on your habits.",
      "Your most productive mission time is here. What will you conquer today?",
      "Time to check in on your active missions!",
      "Your pattern shows this is when you do your best work. Let's go!",
    ],
    url: "/quests",
    tag: "smart-missions",
  },
  reflection: {
    title: "Time to Reflect",
    bodies: [
      "Take a moment to log your daily reflection. Your future self will thank you.",
      "How was your day? A quick reflection helps track your growth.",
      "Your reflection time is here. What went well today?",
      "Pause and reflect — it's one of your most powerful habits.",
    ],
    url: "/chronilog",
    tag: "smart-reflection",
  },
  goal_review: {
    title: "Vision Check-In",
    bodies: [
      "Time to review your mission objectives. Are you on track?",
      "Check in on your vision goals — small progress adds up.",
      "Your goals are waiting for a review. How's your progress?",
      "A quick goal review keeps your vision sharp and your motivation high.",
    ],
    url: "/goals-archive",
    tag: "smart-goal-review",
  },
};

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function shouldSendReminder(reminder: SmartReminder, now: Date): boolean {
  const currentHour = now.getHours();
  if (currentHour !== reminder.preferredHour) return false;

  const currentDay = DAY_NAMES[now.getDay()];
  const days = reminder.preferredDays as string[];
  if (!days.includes(currentDay)) return false;

  if (reminder.lastSentAt) {
    const hoursSinceLastSent = (now.getTime() - new Date(reminder.lastSentAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSent < reminder.cooldownHours) return false;
  }

  return true;
}

async function evaluateSmartReminders() {
  try {
    const reminders = await storage.getAllEnabledSmartReminders();
    if (reminders.length === 0) return;

    const now = new Date();

    for (const reminder of reminders) {
      try {
        if (!shouldSendReminder(reminder, now)) continue;

        const subs = await storage.getPushSubscriptions(reminder.userId);
        if (subs.length === 0) continue;

        const config = REMINDER_MESSAGES[reminder.reminderType];
        if (!config) continue;

        const body = config.bodies[Math.floor(Math.random() * config.bodies.length)];

        await sendPushToUser(reminder.userId, {
          title: config.title,
          body,
          tag: config.tag,
          url: config.url,
        });

        await storage.updateSmartReminderLastSent(reminder.id);
      } catch (err) {
        logger.error(`Smart reminder error for user ${reminder.userId}:`, err);
      }
    }
  } catch (err) {
    logger.error("Smart reminder evaluation error:", err);
  }
}

const EVENT_TYPE_TO_REMINDER: Record<string, string> = {
  mission_complete: 'missions',
  daily_log: 'reflection',
  goal_review: 'goal_review',
};

async function learnUserPatterns() {
  try {
    const reminders = await storage.getAllEnabledSmartReminders();
    const userReminders = new Map<number, SmartReminder[]>();
    for (const r of reminders) {
      if (r.source === 'manual') continue;
      const list = userReminders.get(r.userId) || [];
      list.push(r);
      userReminders.set(r.userId, list);
    }

    for (const [userId, userRems] of Array.from(userReminders.entries())) {
      for (const reminder of userRems) {
        try {
          const eventTypes = Object.entries(EVENT_TYPE_TO_REMINDER)
            .filter(([_, rt]) => rt === reminder.reminderType)
            .map(([et]) => et);

          const hourCounts = new Array(24).fill(0);
          let totalEvents = 0;

          for (const eventType of eventTypes) {
            const events = await storage.getActivityEvents(userId, eventType, 30);
            for (const event of events) {
              const hour = new Date(event.occurredAt).getHours();
              hourCounts[hour]++;
              totalEvents++;
            }
          }

          if (totalEvents < 5) continue;

          let peakHour = reminder.preferredHour;
          let peakCount = 0;
          for (let h = 0; h < 24; h++) {
            if (hourCounts[h] > peakCount) {
              peakCount = hourCounts[h];
              peakHour = h;
            }
          }

          if (peakHour !== reminder.preferredHour) {
            await storage.upsertSmartReminder(userId, reminder.reminderType, {
              preferredHour: peakHour,
              source: 'learned',
            });
          }
        } catch (err) {
          logger.error(`Pattern learning error for user ${userId}, type ${reminder.reminderType}:`, err);
        }
      }
    }
  } catch (err) {
    logger.error("Pattern learning error:", err);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let streakInterval: ReturnType<typeof setInterval> | null = null;
let smartReminderInterval: ReturnType<typeof setInterval> | null = null;
let learningInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler() {
  if (schedulerInterval) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys not configured - notification scheduler disabled");
    return;
  }
  logger.info("Notification scheduler started (checking every 60s)");
  schedulerInterval = setInterval(checkAndSendNotifications, 60_000);
  checkAndSendNotifications();

  streakInterval = setInterval(sendStreakReminders, 60 * 60_000);
  sendStreakReminders();

  smartReminderInterval = setInterval(evaluateSmartReminders, 5 * 60_000);
  evaluateSmartReminders();

  learningInterval = setInterval(learnUserPatterns, 6 * 60 * 60_000);
  setTimeout(learnUserPatterns, 60_000);
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
  if (smartReminderInterval) {
    clearInterval(smartReminderInterval);
    smartReminderInterval = null;
  }
  if (learningInterval) {
    clearInterval(learningInterval);
    learningInterval = null;
  }
}
