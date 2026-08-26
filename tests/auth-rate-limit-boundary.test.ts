import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("distributed sensitive-request abuse boundary", () => {
  it("routes auth enumeration, mutation, webhook, and public submissions through database buckets", () => {
    const server = source("server/index.ts");
    for (const route of [
      "/api/auth/register", "/api/auth/complete-registration", "/api/auth/login", "/api/auth/check-email",
      "/api/auth/check-display-name", "/api/auth/sync-email-verified", "/api/webhooks/clerk", "/api/public/forms",
    ]) expect(server).toContain(`app.use("${route}", createDistributedRateLimiter(`);
    expect(server).toContain("rateLimitBucketHash(sessionSecret");
    expect(server).toContain('res.setHeader("RateLimit-Reset", String(decision.retryAfterSeconds))');
    expect(server).toContain("return res.status(503)");
  });

  it("ships the same constrained table through raw and release migrations", () => {
    const migration = source("migrations/0127_distributed_request_rate_limits.sql");
    const release = source("server/release-migrate.ts");
    for (const contract of [migration, release]) {
      expect(contract).toContain('"bucket_hash" text PRIMARY KEY');
      expect(contract).toContain('"request_count" integer NOT NULL');
      expect(contract).toContain('"request_rate_limits_expires_idx"');
    }
    expect(migration).not.toContain("email");
    expect(migration).not.toContain("ip_address");
    expect(release).toContain('id: "0127_distributed_request_rate_limits"');
  });
});
