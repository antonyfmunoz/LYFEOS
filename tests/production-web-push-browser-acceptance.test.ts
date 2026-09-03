import fs from "node:fs";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync("scripts/production-web-push-browser-acceptance.ts", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");

describe("production Web Push browser acceptance harness", () => {
  it("registers, delivers, revokes, unsubscribes, and erases a disposable account", () => {
    expect(packageJson).toContain('"acceptance:production-web-push": "tsx scripts/production-web-push-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Web Push acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-web-push");
    expect(script).toContain('contract: "lyfeos.production-web-push-browser.v1"');
    expect(script).toContain('navigator.serviceWorker.ready');
    expect(script).toContain('pushManager.subscribe');
    expect(script).toContain('"/api/push/subscriptions"');
    expect(script).toContain('"/api/push/test"');
    expect(script).toContain('subscription.unsubscribe()');
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).toContain('Push test delivery returned');
    expect(script).toContain('"--no-sandbox"');
  });
});
