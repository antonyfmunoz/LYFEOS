export type HealthSeriesPoint = { date: string; value: number; records: number };
export type HealthObservationAggregationKind = "sum" | "average" | "latest";
export type HealthSeriesCoverage = { requestedDays: number; recordedDays: number; missingDays: number; withheldDays: number; recordedCoverage: number };

export function healthSeriesCoverage(points: HealthSeriesPoint[], omittedDates: readonly string[], requestedDays: number): HealthSeriesCoverage {
  if (!Number.isInteger(requestedDays) || requestedDays < 1) throw new Error("requestedDays must be a positive whole number");
  const recordedDays = new Set(points.map((point) => point.date)).size;
  const withheldDays = new Set(omittedDates).size;
  return {
    requestedDays,
    recordedDays,
    missingDays: Math.max(0, requestedDays - recordedDays - withheldDays),
    withheldDays,
    recordedCoverage: Number((recordedDays / requestedDays).toFixed(4)),
  };
}

export function aggregateDailyValues(
  rows: Array<{ date: string; value: number }>,
  mode: "sum" | "average",
): HealthSeriesPoint[] {
  const daily = new Map<string, { total: number; records: number }>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.value)) continue;
    const current = daily.get(row.date) || { total: 0, records: 0 };
    daily.set(row.date, { total: current.total + row.value, records: current.records + 1 });
  }
  return Array.from(daily.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({
    date,
    value: mode === "average" ? value.total / value.records : value.total,
    records: value.records,
  }));
}

export function aggregateObservationDailyValues(
  rows: Array<{
    date: string;
    value: number;
    observedAt: Date;
    temporalType: string;
    intervalStartAt: Date | null;
    intervalEndAt: Date | null;
    intervalStartDate: string | null;
    intervalEndDate: string | null;
  }>,
  mode: HealthObservationAggregationKind,
) {
  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.value)) continue;
    byDate.set(row.date, [...(byDate.get(row.date) || []), row]);
  }
  const points: HealthSeriesPoint[] = [];
  const omittedAmbiguousDates: string[] = [];
  for (const [date, daily] of Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    if (mode === "sum") {
      const intervals = daily.filter((row) => row.temporalType === "interval");
      const hasIncompleteInterval = intervals.some((row) => !row.intervalStartAt || !row.intervalEndAt);
      const crossesCalendarDay = intervals.some((row) => row.intervalStartDate !== date || row.intervalEndDate !== date);
      const mixesTemporalTypes = intervals.length > 0 && intervals.length !== daily.length;
      const ordered = intervals.slice().sort((left, right) => left.intervalStartAt!.getTime() - right.intervalStartAt!.getTime());
      const overlaps = ordered.some((row, index) => index > 0 && row.intervalStartAt!.getTime() < ordered[index - 1].intervalEndAt!.getTime());
      if (hasIncompleteInterval || crossesCalendarDay || mixesTemporalTypes || overlaps) {
        omittedAmbiguousDates.push(date);
        continue;
      }
      points.push({ date, value: daily.reduce((total, row) => total + row.value, 0), records: daily.length });
      continue;
    }
    if (mode === "latest") {
      const latest = daily.slice().sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0];
      points.push({ date, value: latest.value, records: daily.length });
      continue;
    }
    points.push({ date, value: daily.reduce((total, row) => total + row.value, 0) / daily.length, records: daily.length });
  }
  return {
    points,
    omittedAmbiguousDates,
    disclosure: omittedAmbiguousDates.length
      ? "Additive totals omit dates containing overlapping, mixed, incomplete, or cross-calendar-day intervals because LyfeOS cannot allocate them without guessing. Source records remain available."
      : "Daily values use the recorded aggregation method and preserve missing dates.",
  };
}

export function rollingAverage(points: HealthSeriesPoint[], window = 7): Array<HealthSeriesPoint & { rollingAverage: number | null }> {
  return points.map((point, index) => {
    const values = points.slice(Math.max(0, index - window + 1), index + 1).map((item) => item.value);
    return { ...point, rollingAverage: values.length === window ? values.reduce((sum, value) => sum + value, 0) / window : null };
  });
}

export function associationFromDailySeries(
  left: HealthSeriesPoint[],
  right: HealthSeriesPoint[],
  requestedDays: number,
  lagDays = 0,
  minimumSamples = 7,
  minimumCoverage = 0.2,
) {
  if (!Number.isInteger(lagDays) || Math.abs(lagDays) > 30) throw new Error("lagDays must be a whole number from -30 through 30");
  if (!Number.isInteger(requestedDays) || requestedDays < 1) throw new Error("requestedDays must be a positive whole number");
  const shiftDate = (date: string, offset: number) => {
    const shifted = new Date(`${date}T00:00:00.000Z`);
    shifted.setUTCDate(shifted.getUTCDate() + offset);
    return shifted.toISOString().slice(0, 10);
  };
  const invalidValues = [...left, ...right].filter((point) => !Number.isFinite(point.value));
  const duplicateDates = (points: HealthSeriesPoint[]) => points.length - new Set(points.map((point) => point.date)).size;
  const leftDuplicateDates = duplicateDates(left);
  const rightDuplicateDates = duplicateDates(right);
  if (invalidValues.length || leftDuplicateDates || rightDuplicateDates) {
    const reasons = [
      ...(invalidValues.length ? ["Every selected daily value must be a finite number."] : []),
      ...(leftDuplicateDates || rightDuplicateDates ? ["Each selected series must contain at most one value for each local-calendar date."] : []),
    ];
    return {
      status: "insufficient" as const, pairedSamples: 0, coverage: 0, reasons, aligned: [],
      diagnostics: { requestedDays, comparableDays: Math.max(1, requestedDays - Math.abs(lagDays)), leftRecordedDays: left.length, rightRecordedDays: right.length, pairedDays: 0, unpairedLeftRecordedDays: left.length, unpairedRightRecordedDays: right.length, missingValuesImputed: false },
    };
  }
  const rightByDate = new Map(right.map((point) => [point.date, point.value]));
  const aligned = left.flatMap((point) => {
    const rightDate = shiftDate(point.date, lagDays);
    return rightByDate.has(rightDate) ? [{ leftDate: point.date, rightDate, left: point.value, right: rightByDate.get(rightDate)! }] : [];
  });
  const comparableDays = Math.max(1, requestedDays - Math.abs(lagDays));
  const coverage = Math.min(1, aligned.length / comparableDays);
  const leftDates = new Set(left.map((point) => point.date));
  const diagnostics = {
    requestedDays,
    comparableDays,
    leftRecordedDays: left.length,
    rightRecordedDays: right.length,
    pairedDays: aligned.length,
    unpairedLeftRecordedDays: left.filter((point) => !rightByDate.has(shiftDate(point.date, lagDays))).length,
    unpairedRightRecordedDays: right.filter((point) => !leftDates.has(shiftDate(point.date, -lagDays))).length,
    missingValuesImputed: false,
  };
  const reasons: string[] = [];
  if (aligned.length < minimumSamples) reasons.push(`At least ${minimumSamples} aligned days are required.`);
  if (coverage < minimumCoverage) reasons.push(`Aligned coverage must be at least ${Math.round(minimumCoverage * 100)}% of the selected period.`);
  if (reasons.length) return { status: "insufficient" as const, pairedSamples: aligned.length, coverage, reasons, aligned, diagnostics };
  // Pearson is scale invariant. Normalizing first avoids overflow for large but
  // finite source values while preserving the same mathematical association.
  const leftScale = Math.max(...aligned.map((point) => Math.abs(point.left)), 1);
  const rightScale = Math.max(...aligned.map((point) => Math.abs(point.right)), 1);
  const normalized = aligned.map((point) => ({ left: point.left / leftScale, right: point.right / rightScale }));
  const leftMean = normalized.reduce((sum, point) => sum + point.left, 0) / normalized.length;
  const rightMean = normalized.reduce((sum, point) => sum + point.right, 0) / normalized.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (const point of normalized) {
    const leftDelta = point.left - leftMean;
    const rightDelta = point.right - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta ** 2;
    rightSquares += rightDelta ** 2;
  }
  if (leftSquares === 0 || rightSquares === 0) return { status: "insufficient" as const, pairedSamples: aligned.length, coverage, reasons: ["At least one selected series has no variation in the aligned period."], aligned, diagnostics };
  const coefficient = Math.max(-1, Math.min(1, numerator / Math.sqrt(leftSquares * rightSquares)));
  const magnitude = Math.abs(coefficient) < 0.3 ? "small" : Math.abs(coefficient) < 0.5 ? "moderate" : "large";
  const direction = coefficient < 0 ? "inverse" : "same-direction";
  // Fisher's z interval estimates sampling uncertainty for the mathematical
  // association under strong assumptions. It cannot establish causation,
  // clinical meaning, prediction quality, or source accuracy.
  const boundedCoefficient = Math.max(-0.999999999999, Math.min(0.999999999999, coefficient));
  const fisherZ = Math.atanh(boundedCoefficient);
  const fisherStandardError = 1 / Math.sqrt(aligned.length - 3);
  const uncertaintyLower = Math.tanh(fisherZ - 1.96 * fisherStandardError);
  const uncertaintyUpper = Math.tanh(fisherZ + 1.96 * fisherStandardError);
  return {
    status: "available" as const,
    pairedSamples: aligned.length,
    coverage,
    coefficient: Math.round(coefficient * 1000) / 1000,
    magnitude,
    direction,
    uncertainty: {
      method: "fisher_z_approximation" as const,
      confidenceLevel: 0.95,
      lower: Math.round(uncertaintyLower * 1000) / 1000,
      upper: Math.round(uncertaintyUpper * 1000) / 1000,
      assumptions: ["paired daily values are independent", "the relationship is approximately linear", "the selected recorded days are representative"],
      disclosure: "This interval quantifies sampling uncertainty only under its stated assumptions. It does not account for confounding, measurement error, missing-not-at-random data, repeated comparisons, or causation.",
    },
    aligned,
    diagnostics,
    disclosure: "This is a Pearson association for the one user-selected day alignment. It is exploratory, user-specific, sensitive to missing data, repeated testing, and confounders, and is not proof that either series caused the other.",
  };
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function comparisonCsv(input: {
  dates: string[];
  left: { label: string; unit: string; points: HealthSeriesPoint[] };
  right?: { label: string; unit: string; points: HealthSeriesPoint[] } | null;
}): string {
  const left = new Map(input.left.points.map((point) => [point.date, point]));
  const right = input.right ? new Map(input.right.points.map((point) => [point.date, point])) : null;
  const headers = ["date", `${input.left.label} (${input.left.unit})`, `${input.left.label} records`];
  if (input.right) headers.push(`${input.right.label} (${input.right.unit})`, `${input.right.label} records`);
  const rows = input.dates.map((date) => {
    const values: Array<string | number | null> = [date, left.get(date)?.value ?? null, left.get(date)?.records ?? null];
    if (right) values.push(right.get(date)?.value ?? null, right.get(date)?.records ?? null);
    return values.map(csvCell).join(",");
  });
  return [headers.map(csvCell).join(","), ...rows].join("\n");
}
