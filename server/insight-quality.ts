export type ObservedPatternQuality = {
  observations: number;
  availableDays: number;
  coveragePercent: number;
  level: "insufficient" | "limited" | "developing" | "substantial";
  readyToExplore: boolean;
  note: string;
};

/**
 * Describes data sufficiency only. It deliberately does not estimate a causal
 * effect or tell the user what a pair of self-reported signals means.
 */
export function assessObservedPatternQuality(observations: number, availableDays: number): ObservedPatternQuality {
  const safeObservations = Math.max(0, Math.floor(observations));
  const safeDays = Math.max(0, Math.floor(availableDays));
  const coveragePercent = safeDays > 0 ? Math.round((safeObservations / safeDays) * 100) : 0;
  if (safeObservations < 5) {
    return {
      observations: safeObservations, availableDays: safeDays, coveragePercent,
      level: "insufficient", readyToExplore: false,
      note: "At least five complete daily records are needed before LyfeOS shows an observed pattern.",
    };
  }
  if (safeObservations < 10 || coveragePercent < 50) {
    return {
      observations: safeObservations, availableDays: safeDays, coveragePercent,
      level: "limited", readyToExplore: true,
      note: "This is an early, partial record. Treat it as a prompt to notice, not a conclusion.",
    };
  }
  if (safeObservations < 20 || coveragePercent < 70) {
    return {
      observations: safeObservations, availableDays: safeDays, coveragePercent,
      level: "developing", readyToExplore: true,
      note: "The record is developing. Continue logging before making any important interpretation.",
    };
  }
  return {
    observations: safeObservations, availableDays: safeDays, coveragePercent,
    level: "substantial", readyToExplore: true,
    note: "This is a fuller self-reported record, still not evidence of causation or medical guidance.",
  };
}
