import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push-notification availability", () => {
  it("fails closed while no delivery provider is configured", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/goals.ts"), "utf8");
    const scheduler = readFileSync(resolve(process.cwd(), "server/notificationScheduler.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "client/src/pages/ProfilePage.tsx"), "utf8");

    expect(routes).toContain('res.status(503).json({ error: "Push notifications are not configured for this LyfeOS release." })');
    expect(routes).not.toContain("Push notifications are working!");
    expect(scheduler).toContain("export const PUSH_NOTIFICATIONS_CONFIGURED = false;");
    expect(scheduler).toContain("Push notification scheduler not started: no delivery provider is configured");
    expect(profile).toContain("Push delivery is not available in this LyfeOS release.");
    expect(profile).not.toContain("Send Test Notification");
  });
});
