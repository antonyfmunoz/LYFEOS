type PlannedEntry = { scheduledDate: string; status: string; loggedDiaryEntryIds: unknown };
type DiaryRecord = { id: number; date: string };

function linkedIds(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
}

function calendarDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end && dates.length < 367) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}

export function summarizeMealPlanActual(startDate: string, endDate: string, entries: PlannedEntry[], diaryRecords: DiaryRecord[]) {
  const linked = new Set(entries.flatMap((entry) => linkedIds(entry.loggedDiaryEntryIds)));
  const availableDiaryIds = new Set(diaryRecords.map((record) => record.id));
  const days = calendarDates(startDate, endDate).map((date) => {
    const planned = entries.filter((entry) => entry.scheduledDate === date);
    const diary = diaryRecords.filter((record) => record.date === date);
    return {
      date,
      plannedIntents: planned.length,
      stillPlanned: planned.filter((entry) => entry.status === "planned").length,
      confirmedPlanEntries: planned.filter((entry) => entry.status === "logged").length,
      skippedPlanEntries: planned.filter((entry) => entry.status === "skipped").length,
      linkedDiaryRecords: diary.filter((record) => linked.has(record.id)).length,
      otherDiaryRecords: diary.filter((record) => !linked.has(record.id)).length,
    };
  });
  return {
    days,
    totals: days.reduce((total, day) => ({
      plannedIntents: total.plannedIntents + day.plannedIntents,
      stillPlanned: total.stillPlanned + day.stillPlanned,
      confirmedPlanEntries: total.confirmedPlanEntries + day.confirmedPlanEntries,
      skippedPlanEntries: total.skippedPlanEntries + day.skippedPlanEntries,
      linkedDiaryRecords: total.linkedDiaryRecords + day.linkedDiaryRecords,
      otherDiaryRecords: total.otherDiaryRecords + day.otherDiaryRecords,
    }), { plannedIntents: 0, stillPlanned: 0, confirmedPlanEntries: 0, skippedPlanEntries: 0, linkedDiaryRecords: 0, otherDiaryRecords: 0 }),
    missingLinkedDiaryRecords: Array.from(linked).filter((id) => !availableDiaryIds.has(id)).length,
  };
}
