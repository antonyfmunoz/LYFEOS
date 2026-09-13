export function todoIdeaLines(value: string | null | undefined): string[] {
  return (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function localMidnight(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** The last instant of a user's calendar day, used to preserve the date an
 * idea was captured when it is later reconciled into the historical archive. */
export function localEndOfDay(date: string): Date {
  const end = localMidnight(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}
