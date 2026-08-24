import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  automationDefinitionSchema,
  automationMatchesMission,
  previewAutomation,
  type AutomationDefinition,
  type AutomationMissionContext,
} from "../shared/automations";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const mission: AutomationMissionContext = { id: 7, title: "Practice sales discovery", category: "business", completed: true, completedAt: new Date() };
const definition: AutomationDefinition = {
  version: 1,
  trigger: { type: "mission_completed" },
  conditions: { titleContains: "SALES", category: "Business" },
  actions: [
    { type: "set_mission_category", category: "growth" },
    { type: "schedule_follow_up", title: "Review sales call", description: "Review evidence", category: "business", delayDays: 2 },
  ],
  stopOnError: true,
};

describe("workflow automations", () => {
  it("matches bounded mission conditions case-insensitively and previews without mutation", () => {
    expect(automationDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(automationMatchesMission(definition, mission)).toBe(true);
    expect(automationMatchesMission({ ...definition, conditions: { category: "health" } }, mission)).toBe(false);
    expect(previewAutomation(definition, mission)).toEqual(expect.objectContaining({
      matched: true,
      disclosure: expect.stringContaining("No mission was changed"),
      actions: expect.arrayContaining([expect.objectContaining({ type: "schedule_follow_up" })]),
    }));
  });

  it("rejects destructive, external, oversized, and unknown action definitions", () => {
    for (const type of ["complete_mission", "delete_mission", "send_email", "write_umh", "interpret_health"]) {
      expect(automationDefinitionSchema.safeParse({ ...definition, actions: [{ type }] }).success).toBe(false);
    }
    expect(automationDefinitionSchema.safeParse({ ...definition, actions: Array(4).fill({ type: "set_mission_category", category: "general" }) }).success).toBe(false);
    expect(automationDefinitionSchema.safeParse({ ...definition, actions: [{ type: "schedule_follow_up", title: "Later", description: "", category: "general", delayDays: 366 }] }).success).toBe(false);
  });

  it("subscribes after canonical mission lifecycle writes and prevents generated recursion", () => {
    const lifecycle = source("server/mission-lifecycle.ts");
    const engine = source("server/automation-engine.ts");
    expect(lifecycle).toContain('triggerType: "mission_created"');
    expect(lifecycle).toContain('triggerType: "mission_completed"');
    expect(lifecycle).toContain("suppressAutomations");
    expect(engine).toContain("suppressAutomations: true");
    expect(engine).toContain("createMissionLifecycle({");
    expect(engine).toContain("updateMissionLifecycle({");
    expect(engine).not.toContain("storage.createQuest(");
    expect(engine).not.toContain("storage.toggleQuestCompletion(");
  });

  it("claims each event run idempotently and stores bounded outcome receipts", () => {
    const engine = source("server/automation-engine.ts");
    expect(engine).toContain(".onConflictDoNothing().returning()");
    expect(engine).toContain('errorCode: failures ? "ACTION_FAILED" : null');
    expect(engine).not.toContain("action.description,");
    expect(engine).not.toContain("quest.description,");
  });

  it("ships owner-scoped private routes and starts every new automation disabled", () => {
    const routes = source("server/routes/automations.ts");
    expect(routes).toContain('app.get("/api/automations", isAuthenticated');
    expect(routes).toContain('app.post("/api/automations/:id/preview", isAuthenticated');
    expect(routes).toContain('app.post("/api/automations/:id/run", isAuthenticated');
    expect(routes).toContain("eq(workflowAutomations.userId, req.session.userId!)");
    expect(routes).toContain("enabled: false");
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(routes).not.toContain("userId: req.body");
  });

  it("includes persistence, account rights, protected UI, and minimal discovery", () => {
    const migration = source("migrations/0096_workflow_automations.sql");
    const release = source("server/release-migrate.ts");
    const profile = source("server/routes/profile.ts");
    const app = source("client/src/App.tsx");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    for (const table of ["workflow_automations", "workflow_automation_runs"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(release).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(profile).toContain(`"${table}"`);
    }
    expect(release).toContain('id: "0096_workflow_automations"');
    expect(app).toContain('React.lazy(() => import("./pages/AutomationsPage"))');
    expect(app).toContain('<Route path="/automations">');
    expect(vault).toContain("navigate('/automations')");
  });
});
