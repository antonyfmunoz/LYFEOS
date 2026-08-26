import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push-notification availability", () => {
  it("fails closed until VAPID and browser permission are present", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/push-notifications.ts"), "utf8");
    const scheduler = readFileSync(resolve(process.cwd(), "server/notificationScheduler.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "client/src/pages/ProfilePage.tsx"), "utf8");
    const settings = readFileSync(resolve(process.cwd(), "client/src/components/profile/PushNotificationSettings.tsx"), "utf8");
    const serviceWorker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");

    expect(routes).toContain('if (!webPushConfiguration().configured) return res.status(503)');
    expect(routes).toContain("existing.userId !== userId");
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store")');
    expect(scheduler).toContain("webPushConfiguration().configured");
    expect(scheduler).toContain("Push notification scheduler not started: no delivery provider is configured");
    expect(scheduler).not.toContain("${payload.title}");
    expect(profile).toContain("<PushNotificationSettings />");
    expect(settings).toContain("Notification.requestPermission()");
    expect(settings).toContain("subscription.unsubscribe()");
    expect(serviceWorker).toContain("self.addEventListener('push'");
  });
});
