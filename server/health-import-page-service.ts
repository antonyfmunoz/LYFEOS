import type { z } from "zod";
import type { HealthProviderId } from "./health-connections";
import { providerHealthEnvelopeSchema } from "./health-import";
import { ingestProviderHealthEnvelope } from "./health-import-service";
import { beginHealthSync, completeHealthSync, failHealthSync } from "./health-sync-service";
import { healthImportFailureCode, healthImportFailureIsRetryable } from "./health-provider-metrics";

/**
 * Internal provider-page orchestration. Durable record transactions finish
 * before the cursor transaction advances. A crash or rejected record leaves
 * the previous cursor intact, so replay uses the idempotent record boundary.
 */
export async function ingestProviderHealthPage(input: {
  userId: number;
  connectionId: number;
  provider: HealthProviderId;
  resourceType: string;
  envelopes: Array<z.input<typeof providerHealthEnvelopeSchema>>;
  nextCursor: string;
  failureCode?: string;
  receivedAt?: Date;
}) {
  const started = await beginHealthSync({ userId: input.userId, connectionId: input.connectionId, resourceType: input.resourceType, attemptedAt: input.receivedAt });
  const counts = { fetchedCount: input.envelopes.length, importedCount: 0, replayedCount: 0, correctedCount: 0, suppressedCount: 0, failedCount: 0 };
  try {
    for (const envelope of input.envelopes) {
      const outcome = await ingestProviderHealthEnvelope({
        userId: input.userId, connectionId: input.connectionId, provider: input.provider, envelope, receivedAt: input.receivedAt,
      });
      if (outcome.suppressed) counts.suppressedCount += 1;
      else if (outcome.replayed) counts.replayedCount += 1;
      else {
        counts.importedCount += 1;
        if (outcome.corrected) counts.correctedCount += 1;
      }
    }
    const completed = await completeHealthSync({
      userId: input.userId, connectionId: input.connectionId, runId: started.run.id, resourceType: input.resourceType,
      nextCursor: input.nextCursor, counts, completedAt: input.receivedAt,
    });
    return { ...completed, counts };
  } catch (error) {
    counts.failedCount += 1;
    await failHealthSync({
      userId: input.userId, connectionId: input.connectionId, runId: started.run.id, resourceType: input.resourceType,
      errorCode: healthImportFailureCode(error, input.failureCode), counts, retryable: healthImportFailureIsRetryable(error), attemptedAt: input.receivedAt,
    });
    throw error;
  }
}
