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

  it("keeps optional preferences in Profile while Health Log keeps every record workspace discoverable", () => {
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    const healthLog = source("client/src/pages/HealthDetailPage.tsx");
    const profile = source("client/src/pages/ProfilePage.tsx");
    expect(preferences).toContain("Everything is optional, and unselected workspaces remain available below");
    expect(profile).toContain('import HealthPreferences from "@/components/health/HealthPreferences"');
    expect(profile).toContain('<HealthPreferences embedded />');
    expect(healthLog).toContain('const healthLogSections');
    expect(healthLog).toContain('title: "Nourishment"');
    expect(healthLog).toContain('case "nutrition-diary": return <DeferredHealthSection label="nutrition diary"');
    expect(healthLog).toContain("Profile owns health preferences, connected services, and data controls.");
  });

  it("keeps the recorded-practice panel free of decorative progress glows", () => {
    const page = source("client/src/pages/HealthDetailPage.tsx");
    expect(page).not.toContain("getHealthGlow");
    expect(page).not.toContain("shadow-[0_0_40px_hsl(var(--primary)/0.3)]");
    expect(page).not.toContain("bg-gradient-to-br from-primary/5 via-transparent to-primary/3");
    expect(page).toContain('className="health-page mx-auto max-w-5xl py-8 px-4"');
  });

  it("keeps Health cards opaque so right-edge browser chrome cannot bleed through", () => {
    const page = source("client/src/pages/HealthDetailPage.tsx");
    const styles = source("client/src/index.css");
    expect(page).toContain('className="health-page mx-auto max-w-5xl py-8 px-4"');
    expect(styles).toContain(".health-page .glassmorphic");
    expect(styles).toContain("@apply bg-card shadow-none;");
    expect(styles).toContain("backdrop-filter: none");
  });

  it("preserves a saved IANA timezone and keeps device detection user-triggered", () => {
    const preferences = source("client/src/components/health/HealthPreferences.tsx");
    expect(preferences).toContain("profile.data.profile.timeZone || getBrowserTimeZone()");
    expect(preferences).toContain('aria-label="Health calendar IANA time zone"');
    expect(preferences).toContain("Use device timezone");
    expect(preferences).not.toContain('aria-label="Detected health calendar IANA time zone"');
  });
});
