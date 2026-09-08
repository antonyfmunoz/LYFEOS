import fs from "node:fs";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync("scripts/production-web-push-browser-acceptance.ts", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const goalRoutes = fs.readFileSync("server/routes/goals.ts", "utf8");
const pushRoutes = fs.readFileSync("server/routes/push-notifications.ts", "utf8");

describe("production Web Push browser acceptance harness", () => {
  it("registers, delivers, revokes, unsubscribes, and erases a disposable account", () => {
    expect(packageJson).toContain('"acceptance:production-web-push": "tsx scripts/production-web-push-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Web Push acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-web-push");
    expect(script).toContain('contract: "lyfeos.production-web-push-browser.v1"');
    expect(script).toContain('navigator.serviceWorker.ready');
    expect(script).toContain('Browser service worker activation');
    expect(script).toContain('pushManager.subscribe');
    expect(script).toContain('creating browser subscription');
    expect(script).toContain('}), 90_000)');
    expect(script).toContain('"/api/push/subscriptions"');
    expect(script).toContain('"/api/push/test"');
    expect(script).toContain('subscription.unsubscribe()');
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).toContain('Push test delivery returned');
    expect(script).toContain('"--no-sandbox"');
    expect(script).toContain('response.headers.get("retry-after")');
    expect(script).toContain('registered.status !== 429 || attempt === 2');
    expect(script).toContain('Math.min(61, Math.max(1, registered.retryAfterSeconds || 60))');
    expect(script).toContain('ignoreDefaultArgs: ["--disable-background-networking"]');
  });

  it("does not let a retired placeholder shadow the live test-delivery route", () => {
    expect(goalRoutes).not.toContain('app.post("/api/push/test"');
    expect(pushRoutes).toContain('app.post("/api/push/test"');
    expect(pushRoutes).toContain('sendPushToUser');
  });
});
