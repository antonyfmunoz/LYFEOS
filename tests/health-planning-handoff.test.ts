import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("confirm-first health planning hand-off", () => {
  it("keeps evidence selectors in a private stateful draft with release coverage", () => {
    const migration = source("migrations/0062_health_planning_handoff.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_planning_drafts"');
    expect(migration).toContain("'pending', 'executing', 'succeeded', 'rejected', 'failed'");
    expect(release).toContain('id: "0062_health_planning_handoff"');
    expect(schema).toContain('export const healthPlanningDrafts = pgTable("health_planning_drafts"');
  });

  it("requires reviewed draft creation and a second explicit confirm before mission creation", () => {
    const routes = source("server/routes/health-insights.ts");
    const client = source("client/src/components/health/HealthPlanningHandoff.tsx");
    expect(routes).toContain("confirmed: z.literal(true)");
    expect(routes).toContain('current.state !== "pending"');
    expect(routes).toContain("prepareMissionCreation");
    expect(routes).toContain("Health values and evidence references remain in Health");
    expect(client).toContain("nothing enters Missions until you confirm");
    expect(client).toContain("Confirm into Missions");
    expect(client).toContain("Discard");
  });

  it("creates the confirmed mission and its receipt atomically and replays safely", () => {
    const routes = source("server/routes/health-insights.ts");
    const migration = source("migrations/0074_mission_lifecycle_idempotency.sql");
    const release = source("server/release-migrate.ts");
    expect(routes).toContain("db.transaction(async (tx)");
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain("health-planning-draft:${id}");
    expect(routes).toContain('eventType: "mission_created"');
    expect(routes).toContain("replayed: true");
    expect(routes).toContain('"planning_draft_not_pending", "planning_draft_mission_missing"');
    expect(routes).toContain("changed while it was being confirmed");
    expect(routes).not.toContain('healthPlanningDrafts).set({ state: "executing"');
    expect(routes).not.toContain('healthPlanningDrafts).set({ state: "failed"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "quests_user_lifecycle_key_unique_idx"');
    expect(release).toContain('id: "0074_mission_lifecycle_idempotency"');
  });

  it("retains append-only private creation and decision receipts without health evidence", () => {
    const routes = source("server/routes/health-insights.ts");
    const client = source("client/src/components/health/HealthPlanningHandoff.tsx");
    const migration = source("migrations/0081_health_planning_draft_events.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_planning_draft_events"');
    expect(migration).toContain("'created', 'confirmed', 'rejected'");
    expect(migration).not.toContain("evidence_series");
    expect(release).toContain('id: "0081_health_planning_draft_events"');
    expect(routes).toContain('action: "created"');
    expect(routes).toContain('action: "confirmed"');
    expect(routes).toContain('action: "rejected"');
    expect(routes.match(/SELECT id FROM health_planning_drafts[^`]+FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(client).toContain("Private planning receipt history");
    expect(client).toContain("not health values or evidence selectors");
  });

  it("includes drafts in health export and deletion paths", () => {
    const routes = source("server/routes/health-insights.ts");
    const profile = source("server/routes/profile.ts");
    expect(routes).toContain('"health_planning_drafts"');
    expect(profile).toContain('"health_planning_drafts"');
    expect(routes).toContain('"health_planning_draft_events"');
    expect(profile).toContain('"health_planning_draft_events"');
  });

  it("records a narrow scope, seven-day expiry, and explicit revocation without copying health evidence", () => {
    const migration = source("migrations/0092_health_planning_consent_lifecycle.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/health-insights.ts");
    const client = source("client/src/components/health/HealthPlanningHandoff.tsx");
    expect(migration).toContain("created_at\" + interval '7 days'");
    expect(migration).toContain("'expired', 'revoked'");
    expect(migration).toContain('"scope_snapshot" text NOT NULL DEFAULT \'mission_title_only\'');
    expect(release).toContain('id: "0092_health_planning_consent_lifecycle"');
    expect(routes).toContain('planningHandoffScope = "mission_title_only"');
    expect(routes).toContain('/planning-drafts/:id/revoke');
    expect(routes).toContain("already-created generic mission remains independently user-owned");
    expect(client).toContain("Revoke handoff");
    expect(client).toContain("title-only scope");
  });
});
