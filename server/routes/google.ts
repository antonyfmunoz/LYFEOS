import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { isAuthenticated } from "./middleware";
import { storage } from "../storage";
import { logger } from "../utils";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/drive",
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
      const existingQuests = await storage.getQuests(userId);

      const externalIdMap = new Map<string, number>();
      const questFingerprints = new Map<string, number>();
      for (const q of existingQuests) {
        if (q.externalId && q.externalSource === "google_calendar") {
          externalIdMap.set(q.externalId, q.id);
        }
        if (!q.externalId && q.startDate && q.startTime) {
          const key = `${normalizeTitle(q.title)}|${q.startDate}|${q.startTime}`;
          questFingerprints.set(key, q.id);
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
        const gTimezone = gEvent.start?.timeZone || null;
        const gUrl = gEvent.hangoutLink || gEvent.htmlLink || null;
        const gStatus = gEvent.status || "confirmed";
        const gAttendees = (gEvent.attendees || []).map((a: any) => ({
          email: a.email,
          name: a.displayName || null,
          responseStatus: a.responseStatus || null,
        }));

        const start = parseGoogleDateTime(startRaw);
        const end = parseGoogleDateTime(endRaw);

        const questFields: any = {
          title: gTitle,
          description: gDescription,
          startDate: start.date,
          startTime: isAllDay ? null : start.time,
          endDate: end.date,
          endTime: isAllDay ? null : end.time,
          location: gLocation || null,
          allDay: isAllDay,
          timezone: gTimezone,
          url: gUrl,
          missionStatus: gStatus,
          attendees: gAttendees,
        };

        if (externalIdMap.has(gEvent.id)) {
          await storage.updateQuest(externalIdMap.get(gEvent.id)!, questFields);
          updated++;
          continue;
        }

        const fingerprint = `${normalizeTitle(gTitle)}|${start.date}|${isAllDay ? "00:00" : start.time}`;

        if (questFingerprints.has(fingerprint)) {
          const questId = questFingerprints.get(fingerprint)!;
          await storage.updateQuest(questId, {
            ...questFields,
            externalId: gEvent.id,
            externalSource: "google_calendar",
          });
          linkedExisting++;
          continue;
        }

        await storage.createQuest({
          userId,
          ...questFields,
          category: "general",
          completed: false,
          energyCost: 1,
          experienceReward: 25,
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

      const { missionId } = req.body;
      if (!missionId) {
        return res.status(400).json({ error: "missionId is required" });
      }

      const mission = await storage.getQuest(missionId);
      if (!mission || mission.userId !== userId) {
        return res.status(404).json({ error: "Mission not found" });
      }

      if (!mission.startDate) {
        return res.status(400).json({ error: "Mission has no date — cannot push to Google Calendar" });
      }

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });
      const tz = mission.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      const startDateTime = mission.allDay
        ? undefined
        : `${mission.startDate}T${mission.startTime || "00:00"}:00`;
      const endDate = mission.endDate || mission.startDate;
      const endDateTime = mission.allDay
        ? undefined
        : `${endDate}T${mission.endTime || mission.startTime || "00:00"}:00`;

      const eventBody: any = {
        summary: mission.title,
        description: mission.description || undefined,
        location: mission.location || undefined,
        start: mission.allDay
          ? { date: mission.startDate }
          : { dateTime: startDateTime, timeZone: tz },
        end: mission.allDay
          ? { date: endDate }
          : { dateTime: endDateTime, timeZone: tz },
      };

      if (mission.url) eventBody.source = { url: mission.url };
      if (mission.attendees && Array.isArray(mission.attendees) && (mission.attendees as any[]).length > 0) {
        eventBody.attendees = (mission.attendees as any[]).map((a: any) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      if (mission.externalId && mission.externalSource === "google_calendar") {
        await calendar.events.update({
          calendarId: "primary",
          eventId: mission.externalId,
          requestBody: eventBody,
        });
        return res.json({ success: true, action: "updated" });
      } else {
        const created = await calendar.events.insert({
          calendarId: "primary",
          requestBody: eventBody,
        });
        if (created.data.id) {
          await storage.updateQuest(mission.id, {
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
      logger.error("Error pushing mission to Google Calendar:", error);
      return res.status(500).json({ error: "Failed to push mission to Google" });
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

  app.get("/api/google/drive/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const drive = google.drive({ version: "v3", auth: client.oauth2Client });
      const parentId = (req.query.parentId as string) || "root";

      const response = await drive.files.list({
        q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, parents, webViewLink, createdTime, modifiedTime)",
        orderBy: "name",
        pageSize: 1000,
      });

      const drivefolders = (response.data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parents?.[0] || null,
        webViewLink: f.webViewLink,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
      }));

      return res.json({ folders: drivefolders });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error fetching Google Drive folders:", error);
      return res.status(500).json({ error: "Failed to fetch Drive folders" });
    }
  });

  app.get("/api/google/drive/files", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const drive = google.drive({ version: "v3", auth: client.oauth2Client });
      const pageToken = req.query.pageToken as string | undefined;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 100, 1000);

      const response = await drive.files.list({
        q: "trashed = false",
        fields: "nextPageToken, files(id, name, mimeType, parents, webViewLink, createdTime, modifiedTime, size, thumbnailLink)",
        orderBy: "modifiedTime desc",
        pageSize,
        pageToken: pageToken || undefined,
      });

      const files = (response.data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        parentId: f.parents?.[0] || null,
        webViewLink: f.webViewLink,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : null,
        thumbnailLink: f.thumbnailLink,
      }));

      return res.json({
        files,
        nextPageToken: response.data.nextPageToken || null,
      });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error fetching Google Drive files:", error);
      return res.status(500).json({ error: "Failed to fetch Drive files" });
    }
  });

  app.post("/api/google/drive/sync", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const drive = google.drive({ version: "v3", auth: client.oauth2Client });

      let rootFolder = await storage.getFolderByExternalId(userId, "google_drive", "root");
      if (!rootFolder) {
        rootFolder = await storage.createFolder({
          userId,
          name: "Google Drive",
          source: "google_drive",
          externalId: "root",
          favorite: false,
        });
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      const folderIdMap = new Map<string, number>();
      folderIdMap.set("root", rootFolder.id);

      let folderPageToken: string | undefined;
      const allDriveFolders: any[] = [];
      do {
        const folderRes = await drive.files.list({
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: "nextPageToken, files(id, name, parents, webViewLink)",
          pageSize: 1000,
          pageToken: folderPageToken,
        });
        allDriveFolders.push(...(folderRes.data.files || []));
        folderPageToken = folderRes.data.nextPageToken || undefined;
      } while (folderPageToken);

      const processFolderBatch = async (driveFolders: any[]) => {
        const pending = [...driveFolders];
        let lastPendingCount = -1;

        while (pending.length > 0 && pending.length !== lastPendingCount) {
          lastPendingCount = pending.length;
          const stillPending: any[] = [];

          for (const df of pending) {
            const driveParentId = df.parents?.[0] || "root";
            const parentVaultId = folderIdMap.get(driveParentId);

            if (parentVaultId === undefined) {
              stillPending.push(df);
              continue;
            }

            let existingFolder = await storage.getFolderByExternalId(userId, "google_drive", df.id!);
            if (existingFolder) {
              await storage.updateFolder(existingFolder.id, {
                name: df.name!,
                parentId: parentVaultId,
                externalUrl: df.webViewLink || undefined,
              });
              folderIdMap.set(df.id!, existingFolder.id);
            } else {
              const newFolder = await storage.createFolder({
                userId,
                name: df.name!,
                parentId: parentVaultId,
                source: "google_drive",
                externalId: df.id!,
                externalUrl: df.webViewLink || undefined,
                favorite: false,
              });
              folderIdMap.set(df.id!, newFolder.id);
            }
          }
          pending.length = 0;
          pending.push(...stillPending);
        }
      };

      await processFolderBatch(allDriveFolders);

      let filePageToken: string | undefined;
      do {
        const fileRes = await drive.files.list({
          q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
          fields: "nextPageToken, files(id, name, mimeType, parents, webViewLink, modifiedTime, size)",
          pageSize: 100,
          pageToken: filePageToken,
        });

        const files = fileRes.data.files || [];

        for (const file of files) {
          if (!file.id || !file.name) continue;

          const driveParentId = file.parents?.[0] || "root";
          const vaultFolderId = folderIdMap.get(driveParentId) || rootFolder.id;
          const mimeType = file.mimeType || "";

          const existingDoc = await storage.getDocumentByExternalId(userId, "google_drive", file.id);

          if (mimeType === "application/vnd.google-apps.document") {
            let markdownContent = "";
            try {
              const exported = await drive.files.export({
                fileId: file.id,
                mimeType: "text/plain",
              });
              markdownContent = (exported.data as string) || "";
            } catch (exportErr) {
              logger.error(`Failed to export Google Doc ${file.id}:`, exportErr);
              markdownContent = "";
            }

            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title: file.name,
                content: markdownContent,
                folderId: vaultFolderId,
                externalUrl: file.webViewLink || undefined,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createDocument({
                userId,
                folderId: vaultFolderId,
                title: file.name,
                content: markdownContent,
                format: "markdown",
                source: "google_drive",
                externalId: file.id,
                externalUrl: file.webViewLink || undefined,
                favorite: false,
              });
              imported++;
            }
          } else if (
            mimeType.startsWith("image/") ||
            mimeType.startsWith("video/") ||
            mimeType === "application/pdf"
          ) {
            let fileType: string;
            if (mimeType.startsWith("image/")) fileType = "image";
            else if (mimeType.startsWith("video/")) fileType = "video";
            else fileType = "pdf";

            let fileData: string | null = null;
            try {
              const fileSize = file.size ? parseInt(file.size) : 0;
              if (fileSize < 10 * 1024 * 1024) {
                const downloaded = await drive.files.get(
                  { fileId: file.id, alt: "media" },
                  { responseType: "arraybuffer" }
                );
                const buffer = Buffer.from(downloaded.data as ArrayBuffer);
                fileData = `data:${mimeType};base64,${buffer.toString("base64")}`;
              }
            } catch (dlErr) {
              logger.error(`Failed to download file ${file.id}:`, dlErr);
            }

            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title: file.name,
                folderId: vaultFolderId,
                externalUrl: file.webViewLink || undefined,
                fileType,
                mimeType,
                fileSize: file.size ? parseInt(file.size) : undefined,
                fileData: fileData || undefined,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createDocument({
                userId,
                folderId: vaultFolderId,
                title: file.name,
                content: "",
                format: "binary",
                source: "google_drive",
                externalId: file.id,
                externalUrl: file.webViewLink || undefined,
                fileType,
                mimeType,
                fileSize: file.size ? parseInt(file.size) : undefined,
                fileData: fileData || undefined,
                favorite: false,
              });
              imported++;
            }
          } else if (
            mimeType === "application/vnd.google-apps.spreadsheet" ||
            mimeType === "application/vnd.google-apps.presentation"
          ) {
            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title: file.name,
                folderId: vaultFolderId,
                externalUrl: file.webViewLink || undefined,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createDocument({
                userId,
                folderId: vaultFolderId,
                title: file.name,
                content: "",
                format: "link",
                source: "google_drive",
                externalId: file.id,
                externalUrl: file.webViewLink || undefined,
                fileType: "document",
                favorite: false,
              });
              imported++;
            }
          } else {
            skipped++;
          }
        }

        filePageToken = fileRes.data.nextPageToken || undefined;
      } while (filePageToken);

      return res.json({ imported, updated, skipped, folders: allDriveFolders.length });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error syncing Google Drive:", error);
      return res.status(500).json({ error: "Failed to sync Google Drive" });
    }
  });

  app.post("/api/google/drive/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId);
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const drive = google.drive({ version: "v3", auth: client.oauth2Client });
      const allDocs = await storage.getDocuments(userId);
      const driveDocs = allDocs.filter(
        (d) => d.source === "google_drive" && d.externalId && !d.fileType
      );

      let pushed = 0;
      let created = 0;
      let skippedCount = 0;

      for (const doc of driveDocs) {
        if (doc.lastSyncedAt && doc.updatedAt && doc.updatedAt <= doc.lastSyncedAt) {
          skippedCount++;
          continue;
        }

        try {
          await drive.files.update({
            fileId: doc.externalId!,
            media: {
              mimeType: "text/plain",
              body: doc.content,
            },
          });
          await storage.updateDocument(doc.id, { lastSyncedAt: new Date() });
          pushed++;
        } catch (pushErr) {
          logger.error(`Failed to push doc ${doc.id} to Drive:`, pushErr);
        }
      }

      const localDocs = allDocs.filter(
        (d) => d.source === "local" && !d.fileType && d.content
      );

      if (req.body.includeLocal) {
        for (const doc of localDocs) {
          try {
            const createRes = await drive.files.create({
              requestBody: {
                name: doc.title,
                mimeType: "application/vnd.google-apps.document",
              },
              media: {
                mimeType: "text/plain",
                body: doc.content,
              },
            });

            if (createRes.data.id) {
              const fileInfo = await drive.files.get({
                fileId: createRes.data.id,
                fields: "webViewLink",
              });

              await storage.updateDocument(doc.id, {
                source: "google_drive",
                externalId: createRes.data.id,
                externalUrl: fileInfo.data.webViewLink || undefined,
                lastSyncedAt: new Date(),
              });
              created++;
            }
          } catch (createErr) {
            logger.error(`Failed to create doc ${doc.id} in Drive:`, createErr);
          }
        }
      }

      return res.json({ pushed, created, skipped: skippedCount });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error pushing to Google Drive:", error);
      return res.status(500).json({ error: "Failed to push to Google Drive" });
    }
  });

  app.post("/api/google/drive/push-document/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const docId = parseInt(req.params.id);
      if (isNaN(docId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }

      const doc = await storage.getDocument(docId);
      if (!doc || doc.userId !== userId) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (doc.fileType) {
        return res.status(400).json({ error: "Cannot push media files to Google Drive as documents" });
      }

      const client = await getAuthenticatedClient(userId);
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }

      const drive = google.drive({ version: "v3", auth: client.oauth2Client });

      if (doc.externalId && doc.source === "google_drive") {
        await drive.files.update({
          fileId: doc.externalId,
          media: {
            mimeType: "text/plain",
            body: doc.content,
          },
        });
        await storage.updateDocument(doc.id, { lastSyncedAt: new Date() });
        return res.json({ success: true, action: "updated" });
      } else {
        const createRes = await drive.files.create({
          requestBody: {
            name: doc.title,
            mimeType: "application/vnd.google-apps.document",
          },
          media: {
            mimeType: "text/plain",
            body: doc.content,
          },
        });

        if (createRes.data.id) {
          const fileInfo = await drive.files.get({
            fileId: createRes.data.id,
            fields: "webViewLink",
          });

          await storage.updateDocument(doc.id, {
            source: "google_drive",
            externalId: createRes.data.id,
            externalUrl: fileInfo.data.webViewLink || undefined,
            lastSyncedAt: new Date(),
          });
        }

        return res.json({ success: true, action: "created", googleFileId: createRes.data.id });
      }
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logger.error("Error pushing document to Google Drive:", error);
      return res.status(500).json({ error: "Failed to push document to Google Drive" });
    }
  });
}
