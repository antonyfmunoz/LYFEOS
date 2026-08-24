import { z } from "zod";
import { healthImportRetryDelayMs } from "./health-import";

export const healthSyncResourceTypeSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i);
export const healthSyncCursorValueSchema = z.string().min(1).max(4_000);
export const healthSyncErrorCodeSchema = z.string().trim().min(1).max(120).regex(/^[A-Z0-9_.:-]+$/);
export const healthSyncRunCountsSchema = z.object({
  fetchedCount: z.number().int().min(0).max(1_000_000),
  importedCount: z.number().int().min(0).max(1_000_000),
  replayedCount: z.number().int().min(0).max(1_000_000),
  correctedCount: z.number().int().min(0).max(1_000_000),
  suppressedCount: z.number().int().min(0).max(1_000_000),
  failedCount: z.number().int().min(0).max(1_000_000),
}).superRefine((counts, context) => {
  if (counts.correctedCount > counts.importedCount) context.addIssue({ code: z.ZodIssueCode.custom, message: "Corrected records must be a subset of imported records." });
  if (counts.importedCount + counts.replayedCount + counts.suppressedCount + counts.failedCount > counts.fetchedCount) context.addIssue({ code: z.ZodIssueCode.custom, message: "Run outcomes cannot exceed fetched records." });
});

export function healthSyncLockKey(connectionId: number, resourceType: string): string {
  return `health-sync:${connectionId}:${resourceType}`;
}

export function nextHealthSyncRetryAt(consecutiveFailures: number, attemptedAt: Date): Date {
  return new Date(attemptedAt.getTime() + healthImportRetryDelayMs(consecutiveFailures));
}

export const healthSyncLeaseMs = 15 * 60 * 1000;

export function healthSyncLeaseExpired(lastAttemptAt: Date | null, now: Date): boolean {
  return !lastAttemptAt || now.getTime() - lastAttemptAt.getTime() >= healthSyncLeaseMs;
}
