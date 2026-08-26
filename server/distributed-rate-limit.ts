import crypto from "node:crypto";

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type DistributedRateLimitDecision = {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
};

export function rateLimitBucketHash(secret: string, scope: string, kind: "ip" | "subject", value: string): string {
  const normalized = value.trim().toLowerCase().slice(0, 256);
  return crypto.createHmac("sha256", secret).update(`${scope.length}:${scope}|${kind}|${normalized.length}:${normalized}`).digest("hex");
}

export async function consumeDistributedRateLimit(
  database: Queryable,
  bucketHashes: string[],
  maxRequests: number,
  windowMs: number,
  now = new Date(),
): Promise<DistributedRateLimitDecision> {
  // A stable lock order prevents two multi-bucket requests from deadlocking
  // when they contain the same dimensions in a different order.
  const uniqueBuckets = Array.from(new Set(bucketHashes)).sort();
  if (uniqueBuckets.length === 0) throw new Error("At least one rate-limit bucket is required");
  if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error("maxRequests must be a positive integer");
  if (!Number.isInteger(windowMs) || windowMs < 1_000) throw new Error("windowMs must be at least one second");
  const nextExpiry = new Date(now.getTime() + windowMs);
  const result = await database.query(`
    INSERT INTO request_rate_limits (bucket_hash, window_start, request_count, expires_at, updated_at)
    SELECT incoming.bucket_hash, $2::timestamptz, 1, $3::timestamptz, $2::timestamptz
    FROM unnest($1::text[]) AS incoming(bucket_hash)
    ON CONFLICT (bucket_hash) DO UPDATE SET
      request_count = CASE
        WHEN request_rate_limits.expires_at <= EXCLUDED.window_start THEN 1
        ELSE request_rate_limits.request_count + 1
      END,
      window_start = CASE
        WHEN request_rate_limits.expires_at <= EXCLUDED.window_start THEN EXCLUDED.window_start
        ELSE request_rate_limits.window_start
      END,
      expires_at = CASE
        WHEN request_rate_limits.expires_at <= EXCLUDED.window_start THEN EXCLUDED.expires_at
        ELSE request_rate_limits.expires_at
      END,
      updated_at = EXCLUDED.updated_at
    RETURNING request_count, expires_at
  `, [uniqueBuckets, now, nextExpiry]);
  const count = Math.max(...result.rows.map((row) => Number(row.request_count)));
  const resetAt = new Date(Math.max(...result.rows.map((row) => new Date(String(row.expires_at)).getTime())));
  return {
    allowed: count <= maxRequests,
    count,
    remaining: Math.max(0, maxRequests - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1_000)),
    resetAt,
  };
}

export async function deleteExpiredRateLimits(database: Queryable, now = new Date()): Promise<number> {
  const result = await database.query(`DELETE FROM request_rate_limits WHERE expires_at <= $1::timestamptz RETURNING bucket_hash`, [now]);
  return result.rows.length;
}
