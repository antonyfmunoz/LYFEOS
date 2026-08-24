import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("optional Health workspace preferences", () => {
  it("defaults existing users to every workspace while allowing an empty reversible selection", () => {
    const migration = source("migrations/0089_health_tracking_preferences.sql");
    const schema = source("shared/schema.ts");
    const routes = source("server/routes/health-fitness.ts");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "tracked_domains" jsonb NOT NULL DEFAULT');
    expect(migration).toContain("jsonb_array_length");
    expect(schema).toContain('trackedDomains: jsonb("tracked_domains")');
    expect(routes).toContain("trackedDomains: z.array(z.enum(healthTrackingDomains))");
    expect(routes).not.toContain("trackedDomains: z.array(z.enum(healthTrackingDomains)).min(");
  });

  it("uses the preference for shortcuts without hiding unselected workspaces", () => {
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    const page = source("client/src/pages/HealthDetailPage.tsx");
    expect(preferences).toContain("Everything is optional, and unselected workspaces remain available below");
    expect(page).toContain('aria-label="Selected Health workspace shortcuts"');
    expect(page).toContain("Every workspace remains available below");
    expect(page).toContain('<DeferredHealthSection label="nutrition diary"');
  });

  it("preserves a saved IANA timezone and keeps device detection user-triggered", () => {
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    expect(preferences).toContain("profile.data.profile.timeZone || getBrowserTimeZone()");
    expect(preferences).toContain('aria-label="Health calendar IANA time zone"');
    expect(preferences).toContain("Use device timezone");
    expect(preferences).not.toContain('aria-label="Detected health calendar IANA time zone"');
  });
});
