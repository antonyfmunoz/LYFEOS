import { sql } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./utils";

export type AIMemoryRetentionSweepResult = {
  leaseAcquired: boolean;
  conversations: number;
  legacyMessages: number;
  voiceSessions: number;
  contextReceipts: number;
  actionReceipts: number;
};

function affectedRows(result: unknown): number {
  return (result as { rows?: unknown[] }).rows?.length || 0;
}

export async function runAIMemoryRetentionSweep(): Promise<AIMemoryRetentionSweepResult> {
  return db.transaction(async (tx) => {
    const lease = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('lyfeos.ai-memory-retention.v1')) AS "acquired"`);
    const leaseAcquired = Boolean((lease as unknown as { rows?: Array<{ acquired: boolean }> }).rows?.[0]?.acquired);
    if (!leaseAcquired) return { leaseAcquired, conversations: 0, legacyMessages: 0, voiceSessions: 0, contextReceipts: 0, actionReceipts: 0 };

    const voiceSessions = affectedRows(await tx.execute(sql`
      DELETE FROM "ai_voice_sessions" AS voice
      USING "ai_memory_policies" AS policy
      WHERE voice."user_id" = policy."user_id"
        AND policy."chat_history_days" IS NOT NULL
        AND voice."status" <> 'active'
        AND voice."created_at" < now() - (policy."chat_history_days" * interval '1 day')
      RETURNING voice."id"
    `));
    const conversations = affectedRows(await tx.execute(sql`
      DELETE FROM "conversations" AS conversation
      USING "ai_memory_policies" AS policy
      WHERE conversation."user_id" = policy."user_id"
        AND policy."chat_history_days" IS NOT NULL
        AND conversation."created_at" < now() - (policy."chat_history_days" * interval '1 day')
      RETURNING conversation."id"
    `));
    const legacyMessages = affectedRows(await tx.execute(sql`
      DELETE FROM "ai_messages" AS message
      USING "ai_memory_policies" AS policy
      WHERE message."user_id" = policy."user_id"
        AND policy."chat_history_days" IS NOT NULL
        AND message."timestamp" < now() - (policy."chat_history_days" * interval '1 day')
      RETURNING message."id"
    `));
    const contextReceipts = affectedRows(await tx.execute(sql`
      DELETE FROM "ai_context_receipts" AS receipt
      USING "ai_memory_policies" AS policy
      WHERE receipt."user_id" = policy."user_id"
        AND (receipt."expires_at" <= now() OR receipt."created_at" < now() - (policy."context_receipt_days" * interval '1 day'))
      RETURNING receipt."id"
    `));
    const actionReceipts = affectedRows(await tx.execute(sql`
      DELETE FROM "ai_action_records" AS action
      USING "ai_memory_policies" AS policy
      WHERE action."user_id" = policy."user_id"
        AND action."state" NOT IN ('started','pending_approval','executing')
        AND action."created_at" < now() - (policy."action_receipt_days" * interval '1 day')
      RETURNING action."id"
    `));
    return { leaseAcquired, conversations, legacyMessages, voiceSessions, contextReceipts, actionReceipts };
  });
}

let retentionTimer: ReturnType<typeof setInterval> | null = null;

export function startAIMemoryRetentionWorker(): void {
  if (retentionTimer) return;
  const sweep = () => void runAIMemoryRetentionSweep()
    .then((result) => {
      const removed = result.conversations + result.legacyMessages + result.voiceSessions + result.contextReceipts + result.actionReceipts;
      if (result.leaseAcquired && removed > 0) logger.info("AI memory retention sweep completed", { removed });
    })
    .catch((error) => logger.error("AI memory retention sweep failed", { error: error instanceof Error ? error.message : "unknown" }));
  sweep();
  retentionTimer = setInterval(sweep, 60 * 60_000);
  retentionTimer.unref?.();
}

export function stopAIMemoryRetentionWorker(): void {
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = null;
}
