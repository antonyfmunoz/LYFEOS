import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHypothesisSchema, hypothesisSignal, hypothesisSignalRegistry } from "../shared/hypotheses";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Cross-domain hypothesis workspace", () => {
  it("has a bounded, versioned canonical signal dictionary", () => {
    expect(hypothesisSignalRegistry).toHaveLength(10);
    expect(new Set(hypothesisSignalRegistry.map((signal) => signal.id)).size).toBe(hypothesisSignalRegistry.length);
    expect(new Set(hypothesisSignalRegistry.map((signal) => signal.domain))).toEqual(new Set(["missions", "daily_state", "health"]));
    expect(hypothesisSignal("health.workout_minutes")).toMatchObject({ unit: "minutes", aggregation: "sum", quality: "mixed_source_record" });
    expect(hypothesisSignal("unknown")).toBeNull();
  });

  it("requires an explicit, bounded, non-identical user-selected comparison", () => {
    const valid = createHypothesisSchema.parse({ title: "Sleep and completed Missions", leftSignalId: "health.sleep_session_minutes", rightSignalId: "missions.completed_count", periodDays: 30, lagDays: 1, timeZone: "America/Los_Angeles", acknowledgedExploratory: true });
    expect(valid.periodDays).toBe(30);
    expect(() => createHypothesisSchema.parse({ ...valid, rightSignalId: valid.leftSignalId })).toThrow("Choose two different signals");
    expect(() => createHypothesisSchema.parse({ ...valid, lagDays: 15 })).toThrow();
    expect(() => createHypothesisSchema.parse({ ...valid, acknowledgedExploratory: false })).toThrow();
  });

  it("keeps consent, private snapshots, rights, and non-causal UI boundaries wired", () => {
    const migration = source("migrations/0125_cross_domain_hypotheses.sql");
    const engine = source("server/hypothesis-engine.ts");
    const routes = source("server/routes/hypotheses.ts");
    const profile = source("server/routes/profile.ts");
    const health = source("server/routes/health-insights.ts");
    const ui = source("client/src/components/analytics/HypothesisWorkbench.tsx");
    const productionAcceptance = source("scripts/production-pattern-explorer-browser-acceptance.ts");
    const productionWorkflow = source(".github/workflows/production-browser-acceptance.yml");
    expect(migration).toContain("hypothesis_domain_consents");
    expect(migration).toContain("cross_domain_hypothesis_snapshots_fingerprint_unique");
    expect(engine).toContain("aligned: _privateAlignedValues");
    expect(engine).toContain("automaticActionTaken: false");
    expect(engine).toContain("progressionAwarded: false");
    expect(routes).toContain('app.patch("/api/hypotheses/consents"');
    expect(routes).toContain('app.post("/api/hypotheses/:id/recalculate"');
    expect(profile).toContain('"cross_domain_hypothesis_interpretations"');
    expect(health).toContain("Health-derived cross-domain hypotheses");
    expect(ui).toContain("never become automatic advice, Missions, XP, rank, or badges");
    expect(ui).toContain("Scheduled recalculation runs at most daily");
    expect(ui).toContain('aria-label="Private interpretation context"');
    expect(ui).toContain('data-testid="hypothesis-workbench"');
    expect(productionAcceptance).toContain('contract: "lyfeos.production-pattern-explorer-browser.v1"');
    expect(productionAcceptance).toContain('new URL("/tracker", BASE_URL)');
    expect(productionAcceptance).toContain("domainsDefaultedOff");
    expect(productionAcceptance).toContain("noProgressionOrAutomaticAction");
    expect(productionWorkflow).toContain("npm run acceptance:production-pattern-explorer");
  });
});
