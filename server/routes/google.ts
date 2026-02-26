import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { isAuthenticated } from "./middleware";
import { storage } from "../storage";
import { logger } from "../utils";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
];

function getOAuth2Client() {
  const redirectUri = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/api/google/callback`
    : `http://localhost:5000/api/google/callback`;

  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );
}

async function getAuthenticatedClient(userId: number) {
  const integrations = await storage.getUserIntegrations(userId);
  const googleIntegration = integrations.find(
    (i) => i.provider === "google" && i.status === "active"
  );

  if (!googleIntegration || !googleIntegration.accessToken) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: googleIntegration.accessToken,
    refresh_token: googleIntegration.refreshToken,
  });

  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updateData: Record<string, any> = {};
      if (tokens.access_token) updateData.accessToken = tokens.access_token;
      if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) updateData.tokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(updateData).length > 0) {
        await storage.updateIntegration(googleIntegration.id, updateData);
      }
    } catch (err) {
      logger.error("Failed to persist refreshed Google tokens:", err);
    }
  });

  return { oauth2Client, integrationId: googleIntegration.id };
}

export function registerGoogleRoutes(app: Express): void {
  app.get("/api/google/auth-url", isAuthenticated, (req: Request, res: Response) => {
    try {
      const oauth2Client = getOAuth2Client();
      const state = JSON.stringify({ userId: req.session.userId });

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        state,
        prompt: "consent",
      });

      return res.json({ url: authUrl });
    } catch (error) {
      logger.error("Error generating Google auth URL:", error);
      return res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== "string") {
        return res.redirect("/profile?google=error&reason=no_code");
      }

      let userId: number;
      try {
        const parsed = JSON.parse(state as string);
        userId = parsed.userId;
      } catch {
        return res.redirect("/profile?google=error&reason=invalid_state");
      }

      if (!userId || userId !== req.session.userId) {
        return res.redirect("/profile?google=error&reason=session_mismatch");
      }

      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      const existingIntegrations = await storage.getUserIntegrations(userId);
      const existingGoogle = existingIntegrations.find((i) => i.provider === "google");

      if (existingGoogle) {
        await storage.updateIntegration(existingGoogle.id, {
          accessToken: tokens.access_token || undefined,
          refreshToken: tokens.refresh_token || undefined,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          status: "active",
          scope: SCOPES.join(" "),
        });
      } else {
        await storage.createIntegration({
          userId,
          provider: "google",
          providerName: "Google",
          accessToken: tokens.access_token || undefined,
          refreshToken: tokens.refresh_token || undefined,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          scope: SCOPES.join(" "),
          status: "active",
          settings: {},
        });
      }

      return res.redirect("/profile?google=connected");
    } catch (error) {
      logger.error("Google OAuth callback error:", error);
      return res.redirect("/profile?google=error&reason=token_exchange");
    }
  });

  app.get("/api/google/calendar/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });

      const now = new Date();
      const fourWeeksLater = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: fourWeeksLater.toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (response.data.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "Untitled",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        allDay: !event.start?.dateTime,
        location: event.location || "",
        status: event.status,
        htmlLink: event.htmlLink,
      }));

      return res.json({ events });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error fetching Google Calendar events:", error);
      return res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/google/tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const tasks = google.tasks({ version: "v1", auth: client.oauth2Client });

      const taskListsResponse = await tasks.tasklists.list({ maxResults: 10 });
      const taskLists = taskListsResponse.data.items || [];

      const allTasks: any[] = [];

      for (const list of taskLists) {
        if (!list.id) continue;
        const tasksResponse = await tasks.tasks.list({
          tasklist: list.id,
          maxResults: 100,
          showCompleted: false,
          showHidden: false,
        });

        const items = (tasksResponse.data.items || []).map((task) => ({
          id: task.id,
          title: task.title || "Untitled",
          notes: task.notes || "",
          due: task.due || null,
          status: task.status,
          listId: list.id,
          listName: list.title || "Tasks",
        }));

        allTasks.push(...items);
      }

      return res.json({ tasks: allTasks });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error fetching Google Tasks:", error);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/google/tasks/import", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const { tasks: tasksToImport } = req.body;

      if (!Array.isArray(tasksToImport) || tasksToImport.length === 0) {
        return res.status(400).json({ error: "No tasks provided" });
      }

      const existingQuests = await storage.getQuests(userId);
      const existingExternalIds = new Set(
        existingQuests
          .filter((q: any) => q.externalSource === "google_tasks")
          .map((q: any) => q.externalId)
      );

      let imported = 0;
      let skipped = 0;

      for (const task of tasksToImport) {
        if (existingExternalIds.has(task.id)) {
          skipped++;
          continue;
        }

        let startDate = null;
        if (task.due) {
          const d = new Date(task.due);
          startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        await storage.createQuest({
          userId,
          title: task.title,
          description: task.notes || `Imported from Google Tasks (${task.listName})`,
          category: "general",
          completed: false,
          energyCost: 1,
          experienceReward: 25,
          startDate,
          externalId: task.id,
          externalSource: "google_tasks",
        });

        imported++;
      }

      return res.json({ imported, skipped, total: tasksToImport.length });
    } catch (error) {
      logger.error("Error importing Google Tasks:", error);
      return res.status(500).json({ error: "Failed to import tasks" });
    }
  });

  app.post("/api/google/disconnect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const integrations = await storage.getUserIntegrations(userId);
      const googleIntegration = integrations.find((i) => i.provider === "google");

      if (googleIntegration) {
        try {
          const oauth2Client = getOAuth2Client();
          if (googleIntegration.accessToken) {
            await oauth2Client.revokeToken(googleIntegration.accessToken);
          }
        } catch {
        }
        await storage.deleteIntegration(googleIntegration.id);
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Error disconnecting Google:", error);
      return res.status(500).json({ error: "Failed to disconnect Google" });
    }
  });

  app.get("/api/google/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const integrations = await storage.getUserIntegrations(userId);
      const googleIntegration = integrations.find(
        (i) => i.provider === "google" && i.status === "active"
      );

      return res.json({
        connected: !!googleIntegration,
        scope: googleIntegration?.scope || null,
        connectedAt: googleIntegration?.connectedAt || null,
      });
    } catch (error) {
      logger.error("Error checking Google status:", error);
      return res.status(500).json({ error: "Failed to check status" });
    }
  });
}
