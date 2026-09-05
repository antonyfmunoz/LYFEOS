import { describe, expect, it } from "vitest";
import fs from "node:fs";

const script = fs.readFileSync("scripts/production-health-offline-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const page = fs.readFileSync("client/src/pages/HealthDetailPage.tsx", "utf8");
const dailyLog = fs.readFileSync("client/src/components/health/DailyHealthLog.tsx", "utf8");
const queue = fs.readFileSync("client/src/components/health/OfflineHealthQueueStatus.tsx", "utf8");

describe("production Health offline browser acceptance custody", () => {
  it("binds a disposable exact-source desktop/mobile journey into protected production acceptance", () => {
    expect(packageJson).toContain('"acceptance:production-health-offline": "tsx scripts/production-health-offline-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Health offline acceptance");
    expect(workflow).toContain("LYFEOS_HEALTH_OFFLINE_ACCEPTANCE_MODE: production");
    expect(workflow).toContain("LYFEOS_HEALTH_OFFLINE_OUTPUT_DIR: ${{ runner.temp }}/lyfeos-browser-acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-health-offline");
    expect(script).toContain('contract: "lyfeos.production-health-offline-browser.v1"');
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("sourceRevision: SOURCE");
    expect(script).toContain("harnessSource: HARNESS_SOURCE");
    expect(script).toContain("for (const [ordinal, viewport] of SELECTED_VIEWPORTS.entries())");
    expect(script).toContain("LYFEOS_ACCEPTANCE_VIEWPORT");
    expect(script).toContain("Unknown Health offline acceptance viewport");
    expect(script).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(script).toContain("accountErased");
    expect(script).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it("proves failure refusal, device-only queueing, reconnect, exact-once persistence, reload, and truthful boundaries", () => {
    expect(script).toContain('new DOMException("Acceptance fixture quota", "QuotaExceededError")');
    expect(script).toContain('document.body.innerText.includes("Hydration was not saved")');
    expect(script).toContain("quotaFailureLeftFormIntact");
    expect(script).toContain("quotaFailureCreatedNoQueueItem");
    expect(script).toContain("offlineRecordRenderedAsDeviceOnly");
    expect(script).toContain("offlineRecordAbsentFromServer");
    expect(script).toContain("await page.setOfflineMode(true)");
    expect(script).toContain("await page.setOfflineMode(false)");
    expect(script).toContain('window.dispatchEvent(new Event("online"))');
    expect(script).toContain("reconnectSyncedExactlyOnce");
    expect(script).toContain("reloadRenderedPersistedRecord");
    expect(script).toContain("offlineMeasurementRenderedAsDeviceOnly");
    expect(script).toContain("measurementReconnectSyncedExactlyOnce");
    expect(script).toContain("reloadRenderedPersistedMeasurement");
    expect(script).toContain("queueDrained");
    expect(script).toContain("first-ever offline use");
    expect(script).toContain("storage eviction");
    expect(script).toContain("physical browser/device");
    expect(script).toContain("site-data deletion");
  });

  it("uses stable semantic hooks without changing the Health layout", () => {
    expect(page).toContain('data-testid="health-page"');
    expect(dailyLog).toContain('data-testid="daily-health-log"');
    expect(dailyLog).toContain('data-testid="health-hydration-amount"');
    expect(dailyLog).toContain('data-testid="health-hydration-unit"');
    expect(dailyLog).toContain('data-testid="health-hydration-save"');
    expect(dailyLog).toContain('data-testid="health-weight-amount"');
    expect(dailyLog).toContain('data-testid="health-weight-save"');
    expect(queue).toContain('data-testid="health-offline-storage-unavailable"');
    expect(queue).toContain('data-testid="health-offline-queue"');
    expect(queue).toContain("health-offline-queue-item-");
    expect(queue).toContain("health-offline-retry-");
    expect(queue).toContain("health-offline-discard-");
  });
});
