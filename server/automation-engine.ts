import { and, desc, eq } from "drizzle-orm";
import {
  automationDefinitionSchema,
  automationMatchesMission,
  previewAutomation,
  type AutomationDefinition,
  type AutomationMissionContext,
  type AutomationTriggerType,
} from "@shared/automations";
import { workflowAutomationRuns, workflowAutomations, type Quest } from "@shared/schema";
import { shiftCalendarDate } from "@shared/calendar";
import { db } from "./db";
import { createMissionLifecycle, updateMissionLifecycle } from "./mission-lifecycle";
import { formatLocalDate, logger } from "./utils";

type AutomationRecord = typeof workflowAutomations.$inferSelect;
type ActionResult = { type: string; status: "succeeded" | "failed"; targetQuestId?: number };

export type AutomationExecutionResult = {
  status: "succeeded" | "partial" | "failed" | "skipped";
  runId?: number;
  duplicate?: boolean;
  actionResults: ActionResult[];
};

function missionContext(quest: Quest): AutomationMissionContext {
  return {
    id: quest.id,
    title: quest.title,
    category: quest.category,
    completed: quest.completed,
    completedAt: quest.completedAt,
  };
}

async function executeAction(automation: AutomationRecord, definition: AutomationDefinition, quest: Quest, actionIndex: number): Promise<ActionResult> {
  const action = definition.actions[actionIndex];
  if (action.type === "set_mission_category") {
    await updateMissionLifecycle({ questId: quest.id, userId: quest.userId, updates: { category: action.category }, source: "system" });
    return { type: action.type, status: "succeeded", targetQuestId: quest.id };
  }

  const dueDate = shiftCalendarDate(formatLocalDate(), action.delayDays);
  if (!dueDate) throw new Error("AUTOMATION_DATE_INVALID");
  const followUp = await createMissionLifecycle({
    userId: quest.userId,
    title: action.title,
    description: action.description || `Created by automation “${automation.name}” after “${quest.title}”.`,
    category: action.category,
    dueDate,
    source: "system",
    suppressAutomations: true,
  });
  return { type: action.type, status: "succeeded", targetQuestId: followUp.id };
}

export async function executeAutomation(input: {
  automation: AutomationRecord;
  quest: Quest;
  triggerType: AutomationTriggerType;
  idempotencyKey: string;
}): Promise<AutomationExecutionResult> {
  const definition = automationDefinitionSchema.parse(input.automation.definition);
  if (definition.trigger.type !== input.triggerType || !automationMatchesMission(definition, missionContext(input.quest))) {
    return { status: "skipped", actionResults: [] };
  }

  const [run] = await db.insert(workflowAutomationRuns).values({
    userId: input.quest.userId,
    automationId: input.automation.id,
    automationName: input.automation.name,
    triggerType: input.triggerType,
    triggerQuestId: input.quest.id,
    idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing().returning();
  if (!run) return { status: "skipped", duplicate: true, actionResults: [] };

  const actionResults: ActionResult[] = [];
  for (let index = 0; index < definition.actions.length; index += 1) {
    try {
      actionResults.push(await executeAction(input.automation, definition, input.quest, index));
    } catch (error) {
      actionResults.push({ type: definition.actions[index].type, status: "failed" });
      logger.error("Workflow automation action failed", {
        automationId: input.automation.id,
        runId: run.id,
        actionType: definition.actions[index].type,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (definition.stopOnError) break;
    }
  }

  const successes = actionResults.filter((result) => result.status === "succeeded").length;
  const failures = actionResults.length - successes;
  const status = failures === 0 ? "succeeded" : successes === 0 ? "failed" : "partial";
  await db.update(workflowAutomationRuns).set({
    status,
    actionResults,
    errorCode: failures ? "ACTION_FAILED" : null,
    completedAt: new Date(),
  }).where(and(eq(workflowAutomationRuns.id, run.id), eq(workflowAutomationRuns.userId, input.quest.userId)));
  return { status, runId: run.id, actionResults };
}

export async function runMissionAutomations(input: {
  userId: number;
  triggerType: Exclude<AutomationTriggerType, "manual">;
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
