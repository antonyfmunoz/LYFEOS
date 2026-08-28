import { describe, expect, it, vi } from "vitest";
import {
  inspectProductAnalyticsProvider,
  productAnalyticsProviderPrivacyViolations,
  type ProductAnalyticsProviderProject,
} from "../server/product-analytics-provider";

const safeProject: ProductAnalyticsProviderProject = {
  id: 330797,
  anonymize_ips: true,
  autocapture_opt_out: true,
  autocapture_web_vitals_opt_in: false,
  capture_console_log_opt_in: false,
  capture_performance_opt_in: false,
  session_recording_opt_in: false,
  heatmaps_opt_in: false,
  capture_dead_clicks: false,
  event_retention_months: 12,
  events_retention_enforced: true,
};

describe("product analytics provider privacy preflight", () => {
  it("accepts only the expected project with every required control explicitly safe", () => {
    expect(productAnalyticsProviderPrivacyViolations(safeProject, "330797")).toEqual([]);
  });

  it("fails closed when provider fields are absent or retention is not explicitly enforced", () => {
    expect(productAnalyticsProviderPrivacyViolations({ id: 330797 }, "330797")).toEqual([
      "client_ip_discard_disabled",
      "autocapture_enabled",
      "web_vitals_capture_enabled_or_unverified",
      "console_capture_enabled_or_unverified",
      "performance_capture_enabled_or_unverified",
      "session_recording_enabled_or_unverified",
      "heatmaps_enabled_or_unverified",
      "dead_click_capture_enabled_or_unverified",
      "event_retention_not_explicitly_enforced",
    ]);
  });

  it("rejects a valid-looking response from a different project", () => {
    expect(productAnalyticsProviderPrivacyViolations({ ...safeProject, id: 541367 }, "330797"))
      .toContain("project_identity_unverified");
  });

  it("uses the server-only credential for a project read and returns bounded violations", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(safeProject), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const result = await inspectProductAnalyticsProvider({
      adminHost: "https://us.posthog.com",
      projectId: "330797",
      personalApiKey: "private-test-value",
    }, fetchMock as typeof fetch);
    expect(result).toEqual({ ready: true, violations: [] });
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://us.posthog.com/api/projects/330797/");
    expect((request?.headers as Record<string, string>).Authorization).toBe("Bearer private-test-value");
  });

  it("fails closed without leaking provider response bodies when the project read fails", async () => {
    const result = await inspectProductAnalyticsProvider({
      adminHost: "https://us.posthog.com",
      projectId: "330797",
      personalApiKey: "private-test-value",
    }, vi.fn(async () => new Response("sensitive upstream body", { status: 403 })) as typeof fetch);
    expect(result).toEqual({ ready: false, violations: ["project_read_failed_403"] });
  });
});
