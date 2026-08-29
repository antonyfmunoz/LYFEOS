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
    expect(engine).toContain("definitionSnapshot: definition");
    expect(engine).toContain("workflowAutomationActionReceipts");
    expect(engine).toContain("FAILURE_PAUSE_THRESHOLD = 3");
    expect(engine).toContain("repairAutomationRun");
    expect(engine).toContain("lifecycleKey = `automation:${input.runId}:${input.actionIndex}`");
    expect(engine).not.toContain("action.description,");
    expect(engine).not.toContain("quest.description,");
  });

  it("replays manual requests by caller mutation identity and exposes owner-scoped repair", () => {
    const contracts = source("shared/automations.ts");
    const routes = source("server/routes/automations.ts");
    expect(contracts).toContain("automationRunRequestSchema");
    expect(contracts).toContain("mutationId: z.string().uuid()");
    expect(routes).toContain("manual:${request.mutationId}");
    expect(routes).toContain('app.post("/api/automations/:id/runs/:runId/repair", isAuthenticated');
    expect(routes).toContain("ownedRun(runId, id, req.session.userId!)");
    expect(routes).toContain("definitionSnapshot");
  });

  it("migrates immutable snapshots, per-action recovery receipts, and bounded failure pausing", () => {
    const migration = source("migrations/0114_workflow_automation_recovery.sql");
    const release = source("server/release-migrate.ts");
    const profile = source("server/routes/profile.ts");
    for (const field of ["consecutive_failures", "paused_at", "pause_reason", "definition_snapshot"]) {
      expect(migration).toContain(`"${field}"`);
    }
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "workflow_automation_action_receipts"');
    expect(migration).toContain('UNIQUE INDEX IF NOT EXISTS "workflow_automation_action_receipts_run_action_unique_idx"');
    expect(release).toContain('id: "0114_workflow_automation_recovery"');
    expect(profile).toContain('"workflow_automation_action_receipts"');
  });

  it("ships owner-scoped private routes and starts every new automation disabled", () => {
    const routes = source("server/routes/automations.ts");
    expect(routes).toContain('app.get("/api/automations", isAuthenticated');
    expect(routes).toContain('app.post("/api/automations/:id/preview", isAuthenticated');
    expect(routes).toContain('app.post("/api/automations/:id/run", isAuthenticated');
    expect(routes).toContain("eq(workflowAutomations.userId, req.session.userId!)");
    expect(routes).toContain("enabled: false");
    expect(routes).toContain("consecutiveFailures: 0");
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
    expect(app).toContain('lazyRoute(() => import("./pages/AutomationsPage"))');
    expect(app).toContain('<Route path="/automations">');
    expect(vault).toContain("navigate('/automations')");
  });

  it("exposes stable non-visual hooks for the bounded rendered preview journey", () => {
    const page = source("client/src/pages/AutomationsPage.tsx");
    for (const testId of [
      "automations-page",
      "automation-create",
      "automation-save",
      "automation-delete",
      "automation-name",
      "automation-description",
      "automation-condition-title",
      "automation-preview-mission",
      "automation-preview",
      "automation-run-now",
      "automation-preview-result",
      "automation-run-history-empty",
    ]) expect(page).toContain(`data-testid="${testId}"`);
    expect(page).toContain('data-testid={`automation-editor-${automation.id}`}');
    expect(page).toContain('data-testid={`automation-action-title-${index}`}');
    expect(page).toContain('data-testid={`automation-run-${receipt.id}`}');
    expect(page).toContain('data-testid={`automation-run-${receipt.id}-metadata`}');
    expect(page).toContain('data-testid={`automation-run-${receipt.id}-schedule`}');
    expect(page).toContain('data-testid={`automation-run-${receipt.id}-action-${result.actionIndex}`}');
    expect(page).toContain('data-testid={`automation-run-repair-${receipt.id}`}');
    expect(page).toContain('receipt.status === "running" ? `Check unfinished actions for run ${receipt.id}` : `Retry unfinished actions for run ${receipt.id}`');
    expect(page).toContain('data-testid={`automation-run-${receipt.id}-running-note`}');
    expect(page).toContain("Active work is not reclaimed until its recovery window has safely expired");
    expect(page).toContain("never replays an action that already succeeded");
    expect(page).toContain("not copied mission descriptions");
    expect(page).toContain('value.toLowerCase().replaceAll("_", " ")');
  });

  it("qualifies recovery, real scheduled execution, and bounded receipt states only in disposable isolated CI", () => {
    const acceptance = source("scripts/automation-recovery-browser-acceptance.ts");
    const workflow = source(".github/workflows/verify.yml");
    expect(acceptance).toContain('process.env.LYFEOS_TEST_ENV === "isolated"');
    expect(acceptance).toContain('["127.0.0.1", "localhost"].includes(BASE_URL.hostname)');
    expect(acceptance).toContain('status = \'partial\'');
    expect(acceptance).toContain('processScheduledAutomation(scheduledAutomationId, workerNow)');
    expect(acceptance).toContain('scheduledWorkerResults.join(",") === "busy,completed"');
    expect(acceptance).toContain("'failed',$7::jsonb,'ACTION_FAILED'");
    expect(acceptance).toContain("'running',$7::jsonb,NULL,NULL");
    expect(acceptance).toContain('Check unfinished actions for run');
    expect(acceptance).toContain("Retry unfinished actions for run");
    expect(acceptance).toContain('actionAttempts.join(",") === "1,2"');
    expect(acceptance).toContain('followUpCount === 1');
    expect(acceptance).toContain('scheduledFollowUpCount === 1');
    expect(acceptance).toContain('lyfeos.isolated-automation-recovery-browser.v2');
    expect(acceptance).toContain('confirmation: "DELETE MY ACCOUNT"');
    expect(acceptance).toContain("accountErased");
    expect(workflow).toContain("browser-actions/setup-chrome@v2");
    expect(workflow).toContain("npm run acceptance:automation-recovery");
    expect(workflow).toContain("Upload isolated automation recovery evidence");
  });
});
