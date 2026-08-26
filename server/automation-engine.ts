import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import {
  automationDefinitionSchema,
  automationMatchesMission,
  previewAutomation,
  type AutomationDefinition,
  type AutomationMissionContext,
  type AutomationTriggerType,
} from "@shared/automations";
import {
  quests,
  workflowAutomationActionReceipts,
  workflowAutomationRuns,
  workflowAutomations,
  type Quest,
} from "@shared/schema";
import { shiftCalendarDate } from "@shared/calendar";
import { db } from "./db";
import { createMissionLifecycle, updateMissionLifecycle } from "./mission-lifecycle";
import { formatLocalDate, logger } from "./utils";

type AutomationRecord = typeof workflowAutomations.$inferSelect;
type RunRecord = typeof workflowAutomationRuns.$inferSelect;
type ActionReceipt = typeof workflowAutomationActionReceipts.$inferSelect;
type ActionResult = {
  actionIndex: number;
  type: string;
  status: "succeeded" | "failed" | "running";
  targetQuestId?: number;
  attemptCount: number;
};

export type AutomationExecutionResult = {
  status: "succeeded" | "partial" | "failed" | "running" | "skipped";
  runId?: number;
  duplicate?: boolean;
  actionResults: ActionResult[];
};

const ACTION_RECOVERY_LEASE_MS = 5 * 60 * 1_000;
const FAILURE_PAUSE_THRESHOLD = 3;

function missionContext(quest: Quest): AutomationMissionContext {
  return {
    id: quest.id,
    title: quest.title,
    category: quest.category,
    completed: quest.completed,
    completedAt: quest.completedAt,
  };
}

function publicActionResult(receipt: ActionReceipt): ActionResult {
  return {
    actionIndex: receipt.actionIndex,
    type: receipt.actionType,
    status: receipt.status === "succeeded" ? "succeeded" : receipt.status === "running" ? "running" : "failed",
    ...(receipt.targetQuestId ? { targetQuestId: receipt.targetQuestId } : {}),
    attemptCount: receipt.attemptCount,
  };
}

function storedActionResults(value: unknown): ActionResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, position) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (row.status !== "succeeded" && row.status !== "failed" && row.status !== "running") return [];
    if (typeof row.type !== "string") return [];
    return [{
      actionIndex: typeof row.actionIndex === "number" ? row.actionIndex : position,
      type: row.type,
      status: row.status,
      ...(typeof row.targetQuestId === "number" ? { targetQuestId: row.targetQuestId } : {}),
      attemptCount: typeof row.attemptCount === "number" ? row.attemptCount : 1,
    }];
  });
}

async function findLifecycleMission(userId: number, lifecycleKey: string): Promise<Quest | undefined> {
  const [quest] = await db.select().from(quests)
    .where(and(eq(quests.userId, userId), eq(quests.lifecycleKey, lifecycleKey)))
    .limit(1);
  return quest;
}

async function executeAction(input: {
  automationName: string;
  definition: AutomationDefinition;
  quest: Quest;
  runId: number;
  actionIndex: number;
  receipt: ActionReceipt;
  executionDate?: string;
}): Promise<{ targetQuestId: number }> {
  const action = input.definition.actions[input.actionIndex];
  if (action.type === "set_mission_category") {
    const [current] = await db.select().from(quests).where(and(eq(quests.id, input.quest.id), eq(quests.userId, input.quest.userId))).limit(1);
    if (!current) throw new Error("AUTOMATION_TRIGGER_MISSION_UNAVAILABLE");
    if ((current.category || "general") === action.category) return { targetQuestId: current.id };
    if (!input.receipt.expectedQuestRevision) throw new Error("AUTOMATION_CATEGORY_REPAIR_REVIEW_REQUIRED");
    await updateMissionLifecycle({
      questId: current.id,
      userId: current.userId,
      updates: { category: action.category },
      source: "automation",
      expectedRevision: input.receipt.expectedQuestRevision,
    });
    return { targetQuestId: input.quest.id };
  }

  const lifecycleKey = `automation:${input.runId}:${input.actionIndex}`;
  const existing = await findLifecycleMission(input.quest.userId, lifecycleKey);
  if (existing) return { targetQuestId: existing.id };
  const dueDate = shiftCalendarDate(input.executionDate || formatLocalDate(), action.delayDays);
  if (!dueDate) throw new Error("AUTOMATION_DATE_INVALID");
  try {
    const followUp = await createMissionLifecycle({
      userId: input.quest.userId,
      title: action.title,
      description: action.description || `Created by automation “${input.automationName}” after “${input.quest.title}”.`,
      category: action.category,
      dueDate,
      lifecycleKey,
      source: "automation",
      suppressAutomations: true,
    });
    return { targetQuestId: followUp.id };
  } catch (error) {
    // A crash or a concurrent recovery may have committed the keyed mission
    // before the action receipt was advanced. Converge on that exact record.
    const committed = await findLifecycleMission(input.quest.userId, lifecycleKey);
    if (committed) return { targetQuestId: committed.id };
    throw error;
  }
}

async function claimAction(input: {
  run: RunRecord;
  actionIndex: number;
  actionType: string;
  expectedQuestRevision?: number;
  recovery: boolean;
}): Promise<{ receipt?: ActionReceipt; alreadySucceeded?: ActionReceipt; busy: boolean }> {
  const now = new Date();
  const [inserted] = await db.insert(workflowAutomationActionReceipts).values({
    userId: input.run.userId,
    runId: input.run.id,
    actionIndex: input.actionIndex,
    actionType: input.actionType,
    expectedQuestRevision: input.expectedQuestRevision,
    claimedAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning();
  if (inserted) return { receipt: inserted, busy: false };

  const [existing] = await db.select().from(workflowAutomationActionReceipts)
    .where(and(
      eq(workflowAutomationActionReceipts.runId, input.run.id),
      eq(workflowAutomationActionReceipts.actionIndex, input.actionIndex),
      eq(workflowAutomationActionReceipts.userId, input.run.userId),
    )).limit(1);
  if (!existing) return { busy: true };
  if (existing.status === "succeeded") return { alreadySucceeded: existing, busy: false };
  if (!input.recovery) return { busy: true };

  const staleBefore = new Date(now.getTime() - ACTION_RECOVERY_LEASE_MS);
  const [reclaimed] = await db.update(workflowAutomationActionReceipts).set({
    status: "running",
    attemptCount: sql`${workflowAutomationActionReceipts.attemptCount} + 1`,
    lastErrorCode: null,
    claimedAt: now,
    completedAt: null,
    updatedAt: now,
  }).where(and(
    eq(workflowAutomationActionReceipts.id, existing.id),
    eq(workflowAutomationActionReceipts.userId, input.run.userId),
    or(
      eq(workflowAutomationActionReceipts.status, "failed"),
      and(eq(workflowAutomationActionReceipts.status, "running"), lt(workflowAutomationActionReceipts.updatedAt, staleBefore)),
    ),
  )).returning();
  return reclaimed ? { receipt: reclaimed, busy: false } : { busy: true };
}

async function seedLegacyActionReceipts(run: RunRecord): Promise<void> {
  for (const result of storedActionResults(run.actionResults)) {
    await db.insert(workflowAutomationActionReceipts).values({
      userId: run.userId,
      runId: run.id,
      actionIndex: result.actionIndex,
      actionType: result.type,
      status: result.status,
      targetQuestId: result.targetQuestId,
      attemptCount: result.attemptCount,
      claimedAt: run.createdAt,
      completedAt: run.completedAt,
      updatedAt: run.completedAt || run.createdAt,
      lastErrorCode: result.status === "failed" ? "ACTION_FAILED" : null,
    }).onConflictDoNothing();
  }
}

async function actionReceipts(run: RunRecord): Promise<ActionReceipt[]> {
  return db.select().from(workflowAutomationActionReceipts)
    .where(and(eq(workflowAutomationActionReceipts.runId, run.id), eq(workflowAutomationActionReceipts.userId, run.userId)))
    .orderBy(asc(workflowAutomationActionReceipts.actionIndex));
}

async function persistRunOutcome(input: {
  run: RunRecord;
  automationId: number;
  status: AutomationExecutionResult["status"];
  actionResults: ActionResult[];
}): Promise<void> {
  if (input.status === "running" || input.status === "skipped") return;
  const now = new Date();
  const errorCode = input.status === "succeeded" ? null : "ACTION_FAILED";
  const [firstCompletion] = await db.update(workflowAutomationRuns).set({
    status: input.status,
    actionResults: input.actionResults,
    errorCode,
    completedAt: now,
  }).where(and(
    eq(workflowAutomationRuns.id, input.run.id),
    eq(workflowAutomationRuns.userId, input.run.userId),
    isNull(workflowAutomationRuns.completedAt),
  )).returning({ id: workflowAutomationRuns.id });

  if (!firstCompletion) {
    await db.update(workflowAutomationRuns).set({ status: input.status, actionResults: input.actionResults, errorCode, completedAt: now })
      .where(and(eq(workflowAutomationRuns.id, input.run.id), eq(workflowAutomationRuns.userId, input.run.userId)));
    return;
  }

  if (input.status === "succeeded") {
    await db.update(workflowAutomations).set({ consecutiveFailures: 0, pausedAt: null, pauseReason: null, updatedAt: now })
      .where(and(eq(workflowAutomations.id, input.automationId), eq(workflowAutomations.userId, input.run.userId)));
    return;
  }

  await db.update(workflowAutomations).set({
    consecutiveFailures: sql`${workflowAutomations.consecutiveFailures} + 1`,
    enabled: sql`CASE WHEN ${workflowAutomations.consecutiveFailures} + 1 >= ${FAILURE_PAUSE_THRESHOLD} THEN false ELSE ${workflowAutomations.enabled} END`,
    pausedAt: sql`CASE WHEN ${workflowAutomations.consecutiveFailures} + 1 >= ${FAILURE_PAUSE_THRESHOLD} THEN ${now} ELSE ${workflowAutomations.pausedAt} END`,
    pauseReason: sql`CASE WHEN ${workflowAutomations.consecutiveFailures} + 1 >= ${FAILURE_PAUSE_THRESHOLD} THEN 'REPEATED_ACTION_FAILURE' ELSE ${workflowAutomations.pauseReason} END`,
    updatedAt: now,
  }).where(and(eq(workflowAutomations.id, input.automationId), eq(workflowAutomations.userId, input.run.userId)));
}

async function executeRunActions(input: {
  run: RunRecord;
  automationId: number;
  automationName: string;
  definition: AutomationDefinition;
  quest: Quest;
  recovery: boolean;
  executionDate?: string;
}): Promise<AutomationExecutionResult> {
  for (let actionIndex = 0; actionIndex < input.definition.actions.length; actionIndex += 1) {
    const action = input.definition.actions[actionIndex];
    const [currentQuest] = action.type === "set_mission_category"
      ? await db.select({ revision: quests.revision }).from(quests).where(and(eq(quests.id, input.quest.id), eq(quests.userId, input.run.userId))).limit(1)
      : [];
    const claim = await claimAction({
      run: input.run,
      actionIndex,
      actionType: action.type,
      expectedQuestRevision: currentQuest?.revision,
      recovery: input.recovery,
    });
    if (claim.alreadySucceeded) continue;
    if (claim.busy || !claim.receipt) {
      const current = (await actionReceipts(input.run)).map(publicActionResult);
      return { status: "running", runId: input.run.id, actionResults: current };
    }

    try {
      const outcome = await executeAction({
        automationName: input.automationName,
        definition: input.definition,
        quest: input.quest,
        runId: input.run.id,
        actionIndex,
        receipt: claim.receipt,
        executionDate: input.executionDate,
      });
      const completedAt = new Date();
      await db.update(workflowAutomationActionReceipts).set({
        status: "succeeded",
        targetQuestId: outcome.targetQuestId,
        lastErrorCode: null,
        completedAt,
        updatedAt: completedAt,
      }).where(and(eq(workflowAutomationActionReceipts.id, claim.receipt.id), eq(workflowAutomationActionReceipts.userId, input.run.userId)));
    } catch (error) {
      const completedAt = new Date();
      await db.update(workflowAutomationActionReceipts).set({ status: "failed", lastErrorCode: "ACTION_FAILED", completedAt, updatedAt: completedAt })
        .where(and(eq(workflowAutomationActionReceipts.id, claim.receipt.id), eq(workflowAutomationActionReceipts.userId, input.run.userId)));
      logger.error("Workflow automation action failed", {
        automationId: input.automationId,
        runId: input.run.id,
        actionIndex,
        actionType: action.type,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (input.definition.stopOnError) break;
    }
  }

  const receipts = await actionReceipts(input.run);
  const actionResults = receipts.map(publicActionResult);
  const successes = receipts.filter((receipt) => receipt.status === "succeeded").length;
  const failures = receipts.filter((receipt) => receipt.status === "failed").length;
  const running = receipts.some((receipt) => receipt.status === "running");
  const status: AutomationExecutionResult["status"] = running
    ? "running"
    : failures === 0 && successes === input.definition.actions.length
      ? "succeeded"
      : failures > 0 && successes === 0
        ? "failed"
        : "partial";
  await persistRunOutcome({ run: input.run, automationId: input.automationId, status, actionResults });
  return { status, runId: input.run.id, actionResults };
}

export async function executeAutomation(input: {
  automation: AutomationRecord;
  quest: Quest;
  triggerType: AutomationTriggerType;
  idempotencyKey: string;
  triggerContext?: Record<string, unknown>;
  executionDate?: string;
}): Promise<AutomationExecutionResult> {
  const definition = automationDefinitionSchema.parse(input.automation.definition);
  if (definition.trigger.type !== input.triggerType) {
    return { status: "skipped", actionResults: [] };
  }

  if (!automationMatchesMission(definition, missionContext(input.quest))) {
    if (input.triggerType !== "schedule") return { status: "skipped", actionResults: [] };
    const [skipped] = await db.insert(workflowAutomationRuns).values({
      userId: input.quest.userId,
      automationId: input.automation.id,
      automationName: input.automation.name,
      triggerType: input.triggerType,
      triggerQuestId: input.quest.id,
      idempotencyKey: input.idempotencyKey,
      definitionSnapshot: definition,
      triggerContext: input.triggerContext || {},
      status: "skipped",
      errorCode: "CONDITIONS_NOT_MATCHED",
      completedAt: new Date(),
    }).onConflictDoNothing().returning();
    const existing = skipped || (await db.select().from(workflowAutomationRuns).where(and(
      eq(workflowAutomationRuns.userId, input.quest.userId),
      eq(workflowAutomationRuns.automationId, input.automation.id),
      eq(workflowAutomationRuns.idempotencyKey, input.idempotencyKey),
    )).limit(1))[0];
    return { status: "skipped", runId: existing?.id, duplicate: !skipped, actionResults: [] };
  }

  const [run] = await db.insert(workflowAutomationRuns).values({
    userId: input.quest.userId,
    automationId: input.automation.id,
    automationName: input.automation.name,
    triggerType: input.triggerType,
    triggerQuestId: input.quest.id,
    idempotencyKey: input.idempotencyKey,
    definitionSnapshot: definition,
    triggerContext: input.triggerContext || null,
  }).onConflictDoNothing().returning();
  if (!run) {
    const [existing] = await db.select().from(workflowAutomationRuns).where(and(
      eq(workflowAutomationRuns.userId, input.quest.userId),
      eq(workflowAutomationRuns.automationId, input.automation.id),
      eq(workflowAutomationRuns.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!existing) return { status: "running", duplicate: true, actionResults: [] };
    return {
      status: (["succeeded", "partial", "failed", "running"].includes(existing.status) ? existing.status : "running") as AutomationExecutionResult["status"],
      runId: existing.id,
      duplicate: true,
      actionResults: storedActionResults(existing.actionResults),
    };
  }

  return executeRunActions({
    run,
    automationId: input.automation.id,
    automationName: input.automation.name,
    definition,
    quest: input.quest,
    recovery: false,
    executionDate: input.executionDate,
  });
}

export async function repairAutomationRun(input: {
  automation: AutomationRecord;
  run: RunRecord;
  quest: Quest;
}): Promise<AutomationExecutionResult> {
  if (!["failed", "partial", "running"].includes(input.run.status)) {
    return { status: input.run.status === "succeeded" ? "succeeded" : "skipped", runId: input.run.id, actionResults: storedActionResults(input.run.actionResults) };
  }
  if (input.run.status === "running" && Date.now() - input.run.createdAt.getTime() < ACTION_RECOVERY_LEASE_MS) {
    return { status: "running", runId: input.run.id, actionResults: storedActionResults(input.run.actionResults) };
  }
  if (!input.run.definitionSnapshot) throw new Error("AUTOMATION_SNAPSHOT_UNAVAILABLE");
  const definition = automationDefinitionSchema.parse(input.run.definitionSnapshot);
  await seedLegacyActionReceipts(input.run);
  return executeRunActions({
    run: input.run,
    automationId: input.automation.id,
    automationName: input.run.automationName,
    definition,
    quest: input.quest,
    recovery: true,
    executionDate: input.run.triggerType === "schedule" && input.run.triggerContext && typeof input.run.triggerContext === "object" && typeof (input.run.triggerContext as { localDate?: unknown }).localDate === "string" ? (input.run.triggerContext as { localDate: string }).localDate : undefined,
  });
}

export async function runMissionAutomations(input: {
  userId: number;
  triggerType: Exclude<AutomationTriggerType, "manual" | "schedule">;
  quest: Quest;
  idempotencyReference: string;
}): Promise<AutomationExecutionResult[]> {
  const automations = await db.select().from(workflowAutomations)
    .where(and(eq(workflowAutomations.userId, input.userId), eq(workflowAutomations.enabled, true)))
    .orderBy(desc(workflowAutomations.updatedAt))
    .limit(25);
  const results: AutomationExecutionResult[] = [];
  for (const automation of automations) {
    const parsed = automationDefinitionSchema.safeParse(automation.definition);
    if (!parsed.success || parsed.data.trigger.type !== input.triggerType) continue;
    results.push(await executeAutomation({
      automation,
      quest: input.quest,
      triggerType: input.triggerType,
      idempotencyKey: `${input.triggerType}:${input.idempotencyReference}`,
    }));
  }
  return results;
}

export async function getAutomationPreview(automation: AutomationRecord, quest: Quest) {
  return previewAutomation(automationDefinitionSchema.parse(automation.definition), missionContext(quest));
}
