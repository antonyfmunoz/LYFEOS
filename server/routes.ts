import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerAuthRoutes } from "./routes/auth";
import { registerProfileRoutes } from "./routes/profile";
import { registerQuestRoutes } from "./routes/quests";
import { registerContentRoutes } from "./routes/content";
import { registerGoalRoutes } from "./routes/goals";
import { registerDocumentRoutes } from "./routes/documents";
import { registerWaitlistRoutes } from "./routes/waitlist";
import { registerGoogleRoutes } from "./routes/google";
import { registerUMHRoutes } from "./routes/umh";
import { registerTransformationThreadRoutes } from "./routes/transformation-threads";
import { registerProgressionRoutes } from "./routes/progression";
import { registerCrossProductSharingRoutes } from "./routes/cross-product-sharing";
import { registerMissionContractRoutes } from "./routes/mission-contracts";
import { registerMissionReviewRoutes } from "./routes/mission-reviews";
import { registerRelationshipRoutes } from "./routes/relationships";
import { registerInboxRoutes } from "./routes/inbox";
import { registerHealthFitnessRoutes } from "./routes/health-fitness";
import { registerNutritionRoutes } from "./routes/nutrition";
import { registerWorkoutRoutes } from "./routes/workouts";
import { registerRecoveryRoutes } from "./routes/recovery";
import { registerHealthObservationRoutes } from "./routes/health-observations";
import { registerIngredientScannerRoutes } from "./routes/ingredient-scanner";
import { registerExerciseRoutes } from "./routes/exercises";
import { registerTrainingProgramRoutes } from "./routes/training-programs";
import { registerSupplementScheduleRoutes } from "./routes/supplement-schedules";
import { registerMealPlanRoutes } from "./routes/meal-plans";
import { registerHealthInsightRoutes } from "./routes/health-insights";
import { registerHealthConnectionRoutes } from "./routes/health-connections";
import { registerOperationalRoutes } from "./routes/operations";
import { registerSearchRoutes } from "./routes/search";
import { registerTableRoutes } from "./routes/tables";
import { registerAutomationRoutes } from "./routes/automations";
import { registerProjectRoutes } from "./routes/projects";
import { registerMessageRoutes } from "./routes/messages";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { isHealthEvidenceMutation, scheduleHealthProgressionReconcile } from "./health-progression";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use((req, res, next) => {
    const privateHealthPrefixes = [
      "/api/health-fitness", "/api/health-progression", "/api/health-insights", "/api/health-data", "/api/health-connections",
      "/api/health-observations", "/api/health-metric-definitions", "/api/nutrition", "/api/workouts",
      "/api/workout-templates", "/api/workout-programs", "/api/workout-program-sessions", "/api/recovery-activities",
      "/api/recovery-routines", "/api/exercises", "/api/supplement-schedules", "/api/ingredient-scans",
      "/api/ingredient-preferences",
    ];
    if (privateHealthPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie");
    }
    res.on("finish", () => {
      const userId = req.session?.userId;
      if (userId && res.statusCode < 400 && isHealthEvidenceMutation(req.method, req.path)) scheduleHealthProgressionReconcile(userId);
    });
    next();
  });
  app.get("/api/health", (req, res) => {
    try {
      const payload: Record<string, any> = { status: "ok", timestamp: Date.now(), buildTime: "2026-06-22", uptime: process.uptime() };
      if (req.query.verbose === "true") {
        payload.memory = process.memoryUsage();
      }
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.get("/api/release", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    const bakedRevision = process.env.LYFEOS_RELEASE?.trim();
    const sentryRevision = process.env.SENTRY_RELEASE?.trim();
    const sourceRevision = bakedRevision || sentryRevision || null;
    let migrations: { status: "available" | "unavailable"; count: number | null; latest: string | null } = {
      status: "unavailable",
      count: null,
      latest: null,
    };

    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(*)::integer AS "count",
          (SELECT "id" FROM "lyfeos_schema_migrations" ORDER BY "applied_at" DESC, "id" DESC LIMIT 1) AS "latest"
        FROM "lyfeos_schema_migrations"
      `);
      const row = (result as unknown as { rows?: Array<{ count: number | string; latest: string | null }> }).rows?.[0];
      migrations = {
        status: "available",
        count: Number(row?.count || 0),
        latest: row?.latest || null,
      };
    } catch {
      // Older releases may not have the release ledger yet. Keep this endpoint
      // useful for source identification without exposing database errors.
    }

    return res.json({
      service: "lyfeos",
      sourceRevision,
      imageReference: process.env.FLY_IMAGE_REF?.trim() || null,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      migrations,
    });
  });

  app.get("/api/version", (_req, res) => {
    res.json({ version: "1.0.0", env: process.env.NODE_ENV || "development", createdAt: new Date().toISOString() });
  });

  registerOperationalRoutes(app);
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerQuestRoutes(app);
  registerContentRoutes(app);
  registerSearchRoutes(app);
  registerTableRoutes(app);
  registerAutomationRoutes(app);
  registerProjectRoutes(app);
  registerMessageRoutes(app);
  registerGoalRoutes(app);
  registerDocumentRoutes(app);
  registerChatRoutes(app);
  registerWaitlistRoutes(app);
  registerGoogleRoutes(app);
  registerUMHRoutes(app);
  registerTransformationThreadRoutes(app);
  registerProgressionRoutes(app);
  registerCrossProductSharingRoutes(app);
  registerMissionContractRoutes(app);
  registerMissionReviewRoutes(app);
  registerRelationshipRoutes(app);
  registerInboxRoutes(app);
  registerHealthFitnessRoutes(app);
  registerNutritionRoutes(app);
  registerWorkoutRoutes(app);
  registerRecoveryRoutes(app);
  registerHealthObservationRoutes(app);
  registerIngredientScannerRoutes(app);
  registerExerciseRoutes(app);
  registerTrainingProgramRoutes(app);
  registerSupplementScheduleRoutes(app);
  registerMealPlanRoutes(app);
  registerHealthInsightRoutes(app);
  registerHealthConnectionRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
