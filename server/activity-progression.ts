import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { activityLevelProgress, getNextProgressionRank, getProgressionRank, missionExperience } from "@shared/progression";
import { activityProgressionEvents, quests, visionGoals } from "@shared/schema";
import { db } from "./db";

type ProgressionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProgressionExecutor = typeof db | ProgressionTransaction;

type ActivityCandidate = {
  key: string;
  sourceType: "mission" | "vision_goal";
  sourceId: number;
  experience: number;
  reason: string;
  occurredAt: Date;
  evidence: Record<string, unknown>;
};

function calendarDate(value: Date, timeZone: string): string {
  try {
    return value.toLocaleDateString("en-CA", { timeZone });
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

async function activityCandidates(userId: number, executor: ProgressionExecutor): Promise<ActivityCandidate[]> {
  const [completedMissions, completedGoals] = await Promise.all([
    executor.select({
      id: quests.id,
      title: quests.title,
      category: quests.category,
      difficulty: quests.difficulty,
      experienceReward: quests.experienceReward,
      completedAt: quests.completedAt,
    }).from(quests).where(and(eq(quests.userId, userId), eq(quests.completed, true), isNull(quests.deletedAt))),
    executor.select({
      id: visionGoals.id,
      title: visionGoals.title,
      category: visionGoals.category,
      bonusXp: visionGoals.bonusXp,
      completedAt: visionGoals.completedAt,
    }).from(visionGoals).where(and(eq(visionGoals.userId, userId), eq(visionGoals.completed, true))),
  ]);
  return [
    ...completedMissions.flatMap((mission) => mission.completedAt ? [{
      key: `mission:${mission.id}`,
      sourceType: "mission" as const,
      sourceId: mission.id,
      experience: missionExperience(mission.experienceReward, mission.difficulty),
      reason: `Completed mission: ${mission.title}`,
      occurredAt: mission.completedAt,
      evidence: { title: mission.title, category: mission.category || "general", difficulty: mission.difficulty || "D" },
    }] : []),
    ...completedGoals.flatMap((goal) => goal.completedAt && goal.bonusXp > 0 ? [{
      key: `vision_goal:${goal.id}`,
      sourceType: "vision_goal" as const,
      sourceId: goal.id,
      experience: Math.max(0, goal.bonusXp),
      reason: `Completed goal: ${goal.title}`,
      occurredAt: goal.completedAt,
      evidence: { title: goal.title, category: goal.category },
    }] : []),
  ];
}

function streakSummary(events: Array<typeof activityProgressionEvents.$inferSelect>, timeZone: string) {
  const netBySource = new Map<string, number>();
  const practiceDateBySource = new Map<string, string>();
  for (const event of events) {
    const sourceKey = `${event.sourceType}:${event.sourceId}`;
    netBySource.set(sourceKey, (netBySource.get(sourceKey) || 0) + event.experienceDelta);
    const category = (event.evidence as Record<string, unknown>)?.category;
    if (event.sourceType === "mission" && category !== "onboarding" && category !== "todo") {
      practiceDateBySource.set(sourceKey, calendarDate(event.sourceOccurredAt, timeZone));
    }
  }
  const dates = new Set(Array.from(netBySource.entries()).flatMap(([key, net]) => net > 0 && practiceDateBySource.has(key) ? [practiceDateBySource.get(key)!] : []));
  const ordered = Array.from(dates).sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const dateText of ordered) {
    const date = new Date(`${dateText}T00:00:00.000Z`);
    run = previous && (date.getTime() - previous.getTime()) / 86_400_000 === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const todayText = calendarDate(new Date(), timeZone);
  const today = new Date(`${todayText}T00:00:00.000Z`);
  const latestText = ordered.at(-1);
  let current = 0;
  if (latestText) {
    const latest = new Date(`${latestText}T00:00:00.000Z`);
    const gap = Math.floor((today.getTime() - latest.getTime()) / 86_400_000);
    if (gap === 0 || gap === 1) {
      current = 1;
      for (let index = ordered.length - 2; index >= 0; index -= 1) {
        const newer = new Date(`${ordered[index + 1]}T00:00:00.000Z`);
        const older = new Date(`${ordered[index]}T00:00:00.000Z`);
        if ((newer.getTime() - older.getTime()) / 86_400_000 !== 1) break;
        current += 1;
      }
    }
  }
  return { current, longest, activeDays: dates.size, lastPracticeDate: latestText || null };
}

export async function getActivityProgressionSnapshot(
  userId: number,
  executor: ProgressionExecutor = db,
  timeZone = "UTC",
) {
  const events = await executor.select().from(activityProgressionEvents)
    .where(eq(activityProgressionEvents.userId, userId)).orderBy(asc(activityProgressionEvents.id));
  const totalExperience = Math.max(0, events.reduce((total, event) => total + event.experienceDelta, 0));
  const levelProgress = activityLevelProgress(totalExperience);
  const rank = getProgressionRank(levelProgress.level);
  const nextRank = getNextProgressionRank(levelProgress.level);
  const sourceTotals = events.reduce((totals, event) => {
    totals[event.sourceType] = (totals[event.sourceType] || 0) + event.experienceDelta;
    return totals;
  }, {} as Record<string, number>);
  return {
    ...levelProgress,
    rank,
    nextRank,
    levelsToNextRank: nextRank ? nextRank.minLevel - levelProgress.level : 0,
    sourceTotals,
    streak: streakSummary(events, timeZone),
    recentEvents: [...events].reverse().slice(0, 20).map((event) => ({
      id: event.id,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      action: event.action,
      experienceDelta: event.experienceDelta,
      reason: event.reason,
      evidence: event.evidence,
      occurredAt: event.sourceOccurredAt,
      recordedAt: event.createdAt,
    })),
  };
}

/** Reconciles canonical completion state into an immutable, reversible XP ledger. */
export async function reconcileActivityProgression(userId: number, timeZone = "UTC") {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1280922708, ${userId})`);
    const [candidates, priorEvents] = await Promise.all([
      activityCandidates(userId, tx),
      tx.select().from(activityProgressionEvents).where(eq(activityProgressionEvents.userId, userId)).orderBy(asc(activityProgressionEvents.id)),
    ]);
    const desired = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    const history = new Map<string, typeof priorEvents>();
    for (const event of priorEvents) {
      const key = `${event.sourceType}:${event.sourceId}`;
      history.set(key, [...(history.get(key) || []), event]);
    }
    const inserts: Array<typeof activityProgressionEvents.$inferInsert> = [];
    for (const candidate of candidates) {
      const events = history.get(candidate.key) || [];
      const net = events.reduce((total, event) => total + event.experienceDelta, 0);
      if (net > 0 && net !== candidate.experience) {
        const earned = [...events].reverse().find((event) => event.action === "earned");
        if (earned) {
          inserts.push({
            userId,
            eventKey: `activity:${userId}:${candidate.key}:reversed:${earned.id}:value-change`,
            sourceType: candidate.sourceType,
            sourceId: candidate.sourceId,
            action: "reversed",
            experienceDelta: -net,
            reason: `Reversed prior activity XP because the supporting ${candidate.sourceType === "mission" ? "mission" : "goal"} value changed.`,
            evidence: { ...(earned.evidence as Record<string, unknown>), reversalReason: "supporting_value_changed", priorExperience: net },
            reversalOfId: earned.id,
            sourceOccurredAt: new Date(),
          });
          const generation = events.filter((event) => event.action === "earned").length + 1;
          inserts.push({
            userId,
            eventKey: `activity:${userId}:${candidate.key}:earned:${generation}`,
            sourceType: candidate.sourceType,
            sourceId: candidate.sourceId,
            action: "earned",
            experienceDelta: candidate.experience,
            reason: candidate.reason,
            evidence: { ...candidate.evidence, replacesExperience: net },
            sourceOccurredAt: candidate.occurredAt,
          });
          continue;
        }
      }
      if (net <= 0 && candidate.experience > 0) {
        const generation = events.filter((event) => event.action === "earned").length + 1;
        inserts.push({
          userId,
          eventKey: `activity:${userId}:${candidate.key}:earned:${generation}`,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          action: "earned",
          experienceDelta: candidate.experience,
          reason: candidate.reason,
          evidence: candidate.evidence,
          sourceOccurredAt: candidate.occurredAt,
        });
      }
    }
    for (const [key, events] of Array.from(history.entries())) {
      const net = events.reduce((total, event) => total + event.experienceDelta, 0);
      if (!desired.has(key) && net > 0) {
        const earned = [...events].reverse().find((event) => event.action === "earned");
        if (earned) inserts.push({
          userId,
          eventKey: `activity:${userId}:${key}:reversed:${earned.id}`,
          sourceType: earned.sourceType,
          sourceId: earned.sourceId,
          action: "reversed",
          experienceDelta: -net,
          reason: `Reversed activity XP because the supporting ${earned.sourceType === "mission" ? "mission" : "goal"} is no longer complete.`,
          evidence: { ...(earned.evidence as Record<string, unknown>), reversalReason: "supporting_record_not_complete" },
          reversalOfId: earned.id,
          sourceOccurredAt: new Date(),
        });
      }
    }
    if (inserts.length) await tx.insert(activityProgressionEvents).values(inserts).onConflictDoNothing();
    return getActivityProgressionSnapshot(userId, tx, timeZone);
  });
}
