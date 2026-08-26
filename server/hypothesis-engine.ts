import { createHash } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import {
  crossDomainHypotheses,
  crossDomainHypothesisSnapshots,
  hydrationEntries,
  hypothesisDomainConsents,
  quests,
  recoveryActivities,
  sleepSessions,
  userDailyLogs,
  workouts,
} from "@shared/schema";
import {
  HYPOTHESIS_CALCULATION_VERSION,
  HYPOTHESIS_CONSENT_VERSION,
  hypothesisSignal,
  type HypothesisDomain,
  type HypothesisSignal,
} from "@shared/hypotheses";
import { db } from "./db";
import { dateInTimeZone, dayBounds, validTimeZone } from "./health-fitness";
import { aggregateDailyValues, associationFromDailySeries, healthSeriesCoverage, type HealthSeriesPoint } from "./health-insights";
import { logger } from "./utils";

type HypothesisRecord = typeof crossDomainHypotheses.$inferSelect;
type SignalSeries = {
  signal: HypothesisSignal;
  points: HealthSeriesPoint[];
  quality: {
    requestedDays: number;
    recordedDays: number;
    missingDays: number;
    coverage: number;
    provenance: string;
    evidenceQuality: string;
    zeroSemantics: "recorded_zero" | "unknown_when_absent";
    disclosure: string;
  };
};

const DAY_MS = 86_400_000;

function periodWindow(days: number, timeZone: string, now = new Date()) {
  if (!validTimeZone(timeZone)) throw new Error("invalid_time_zone");
  const evidenceEnd = dateInTimeZone(now, timeZone);
  const start = new Date(`${evidenceEnd}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const evidenceStart = start.toISOString().slice(0, 10);
  return {
    evidenceStart,
    evidenceEnd,
    startInstant: dayBounds(evidenceStart, timeZone).start,
    endInstant: dayBounds(evidenceEnd, timeZone).end,
  };
}

function dateKeys(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    return new Date(date.getTime() + index * DAY_MS).toISOString().slice(0, 10);
  });
}

function recordedQuality(signal: HypothesisSignal, points: HealthSeriesPoint[], requestedDays: number, zeroSemantics: SignalSeries["quality"]["zeroSemantics"], disclosure: string): SignalSeries["quality"] {
  const coverage = healthSeriesCoverage(points, [], requestedDays);
  return {
    requestedDays,
    recordedDays: coverage.recordedDays,
    missingDays: coverage.missingDays,
    coverage: coverage.recordedCoverage,
    provenance: signal.provenance,
    evidenceQuality: signal.quality,
    zeroSemantics,
    disclosure,
  };
}

async function loadSignalSeries(userId: number, signalId: string, days: number, timeZone: string): Promise<SignalSeries> {
  const signal = hypothesisSignal(signalId);
  if (!signal) throw new Error("unsupported_signal");
  const window = periodWindow(days, timeZone);
  const dates = dateKeys(window.evidenceStart, days);

  if (signal.id === "missions.completed_count" || signal.id === "missions.created_count") {
    const timestamp = signal.id === "missions.completed_count" ? quests.completedAt : quests.createdAt;
    const rows = await db.select({ occurredAt: timestamp }).from(quests).where(and(
      eq(quests.userId, userId),
      signal.id === "missions.completed_count" ? eq(quests.completed, true) : isNull(quests.deletedAt),
      gte(timestamp, window.startInstant),
      lt(timestamp, window.endInstant),
    ));
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.occurredAt) continue;
      const key = dateInTimeZone(row.occurredAt, timeZone);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const points = dates.map((date) => ({ date, value: counts.get(date) || 0, records: counts.get(date) || 0 }));
    return { signal, points, quality: recordedQuality(signal, points, days, "recorded_zero", "A zero means LyfeOS recorded no matching canonical Mission event that day. Work done outside LyfeOS remains outside this signal.") };
  }

  if (signal.domain === "daily_state") {
    const rows = await db.select({
      date: userDailyLogs.date,
      mental: userDailyLogs.mentalState,
      physical: userDailyLogs.physicalState,
      emotional: userDailyLogs.emotionalState,
      sleepQuality: userDailyLogs.sleepQuality,
    }).from(userDailyLogs).where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, window.evidenceStart), lte(userDailyLogs.date, window.evidenceEnd))).orderBy(asc(userDailyLogs.date));
    const field = signal.id.split(".")[1] as "mental_state" | "physical_state" | "emotional_state" | "sleep_quality";
    const values = rows.flatMap((row) => {
      const value = field === "mental_state" ? row.mental : field === "physical_state" ? row.physical : field === "emotional_state" ? row.emotional : row.sleepQuality;
      return typeof value === "number" && Number.isFinite(value) ? [{ date: row.date, value }] : [];
    });
    const points = aggregateDailyValues(values, "average");
    return { signal, points, quality: recordedQuality(signal, points, days, "unknown_when_absent", "Missing Daily Initialization dates remain unknown. Older daily-state fields may contain the application default when the user did not revise that value.") };
  }

  if (signal.id === "health.workout_minutes") {
    const rows = await db.select({ occurredAt: workouts.occurredAt, value: workouts.durationMinutes }).from(workouts).where(and(eq(workouts.userId, userId), gte(workouts.occurredAt, window.startInstant), lt(workouts.occurredAt, window.endInstant)));
    const points = aggregateDailyValues(rows.flatMap((row) => row.value === null ? [] : [{ date: dateInTimeZone(row.occurredAt, timeZone), value: row.value }]), "sum");
    return { signal, points, quality: recordedQuality(signal, points, days, "unknown_when_absent", "Only workouts with a recorded duration are included. An absent day is unknown, not zero activity.") };
  }
  if (signal.id === "health.recovery_minutes") {
    const rows = await db.select({ occurredAt: recoveryActivities.occurredAt, value: recoveryActivities.durationMinutes }).from(recoveryActivities).where(and(eq(recoveryActivities.userId, userId), gte(recoveryActivities.occurredAt, window.startInstant), lt(recoveryActivities.occurredAt, window.endInstant)));
    const points = aggregateDailyValues(rows.flatMap((row) => row.value === null ? [] : [{ date: dateInTimeZone(row.occurredAt, timeZone), value: row.value }]), "sum");
    return { signal, points, quality: recordedQuality(signal, points, days, "unknown_when_absent", "Only recovery activities with a recorded duration are included. An absent day is unknown, not zero recovery.") };
  }
  if (signal.id === "health.hydration_ml") {
    const rows = await db.select({ occurredAt: hydrationEntries.occurredAt, value: hydrationEntries.volumeMl }).from(hydrationEntries).where(and(eq(hydrationEntries.userId, userId), gte(hydrationEntries.occurredAt, window.startInstant), lt(hydrationEntries.occurredAt, window.endInstant)));
    const points = aggregateDailyValues(rows.map((row) => ({ date: dateInTimeZone(row.occurredAt, timeZone), value: row.value })), "sum");
    return { signal, points, quality: recordedQuality(signal, points, days, "unknown_when_absent", "Only recorded hydration is included. An absent day is unknown, not zero intake.") };
  }
  if (signal.id === "health.sleep_session_minutes") {
    const rows = await db.select({ startedAt: sleepSessions.startedAt, endedAt: sleepSessions.endedAt }).from(sleepSessions).where(and(eq(sleepSessions.userId, userId), gte(sleepSessions.startedAt, window.startInstant), lt(sleepSessions.startedAt, window.endInstant)));
    const points = aggregateDailyValues(rows.map((row) => ({
      date: dateInTimeZone(row.startedAt, timeZone),
      value: Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000)),
    })), "sum");
    return { signal, points, quality: recordedQuality(signal, points, days, "unknown_when_absent", "Only timestamped sleep sessions are included. An absent day is unknown, not zero sleep.") };
  }
  throw new Error("unsupported_signal");
}

export async function currentHypothesisConsents(userId: number): Promise<Record<HypothesisDomain, "enabled" | "revoked">> {
  const rows = await db.select().from(hypothesisDomainConsents).where(and(
    eq(hypothesisDomainConsents.userId, userId),
    inArray(hypothesisDomainConsents.domain, ["missions", "daily_state", "health"]),
  )).orderBy(desc(hypothesisDomainConsents.id));
  const result: Record<HypothesisDomain, "enabled" | "revoked"> = { missions: "revoked", daily_state: "revoked", health: "revoked" };
  const seen = new Set<HypothesisDomain>();
  for (const row of rows) {
    if (row.domain !== "missions" && row.domain !== "daily_state" && row.domain !== "health") continue;
    const domain = row.domain as HypothesisDomain;
    if (seen.has(domain)) continue;
    result[domain] = row.state === "enabled" ? "enabled" : "revoked";
    seen.add(domain);
  }
  return result;
}

export async function recordHypothesisConsent(userId: number, domain: HypothesisDomain, state: "enabled" | "revoked") {
  const [record] = await db.insert(hypothesisDomainConsents).values({ userId, domain, state, policyVersion: HYPOTHESIS_CONSENT_VERSION }).returning();
  if (state === "revoked") {
    const affectedSignals = hypothesisSignalRegistryIdsForDomain(domain);
    await db.update(crossDomainHypotheses).set({ status: "paused", calculationState: "idle", lastErrorCode: "domain_consent_revoked", updatedAt: new Date() }).where(and(
      eq(crossDomainHypotheses.userId, userId),
      inArray(crossDomainHypotheses.leftSignalId, affectedSignals),
    ));
    await db.update(crossDomainHypotheses).set({ status: "paused", calculationState: "idle", lastErrorCode: "domain_consent_revoked", updatedAt: new Date() }).where(and(
      eq(crossDomainHypotheses.userId, userId),
      inArray(crossDomainHypotheses.rightSignalId, affectedSignals),
    ));
  }
  return record;
}

function hypothesisSignalRegistryIdsForDomain(domain: HypothesisDomain): string[] {
  return [
    ...(domain === "missions" ? ["missions.completed_count", "missions.created_count"] : []),
    ...(domain === "daily_state" ? ["daily_state.mental_state", "daily_state.physical_state", "daily_state.emotional_state", "daily_state.sleep_quality"] : []),
    ...(domain === "health" ? ["health.workout_minutes", "health.recovery_minutes", "health.hydration_ml", "health.sleep_session_minutes"] : []),
  ];
}

export async function calculateHypothesis(record: HypothesisRecord, force = false) {
  const leftSignal = hypothesisSignal(record.leftSignalId);
  const rightSignal = hypothesisSignal(record.rightSignalId);
  if (!leftSignal || !rightSignal) throw new Error("unsupported_signal");
  const consents = await currentHypothesisConsents(record.userId);
  if (consents[leftSignal.domain] !== "enabled" || consents[rightSignal.domain] !== "enabled") throw new Error("domain_consent_required");

  const claimWhere = force
    ? and(eq(crossDomainHypotheses.id, record.id), eq(crossDomainHypotheses.userId, record.userId), ne(crossDomainHypotheses.calculationState, "running"))
    : and(eq(crossDomainHypotheses.id, record.id), eq(crossDomainHypotheses.userId, record.userId), eq(crossDomainHypotheses.status, "active"), lte(crossDomainHypotheses.nextCalculationAt, new Date()), ne(crossDomainHypotheses.calculationState, "running"));
  const [claimed] = await db.update(crossDomainHypotheses).set({ calculationState: "running", lastErrorCode: null, updatedAt: new Date() }).where(claimWhere).returning();
  if (!claimed) return null;

  try {
    const [left, right] = await Promise.all([
      loadSignalSeries(record.userId, record.leftSignalId, record.periodDays, record.timeZone),
      loadSignalSeries(record.userId, record.rightSignalId, record.periodDays, record.timeZone),
    ]);
    const calculated = associationFromDailySeries(left.points, right.points, record.periodDays, record.lagDays, 7, 0.2);
    const { aligned: _privateAlignedValues, ...safeResult } = calculated;
    const window = periodWindow(record.periodDays, record.timeZone);
    const dataFingerprint = createHash("sha256").update(JSON.stringify({
      definitionRevision: record.revision,
      left: left.points,
      right: right.points,
      evidenceEnd: window.evidenceEnd,
    })).digest("hex");
    const [snapshot] = await db.insert(crossDomainHypothesisSnapshots).values({
      userId: record.userId,
      hypothesisId: record.id,
      definitionRevision: record.revision,
      calculationVersion: HYPOTHESIS_CALCULATION_VERSION,
      evidenceStart: window.evidenceStart,
      evidenceEnd: window.evidenceEnd,
      result: {
        ...safeResult,
        requestedByUser: true,
        automaticActionTaken: false,
        progressionAwarded: false,
        disclosure: "This is an exploratory association between two user-selected LyfeOS signals. It does not prove cause, predict an outcome, diagnose anything, verify competence, or justify an automatic action.",
      },
      leftQuality: { signal: left.signal, ...left.quality },
      rightQuality: { signal: right.signal, ...right.quality },
      dataFingerprint,
    }).onConflictDoNothing().returning();
    const latest = snapshot || (await db.select().from(crossDomainHypothesisSnapshots).where(and(
      eq(crossDomainHypothesisSnapshots.hypothesisId, record.id),
      eq(crossDomainHypothesisSnapshots.definitionRevision, record.revision),
      eq(crossDomainHypothesisSnapshots.evidenceEnd, window.evidenceEnd),
      eq(crossDomainHypothesisSnapshots.dataFingerprint, dataFingerprint),
    )).limit(1))[0];
    await db.update(crossDomainHypotheses).set({
      calculationState: "idle",
      lastErrorCode: null,
      lastCalculatedAt: new Date(),
      nextCalculationAt: new Date(Date.now() + DAY_MS),
      updatedAt: new Date(),
    }).where(and(eq(crossDomainHypotheses.id, record.id), eq(crossDomainHypotheses.userId, record.userId)));
    return latest;
  } catch (error) {
    const code = error instanceof Error && ["unsupported_signal", "domain_consent_required", "invalid_time_zone"].includes(error.message) ? error.message : "calculation_failed";
    await db.update(crossDomainHypotheses).set({ calculationState: "failed", lastErrorCode: code, nextCalculationAt: new Date(Date.now() + 60 * 60_000), updatedAt: new Date() }).where(eq(crossDomainHypotheses.id, record.id));
    throw error;
  }
}

export async function processDueHypotheses(limit = 20): Promise<number> {
  const due = await db.select().from(crossDomainHypotheses).where(and(
    eq(crossDomainHypotheses.status, "active"),
    lte(crossDomainHypotheses.nextCalculationAt, new Date()),
    ne(crossDomainHypotheses.calculationState, "running"),
  )).orderBy(asc(crossDomainHypotheses.nextCalculationAt), asc(crossDomainHypotheses.id)).limit(limit);
  let processed = 0;
  for (const record of due) {
    try { if (await calculateHypothesis(record)) processed += 1; }
    catch (error) { logger.error("Scheduled hypothesis calculation failed", { hypothesisId: record.id, error: error instanceof Error ? error.message : "unknown" }); }
  }
  return processed;
}

let hypothesisTimer: ReturnType<typeof setInterval> | null = null;
export function startHypothesisWorker(): void {
  if (hypothesisTimer) return;
  void processDueHypotheses();
  hypothesisTimer = setInterval(() => void processDueHypotheses(), 5 * 60_000);
  hypothesisTimer.unref?.();
}

export function stopHypothesisWorker(): void {
  if (hypothesisTimer) clearInterval(hypothesisTimer);
  hypothesisTimer = null;
}
