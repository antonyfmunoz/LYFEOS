import { selectCanonicalHealthRecord } from "./health-import";

export type HealthSourceComparisonRecord = {
  id: string | number;
  metricKey: string;
  displayName: string;
  source: string;
  value: number;
  unit: string;
  observedAt: Date;
  temporalType: string;
  intervalStartAt: Date | null;
  intervalEndAt: Date | null;
  receivedAt: Date;
  method: string | null;
  methodVersion: string | null;
  deviceName: string | null;
};

export function buildHealthSourceComparisons(records: HealthSourceComparisonRecord[], priorities: Record<string, string[]>) {
  const groups = new Map<string, HealthSourceComparisonRecord[]>();
  for (const record of records) {
    const key = `${record.metricKey}\u0000${record.unit}\u0000${record.temporalType}\u0000${record.intervalStartAt?.toISOString() || ""}\u0000${record.intervalEndAt?.toISOString() || ""}\u0000${record.observedAt.toISOString()}`;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  return Array.from(groups.values()).flatMap((group) => {
    if (new Set(group.map((record) => record.source)).size < 2) return [];
    const selected = selectCanonicalHealthRecord(group, priorities[group[0].metricKey] || []);
    return selected.canonical ? [{
      metricKey: group[0].metricKey,
      displayName: group[0].displayName,
      unit: group[0].unit,
      observedAt: group[0].observedAt,
      preferredSources: priorities[group[0].metricKey] || [],
      displayRecord: selected.canonical,
      alternatives: selected.alternatives,
      hasConflict: selected.hasConflict,
      disclosure: "These records have the exact same metric key, unit, temporal type, interval, and observation time. Source priority selects one for display; alternatives remain visible and are not averaged, merged, overwritten, or deleted.",
    }] : [];
  }).sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime());
}
