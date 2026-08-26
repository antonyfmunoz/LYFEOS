import crypto from "crypto";
import { sql } from "drizzle-orm";
import type { UMHEventEnvelope } from "@shared/umh";
import { db } from "../db";
import { getUMHFederationConfig } from "./config";
import { signUMHProjectionEvent } from "./crypto";

const DEFAULT_BATCH_SIZE = 25;
// A batch is delivered sequentially and each request can consume ten seconds.
// Five minutes keeps the final item owned while retaining bounded crash recovery.
const DEFAULT_LEASE_MS = 5 * 60_000;
let workerTimer: NodeJS.Timeout | undefined;

export interface ClaimedUMHOutboxEvent {
  id: number;
  eventId: string;
  payload: UMHEventEnvelope;
  attempts: number;
  leaseToken: string;
  leasedUntil: Date;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows || []) as T[];
}

function boundedBatchSize(value: number | undefined): number {
  return Math.max(1, Math.min(100, Math.floor(value || DEFAULT_BATCH_SIZE)));
}

function retryAt(attempt: number, now = new Date()): Date {
  return new Date(now.getTime() + Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempt, 10)));
}

/** Atomically lease due events across every application instance. */
export async function claimUMHOutboxEvents(input: {
  leaseToken?: string;
  now?: Date;
  leaseMs?: number;
  limit?: number;
} = {}): Promise<ClaimedUMHOutboxEvent[]> {
  const leaseToken = input.leaseToken || crypto.randomUUID();
  const now = input.now || new Date();
  const leaseMs = Math.max(10_000, Math.min(10 * 60_000, Math.floor(input.leaseMs || DEFAULT_LEASE_MS)));
  const leasedUntil = new Date(now.getTime() + leaseMs);
  const limit = boundedBatchSize(input.limit);
  const claimed = await db.execute(sql`
    WITH candidates AS (
      SELECT "id"
      FROM "umh_outbox_events"
      WHERE "next_attempt_at" <= ${now}
        AND (
          "status" IN ('pending', 'retry')
          OR ("status" = 'processing' AND "leased_until" <= ${now})
        )
      ORDER BY "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "umh_outbox_events" AS event
    SET "status" = 'processing',
        "attempts" = event."attempts" + 1,
        "lease_token" = ${leaseToken},
        "leased_until" = ${leasedUntil},
        "last_error" = NULL
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."event_id", event."payload", event."attempts", event."lease_token", event."leased_until"
  `);
  return resultRows<{
    id: number;
    event_id: string;
    payload: UMHEventEnvelope;
    attempts: number;
    lease_token: string;
    leased_until: Date;
  }>(claimed).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    payload: row.payload,
    attempts: row.attempts,
    leaseToken: row.lease_token,
    leasedUntil: new Date(row.leased_until),
  }));
}

/** Settle only a lease still owned by this worker; stale workers cannot win. */
export async function settleUMHOutboxEvent(input: {
  id: number;
  leaseToken: string;
  outcome: "delivered" | "retry" | "failed";
  now?: Date;
  attempts: number;
  errorCode?: string;
}): Promise<boolean> {
  const now = input.now || new Date();
  const nextAttemptAt = input.outcome === "retry" ? retryAt(input.attempts, now) : now;
  const deliveredAt = input.outcome === "delivered" ? now : null;
  const lastError = input.outcome === "delivered" ? null : (input.errorCode || "DELIVERY_FAILED").slice(0, 100);
  const settled = await db.execute(sql`
    UPDATE "umh_outbox_events"
    SET "status" = ${input.outcome},
        "next_attempt_at" = ${nextAttemptAt},
        "delivered_at" = ${deliveredAt},
        "last_error" = ${lastError},
        "lease_token" = NULL,
        "leased_until" = NULL
    WHERE "id" = ${input.id}
      AND "status" = 'processing'
      AND "lease_token" = ${input.leaseToken}
    RETURNING "id"
  `);
  return resultRows<{ id: number }>(settled).length === 1;
}

export async function deliverPendingUMHEvents(): Promise<void> {
  const config = getUMHFederationConfig();
  if (!config?.controlPlaneUrl) return;
  const events = await claimUMHOutboxEvents();
  for (const entry of events) {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const nonce = crypto.randomBytes(24).toString("base64url");
    const body = JSON.stringify(entry.payload);
    try {
      const response = await fetch(`${config.controlPlaneUrl}/api/umh/projections/lyfeos/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-umh-timestamp": timestamp,
          "x-umh-nonce": nonce,
          "x-umh-signature": signUMHProjectionEvent(config.sharedSecret, timestamp, nonce, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await settleUMHOutboxEvent({ ...entry, outcome: "delivered" });
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await settleUMHOutboxEvent({ ...entry, outcome: "failed", errorCode: `HTTP_${response.status}` });
      } else {
        await settleUMHOutboxEvent({ ...entry, outcome: "retry", errorCode: `HTTP_${response.status}` });
      }
    } catch {
      await settleUMHOutboxEvent({ ...entry, outcome: "retry", errorCode: "NETWORK_DELIVERY_FAILED" });
    }
  }
}

export function startUMHOutboxWorker(): void {
  if (workerTimer || !getUMHFederationConfig()?.controlPlaneUrl) return;
  void deliverPendingUMHEvents();
  workerTimer = setInterval(() => void deliverPendingUMHEvents(), 15_000);
  workerTimer.unref();
}
