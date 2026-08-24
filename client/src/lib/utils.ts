import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get today's date in YYYY-MM-DD format using local timezone.
 * This ensures the date reflects the user's current location/timezone.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBrowserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export function localNoonIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

export function localDateTimeIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid local date and time.");
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Choose a valid local date and time.");
  return value.toISOString();
}
