import type { Express, Request, Response } from "express";
import {
  createHealthIntegritySingleFlight,
  healthIntegrityPolicyVersion,
  healthIntegrityReport,
  healthMonitorTokenMatches,
} from "../health-integrity";
import { collectHealthIntegrityCounts } from "../health-integrity-db";
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
}
