import { aggregateObservationDailyValues, type HealthObservationAggregationKind } from "./health-insights";
import { canonicalHealthMetricDefinition } from "./health-provider-metrics";

export const activitySignalMetricKeys = ["steps", "active_energy", "distance"] as const;

export type ActivitySignalRow = {
  id: number;
  metricKey: string;
  displayName: string;
  unit: string;
  source: string;
  value: number;
  observedAt: Date;
  date: string;
  temporalType: string;
  intervalStartAt: Date | null;
  intervalEndAt: Date | null;
  intervalStartDate: string | null;
  intervalEndDate: string | null;
  includedInCalculations: boolean;
};

export function buildActivitySignalSeries(rows: ActivitySignalRow[], sourcePriorities: Record<string, string[]>) {
  const allowed = new Set<string>(activitySignalMetricKeys);
  const groups = new Map<string, ActivitySignalRow[]>();
  for (const row of rows) {
    if (!allowed.has(row.metricKey) || !Number.isFinite(row.value)) continue;
    const definition = canonicalHealthMetricDefinition(row.metricKey);
    if (!definition || definition.canonicalUnit !== row.unit) continue;
    const key = `${row.metricKey}\u0000${row.unit}\u0000${row.source}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  return Array.from(groups.values()).map((group) => {
    const definition = canonicalHealthMetricDefinition(group[0].metricKey)!;
    const included = group.filter((row) => row.includedInCalculations);
    const aggregation = aggregateObservationDailyValues(included, definition.aggregation as HealthObservationAggregationKind);
    const preferredSources = sourcePriorities[group[0].metricKey] || [];
    return {
      metricKey: group[0].metricKey,
      displayName: definition.displayName,
      unit: definition.canonicalUnit,
      source: group[0].source,
      aggregation: definition.aggregation,
      preferred: preferredSources[0] === group[0].source,
      sourcePriority: preferredSources.indexOf(group[0].source),
      recordedRecords: group.length,
      includedRecords: included.length,
      excludedRecords: group.length - included.length,
      points: aggregation.points,
      omittedAmbiguousDates: aggregation.omittedAmbiguousDates,
      disclosure: aggregation.disclosure,
    };
  }).sort((left, right) => {
    if (left.metricKey !== right.metricKey) return activitySignalMetricKeys.indexOf(left.metricKey as typeof activitySignalMetricKeys[number]) - activitySignalMetricKeys.indexOf(right.metricKey as typeof activitySignalMetricKeys[number]);
    const leftRank = left.sourcePriority < 0 ? Number.MAX_SAFE_INTEGER : left.sourcePriority;
    const rightRank = right.sourcePriority < 0 ? Number.MAX_SAFE_INTEGER : right.sourcePriority;
    return leftRank - rightRank || left.source.localeCompare(right.source);
  });
}
