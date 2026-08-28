export type ProgressionRank = {
  key: string;
  name: string;
  minLevel: number;
  color: string;
  icon: string;
};

// Rank communicates a sustained execution record inside LyfeOS. It is never a
// claim of a person's worth or of externally certified competence.
export const PROGRESSION_RANKS: readonly ProgressionRank[] = [
  { key: "novice", name: "Novice", minLevel: 1, color: "#9ca3af", icon: "" },
  { key: "apprentice", name: "Apprentice", minLevel: 5, color: "#34d399", icon: "" },
  { key: "warrior", name: "Warrior", minLevel: 10, color: "#60a5fa", icon: "" },
  { key: "elite", name: "Elite", minLevel: 20, color: "#a78bfa", icon: "" },
  { key: "veteran", name: "Veteran", minLevel: 30, color: "#fbbf24", icon: "" },
  { key: "master", name: "Master", minLevel: 40, color: "#f97316", icon: "" },
  { key: "champion", name: "Champion", minLevel: 50, color: "#ef4444", icon: "" },
  { key: "legend", name: "Legend", minLevel: 60, color: "#ec4899", icon: "" },
  { key: "mythic", name: "Mythic", minLevel: 70, color: "#22d3ee", icon: "" },
  { key: "transcendent", name: "Transcendent", minLevel: 80, color: "#10b981", icon: "" },
  { key: "sovereign", name: "Sovereign", minLevel: 90, color: "#f43f5e", icon: "" },
  { key: "monarch", name: "Monarch", minLevel: 100, color: "#FFD700", icon: "" },
] as const;

export function getProgressionRank(level: number): ProgressionRank {
  for (let index = PROGRESSION_RANKS.length - 1; index >= 0; index -= 1) {
    const candidate = PROGRESSION_RANKS[index];
    if (level >= candidate.minLevel) return candidate;
  }
  return PROGRESSION_RANKS[0];
}

export function getNextProgressionRank(level: number): ProgressionRank | null {
  return PROGRESSION_RANKS.find((rank) => rank.minLevel > level) || null;
}

export type ActivityLevelProgress = {
  totalExperience: number;
  level: number;
  currentLevelExperience: number;
  nextLevelExperience: number;
  percent: number;
};

/** One authoritative level curve for server calculations and every client surface. */
export function activityLevelProgress(totalExperience: number): ActivityLevelProgress {
  const boundedTotal = Math.max(0, Math.floor(totalExperience || 0));
  let level = 1;
  let nextLevelExperience = 1000;
  let currentLevelExperience = boundedTotal;
  while (currentLevelExperience >= nextLevelExperience && level < 100) {
    currentLevelExperience -= nextLevelExperience;
    level += 1;
    if (level <= 10) nextLevelExperience = Math.floor(nextLevelExperience * 1.0372);
    else if (level <= 50) nextLevelExperience = Math.floor(nextLevelExperience * 1.0572);
    else nextLevelExperience = Math.floor(nextLevelExperience * 1.0872);
  }
  if (level >= 100) currentLevelExperience = Math.min(currentLevelExperience, nextLevelExperience);
  return {
    totalExperience: boundedTotal,
    level,
    currentLevelExperience,
    nextLevelExperience,
    percent: nextLevelExperience > 0 ? Math.min(100, Math.floor((currentLevelExperience / nextLevelExperience) * 100)) : 100,
  };
}

export function missionExperience(reward: number, difficulty?: string | null): number {
  const multipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  return Math.floor(Math.max(0, reward || 0) * (multipliers[difficulty || "D"] || 1));
}

export type ActivityHistoryEvent = {
  sourceType: string;
  experienceDelta: number;
  sourceOccurredAt: Date;
};

export type ActivityHistoryPoint = {
  date: string;
  earned: number;
  reversed: number;
  net: number;
  cumulative: number;
};

function historyCalendarDate(value: Date, timeZone: string): string {
  try {
    return value.toLocaleDateString("en-CA", { timeZone });
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function addUtcDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a bounded, timezone-local view over the append-only activity ledger.
 * Reversals stay visible on the date they occurred and cumulative XP includes
 * the opening balance, so the last point reconciles to the authoritative total.
 */
export function buildActivityProgressionHistory(
  events: ActivityHistoryEvent[],
  timeZone = "UTC",
  requestedDays = 30,
  now = new Date(),
) {
  const days = Math.min(365, Math.max(7, Math.floor(requestedDays || 30)));
  const endDate = historyCalendarDate(now, timeZone);
  const startDate = addUtcDays(endDate, -(days - 1));
  const buckets = new Map<string, { earned: number; reversed: number; net: number }>();
  const sourceTotals: Record<string, number> = {};
  let openingExperience = 0;
  let eventCount = 0;

  for (const event of events) {
    const date = historyCalendarDate(event.sourceOccurredAt, timeZone);
    if (date < startDate) {
      openingExperience += event.experienceDelta;
      continue;
    }
    if (date > endDate) continue;
    const bucket = buckets.get(date) || { earned: 0, reversed: 0, net: 0 };
    if (event.experienceDelta >= 0) bucket.earned += event.experienceDelta;
    else bucket.reversed += Math.abs(event.experienceDelta);
    bucket.net += event.experienceDelta;
    buckets.set(date, bucket);
    sourceTotals[event.sourceType] = (sourceTotals[event.sourceType] || 0) + event.experienceDelta;
    eventCount += 1;
  }

  let cumulative = Math.max(0, openingExperience);
  const points: ActivityHistoryPoint[] = Array.from({ length: days }, (_, index) => {
    const date = addUtcDays(startDate, index);
    const bucket = buckets.get(date) || { earned: 0, reversed: 0, net: 0 };
    cumulative = Math.max(0, cumulative + bucket.net);
    return { date, ...bucket, cumulative };
  });

  return {
    days,
    startDate,
    endDate,
    eventCount,
    openingExperience: Math.max(0, openingExperience),
    endingExperience: cumulative,
    sourceTotals,
    points,
    disclosure: "Daily activity XP comes from the append-only LyfeOS activity ledger. Reversals remain visible and capability XP is excluded.",
  };
}
