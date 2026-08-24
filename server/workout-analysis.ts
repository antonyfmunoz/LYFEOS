export type PerformedSet = {
  occurredAt: Date;
  exerciseName: string;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  completed: boolean;
};

export type ExerciseProgress = {
  exerciseName: string;
  loadUnit: string;
  totalVolume: number;
  estimatedOneRepMax: number | null;
  bestObservedLoad: number | null;
  performedSets: number;
  lastPerformedAt: string;
};

export const workoutCalculationRegistry = {
  volume: { id: "set-volume-v1", definition: "Completed set load multiplied by repetitions, summed without converting between units." },
  estimatedOneRepMax: { id: "epley-1rm-v1", definition: "Epley: load × (1 + repetitions / 30), only for completed loaded sets of 1–10 repetitions." },
  observedLoadRecord: { id: "observed-load-v1", definition: "Highest completed load recorded for the same normalized exercise name and load unit." },
  cardioPace: { id: "moving-pace-v1", definition: "Recorded moving seconds, or elapsed set seconds when moving time is absent, divided by recorded kilometers." },
  monthlyTimeline: { id: "monthly-training-summary-v1", definition: "Calendar-month counts and sums from submitted workouts and completed set records; load units remain separate." },
} as const;

export type TimelineWorkout = { id: number; occurredAt: Date; activityType: string; durationMinutes: number | null };
export type TimelineSet = { workoutId: number; completed: boolean; reps: number | null; loadValue: number | null; loadUnit: string | null; distanceMeters: number | null; durationSeconds: number | null };

export function summarizeWorkoutTimeline(workoutRows: TimelineWorkout[], setRows: TimelineSet[]) {
  const months = new Map<string, { month: string; workouts: number; durationMinutes: number; performedSets: number; distanceMeters: number; volumeByUnit: Record<string, number> }>();
  const activities = new Map<string, { activityType: string; workouts: number; durationMinutes: number }>();
  const setsByWorkout = new Map<number, TimelineSet[]>();
  for (const set of setRows) setsByWorkout.set(set.workoutId, [...(setsByWorkout.get(set.workoutId) || []), set]);
  for (const workout of workoutRows) {
    const month = workout.occurredAt.toISOString().slice(0, 7);
    const summary = months.get(month) || { month, workouts: 0, durationMinutes: 0, performedSets: 0, distanceMeters: 0, volumeByUnit: {} };
    summary.workouts += 1;
    summary.durationMinutes += workout.durationMinutes || 0;
    for (const set of setsByWorkout.get(workout.id) || []) {
      if (!set.completed) continue;
      summary.performedSets += 1;
      summary.distanceMeters += set.distanceMeters || 0;
      if (set.loadValue && set.reps && set.loadUnit) summary.volumeByUnit[set.loadUnit] = (summary.volumeByUnit[set.loadUnit] || 0) + set.loadValue * set.reps;
    }
    months.set(month, summary);
    const activity = activities.get(workout.activityType) || { activityType: workout.activityType, workouts: 0, durationMinutes: 0 };
    activity.workouts += 1;
    activity.durationMinutes += workout.durationMinutes || 0;
    activities.set(workout.activityType, activity);
  }
  return {
    months: Array.from(months.values()).map((month) => ({ ...month, distanceMeters: Number(month.distanceMeters.toFixed(2)), volumeByUnit: Object.fromEntries(Object.entries(month.volumeByUnit).map(([unit, value]) => [unit, Number(value.toFixed(2))])) })).sort((left, right) => left.month.localeCompare(right.month)),
    activities: Array.from(activities.values()).sort((left, right) => right.workouts - left.workouts || left.activityType.localeCompare(right.activityType)),
  };
}

export type HeartRateZone = { name: string; lowerBpm: number; upperBpm: number };
export function classifyHeartRateAverage(averageBpm: number | null, zones: HeartRateZone[]): string | null {
  if (averageBpm == null) return null;
  return zones.find((zone) => averageBpm >= zone.lowerBpm && averageBpm <= zone.upperBpm)?.name || null;
}

export type HeartRateSample = { sampledAt: Date; bpm: number };
export function heartRateTimeInZones(samples: HeartRateSample[], zones: HeartRateZone[], maximumGapSeconds = 120) {
  const ordered = [...samples].sort((left, right) => left.sampledAt.getTime() - right.sampledAt.getTime());
  const secondsByZone = Object.fromEntries(zones.map((zone) => [zone.name, 0])) as Record<string, number>;
  let classifiedSeconds = 0;
  let unclassifiedSeconds = 0;
  let longGapSeconds = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const seconds = (ordered[index + 1].sampledAt.getTime() - ordered[index].sampledAt.getTime()) / 1000;
    if (!(seconds > 0)) continue;
    if (seconds > maximumGapSeconds) { longGapSeconds += seconds; continue; }
    const midpointBpm = (ordered[index].bpm + ordered[index + 1].bpm) / 2;
    const zone = zones.find((candidate) => midpointBpm >= candidate.lowerBpm && midpointBpm <= candidate.upperBpm);
    if (zone) { secondsByZone[zone.name] += seconds; classifiedSeconds += seconds; } else unclassifiedSeconds += seconds;
  }
  return {
    secondsByZone: Object.fromEntries(Object.entries(secondsByZone).map(([name, seconds]) => [name, Math.round(seconds)])),
    classifiedSeconds: Math.round(classifiedSeconds), unclassifiedSeconds: Math.round(unclassifiedSeconds), longGapSeconds: Math.round(longGapSeconds),
    sampleCount: ordered.length, maximumGapSeconds,
    method: "Adjacent samples are sorted by timestamp. Gaps of 120 seconds or less are classified by the two-sample midpoint BPM; longer gaps remain unknown.",
  };
}

export type RecordSet = PerformedSet & { workoutId: number; setId: number };

export function summarizeExerciseRecords(rows: RecordSet[]) {
  const records = new Map<string, { exerciseName: string; loadUnit: string; bestObservedLoad: number; observedLoadAt: Date; observedLoadWorkoutId: number; observedLoadSetId: number; bestEstimatedOneRepMax: number | null; estimatedOneRepMaxAt: Date | null; estimatedWorkoutId: number | null; estimatedSetId: number | null }>();
  for (const row of rows) {
    if (!row.completed || !row.loadValue || !row.loadUnit) continue;
    const key = `${row.exerciseName.trim().toLowerCase()}\u0000${row.loadUnit}`;
    const current = records.get(key) || { exerciseName: row.exerciseName, loadUnit: row.loadUnit, bestObservedLoad: row.loadValue, observedLoadAt: row.occurredAt, observedLoadWorkoutId: row.workoutId, observedLoadSetId: row.setId, bestEstimatedOneRepMax: null, estimatedOneRepMaxAt: null, estimatedWorkoutId: null, estimatedSetId: null };
    if (row.loadValue > current.bestObservedLoad || (row.loadValue === current.bestObservedLoad && row.occurredAt > current.observedLoadAt)) {
      current.bestObservedLoad = row.loadValue; current.observedLoadAt = row.occurredAt; current.observedLoadWorkoutId = row.workoutId; current.observedLoadSetId = row.setId;
    }
    const estimate = epleyEstimatedOneRepMax(row.loadValue, row.reps);
    if (estimate !== null && (current.bestEstimatedOneRepMax === null || estimate > current.bestEstimatedOneRepMax || (estimate === current.bestEstimatedOneRepMax && (!current.estimatedOneRepMaxAt || row.occurredAt > current.estimatedOneRepMaxAt)))) {
      current.bestEstimatedOneRepMax = estimate; current.estimatedOneRepMaxAt = row.occurredAt; current.estimatedWorkoutId = row.workoutId; current.estimatedSetId = row.setId;
    }
    records.set(key, current);
  }
  return Array.from(records.values()).map((record) => ({ ...record, observedLoadAt: record.observedLoadAt.toISOString(), estimatedOneRepMaxAt: record.estimatedOneRepMaxAt?.toISOString() || null })).sort((left, right) => left.exerciseName.localeCompare(right.exerciseName));
}

export type CardioSet = {
  workoutId: number;
  occurredAt: Date;
  distanceMeters: number | null;
  durationSeconds: number | null;
  completed: boolean;
  movingTimeSeconds?: number | null;
  elevationGainMeters?: number | null;
  averageHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  heartRateSource?: string | null;
};

export function summarizeCardioSessions(rows: CardioSet[]) {
  const sessions = new Map<number, { workoutId: number; occurredAt: Date; distanceMeters: number; durationSeconds: number; recordedSets: number; movingTimeSeconds: number | null; elevationGainMeters: number | null; averageHeartRateBpm: number | null; maxHeartRateBpm: number | null; heartRateSource: string | null }>();
  for (const row of rows) {
    const hasSessionDetail = row.movingTimeSeconds != null || row.elevationGainMeters != null || row.averageHeartRateBpm != null || row.maxHeartRateBpm != null;
    if ((!row.completed || (row.distanceMeters == null && row.durationSeconds == null)) && !hasSessionDetail) continue;
    const current = sessions.get(row.workoutId) || { workoutId: row.workoutId, occurredAt: row.occurredAt, distanceMeters: 0, durationSeconds: 0, recordedSets: 0, movingTimeSeconds: row.movingTimeSeconds ?? null, elevationGainMeters: row.elevationGainMeters ?? null, averageHeartRateBpm: row.averageHeartRateBpm ?? null, maxHeartRateBpm: row.maxHeartRateBpm ?? null, heartRateSource: row.heartRateSource ?? null };
    if (row.completed && (row.distanceMeters != null || row.durationSeconds != null)) {
      current.distanceMeters += row.distanceMeters || 0;
      current.durationSeconds += row.durationSeconds || 0;
      current.recordedSets += 1;
    }
    sessions.set(row.workoutId, current);
  }
  return Array.from(sessions.values()).map((session) => ({
    workoutId: session.workoutId, occurredAt: session.occurredAt.toISOString(), distanceMeters: Number(session.distanceMeters.toFixed(2)), durationSeconds: session.durationSeconds,
    recordedSets: session.recordedSets, movingTimeSeconds: session.movingTimeSeconds, elevationGainMeters: session.elevationGainMeters,
    averageHeartRateBpm: session.averageHeartRateBpm, maxHeartRateBpm: session.maxHeartRateBpm, heartRateSource: session.heartRateSource,
    paceSecondsPerKilometer: session.distanceMeters > 0 && (session.movingTimeSeconds || session.durationSeconds) > 0 ? Number(((session.movingTimeSeconds || session.durationSeconds) / (session.distanceMeters / 1000)).toFixed(1)) : null,
    speedKilometersPerHour: session.distanceMeters > 0 && (session.movingTimeSeconds || session.durationSeconds) > 0 ? Number(((session.distanceMeters / 1000) / ((session.movingTimeSeconds || session.durationSeconds) / 3600)).toFixed(2)) : null,
  })).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

// Epley is used only for a limited, transparent comparison point. It is not a
// medical assessment or a promise of strength; inputs outside 1–10 reps are
// intentionally excluded rather than extrapolated.
export function epleyEstimatedOneRepMax(loadValue: number | null, reps: number | null): number | null {
  if (!loadValue || !reps || loadValue <= 0 || reps < 1 || reps > 10) return null;
  return Number((loadValue * (1 + reps / 30)).toFixed(2));
}

export function summarizeExerciseProgress(rows: PerformedSet[]): ExerciseProgress[] {
  const groups = new Map<string, { exerciseName: string; loadUnit: string; totalVolume: number; estimatedOneRepMax: number | null; bestObservedLoad: number | null; performedSets: number; lastPerformedAt: Date }>();
  for (const row of rows) {
    if (!row.completed || !row.loadValue || !row.reps || !row.loadUnit) continue;
    const key = `${row.exerciseName}\u0000${row.loadUnit}`;
    const current = groups.get(key) || { exerciseName: row.exerciseName, loadUnit: row.loadUnit, totalVolume: 0, estimatedOneRepMax: null, bestObservedLoad: null, performedSets: 0, lastPerformedAt: row.occurredAt };
    const estimate = epleyEstimatedOneRepMax(row.loadValue, row.reps);
    current.totalVolume += row.loadValue * row.reps;
    current.estimatedOneRepMax = estimate !== null && (current.estimatedOneRepMax === null || estimate > current.estimatedOneRepMax) ? estimate : current.estimatedOneRepMax;
    current.bestObservedLoad = current.bestObservedLoad === null || row.loadValue > current.bestObservedLoad ? row.loadValue : current.bestObservedLoad;
    current.performedSets += 1;
    if (row.occurredAt > current.lastPerformedAt) current.lastPerformedAt = row.occurredAt;
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((value) => ({
    ...value,
    totalVolume: Number(value.totalVolume.toFixed(2)),
    lastPerformedAt: value.lastPerformedAt.toISOString(),
  })).sort((left, right) => right.lastPerformedAt.localeCompare(left.lastPerformedAt));
}
