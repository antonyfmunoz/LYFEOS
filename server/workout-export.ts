export type WorkoutExportWorkout = {
  id: number;
  occurredAt: Date;
  activityType: string;
  durationMinutes: number | null;
  perceivedExertion: number | null;
  movingTimeSeconds: number | null;
  elevationGainMeters: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  heartRateSource: string | null;
  source: string;
  recordedTimeZone: string | null;
  recordedUtcOffsetMinutes: number | null;
  note: string | null;
  createdAt: Date;
};

export type WorkoutExportExercise = {
  id: number;
  workoutId: number;
  name: string;
  sets: number | null;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  sortOrder: number;
  note: string | null;
};

export type WorkoutExportSet = {
  id: number;
  workoutExerciseId: number;
  setOrder: number;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  perceivedExertion: number | null;
  repsInReserve: number | null;
  completed: boolean;
  note: string | null;
};

export type WorkoutLedgerExportRow = {
  recordLevel: "workout" | "exercise" | "set";
  workoutId: number;
  workoutOccurredAtUtc: string;
  exportCalendarDate: string;
  exportTimeZone: string;
  recordedTimeZone: string | null;
  recordedUtcOffsetMinutes: number | null;
  workoutSource: string;
  activityType: string;
  workoutDurationMinutes: number | null;
  workoutPerceivedExertion: number | null;
  movingTimeSeconds: number | null;
  elevationGainMeters: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  heartRateSource: string | null;
  latestRevisionNumber: number | null;
  workoutCreatedAtUtc: string;
  exerciseId: number | null;
  exerciseOrder: number | null;
  exerciseName: string | null;
  legacyAggregateSets: number | null;
  legacyAggregateReps: number | null;
  legacyAggregateLoadValue: number | null;
  legacyAggregateLoadUnit: string | null;
  legacyAggregateDistanceMeters: number | null;
  legacyAggregateDurationSeconds: number | null;
  setId: number | null;
  setOrder: number | null;
  setState: "performed" | "skipped" | null;
  setReps: number | null;
  setLoadValue: number | null;
  setLoadUnit: string | null;
  setDistanceMeters: number | null;
  setDurationSeconds: number | null;
  setPerceivedExertion: number | null;
  setRepsInReserve: number | null;
  workoutNote: string | null;
  exerciseNote: string | null;
  setNote: string | null;
};

export function workoutLedgerExportRows(
  workouts: WorkoutExportWorkout[],
  exercises: WorkoutExportExercise[],
  sets: WorkoutExportSet[],
  latestRevisionByWorkout: ReadonlyMap<number, number>,
  exportTimeZone: string,
  calendarDate: (value: Date) => string,
): WorkoutLedgerExportRow[] {
  return workouts.flatMap<WorkoutLedgerExportRow>((workout): WorkoutLedgerExportRow[] => {
    const workoutExercises = exercises.filter((exercise) => exercise.workoutId === workout.id).sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
    const base = {
      workoutId: workout.id,
      workoutOccurredAtUtc: workout.occurredAt.toISOString(),
      exportCalendarDate: calendarDate(workout.occurredAt),
      exportTimeZone,
      recordedTimeZone: workout.recordedTimeZone,
      recordedUtcOffsetMinutes: workout.recordedUtcOffsetMinutes,
      workoutSource: workout.source,
      activityType: workout.activityType,
      workoutDurationMinutes: workout.durationMinutes,
      workoutPerceivedExertion: workout.perceivedExertion,
      movingTimeSeconds: workout.movingTimeSeconds,
      elevationGainMeters: workout.elevationGainMeters,
      averageHeartRateBpm: workout.averageHeartRateBpm,
      maxHeartRateBpm: workout.maxHeartRateBpm,
      heartRateSource: workout.heartRateSource,
      latestRevisionNumber: latestRevisionByWorkout.get(workout.id) ?? null,
      workoutCreatedAtUtc: workout.createdAt.toISOString(),
      workoutNote: workout.note,
    };
    if (!workoutExercises.length) return [{
      ...base, recordLevel: "workout" as const,
      exerciseId: null, exerciseOrder: null, exerciseName: null,
      legacyAggregateSets: null, legacyAggregateReps: null, legacyAggregateLoadValue: null, legacyAggregateLoadUnit: null, legacyAggregateDistanceMeters: null, legacyAggregateDurationSeconds: null,
      setId: null, setOrder: null, setState: null, setReps: null, setLoadValue: null, setLoadUnit: null, setDistanceMeters: null, setDurationSeconds: null, setPerceivedExertion: null, setRepsInReserve: null,
      exerciseNote: null, setNote: null,
    }];
    return workoutExercises.flatMap<WorkoutLedgerExportRow>((exercise): WorkoutLedgerExportRow[] => {
      const exerciseSets = sets.filter((setRecord) => setRecord.workoutExerciseId === exercise.id).sort((left, right) => left.setOrder - right.setOrder || left.id - right.id);
      const exerciseBase = {
        ...base,
        exerciseId: exercise.id,
        exerciseOrder: exercise.sortOrder,
        exerciseName: exercise.name,
        legacyAggregateSets: exercise.sets,
        legacyAggregateReps: exercise.reps,
        legacyAggregateLoadValue: exercise.loadValue,
        legacyAggregateLoadUnit: exercise.loadUnit,
        legacyAggregateDistanceMeters: exercise.distanceMeters,
        legacyAggregateDurationSeconds: exercise.durationSeconds,
        exerciseNote: exercise.note,
      };
      if (!exerciseSets.length) return [{
        ...exerciseBase, recordLevel: "exercise" as const,
        setId: null, setOrder: null, setState: null, setReps: null, setLoadValue: null, setLoadUnit: null, setDistanceMeters: null, setDurationSeconds: null, setPerceivedExertion: null, setRepsInReserve: null, setNote: null,
      }];
      return exerciseSets.map((setRecord) => ({
        ...exerciseBase,
        recordLevel: "set" as const,
        setId: setRecord.id,
        setOrder: setRecord.setOrder,
        setState: setRecord.completed ? "performed" as const : "skipped" as const,
        setReps: setRecord.reps,
        setLoadValue: setRecord.loadValue,
        setLoadUnit: setRecord.loadUnit,
        setDistanceMeters: setRecord.distanceMeters,
        setDurationSeconds: setRecord.durationSeconds,
        setPerceivedExertion: setRecord.perceivedExertion,
        setRepsInReserve: setRecord.repsInReserve,
        setNote: setRecord.note,
      }));
    });
  });
}

const columns: Array<keyof WorkoutLedgerExportRow> = [
  "recordLevel", "workoutId", "workoutOccurredAtUtc", "exportCalendarDate", "exportTimeZone", "recordedTimeZone", "recordedUtcOffsetMinutes", "workoutSource", "activityType", "workoutDurationMinutes", "workoutPerceivedExertion", "movingTimeSeconds", "elevationGainMeters", "averageHeartRateBpm", "maxHeartRateBpm", "heartRateSource", "latestRevisionNumber", "workoutCreatedAtUtc", "exerciseId", "exerciseOrder", "exerciseName", "legacyAggregateSets", "legacyAggregateReps", "legacyAggregateLoadValue", "legacyAggregateLoadUnit", "legacyAggregateDistanceMeters", "legacyAggregateDurationSeconds", "setId", "setOrder", "setState", "setReps", "setLoadValue", "setLoadUnit", "setDistanceMeters", "setDurationSeconds", "setPerceivedExertion", "setRepsInReserve", "workoutNote", "exerciseNote", "setNote",
];

function csvHeader(column: string): string { return column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  const protectedText = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(protectedText) ? `"${protectedText.replace(/"/g, '""')}"` : protectedText;
}

export function workoutLedgerExportCsv(rows: WorkoutLedgerExportRow[]): string {
  return [columns.map(csvHeader).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
}
