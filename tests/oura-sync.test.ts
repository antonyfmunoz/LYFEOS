import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOuraCollectionRequest, ouraSyncResourcesForScopes } from "../server/oura-sync-contract";

describe("Oura factual collection sync", () => {
  it("maps explicit LyfeOS categories to only their supported Oura resources", () => {
    expect(ouraSyncResourcesForScopes(["activity", "sleep"])).toEqual(["daily_activity", "sleep"]);
    expect(ouraSyncResourcesForScopes(["vitals"])).toEqual(["daily_spo2", "daily_readiness"]);
    expect(ouraSyncResourcesForScopes([])).toEqual([]);
  });

  it("builds bounded official collection requests and carries opaque pagination", () => {
    const now = new Date("2026-08-26T18:00:00.000Z");
    const initial = new URL(buildOuraCollectionRequest("daily_activity", null, "America/Los_Angeles", now).url);
    expect(`${initial.origin}${initial.pathname}`).toBe("https://api.ouraring.com/v2/usercollection/daily_activity");
    expect(initial.searchParams.get("start_date")).toBe("2026-07-27");
    expect(initial.searchParams.get("end_date")).toBe("2026-08-26");
    expect(initial.searchParams.get("fields")).toContain("steps");
    expect(initial.searchParams.get("fields")).not.toContain("score");
    const cursor = JSON.stringify({ v: 1, nextToken: "opaque-next", windowStart: "2026-07-27", windowEnd: "2026-08-26", completedAt: now.toISOString() });
    const next = new URL(buildOuraCollectionRequest("daily_activity", cursor, "America/Los_Angeles", new Date("2026-08-27T18:00:00.000Z")).url);
    expect(next.searchParams.get("next_token")).toBe("opaque-next");
    expect(next.searchParams.get("start_date")).toBe("2026-07-27");
    const heart = new URL(buildOuraCollectionRequest("heartrate", null, "UTC", now).url);
    expect(heart.searchParams.get("start_datetime")).toBe("2026-07-27T18:00:00.000Z");
    expect(heart.searchParams.get("start_date")).toBeNull();
  });

  it("keeps tokens and cursors out of API responses and imports before cursor completion", () => {
    const service = readFileSync(resolve(process.cwd(), "server/oura-sync.ts"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-connections.ts"), "utf8");
    expect(service.indexOf("ingestProviderHealthEnvelope")).toBeLessThan(service.indexOf("completeHealthSync({"));
    expect(service).toContain("refreshOuraCredential");
    expect(service).toContain('action: "credential_rotated"');
    expect(routes).toContain('app.post("/api/health-connections/:id/oura-sync", isAuthenticated');
    expect(routes).toContain("Only reviewed factual fields");
    expect(routes).not.toContain("credential: resolved.credential");
    expect(routes).not.toContain("nextCursor");
  });
});
