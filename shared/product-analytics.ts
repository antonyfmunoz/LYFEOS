export type ProductAnalyticsDeletionQueueRow = {
  requested_at: Date | string;
  attempts: number;
  last_attempt_at: Date | string | null;
  completed_at: Date | string | null;
};

export type ProductAnalyticsDeletionReceipt = {
  state: "queued" | "retrying" | "provider_reconciled";
  requestedAt: string;
  firstAttemptNotBefore: string;
  attempts: number;
  lastAttemptAt: string | null;
  reconciledAt: string | null;
};

export function productAnalyticsDeletionReceiptFromRow(row: ProductAnalyticsDeletionQueueRow | null): ProductAnalyticsDeletionReceipt | null {
  if (!row) return null;
  const requestedAt = new Date(row.requested_at);
  const reconciledAt = row.completed_at ? new Date(row.completed_at).toISOString() : null;
  return {
    state: reconciledAt ? "provider_reconciled" : row.attempts > 0 ? "retrying" : "queued",
    requestedAt: requestedAt.toISOString(),
    firstAttemptNotBefore: new Date(requestedAt.getTime() + 15 * 60_000).toISOString(),
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).toISOString() : null,
    reconciledAt,
  };
}
