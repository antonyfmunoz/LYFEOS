import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("production Calendar evidence custody", () => {
  const acceptance = source("scripts/production-calendar-browser-acceptance.ts");
  const workflow = source(".github/workflows/production-browser-acceptance.yml");
  const packageJson = source("package.json");
  const calendar = source("client/src/pages/QuestsPage.tsx");
  const queue = source("client/src/components/calendar/OfflineCalendarQueueStatus.tsx");
  const context = source("client/src/lib/context.tsx");

  it("binds the production-only contract to immutable runtime and harness sources", () => {
    expect(acceptance).toContain('contract: "lyfeos.production-calendar-browser.v1"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain("release.body?.sourceRevision === SOURCE");
    expect(acceptance).toContain("HARNESS_SOURCE");
  });

  it("qualifies desktop/mobile canonical scheduling and explicit offline conflict behavior", () => {
    expect(acceptance).toContain('name: "desktop-1440x900"');
    expect(acceptance).toContain('name: "mobile-390x844"');
    expect(acceptance).toContain("offlineCreateQueued");
    expect(acceptance).toContain("reconnectCreateConverged");
    expect(acceptance).toContain("staleEditStoppedAsConflict");
    expect(acceptance).toContain("explicitConflictApplyConverged");
    expect(acceptance).toContain("queueDrained");
    expect(acceptance).toContain('CALENDAR_TIME_ZONE = "America/Los_Angeles"');
    expect(acceptance).toContain("page.emulateTimezone(CALENDAR_TIME_ZONE)");
    expect(acceptance).toContain('text === "Skip tour"');
    expect(acceptance).toContain("service-worker cold-start offline navigation");
  });

  it("uses stable nonvisual hooks and protected evidence custody", () => {
    expect(calendar).toContain('data-testid="calendar-page"');
    expect(calendar).toContain('data-testid="calendar-title"');
    expect(calendar).toContain('data-testid="mission-update-submit"');
    expect(queue).toContain('data-testid="calendar-offline-queue"');
    expect(context).toContain('queryClient.setQueryData(["calendar-offline-queue", user.id], await listCalendarMutationQueue(user.id))');
    expect(context).toContain('queryClient.setQueryData(["calendar-offline-queue", user!.id], await listCalendarMutationQueue(user!.id))');
    expect(packageJson).toContain('"acceptance:production-calendar"');
    expect(workflow).toContain("npm run acceptance:production-calendar");
    expect(workflow).toContain("LYFEOS_CALENDAR_OUTPUT_DIR");
  });
});
