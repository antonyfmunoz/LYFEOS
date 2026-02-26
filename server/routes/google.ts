import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { isAuthenticated } from "./middleware";
import { storage } from "../storage";
import { logger } from "../utils";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
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

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function parseGoogleDateTime(dt: string): { date: string; time: string } {
  if (dt.includes("T")) {
    const d = new Date(dt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { date, time };
  }
  return { date: dt, time: "00:00" };
}

function calcDuration(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const totalMins = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMins <= 0) return "0m";
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
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
        maxResults: 250,
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

  app.post("/api/google/calendar/sync", isAuthenticated, async (req: Request, res: Response) => {
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
        maxResults: 250,
        singleEvents: true,
        orderBy: "startTime",
      });

      const googleEvents = response.data.items || [];
      const existingLocalEvents = await storage.getEvents(userId);
      const existingQuests = await storage.getQuests(userId);

      const externalIdMap = new Map<string, number>();
      for (const ev of existingLocalEvents) {
        if (ev.externalId && ev.externalSource === "google_calendar") {
          externalIdMap.set(ev.externalId, ev.id);
        }
      }

      const localEventFingerprints = new Map<string, number>();
      for (const ev of existingLocalEvents) {
        if (!ev.externalId) {
          const key = `${normalizeTitle(ev.title)}|${ev.date}|${ev.startTime}`;
          localEventFingerprints.set(key, ev.id);
        }
      }

      const missionFingerprints = new Set<string>();
      for (const q of existingQuests) {
        if (q.startDate && q.startTime) {
          const key = `${normalizeTitle(q.title)}|${q.startDate}|${q.startTime}`;
          missionFingerprints.add(key);
        }
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let linkedExisting = 0;

      for (const gEvent of googleEvents) {
        if (!gEvent.id || gEvent.status === "cancelled") continue;

        const gTitle = gEvent.summary || "Untitled";
        const gDescription = gEvent.description || "";
        const isAllDay = !gEvent.start?.dateTime;
        const startRaw = gEvent.start?.dateTime || gEvent.start?.date || "";
        const endRaw = gEvent.end?.dateTime || gEvent.end?.date || "";
        const gLocation = gEvent.location || "";

        const start = parseGoogleDateTime(startRaw);
        const end = parseGoogleDateTime(endRaw);
        const duration = isAllDay ? "All day" : calcDuration(start.time, end.time);

        if (externalIdMap.has(gEvent.id)) {
          await storage.updateEvent(externalIdMap.get(gEvent.id)!, {
            title: gTitle,
            description: gDescription,
            startTime: start.time,
            endTime: end.time,
            duration,
            date: start.date,
            location: gLocation,
            allDay: isAllDay,
          });
          updated++;
          continue;
        }

        const fingerprint = `${normalizeTitle(gTitle)}|${start.date}|${start.time}`;

        if (localEventFingerprints.has(fingerprint)) {
          const localId = localEventFingerprints.get(fingerprint)!;
          await storage.updateEvent(localId, {
            externalId: gEvent.id,
            externalSource: "google_calendar",
            description: gDescription || undefined,
            location: gLocation || undefined,
            endTime: end.time,
          });
          linkedExisting++;
          continue;
        }

        if (missionFingerprints.has(fingerprint)) {
          skipped++;
          continue;
        }

        await storage.createEvent({
          userId,
          title: gTitle,
          description: gDescription,
          startTime: start.time,
          endTime: end.time,
          duration,
          category: "personal",
          date: start.date,
          location: gLocation,
          allDay: isAllDay,
          externalId: gEvent.id,
          externalSource: "google_calendar",
        });
        imported++;
      }

      return res.json({ imported, updated, skipped, linkedExisting, total: googleEvents.length });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error syncing Google Calendar:", error);
      return res.status(500).json({ error: "Failed to sync calendar" });
    }
  });

  app.post("/api/google/calendar/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const { eventId } = req.body;
      if (!eventId) {
        return res.status(400).json({ error: "eventId is required" });
      }

      const localEvent = await storage.getEvent(eventId);
      if (!localEvent || localEvent.userId !== userId) {
        return res.status(404).json({ error: "Event not found" });
      }

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });

      const startDateTime = localEvent.allDay
        ? undefined
        : `${localEvent.date}T${localEvent.startTime}:00`;
      const endDateTime = localEvent.allDay
        ? undefined
        : localEvent.endTime
          ? `${localEvent.date}T${localEvent.endTime}:00`
          : `${localEvent.date}T${localEvent.startTime}:00`;

      const eventBody: any = {
        summary: localEvent.title,
        description: localEvent.description,
        location: localEvent.location || undefined,
        start: localEvent.allDay
          ? { date: localEvent.date }
          : { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: localEvent.allDay
          ? { date: localEvent.date }
          : { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      };

      if (localEvent.externalId && localEvent.externalSource === "google_calendar") {
        await calendar.events.update({
          calendarId: "primary",
          eventId: localEvent.externalId,
          requestBody: eventBody,
        });
        return res.json({ success: true, action: "updated" });
      } else {
        const created = await calendar.events.insert({
          calendarId: "primary",
          requestBody: eventBody,
        });
        if (created.data.id) {
          await storage.updateEvent(localEvent.id, {
            externalId: created.data.id,
            externalSource: "google_calendar",
          });
        }
        return res.json({ success: true, action: "created", googleEventId: created.data.id });
      }
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error pushing event to Google Calendar:", error);
      return res.status(500).json({ error: "Failed to push event to Google" });
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

      const externalIdSet = new Set(
        existingQuests
          .filter((q: any) => q.externalSource === "google_tasks")
          .map((q: any) => q.externalId)
      );

      const missionFingerprints = new Set<string>();
      for (const q of existingQuests) {
        const key = normalizeTitle(q.title);
        if (q.startDate) {
          missionFingerprints.add(`${key}|${q.startDate}`);
        }
        missionFingerprints.add(key);
      }

      let imported = 0;
      let skipped = 0;

      for (const task of tasksToImport) {
        if (externalIdSet.has(task.id)) {
          skipped++;
          continue;
        }

        let startDate = null;
        if (task.due) {
          const d = new Date(task.due);
          startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        const titleNorm = normalizeTitle(task.title);
        if (startDate && missionFingerprints.has(`${titleNorm}|${startDate}`)) {
          skipped++;
          continue;
        }
        if (missionFingerprints.has(titleNorm)) {
          skipped++;
          continue;
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
