import type { Express, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import {
  createHealthIntegritySingleFlight,
  healthIntegrityPolicyVersion,
  healthIntegrityReport,
  healthMonitorTokenMatches,
} from "../health-integrity";
import { collectHealthIntegrityCounts } from "../health-integrity-db";
import { pool } from "../db";
import { consumeDistributedRateLimit, rateLimitBucketHash } from "../distributed-rate-limit";
import { sendSentryProbe } from "../sentry-probe";
import { logger } from "../utils";

const runHealthIntegritySingleFlight = createHealthIntegritySingleFlight<Awaited<ReturnType<typeof collectHealthIntegrityCounts>>>();

export function registerOperationalRoutes(app: Express): void {
  app.get("/api/operations/health-integrity", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    if (!healthMonitorTokenMatches(process.env.LYFEOS_MONITOR_TOKEN, req.header("x-lyfeos-monitor-token"))) {
      return res.status(404).json({ error: "Not found" });
    }
    const now = new Date();
    try {
      const report = healthIntegrityReport(await runHealthIntegritySingleFlight(() => collectHealthIntegrityCounts(now)), now);
      return res.status(report.status === "healthy" ? 200 : 503).json(report);
    } catch {
      logger.error("Health integrity aggregate query failed");
      return res.status(503).json({
        status: "unavailable",
        checkedAt: now.toISOString(),
        policyVersion: healthIntegrityPolicyVersion,
      });
    }
  });

  app.post("/api/operations/sentry-probe", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    const configuredToken = process.env.LYFEOS_MONITOR_TOKEN;
    if (!healthMonitorTokenMatches(configuredToken, req.header("x-lyfeos-monitor-token"))) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!process.env.SENTRY_DSN?.trim()) {
      return res.status(503).json({ status: "unavailable", reason: "provider_not_configured" });
    }

    try {
      const bucket = rateLimitBucketHash(configuredToken!, "operations:sentry-probe", "subject", "manual-probe");
      const decision = await consumeDistributedRateLimit(pool, [bucket], 1, 60 * 60 * 1_000);
      res.setHeader("RateLimit-Limit", "1");
      res.setHeader("RateLimit-Remaining", String(decision.remaining));
      res.setHeader("RateLimit-Reset", String(decision.retryAfterSeconds));
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(decision.retryAfterSeconds));
        return res.status(429).json({ status: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds });
      }

      const result = await sendSentryProbe(Sentry);
      return res.status(result.status === "sent" ? 200 : 503).json(result);
    } catch {
      logger.error("Sentry observability probe failed");
      return res.status(503).json({ status: "unavailable" });
    }
  });
}
