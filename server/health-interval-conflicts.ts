export type HealthIntervalConflictRecord = {
  id: number;
  metricKey: string;
  displayName: string;
  unit: string;
  source: string;
  value: number;
  temporalType: string;
  aggregationKind: string;
  intervalStartAt: Date | string | null;
  intervalEndAt: Date | string | null;
  method: string | null;
  methodVersion: string | null;
  deviceName: string | null;
  includedInCalculations: boolean;
};

export type HealthIntervalConflictGroup = {
  id: string;
  metricKey: string;
  displayName: string;
  unit: string;
  source: string;
  resolved: boolean;
  records: Array<HealthIntervalConflictRecord & { intervalStartAt: string; intervalEndAt: string }>;
};

function intervalsOverlap(left: { intervalStartAt: string; intervalEndAt: string }, right: { intervalStartAt: string; intervalEndAt: string }): boolean {
  return new Date(left.intervalStartAt).getTime() < new Date(right.intervalEndAt).getTime()
    && new Date(right.intervalStartAt).getTime() < new Date(left.intervalEndAt).getTime();
}

export function buildHealthIntervalConflictGroups(records: HealthIntervalConflictRecord[]): HealthIntervalConflictGroup[] {
  const eligible = records.flatMap((record) => {
    if (record.temporalType !== "interval" || record.aggregationKind !== "sum" || !record.intervalStartAt || !record.intervalEndAt) return [];
    const start = new Date(record.intervalStartAt);
    const end = new Date(record.intervalEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const intervalStartAt = start.toISOString();
    const intervalEndAt = end.toISOString();
    if (intervalStartAt >= intervalEndAt) return [];
    return [{ ...record, intervalStartAt, intervalEndAt }];
  });
  const bySeries = new Map<string, typeof eligible>();
  for (const record of eligible) {
    const key = `${record.metricKey}\u0000${record.unit}\u0000${record.source}`;
    bySeries.set(key, [...(bySeries.get(key) || []), record]);
  }

  const groups: HealthIntervalConflictGroup[] = [];
  for (const seriesRecords of Array.from(bySeries.values())) {
    const sorted = [...seriesRecords].sort((left, right) => left.intervalStartAt.localeCompare(right.intervalStartAt) || left.intervalEndAt.localeCompare(right.intervalEndAt) || left.id - right.id);
    let component: typeof sorted = [];
    let componentEnd = "";
    const finish = () => {
      if (component.length < 2) return;
      const included = component.filter((record) => record.includedInCalculations);
      const hasIncludedOverlap = included.some((record, index) => included.slice(index + 1).some((other) => intervalsOverlap(record, other)));
      const first = component[0];
      groups.push({
        id: `${first.metricKey}:${first.unit}:${first.source}:${component.map((record) => record.id).join("-")}`,
        metricKey: first.metricKey,
        displayName: first.displayName,
        unit: first.unit,
        source: first.source,
        resolved: !hasIncludedOverlap,
        records: component,
      });
    };
    for (const record of sorted) {
      if (!component.length || record.intervalStartAt < componentEnd) {
        component.push(record);
        if (record.intervalEndAt > componentEnd) componentEnd = record.intervalEndAt;
      } else {
        finish();
        component = [record];
        componentEnd = record.intervalEndAt;
      }
    }
    finish();
  }
  return groups.sort((left, right) => right.records[0].intervalEndAt.localeCompare(left.records[0].intervalEndAt));
}
