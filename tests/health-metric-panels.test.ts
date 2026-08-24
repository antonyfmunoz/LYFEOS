import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("private health metric panels", () => {
  it("release-migrates owner-scoped view recipes with database invariants", () => {
    const migration = source("migrations/0075_health_metric_panels.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_metric_panels"');
    expect(migration).toContain('CHECK ("period_days" IN (30, 90, 365, 730, 3650))');
    expect(migration).toContain('CHECK ("left_series_id" <> "right_series_id")');
    expect(migration).toContain('UNIQUE ("user_id", "name")');
    expect(release).toContain('id: "0075_health_metric_panels"');
    expect(schema).toContain('export const healthMetricPanels = pgTable("health_metric_panels"');
  });

  it("validates selectors and never stores chart values or conclusions", () => {
    const routes = source("server/routes/health-insights.ts");
    expect(routes).toContain('app.get("/api/health-insights/panels"');
    expect(routes).toContain('app.post("/api/health-insights/panels"');
    expect(routes).toContain('app.delete("/api/health-insights/panels/:id"');
    expect(routes).toContain("input.seriesIds.some((seriesId) => !parseSeries(seriesId))");
    expect(routes).toContain('app.get("/api/health-insights/panels/:id/data"');
    expect(routes).toContain("eq(healthMetricPanels.userId, req.session.userId!)");
    const schema = source("shared/schema.ts");
    const panelTable = schema.slice(schema.indexOf('export const healthMetricPanels'), schema.indexOf('// Health observations preserve'));
    expect(panelTable).not.toMatch(/\b(value|score|conclusion)\b/i);
  });

  it("lets the user save, reopen, and delete panel choices with honest copy", () => {
    const client = source("client/src/components/health/HealthTrendWorkbench.tsx");
    expect(client).toContain("Save current panel");
    expect(client).toContain("openPanel(panel)");
    expect(client).toContain("does not snapshot, score, or reinterpret");
    expect(client).toContain("Metric panel name");
    expect(client).toContain("Optional third panel series");
    expect(client).toContain("View saved-panel data table");
  });

  it("release-migrates two-to-four selector panels without losing existing pairs", () => {
    const migration = source("migrations/0084_health_metric_panel_series.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('jsonb_build_array("left_series_id", "right_series_id")');
    expect(migration).toContain('jsonb_array_length("series_ids") BETWEEN 2 AND 4');
    expect(release).toContain('id: "0084_health_metric_panel_series"');
  });

  it("includes panels in private export and deletion", () => {
    const routes = source("server/routes/health-insights.ts");
    expect(routes).toContain('"health_metric_panels"');
  });
});
