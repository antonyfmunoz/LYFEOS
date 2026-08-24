function calendarDateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed.getTime();
}

export function calendarDayDelta(fromDate: string, toDate: string): number | null {
  const from = calendarDateValue(fromDate);
  const to = calendarDateValue(toDate);
  return from === null || to === null ? null : Math.round((to - from) / 86_400_000);
}

export function shiftCalendarDate(date: string, dayDelta: number): string | null {
  const value = calendarDateValue(date);
  if (value === null || !Number.isInteger(dayDelta)) return null;
  const shifted = new Date(value + dayDelta * 86_400_000);
  if (Number.isNaN(shifted.getTime())) return null;
  const result = shifted.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

export type RecurringSeriesCandidate = { id: number; scheduledDate: string; status: string };

export function recurringSeriesShiftPlan(sessions: RecurringSeriesCandidate[], dayDelta: number) {
  const updates: Array<{ id: number; scheduledDate: string }> = [];
  const preservedCompletedSessionIds: number[] = [];
  for (const session of sessions) {
    if (session.status === "completed") {
      preservedCompletedSessionIds.push(session.id);
      continue;
    }
    const scheduledDate = shiftCalendarDate(session.scheduledDate, dayDelta);
    if (!scheduledDate) return null;
    updates.push({ id: session.id, scheduledDate });
  }
  return { updates, preservedCompletedSessionIds };
}

export function recurringWeeklyDates(startDate: string, repeatEveryWeeks: number, occurrences: number): string[] {
  const startValue = calendarDateValue(startDate);
  if (startValue === null || !Number.isInteger(repeatEveryWeeks) || !Number.isInteger(occurrences) || repeatEveryWeeks < 1 || occurrences < 1) return [];
  const start = new Date(startValue);
  return Array.from({ length: occurrences }, (_, index) => {
    const scheduled = new Date(start);
    scheduled.setUTCDate(scheduled.getUTCDate() + index * repeatEveryWeeks * 7);
    return scheduled.toISOString().slice(0, 10);
  });
}

export type ProgramReportSession = {
  id: number;
  scheduledDate: string;
  title: string;
  status: string;
  templateId: number | null;
  originalTemplateId: number | null;
  missionId?: number | null;
  substitutionReason: string | null;
  completedWorkoutId: number | null;
  completionLinkLostAt: Date | null;
};

export type ProgramReportWorkout = { id: number; occurredAt: Date; activityType: string };

export function trainingProgramReport(sessions: ProgramReportSession[], workouts: ProgramReportWorkout[]) {
  const workoutsById = new Map(workouts.map((workout) => [workout.id, workout]));
  const rows = sessions.map((session) => {
    const workout = session.completedWorkoutId == null ? null : workoutsById.get(session.completedWorkoutId) || null;
    const completionEvidenceState = session.status === "completed"
      ? workout ? "linked_workout" as const
        : session.completionLinkLostAt ? "link_lost" as const
          : "missing_link" as const
      : session.completedWorkoutId == null ? "none" as const : "unexpected_link" as const;
    return {
      sessionId: session.id,
      scheduledDate: session.scheduledDate,
      title: session.title,
      planState: session.status,
      templateId: session.templateId,
      originalTemplateId: session.originalTemplateId,
      missionId: session.missionId ?? null,
      substituted: session.templateId !== session.originalTemplateId || session.substitutionReason !== null,
      substitutionReason: session.substitutionReason,
      completionEvidenceState,
      completedWorkoutId: workout?.id ?? session.completedWorkoutId,
      workoutOccurredAt: workout?.occurredAt.toISOString() ?? null,
      workoutActivityType: workout?.activityType ?? null,
      completionLinkLostAt: session.completionLinkLostAt?.toISOString() ?? null,
    };
  });
  return {
    summary: {
      scheduledSessions: rows.length,
      plannedSessions: rows.filter((row) => row.planState === "planned").length,
      skippedSessions: rows.filter((row) => row.planState === "skipped").length,
      linkedCompletedSessions: rows.filter((row) => row.completionEvidenceState === "linked_workout").length,
      missingCompletionEvidence: rows.filter((row) => row.completionEvidenceState === "link_lost" || row.completionEvidenceState === "missing_link").length,
      unexpectedLinks: rows.filter((row) => row.completionEvidenceState === "unexpected_link").length,
      substitutedSessions: rows.filter((row) => row.substituted).length,
    },
    rows,
  };
}
