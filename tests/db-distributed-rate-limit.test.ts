import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { consumeDistributedRateLimit, deleteExpiredRateLimits, rateLimitBucketHash } from "../server/distributed-rate-limit";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

describeDb("privacy-preserving distributed request limits", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const secret = `qualification-secret-${stamp}`;
  const rawIp = "203.0.113.42";
  const rawSubject = `Person_${stamp}@Example.com`;
  const ipBucket = rateLimitBucketHash(secret, "auth.login", "ip", rawIp);
  const subjectBucket = rateLimitBucketHash(secret, "auth.login", "subject", rawSubject);

  afterAll(async () => {
    await pool.query(`DELETE FROM request_rate_limits WHERE bucket_hash = ANY($1::text[])`, [[ipBucket, subjectBucket]]);
    await pool.end();
  });

  it("stores only stable salted hashes", () => {
    expect(ipBucket).toMatch(/^[a-f0-9]{64}$/);
    expect(subjectBucket).toMatch(/^[a-f0-9]{64}$/);
    expect(ipBucket).not.toContain(rawIp);
    expect(subjectBucket).not.toContain(rawSubject.toLowerCase());
    expect(rateLimitBucketHash(secret, "auth.login", "subject", rawSubject.toUpperCase())).toBe(subjectBucket);
    expect(rateLimitBucketHash(`${secret}-other`, "auth.login", "subject", rawSubject)).not.toBe(subjectBucket);
  });

  it("atomically admits only the bounded number across concurrent consumers", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const decisions = await Promise.all(Array.from({ length: 8 }, () => consumeDistributedRateLimit(pool, [ipBucket, subjectBucket], 5, 60_000, now)));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(3);
    expect(Math.max(...decisions.map((decision) => decision.count))).toBe(8);
    expect(decisions.every((decision) => decision.resetAt.toISOString() === "2026-08-26T00:01:00.000Z")).toBe(true);
    const stored = await pool.query(`SELECT bucket_hash, request_count FROM request_rate_limits WHERE bucket_hash = ANY($1::text[]) ORDER BY bucket_hash`, [[ipBucket, subjectBucket]]);
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows.every((row) => Number(row.request_count) === 8)).toBe(true);
    expect(JSON.stringify(stored.rows)).not.toContain(rawIp);
    expect(JSON.stringify(stored.rows).toLowerCase()).not.toContain(rawSubject.toLowerCase());
  });

  it("resets after expiry and supports bounded cleanup", async () => {
    const reset = await consumeDistributedRateLimit(pool, [ipBucket, subjectBucket], 5, 60_000, new Date("2026-08-26T00:01:00.001Z"));
    expect(reset).toMatchObject({ allowed: true, count: 1, remaining: 4 });
    expect(await deleteExpiredRateLimits(pool, new Date("2026-08-26T00:02:00.002Z"))).toBe(2);
  });
});
