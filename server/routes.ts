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

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerQuestRoutes(app);
  registerContentRoutes(app);
  registerGoalRoutes(app);
  registerDocumentRoutes(app);
  registerChatRoutes(app);
  registerWaitlistRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
