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

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.get("/api/version", (_req, res) => {
    res.json({ version: "1.0.0", env: process.env.NODE_ENV || "development" });
  });

  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerQuestRoutes(app);
  registerContentRoutes(app);
  registerGoalRoutes(app);
  registerDocumentRoutes(app);
  registerChatRoutes(app);
  registerWaitlistRoutes(app);
  registerGoogleRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
