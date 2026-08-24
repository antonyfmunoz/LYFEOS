import type { UserDailyLog, UserProfile, UserStats } from "@shared/schema";

export type PlanningContextSnapshot = {
  capturedAt: string;
  focus: string | null;
  declaredWeeklyHours: number | null;
  capacity: {
    energy: number | null;
    time: number | null;
    attention: number | null;
    availability: "low" | "steady" | "high" | "unknown";
  };
  dailyState: {
    mental: number | null;
    physical: number | null;
    emotional: number | null;
  } | null;
  constraints: string[];
};

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedState(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 1 && number <= 10 ? number : null;
}

function percent(current: number | null | undefined, maximum: number | null | undefined): number | null {
  if (typeof current !== "number" || typeof maximum !== "number" || maximum <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((current / maximum) * 100)));
}

/**
 * A deliberately small, user-owned planning snapshot. It records the inputs
 * behind a proposed focus without claiming that a score diagnoses wellbeing or
 * dictates what the user must do.
 */
export function buildPlanningContextSnapshot(input: {
  profile?: UserProfile;
  stats?: UserStats;
  dailyLog?: UserDailyLog;
  capturedAt?: Date;
}): PlanningContextSnapshot {
  const weeklyCapacity = input.profile?.weeklyCapacity as { hours?: unknown; cap?: unknown } | null | undefined;
  const declaredWeeklyHours = finiteNumber(weeklyCapacity?.hours);
  const energy = percent(input.stats?.energyPointsCurrent, input.stats?.energyPointsMax);
  const time = percent(input.stats?.timeTokensCurrent, input.stats?.timeTokensMax);
  const attention = percent(input.stats?.attentionTokensCurrent, input.stats?.attentionTokensMax);
  const available = [energy, time, attention].filter((value): value is number => value !== null);
  const averageAvailability = available.length > 0
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : null;
  const availability = averageAvailability === null
    ? "unknown"
    : averageAvailability < 35
      ? "low"
      : averageAvailability < 70
        ? "steady"
        : "high";

  const dailyStateValues = {
    mental: boundedState(input.dailyLog?.mentalState),
    physical: boundedState(input.dailyLog?.physicalState),
    emotional: boundedState(input.dailyLog?.emotionalState),
  };
  const hasDailyState = Object.values(dailyStateValues).some((value) => value !== null);
  const constraints = [
    cleanText(weeklyCapacity?.cap),
    cleanText(input.profile?.lockedHabit),
    cleanText(input.profile?.physicalEnvironmentImpact),
  ].filter((value): value is string => value !== null).slice(0, 3);

  return {
    capturedAt: (input.capturedAt || new Date()).toISOString(),
    focus: cleanText(input.profile?.desiredTrait)
      || cleanText(input.profile?.primaryCraft)
      || cleanText(input.profile?.vision90Day),
    declaredWeeklyHours,
    capacity: { energy, time, attention, availability },
    dailyState: hasDailyState ? dailyStateValues : null,
    constraints,
  };
}
