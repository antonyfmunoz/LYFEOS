import { lte } from "drizzle-orm";
import { healthDeletionReceipts } from "@shared/schema";
import { db } from "./db";
import { logger } from "./utils";

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export async function purgeExpiredHealthDeletionReceipts(now = new Date()): Promise<number> {
  const removed = await db.delete(healthDeletionReceipts).where(lte(healthDeletionReceipts.expiresAt, now)).returning({ id: healthDeletionReceipts.id });
  return removed.length;
}

export function startHealthDeletionReceiptCleanup(): void {
  if (cleanupTimer) return;
  const cleanup = () => void purgeExpiredHealthDeletionReceipts().catch((error) => logger.error("Health deletion receipt cleanup failed", error));
  cleanup();
  cleanupTimer = setInterval(cleanup, 60_000);
  cleanupTimer.unref?.();
}
