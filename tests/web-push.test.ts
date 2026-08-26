import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { webPushConfiguration } from "../server/web-push";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const originalPublic = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const originalPrivate = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

afterEach(() => {
  if (originalPublic === undefined) delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY; else process.env.WEB_PUSH_VAPID_PUBLIC_KEY = originalPublic;
  if (originalPrivate === undefined) delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY; else process.env.WEB_PUSH_VAPID_PRIVATE_KEY = originalPrivate;
});

describe("standards-based Web Push", () => {
  it("fails closed unless both public and private VAPID keys exist", () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY; delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect(webPushConfiguration()).toEqual({ configured: false, publicKey: null });
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "public";
    expect(webPushConfiguration()).toEqual({ configured: false, publicKey: "public" });
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "private";
    expect(webPushConfiguration()).toEqual({ configured: true, publicKey: "public" });
  });

  it("release-migrates owner devices and keeps browser permission explicit", () => {
    const migration = source("migrations/0134_web_push.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/push-notifications.ts");
    const client = source("client/src/components/profile/PushNotificationSettings.tsx");
    expect(release).toContain('id: "0134_web_push"');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).toContain(`SET "status" = 'revoked'`);
    expect(migration).toContain('push_subscriptions_endpoint_unique_idx');
    expect(routes).toContain('existing.userId !== userId');
    expect(routes).toContain('Web Push is not configured.');
    expect(client).toContain('Notification.requestPermission()');
    expect(client).toContain('subscription.unsubscribe()');
  });
});
