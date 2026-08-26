import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { automationDefinitionSchema, type AutomationScheduleTrigger } from "@shared/automations";
import { quests, workflowAutomationRuns, workflowAutomations } from "@shared/schema";
import { db } from "./db";
import { dueScheduleWindow, scheduleOccurrenceContext } from "./automation-schedule";
import { executeAutomation } from "./automation-engine";
import { logger } from "./utils";

const CLAIM_LEASE_MS = 5 * 60_000;
const MISSED_GRACE_MS = 2 * 60_000;

async function claimScheduledAutomation(id: number, now: Date) {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  return (await db.update(workflowAutomations).set({ scheduleClaimedAt: now, updatedAt: now }).where(and(
    eq(workflowAutomations.id, id),
    eq(workflowAutomations.enabled, true),
    lte(workflowAutomations.scheduleNextRunAt, now),
    or(isNull(workflowAutomations.scheduleClaimedAt), lt(workflowAutomations.scheduleClaimedAt, staleBefore)),
  )).returning())[0];
}

async function recordSkippedWindow(automation: typeof workflowAutomations.$inferSelect, trigger: AutomationScheduleTrigger, due: Date[], now: Date) {
  const first = due[0], last = due[due.length - 1];
  const idempotencyKey = `schedule-skip:${first.toISOString()}:${last.toISOString()}`;
  await db.insert(workflowAutomationRuns).values({
    userId: automation.userId,
    automationId: automation.id,
    automationName: automation.name,
    triggerType: "schedule",
    triggerQuestId: null,
    idempotencyKey,
    definitionSnapshot: automation.definition,
    triggerContext: { ...scheduleOccurrenceContext(trigger, last, now), anchorMissionId: trigger.questId, missedOccurrences: due.length, missedRunPolicy: "skip" },
    status: "skipped",
    actionResults: [],
    errorCode: "MISSED_RUN_SKIPPED",
    completedAt: now,
  }).onConflictDoNothing();
}

async function recordAnchorFailure(automation: typeof workflowAutomations.$inferSelect, trigger: AutomationScheduleTrigger, due: Date[], now: Date) {
  const first = due[0], last = due[due.length - 1];
  await db.insert(workflowAutomationRuns).values({
    userId: automation.userId,
    automationId: automation.id,
    automationName: automation.name,
    triggerType: "schedule",
    triggerQuestId: null,
    idempotencyKey: `schedule:${first.toISOString()}:${last.toISOString()}`,
    definitionSnapshot: automation.definition,
    triggerContext: { ...scheduleOccurrenceContext(trigger, last, now), anchorMissionId: trigger.questId, consolidatedOccurrences: due.length, missedRunPolicy: trigger.missedRunPolicy },
    status: "failed",
    actionResults: [],
    errorCode: "SCHEDULE_ANCHOR_UNAVAILABLE",
    completedAt: now,
  }).onConflictDoNothing();
  await db.update(workflowAutomations).set({ enabled: false, pausedAt: now, pauseReason: "SCHEDULE_ANCHOR_UNAVAILABLE", scheduleClaimedAt: null, updatedAt: now }).where(and(eq(workflowAutomations.id, automation.id), eq(workflowAutomations.userId, automation.userId)));
}

async function advanceSchedule(automation: typeof workflowAutomations.$inferSelect, due: Date[], next: Date | null, exhausted: boolean, now: Date) {
  const occurrences = automation.scheduleOccurrencesRun + due.length;
  await db.update(workflowAutomations).set({
    scheduleOccurrencesRun: occurrences,
    scheduleLastScheduledFor: due[due.length - 1],
    scheduleNextRunAt: next,
    scheduleClaimedAt: null,
    ...(exhausted ? { enabled: false, pausedAt: now, pauseReason: "SCHEDULE_COMPLETE" } : {}),
    updatedAt: now,
  }).where(and(eq(workflowAutomations.id, automation.id), eq(workflowAutomations.userId, automation.userId)));
}

export async function processScheduledAutomation(automationId: number, now = new Date()): Promise<"ran" | "skipped" | "completed" | "unavailable" | "busy"> {
  const automation = await claimScheduledAutomation(automationId, now);
  if (!automation || !automation.scheduleNextRunAt) return "busy";
  const parsed = automationDefinitionSchema.safeParse(automation.definition);
  if (!parsed.success || parsed.data.trigger.type !== "schedule") {
    await db.update(workflowAutomations).set({ enabled: false, pauseReason: "INVALID_SCHEDULE_DEFINITION", pausedAt: now, scheduleClaimedAt: null, updatedAt: now }).where(eq(workflowAutomations.id, automation.id));
    return "unavailable";
  }
  const trigger = parsed.data.trigger;
  const remaining = trigger.maxOccurrences - automation.scheduleOccurrencesRun;
  if (remaining <= 0) {
    await db.update(workflowAutomations).set({ enabled: false, pauseReason: "SCHEDULE_COMPLETE", pausedAt: now, scheduleNextRunAt: null, scheduleClaimedAt: null, updatedAt: now }).where(eq(workflowAutomations.id, automation.id));
    return "completed";
  }
  const window = dueScheduleWindow({ trigger, firstDue: automation.scheduleNextRunAt, now, remainingOccurrences: remaining });
  if (!window.due.length) {
    await db.update(workflowAutomations).set({ scheduleNextRunAt: window.next, scheduleClaimedAt: null, ...(window.exhausted ? { enabled: false, pauseReason: "SCHEDULE_COMPLETE", pausedAt: now } : {}), updatedAt: now }).where(eq(workflowAutomations.id, automation.id));
    return window.exhausted ? "completed" : "busy";
  }
  const delayed = now.getTime() > window.due[0].getTime() + MISSED_GRACE_MS;
  if (delayed && trigger.missedRunPolicy === "skip") {
    await recordSkippedWindow(automation, trigger, window.due, now);
    await advanceSchedule(automation, window.due, window.next, window.exhausted, now);
    return window.exhausted ? "completed" : "skipped";
  }

  const [anchor] = await db.select().from(quests).where(and(eq(quests.id, trigger.questId), eq(quests.userId, automation.userId), isNull(quests.deletedAt))).limit(1);
  if (!anchor) {
    await recordAnchorFailure(automation, trigger, window.due, now);
    return "unavailable";
  }
  const scheduledFor = window.due[window.due.length - 1];
  const context = { ...scheduleOccurrenceContext(trigger, scheduledFor, now), anchorMissionId: trigger.questId, consolidatedOccurrences: window.due.length, missedRunPolicy: trigger.missedRunPolicy };
  const result = await executeAutomation({
    automation,
    quest: anchor,
    triggerType: "schedule",
    idempotencyKey: `schedule:${window.due[0].toISOString()}:${scheduledFor.toISOString()}`,
    triggerContext: context,
    executionDate: context.localDate,
  });
  await advanceSchedule(automation, window.due, window.next, window.exhausted, now);
  return window.exhausted ? "completed" : result.status === "skipped" ? "skipped" : "ran";
}

export async function processDueScheduledAutomations(limit = 25, now = new Date()): Promise<number> {
  const due = await db.select({ id: workflowAutomations.id }).from(workflowAutomations).where(and(
    eq(workflowAutomations.enabled, true),
    lte(workflowAutomations.scheduleNextRunAt, now),
  )).orderBy(asc(workflowAutomations.scheduleNextRunAt), asc(workflowAutomations.id)).limit(limit);
  let processed = 0;
  for (const automation of due) {
    try { if (await processScheduledAutomation(automation.id, now) !== "busy") processed += 1; }
    catch (error) {
      logger.error("Scheduled automation worker failed", { automationId: automation.id, error: error instanceof Error ? error.message : "unknown" });
      await db.update(workflowAutomations).set({ scheduleClaimedAt: null, enabled: false, pauseReason: "SCHEDULE_WORKER_FAILURE", pausedAt: now, updatedAt: now }).where(eq(workflowAutomations.id, automation.id));
    }
  }
  return processed;
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startScheduledAutomationWorker(): void {
  if (timer) return;
  void processDueScheduledAutomations();
  timer = setInterval(() => void processDueScheduledAutomations(), 60_000);
  timer.unref?.();
}

export function stopScheduledAutomationWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
