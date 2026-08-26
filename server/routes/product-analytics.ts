import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  latestProductAnalyticsConsent,
  processProductAnalyticsDeletionQueue,
  productAnalyticsConfig,
  productAnalyticsStatus,
  PRODUCT_ANALYTICS_POLICY_VERSION,
} from "../product-analytics";
import { isAuthenticated } from "./middleware";
import { logger } from "../utils";

const consentSchema = z.object({
  enabled: z.boolean(),
  policyVersion: z.literal(PRODUCT_ANALYTICS_POLICY_VERSION),
}).strict();

export function registerProductAnalyticsRoutes(app: Express): void {
  app.get("/api/product-analytics", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const row = await latestProductAnalyticsConsent(req.session.userId!);
      return res.json(productAnalyticsStatus(row));
    } catch (error) {
      logger.error("Could not read product analytics consent", error);
      return res.status(500).json({ error: "Could not read product analytics settings." });
    }
  });

  app.put("/api/product-analytics/consent", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Confirm the current product analytics choice." });
    if (parsed.data.enabled && !productAnalyticsConfig()) {
      return res.status(409).json({ error: "Product analytics is not configured, so LyfeOS will not enable capture." });
    }

    const userId = req.session.userId!;
    try {
      await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 19001)`);
      const currentResult = await tx.execute(sql`
        SELECT "subject_id", "state" FROM "product_analytics_consents"
        WHERE "user_id" = ${userId} ORDER BY "id" DESC LIMIT 1
      `);
      const current = ((currentResult as unknown as { rows?: Array<{ subject_id: string; state: string }> }).rows || [])[0];
      if (parsed.data.enabled) {
        if (current?.state === "enabled") return;
        await tx.execute(sql`
          INSERT INTO "product_analytics_consents" ("user_id", "subject_id", "state", "policy_version", "source")
          VALUES (${userId}, ${crypto.randomUUID()}, 'enabled', ${PRODUCT_ANALYTICS_POLICY_VERSION}, 'profile_settings')
        `);
        return;
      }
      if (!current || current.state === "revoked") return;
      await tx.execute(sql`
        INSERT INTO "product_analytics_consents" ("user_id", "subject_id", "state", "policy_version", "source")
        VALUES (${userId}, ${current.subject_id}, 'revoked', ${PRODUCT_ANALYTICS_POLICY_VERSION}, 'profile_settings')
      `);
      await tx.execute(sql`
        INSERT INTO "product_analytics_deletion_queue" ("subject_id") VALUES (${current.subject_id})
        ON CONFLICT ("subject_id") DO NOTHING
      `);
      });

      if (!parsed.data.enabled) void processProductAnalyticsDeletionQueue();
      const row = await latestProductAnalyticsConsent(userId);
      return res.json(productAnalyticsStatus(row));
    } catch (error) {
      logger.error("Could not update product analytics consent", error);
      return res.status(500).json({ error: "Could not update product analytics settings." });
    }
  });
}
