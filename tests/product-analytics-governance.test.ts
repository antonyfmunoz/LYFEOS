import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsAreaForPath, PRODUCT_ANALYTICS_POLICY_VERSION } from "../client/src/lib/productAnalytics";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("privacy-safe product analytics", () => {
  it("release-migrates append-only consent and a user-independent deletion queue", () => {
    const migration = source("migrations/0123_product_analytics_consent.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    for (const text of [migration, release, schema]) {
      expect(text).toContain("product_analytics_consents");
      expect(text).toContain("product_analytics_deletion_queue");
    }
    expect(release).toContain('id: "0123_product_analytics_consent"');
    expect(migration).toContain("ON DELETE cascade");
    expect(migration).toContain("CHECK (\"state\" IN ('enabled', 'revoked'))");
    expect(migration).not.toMatch(/product_analytics_deletion_queue[\s\S]{0,300}"user_id"/);
  });

  it("fails closed unless capture and provider-deletion credentials are all configured", () => {
    const service = source("server/product-analytics.ts");
    const route = source("server/routes/product-analytics.ts");
    for (const key of ["POSTHOG_PROJECT_KEY", "POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_HOST", "POSTHOG_ADMIN_HOST"]) {
      expect(service).toContain(key);
    }
    expect(route).toContain("if (parsed.data.enabled && !productAnalyticsConfig())");
    expect(route).toContain("crypto.randomUUID()");
    expect(route).toContain("ON CONFLICT (\"subject_id\") DO NOTHING");
    expect(service).toContain(PRODUCT_ANALYTICS_POLICY_VERSION);
  });

  it("captures only an explicit content-free event catalog with invasive defaults disabled", () => {
    const client = source("client/src/lib/productAnalytics.ts");
    const server = source("server/product-analytics.ts");
    const expectedEvents = [
      "lyfeos_session_started", "lyfeos_area_viewed", "onboarding_completed", "mission_created",
      "mission_completed", "mission_reopened", "mission_evidence_submitted", "mission_review_completed",
      "transformation_thread_completed",
    ];
    for (const event of expectedEvents) {
      expect(client).toContain(`"${event}"`);
      expect(server).toContain(`"${event}"`);
    }
    expect(client).toContain("autocapture: false");
    expect(client).toContain("disable_session_recording: true");
    expect(client).toContain("capture_exceptions: false");
    expect(client).toContain("advanced_disable_feature_flags: true");
    expect(client).toContain("opt_out_capturing_by_default: true");
    expect(client).toContain("mask_all_text: true");
    expect(client).not.toContain("entity_id");
    expect(client).not.toMatch(/email\s*:/i);
  });

  it("uses coarse route names and never transmits record IDs embedded in URLs", () => {
    expect(analyticsAreaForPath("/mission/918")).toBeNull();
    expect(analyticsAreaForPath("/messages/secret-thread-id")).toBe("messages");
    expect(analyticsAreaForPath("/health/labs/44")).toBe("health");
    expect(analyticsAreaForPath("/databases/private-id")).toBe("tables");
  });

  it("queues right-to-be-forgotten work before local erasure and requests event deletion", () => {
    const profile = source("server/routes/profile.ts");
    const service = source("server/product-analytics.ts");
    const rights = source("shared/data-rights.ts");
    expect(profile.indexOf('INSERT INTO "product_analytics_deletion_queue"')).toBeLessThan(profile.indexOf('DELETE FROM "users"'));
    expect(profile).toContain('"product_analytics_consents"');
    expect(service).toContain('deleteUrl.searchParams.set("delete_events", "true")');
    expect(service).toContain("person.distinct_ids?.includes(subjectId)");
    expect(service).toContain("interval '15 minutes'");
    expect(rights).toContain('id: "product_analytics"');
    expect(rights).toContain("capture_stops_and_provider_deletion_is_queued_before_local_erasure");
  });

  it("provides a plain-language, default-off control without changing navigation", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    const app = source("client/src/App.tsx");
    expect(profile).toContain("Optional Product Analytics");
    expect(profile).toContain("This is off by default");
    expect(profile).toContain("No PostHog events are sent");
    expect(app).toContain("<ProductAnalytics />");
    expect(app).not.toContain('path="/product-analytics"');
    expect(source(".github/workflows/verify.yml")).toContain("tests/api-product-analytics.test.ts");
  });
});
