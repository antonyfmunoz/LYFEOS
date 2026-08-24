import { and, asc, eq, sql } from "drizzle-orm";
import {
  bodyMeasurements, healthBadgeEvents, healthObservations, healthPracticeReviews, healthProgressionEvents, hydrationEntries,
  nutritionDiaryEntries, recoveryActivities, sleepSessions, userDailyLogs, workouts,
} from "@shared/schema";
import { db } from "./db";
import { dateInTimeZone, sleepDurationMinutes } from "./health-fitness";
import { logger } from "./utils";
import { groupedHealthPracticeCandidates, healthBadgeCandidates, healthBadgeDefinitions, healthPracticeRank, healthPracticeRanks, healthPracticeRules, weeklyHealthReviewCandidates, type HealthPracticeCandidate } from "./health-progression-rules";
export { isHealthEvidenceMutation } from "./health-progression-rules";

type HealthProgressionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HealthProgressionExecutor = typeof db | HealthProgressionTransaction;

async function currentHealthCandidates(userId: number, executor: HealthProgressionExecutor = db): Promise<HealthPracticeCandidate[]> {
  const [hydration, nutrition, training, recovery, measurements, observations, dailyLogs, sessions, reviews] = await Promise.all([
    executor.select({ occurredAt: hydrationEntries.occurredAt, timeZone: hydrationEntries.recordedTimeZone }).from(hydrationEntries).where(eq(hydrationEntries.userId, userId)),
    executor.select({ occurredAt: nutritionDiaryEntries.occurredAt, timeZone: nutritionDiaryEntries.recordedTimeZone }).from(nutritionDiaryEntries).where(eq(nutritionDiaryEntries.userId, userId)),
    executor.select({ occurredAt: workouts.occurredAt, timeZone: workouts.recordedTimeZone }).from(workouts).where(eq(workouts.userId, userId)),
    executor.select({ occurredAt: recoveryActivities.occurredAt, timeZone: recoveryActivities.recordedTimeZone }).from(recoveryActivities).where(eq(recoveryActivities.userId, userId)),
    executor.select({ observedAt: bodyMeasurements.observedAt }).from(bodyMeasurements).where(eq(bodyMeasurements.userId, userId)),
    executor.select({ observedAt: healthObservations.observedAt, timeZone: healthObservations.recordedTimeZone }).from(healthObservations).where(eq(healthObservations.userId, userId)),
    executor.select({ date: userDailyLogs.date, sleepTime: userDailyLogs.sleepTime, wakeTime: userDailyLogs.wakeTime }).from(userDailyLogs).where(eq(userDailyLogs.userId, userId)),
    executor.select({ startedAt: sleepSessions.startedAt, timeZone: sleepSessions.recordedTimeZone }).from(sleepSessions).where(eq(sleepSessions.userId, userId)),
    executor.select({ reviewDate: healthPracticeReviews.reviewDate }).from(healthPracticeReviews).where(eq(healthPracticeReviews.userId, userId)),
  ]);
  return [
    ...groupedHealthPracticeCandidates("hydration_day", hydration.map((row) => dateInTimeZone(row.occurredAt, row.timeZone || "UTC"))),
    ...groupedHealthPracticeCandidates("nutrition_day", nutrition.map((row) => dateInTimeZone(row.occurredAt, row.timeZone || "UTC"))),
    ...groupedHealthPracticeCandidates("workout_day", training.map((row) => dateInTimeZone(row.occurredAt, row.timeZone || "UTC"))),
    ...groupedHealthPracticeCandidates("recovery_day", recovery.map((row) => dateInTimeZone(row.occurredAt, row.timeZone || "UTC"))),
    ...groupedHealthPracticeCandidates("body_measurement_day", measurements.map((row) => String(row.observedAt))),
    ...groupedHealthPracticeCandidates("metric_observation_day", observations.map((row) => dateInTimeZone(row.observedAt, row.timeZone || "UTC"))),
    ...groupedHealthPracticeCandidates("sleep_record_day", [
      ...dailyLogs.flatMap((row) => sleepDurationMinutes(row.sleepTime, row.wakeTime) === null ? [] : [String(row.date)]),
      ...sessions.map((row) => dateInTimeZone(row.startedAt, row.timeZone || "UTC")),
    ]),
    ...weeklyHealthReviewCandidates(reviews.map((row) => String(row.reviewDate))),
  ];
}

export async function reconcileHealthProgression(userId: number) {
  return db.transaction(async (tx) => {
  // One user-scoped ledger writer at a time across every application process.
  // The lock is released automatically on commit/rollback; no health values
  // or derived scores are placed in the lock key.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(1280922707, ${userId})`);
  const candidates = await currentHealthCandidates(userId, tx);
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const priorEvents = await tx.select().from(healthProgressionEvents).where(eq(healthProgressionEvents.userId, userId)).orderBy(asc(healthProgressionEvents.id));
  const eventsByKey = new Map<string, typeof priorEvents>();
  for (const event of priorEvents) {
    const logicalKey = `${event.ruleKey}:${event.evidenceDate}`;
    eventsByKey.set(logicalKey, [...(eventsByKey.get(logicalKey) || []), event]);
  }
  const eventInserts: Array<typeof healthProgressionEvents.$inferInsert> = [];
  for (const candidate of candidates) {
    const existing = eventsByKey.get(candidate.key) || [];
    const net = existing.reduce((sum, event) => sum + event.xpDelta, 0);
    if (net <= 0) {
      const generation = existing.filter((event) => event.action === "earned").length + 1;
      eventInserts.push({
        userId, eventKey: `health:${candidate.key}:earned:${generation}`, ruleKey: candidate.ruleKey,
        evidenceDate: candidate.evidenceDate, xpDelta: candidate.xp, action: "earned", evidence: candidate.evidence,
      });
    }
  }
  for (const [logicalKey, existing] of Array.from(eventsByKey.entries())) {
    const net = existing.reduce((sum, event) => sum + event.xpDelta, 0);
    if (!candidateByKey.has(logicalKey) && net > 0) {
      const earned = [...existing].reverse().find((event) => event.action === "earned");
      if (earned) eventInserts.push({
        userId, eventKey: `health:${logicalKey}:reversed:${earned.id}`, ruleKey: earned.ruleKey,
        evidenceDate: earned.evidenceDate, xpDelta: -net, action: "reversed",
        evidence: { reason: "underlying_records_removed" }, reversalOfId: earned.id,
      });
    }
  }
  if (eventInserts.length) await tx.insert(healthProgressionEvents).values(eventInserts).onConflictDoNothing();

  const badgeCandidates = healthBadgeCandidates(candidates);
  const desiredBadges = new Map(badgeCandidates.map((badge) => [badge.key, badge]));
  const priorBadgeEvents = await tx.select().from(healthBadgeEvents).where(eq(healthBadgeEvents.userId, userId)).orderBy(asc(healthBadgeEvents.id));
  const badgeHistory = new Map<string, typeof priorBadgeEvents>();
  for (const event of priorBadgeEvents) badgeHistory.set(event.badgeKey, [...(badgeHistory.get(event.badgeKey) || []), event]);
  const badgeInserts: Array<typeof healthBadgeEvents.$inferInsert> = [];
  for (const badge of badgeCandidates) {
    const history = badgeHistory.get(badge.key) || [];
    if (history.at(-1)?.action !== "awarded") badgeInserts.push({ userId, eventKey: `health-badge:${badge.key}:awarded:${history.length + 1}`, badgeKey: badge.key, action: "awarded", evidence: badge.evidence });
  }
  for (const [badgeKey, history] of Array.from(badgeHistory.entries())) {
    if (!desiredBadges.has(badgeKey as keyof typeof healthBadgeDefinitions) && history.at(-1)?.action === "awarded") badgeInserts.push({ userId, eventKey: `health-badge:${badgeKey}:reversed:${history.length + 1}`, badgeKey, action: "reversed", evidence: { reason: "qualifying_evidence_removed" } });
  }
  if (badgeInserts.length) await tx.insert(healthBadgeEvents).values(badgeInserts).onConflictDoNothing();
  return getHealthProgressionSummary(userId, tx);
  });
}

export async function getHealthProgressionSummary(userId: number, executor: HealthProgressionExecutor = db) {
  const [events, badgeEvents] = await Promise.all([
    executor.select().from(healthProgressionEvents).where(eq(healthProgressionEvents.userId, userId)).orderBy(asc(healthProgressionEvents.id)),
    executor.select().from(healthBadgeEvents).where(eq(healthBadgeEvents.userId, userId)).orderBy(asc(healthBadgeEvents.id)),
  ]);
  const practiceXp = Math.max(0, events.reduce((sum, event) => sum + event.xpDelta, 0));
  const currentBadges = new Map<string, typeof badgeEvents[number]>();
  for (const event of badgeEvents) currentBadges.set(event.badgeKey, event);
  const badges = Array.from(currentBadges.values()).flatMap((event) => {
    const definition = healthBadgeDefinitions[event.badgeKey as keyof typeof healthBadgeDefinitions];
    return event.action === "awarded" && definition ? [{ key: event.badgeKey, ...definition, evidence: event.evidence, awardedAt: event.createdAt }] : [];
  });
  return {
    practiceXp, rank: healthPracticeRank(practiceXp), nextRank: healthPracticeRanks.find((rank) => rank.minimumXp > practiceXp) || null, badges,
    events: [...events].reverse().slice(0, 50).map((event) => ({ ...event, label: healthPracticeRules[event.ruleKey as keyof typeof healthPracticeRules]?.label || event.ruleKey })),
    disclosure: "Health practice XP and badges recognize LyfeOS-recorded process only. They do not measure health, competence, readiness, treatment response, or personal worth. Deleted qualifying records create reversing ledger events.",
  };
}

const reconcileTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function scheduleHealthProgressionReconcile(userId: number): void {
  const existing = reconcileTimers.get(userId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    reconcileTimers.delete(userId);
    void reconcileHealthProgression(userId).catch((error) => logger.error("Health progression reconciliation failed", { userId, error }));
  }, 250);
  timer.unref?.();
  reconcileTimers.set(userId, timer);
}
