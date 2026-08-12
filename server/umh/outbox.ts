import crypto from "crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { UMHEventEnvelope } from "@shared/umh";
import { umhOutboxEvents } from "@shared/schema";
import { db } from "../db";
import { getUMHFederationConfig } from "./config";
import { signUMHMessage } from "./crypto";

let workerTimer: NodeJS.Timeout | undefined;
let isDelivering = false;

function retryAt(attempt: number): Date {
  return new Date(Date.now() + Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempt, 10)));
}

async function deliverPendingEvents(): Promise<void> {
  const config = getUMHFederationConfig();
  if (!config?.controlPlaneUrl || isDelivering) return;
  isDelivering = true;
  try {
    const events = await db.select().from(umhOutboxEvents)
      .where(and(
        inArray(umhOutboxEvents.status, ["pending", "retry"]),
        lte(umhOutboxEvents.nextAttemptAt, new Date()),
      ))
      .orderBy(asc(umhOutboxEvents.id))
      .limit(25);

    for (const entry of events) {
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(24).toString("base64url");
      const event = entry.payload as UMHEventEnvelope;
      try {
        const response = await fetch(`${config.controlPlaneUrl}/api/umh/v1/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-umh-key-id": config.keyId,
            "x-umh-timestamp": timestamp,
            "x-umh-nonce": nonce,
            "x-umh-signature": signUMHMessage(config.sharedSecret, timestamp, nonce, event),
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          await db.update(umhOutboxEvents).set({ status: "delivered", deliveredAt: new Date(), lastError: null })
            .where(eq(umhOutboxEvents.id, entry.id));
        } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          await db.update(umhOutboxEvents).set({ status: "failed", attempts: entry.attempts + 1, lastError: `HTTP ${response.status}` })
            .where(eq(umhOutboxEvents.id, entry.id));
        } else {
          await db.update(umhOutboxEvents).set({ status: "retry", attempts: entry.attempts + 1, nextAttemptAt: retryAt(entry.attempts + 1), lastError: `HTTP ${response.status}` })
            .where(eq(umhOutboxEvents.id, entry.id));
        }
      } catch (error) {
        await db.update(umhOutboxEvents).set({
          status: "retry",
          attempts: entry.attempts + 1,
          nextAttemptAt: retryAt(entry.attempts + 1),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "delivery failed",
        }).where(eq(umhOutboxEvents.id, entry.id));
      }
    }
  } finally {
    isDelivering = false;
  }
}

export function startUMHOutboxWorker(): void {
  if (workerTimer || !getUMHFederationConfig()?.controlPlaneUrl) return;
  void deliverPendingEvents();
  workerTimer = setInterval(() => void deliverPendingEvents(), 15_000);
  workerTimer.unref();
}
