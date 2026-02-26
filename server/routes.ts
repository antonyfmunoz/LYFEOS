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
import { pool } from "./db";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerQuestRoutes(app);
  registerContentRoutes(app);
  registerGoalRoutes(app);
  registerDocumentRoutes(app);
  registerChatRoutes(app);
  registerWaitlistRoutes(app);

  app.post("/api/admin/wipe-all-data", async (_req, res) => {
    try {
      const tables = [
        'ai_messages', 'calendar_events', 'canvases', 'contacts', 'conversations',
        'dismissed_knowledge', 'documents', 'folders', 'graphs', 'integrations',
        'kanban_tasks', 'kanban_columns', 'kanban_boards', 'media_items', 'media_albums',
        'messages', 'mission_pages', 'progress_trackers', 'push_subscriptions', 'quests',
        'ritual_groups', 'smart_reminders', 'spreadsheets', 'templates',
        'user_activity_events', 'user_categories', 'user_daily_logs', 'user_integrations',
        'user_profile', 'user_stats', 'vision_goals', 'widget_states',
        'users', 'waitlist_emails'
      ];
      await pool.query(`TRUNCATE TABLE ${tables.join(', ')} CASCADE`);
      res.json({ success: true, message: "All data wiped" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
