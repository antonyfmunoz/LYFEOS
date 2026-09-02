import type { Express, Request, Response } from "express";
import type { PoolClient } from "pg";
import { google } from "googleapis";
import crypto from "crypto";
import { isAuthenticated } from "./middleware";
import { storage } from "../storage";
import { logger } from "../utils";
import { createMissionLifecycleResult, MissionLifecycleError, updateMissionLifecycle } from "../mission-lifecycle";
import { shiftCalendarDate } from "@shared/calendar";
import { db, pool } from "../db";
import { missionExternalLinks } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { fetchGoogleCalendarSyncBatch, parseGoogleCalendarDateTime, readGoogleCalendarSyncState, writeGoogleCalendarSyncState } from "../google-calendar-sync";
import { configuredIntegrationCredentialKey, deleteIntegrationCredential, readIntegrationCredential, writeIntegrationCredential } from "../integration-provider-credentials";
import {
  GOOGLE_INTEGRATION_SERVICES,
  defaultGoogleIntegrationPermissions,
  googleIntegrationApprovalRequired,
  googleIntegrationCapabilityAllowed,
  googleFutureActionAllowed,
  normalizeGoogleAccountPermissionPreferences,
  normalizeGoogleIntegrationPermissions,
  parseGoogleAccountPermissionPreferences,
  parseGoogleIntegrationPermissionPatch,
  writeGoogleAccountPermissionPreferences,
  writeGoogleIntegrationPermissions,
  type GoogleIntegrationCapability,
  type GoogleIntegrationService,
} from "@shared/google-integration-permissions";
import {
  completeIntegrationActionReceipt,
  consumeIntegrationApproval,
  createAuthorizedIntegrationReceipt,
  createPendingIntegrationApproval,
  alwaysAllowIntegrationApproval,
  decideIntegrationApproval,
  listIntegrationActionReceipts,
  type IntegrationActionDescriptor,
  type IntegrationApprovalDecision,
} from "../integration-action-approvals";
import { integrationActionFingerprint } from "../integration-action-fingerprint";

declare module "express-session" {
  interface SessionData {
    googleOAuthState?: string;
    googleOAuthUserId?: number;
    googleOAuthStartedAt?: number;
    googleOAuthService?: GoogleIntegrationService;
  }
}

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_SERVICES = GOOGLE_INTEGRATION_SERVICES;
const GOOGLE_SERVICE_CONFIG = {
  calendar: { provider: "google_calendar", providerName: "Google Calendar", scope: GOOGLE_CALENDAR_SCOPE, envPrefix: "GOOGLE_CALENDAR" },
  tasks: { provider: "google_tasks", providerName: "Google Tasks", scope: GOOGLE_TASKS_SCOPE, envPrefix: "GOOGLE_TASKS" },
  drive: { provider: "google_drive", providerName: "Google Drive", scope: GOOGLE_DRIVE_SCOPE, envPrefix: "GOOGLE_DRIVE" },
} as const satisfies Record<GoogleIntegrationService, { provider: string; providerName: string; scope: string; envPrefix: string }>;
const GOOGLE_ACTIONS = {
  calendarRead: { key: "google.calendar.read_events", title: "Read Google Calendar", summary: "View Google Calendar event details for LyfeOS planning.", capability: "read", risk: "low", futureAction: false },
  calendarSync: { key: "google.calendar.sync", title: "Sync Google Calendar", summary: "Import Google Calendar changes into your LyfeOS missions.", capability: "import", risk: "medium", futureAction: false },
  calendarPush: { key: "google.calendar.push", title: "Change Google Calendar", summary: "Create or update a Google Calendar event from a LyfeOS mission.", capability: "write", risk: "important", futureAction: false },
  calendarDelete: { key: "google.calendar.delete_event", title: "Remove Google Calendar event", summary: "Delete the Google Calendar event linked to this LyfeOS mission. The LyfeOS mission will be kept.", capability: "write", risk: "important", futureAction: false },
  tasksRead: { key: "google.tasks.read", title: "Read Google Tasks", summary: "View active tasks from your connected Google Tasks account.", capability: "read", risk: "low", futureAction: false },
  tasksImport: { key: "google.tasks.import", title: "Import Google Tasks", summary: "Create LyfeOS missions from active Google Tasks.", capability: "import", risk: "medium", futureAction: false },
  tasksPush: { key: "google.tasks.push", title: "Change Google Tasks", summary: "Create or update a Google Task from a LyfeOS mission.", capability: "write", risk: "important", futureAction: false },
  tasksDelete: { key: "google.tasks.delete_task", title: "Remove Google Task", summary: "Delete the Google Task linked to this LyfeOS mission. The LyfeOS mission will be kept.", capability: "write", risk: "important", futureAction: false },
  driveFolders: { key: "google.drive.list_folders", title: "Browse Google Drive folders", summary: "View folder names and structure from your connected Google Drive.", capability: "read", risk: "low", futureAction: false },
  driveFiles: { key: "google.drive.list_files", title: "Browse Google Drive files", summary: "View supported file names and metadata from your connected Google Drive.", capability: "read", risk: "low", futureAction: false },
  driveSync: { key: "google.drive.sync", title: "Sync Google Drive", summary: "Import supported Google Drive files into your private LyfeOS vault.", capability: "import", risk: "medium", futureAction: false },
  drivePush: { key: "google.drive.push", title: "Change Google Drive", summary: "Update changed Drive-linked documents from your LyfeOS vault.", capability: "write", risk: "important", futureAction: false },
  drivePushDocument: { key: "google.drive.push_document", title: "Change a Google Drive document", summary: "Create or update one Google Drive document from your LyfeOS vault.", capability: "write", risk: "important", futureAction: false },
} as const satisfies Record<string, IntegrationActionDescriptor>;
const googleOAuthStateLifetimeMs = 10 * 60 * 1_000;
const googleDriveSyncStateKey = "googleDriveSyncV1";
// Keep an import within the memory envelope of the production web process.
// Binary files remain available through their private Drive link; text imports
// are streamed and bounded before they are stored in the LyfeOS vault.
const googleDriveFolderPageSize = 100;
const googleDriveFilePageSize = 25;
const maxGoogleDriveTextImportBytes = 1 * 1024 * 1024;
const googleDriveSyncStaleAfterMs = 2 * 60 * 1_000;

type GoogleDriveSyncState = {
  version: 1;
  state: "running" | "succeeded" | "failed";
  startedAt: string;
  updatedAt: string;
  imported: number;
  updated: number;
  skipped: number;
  folders: number;
  error?: "provider_unavailable" | "connection_revoked";
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readGoogleDriveSyncState(settings: unknown): GoogleDriveSyncState | null {
  const value = record(record(settings)[googleDriveSyncStateKey]);
  const state = value.state;
  if (value.version !== 1 || !["running", "succeeded", "failed"].includes(String(state)) || typeof value.startedAt !== "string" || typeof value.updatedAt !== "string") return null;
  const number = (key: "imported" | "updated" | "skipped" | "folders") => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0 ? Number(value[key]) : 0;
  return {
    version: 1,
    state: state as GoogleDriveSyncState["state"],
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    imported: number("imported"),
    updated: number("updated"),
    skipped: number("skipped"),
    folders: number("folders"),
    ...(value.error === "provider_unavailable" || value.error === "connection_revoked" ? { error: value.error } : {}),
  };
}

function writeGoogleDriveSyncState(settings: unknown, state: GoogleDriveSyncState): Record<string, unknown> {
  return { ...record(settings), [googleDriveSyncStateKey]: state };
}

async function saveGoogleDriveSyncState(userId: number, integrationId: number, state: GoogleDriveSyncState): Promise<void> {
  const latest = await storage.getIntegration(integrationId);
  if (!latest || latest.userId !== userId || latest.status !== "active") throw new Error("GOOGLE_DRIVE_CONNECTION_REVOKED");
  await storage.updateIntegration(integrationId, {
    settings: writeGoogleDriveSyncState(latest.settings, state),
    ...(state.state === "succeeded" ? { lastSyncedAt: new Date() } : {}),
  });
}

async function readGoogleDriveTextImport(value: unknown): Promise<string | null> {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8") <= maxGoogleDriveTextImportBytes ? value : null;
  }

  const stream = value as AsyncIterable<unknown> & { destroy?: () => void };
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") return null;

  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    byteLength += buffer.length;
    if (byteLength > maxGoogleDriveTextImportBytes) {
      stream.destroy?.();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, byteLength).toString("utf8");
}

function isStaleGoogleDriveSync(state: GoogleDriveSyncState): boolean {
  return state.state === "running" && Date.now() - Date.parse(state.updatedAt) > googleDriveSyncStaleAfterMs;
}

function parseGoogleService(value: unknown): GoogleIntegrationService | null {
  return typeof value === "string" && (GOOGLE_SERVICES as readonly string[]).includes(value) ? value as GoogleIntegrationService : null;
}

function googleStateMatches(received: unknown, expected: unknown): boolean {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function clearGoogleOAuthSession(req: Request): void {
  delete req.session.googleOAuthState; delete req.session.googleOAuthUserId; delete req.session.googleOAuthStartedAt; delete req.session.googleOAuthService;
}

function allowedGoogleScopes(service: GoogleIntegrationService, scopes: Iterable<string>): string[] {
  const requiredScope = GOOGLE_SERVICE_CONFIG[service].scope;
  return Array.from(new Set(Array.from(scopes).filter((scope) => scope === requiredScope))).sort();
}

function googleProviderStatus(error: unknown): number | undefined {
  const candidate = error as { code?: unknown; response?: { status?: unknown } } | null;
  const status = Number(candidate?.response?.status ?? candidate?.code);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function logGoogleFailure(operation: string, error: unknown, userId?: number): void {
  logger.error(operation, {
    userId,
    providerStatus: googleProviderStatus(error),
    errorType: error instanceof Error ? error.name : "unknown",
  });
}

function googleOAuthEnvironment(service: GoogleIntegrationService, suffix: "CLIENT_ID" | "CLIENT_SECRET" | "REDIRECT_URI"): string | undefined {
  const serviceValue = process.env[`${GOOGLE_SERVICE_CONFIG[service].envPrefix}_OAUTH_${suffix}`];
  if (serviceValue) return serviceValue;
  return process.env.NODE_ENV === "production" ? undefined : process.env[`GOOGLE_OAUTH_${suffix}`];
}

function isGoogleOAuthConfigured(service: GoogleIntegrationService): boolean {
  if (!googleOAuthEnvironment(service, "CLIENT_ID") || !googleOAuthEnvironment(service, "CLIENT_SECRET")) return false;
  try {
    configuredIntegrationCredentialKey();
    const redirect = new URL(getRedirectUri(service));
    if (process.env.NODE_ENV === "production" && (redirect.protocol !== "https:" || !googleOAuthEnvironment(service, "REDIRECT_URI"))) return false;
    return true;
  } catch {
    return false;
  }
}

function getRedirectUri(service: GoogleIntegrationService): string {
  const configured = googleOAuthEnvironment(service, "REDIRECT_URI");
  if (configured) return configured;
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/api/google/${service}/callback`;
  return `http://localhost:5000/api/google/${service}/callback`;
}

function getOAuth2Client(service: GoogleIntegrationService) {
  return new google.auth.OAuth2(
    googleOAuthEnvironment(service, "CLIENT_ID"),
    googleOAuthEnvironment(service, "CLIENT_SECRET"),
    getRedirectUri(service),
  );
}

async function getAuthenticatedClient(userId: number, service: GoogleIntegrationService) {
  const integrations = await storage.getUserIntegrations(userId);
  const config = GOOGLE_SERVICE_CONFIG[service];
  const googleIntegration = integrations.find((i) => i.provider === config.provider && i.status === "active")
    || integrations.find((i) => i.provider === "google" && i.status === "active" && (i.scope || "").split(/\s+/).includes(config.scope));

  if (!googleIntegration) {
    return null;
  }
  const credentialProvider = googleIntegration.provider;
  const credential = await readIntegrationCredential({ userId, integrationId: googleIntegration.id, provider: credentialProvider });
  if (!credential?.accessToken) return null;

  const oauth2Client = getOAuth2Client(service);
  oauth2Client.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    expiry_date: credential.expiresAt ? new Date(credential.expiresAt).getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    try {
      if (!tokens.access_token && !tokens.refresh_token && !tokens.expiry_date) return;
      const current = await readIntegrationCredential({ userId, integrationId: googleIntegration.id, provider: credentialProvider });
      if (!current) return;
      await writeIntegrationCredential({ userId, integrationId: googleIntegration.id, provider: credentialProvider }, {
        accessToken: tokens.access_token || current.accessToken,
        refreshToken: tokens.refresh_token || current.refreshToken || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : current.expiresAt || null,
        tokenType: tokens.token_type || current.tokenType || "Bearer",
        grantedScopes: tokens.scope ? allowedGoogleScopes(service, tokens.scope.split(/\s+/).filter(Boolean)) : current.grantedScopes,
      });
    } catch (error) {
      logger.error("Failed to persist refreshed Google credential", { userId, integrationId: googleIntegration.id, errorType: error instanceof Error ? error.name : "unknown" });
    }
  });

  return { oauth2Client, integration: googleIntegration, grantedScopes: new Set(credential.grantedScopes) };
}

async function resolveGoogleGrantedScopes(service: GoogleIntegrationService, oauth2Client: ReturnType<typeof getOAuth2Client>, accessToken: string, reportedScope?: string | null): Promise<string[]> {
  const reported = reportedScope?.split(/\s+/).filter(Boolean) || [];
  const providerScopes = reported.length > 0 ? reported : (await oauth2Client.getTokenInfo(accessToken)).scopes;
  const allowed = allowedGoogleScopes(service, providerScopes);
  if (!allowed.includes(GOOGLE_SERVICE_CONFIG[service].scope)) throw new Error(`Google did not grant the required ${service} scope.`);
  return allowed;
}

function hasGoogleScope(client: Awaited<ReturnType<typeof getAuthenticatedClient>>, scope: string): boolean {
  return Boolean(client?.grantedScopes.has(scope));
}

function hasGoogleCapability(
  client: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  service: GoogleIntegrationService,
  capability: GoogleIntegrationCapability,
): boolean {
  return Boolean(client && googleIntegrationCapabilityAllowed(service, client.integration.settings, capability));
}

async function getGoogleAccountPreferences(userId: number) {
  const record = await storage.getUserIntegration(userId);
  return normalizeGoogleAccountPermissionPreferences(record?.otherIntegrations);
}

function requireGoogleCapability(
  res: Response,
  client: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  service: GoogleIntegrationService,
  capability: GoogleIntegrationCapability,
): boolean {
  if (hasGoogleCapability(client, service, capability)) return true;
  res.status(403).json({
    error: `${GOOGLE_SERVICE_CONFIG[service].providerName} ${capability} access is disabled in your LyfeOS integration permissions.`,
    code: "integration_capability_disabled",
    service,
    capability,
  });
  return false;
}

async function requireGoogleActionApproval(
  req: Request,
  res: Response,
  client: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  service: GoogleIntegrationService,
  descriptor: IntegrationActionDescriptor,
): Promise<boolean> {
  if (!client) return false;
  const userId = req.session.userId as number;
  const accountPreferences = await getGoogleAccountPreferences(userId);
  const permissions = normalizeGoogleIntegrationPermissions(service, client.integration.settings, accountPreferences);
  if (descriptor.futureAction && !googleFutureActionAllowed(permissions.futureActionPolicy, descriptor.capability as GoogleIntegrationCapability)) {
    res.status(403).json({
      error: `${GOOGLE_SERVICE_CONFIG[service].providerName} cannot use this newly added action under your future-action setting.`,
      code: "integration_future_action_disabled",
      service,
      capability: descriptor.capability,
    });
    return false;
  }
  const fingerprint = integrationActionFingerprint({
    actionKey: descriptor.key,
    method: req.method,
    body: req.body,
    query: req.query,
  });
  const receiptInput = {
    userId,
    integrationId: client.integration.id,
    service,
    descriptor,
    fingerprint,
    approvalPolicy: permissions.approvalPolicy,
  };
  const suppliedApprovalId = typeof req.body?.approvalId === "string"
    ? req.body.approvalId
    : req.header("x-lyfeos-approval-id");
  let receipt = suppliedApprovalId
    ? await consumeIntegrationApproval({ ...receiptInput, id: suppliedApprovalId })
    : null;
  if (suppliedApprovalId && !receipt) {
    res.status(409).json({ error: "This app-action approval is invalid, expired, already used, or does not match the request.", code: "integration_action_approval_invalid" });
    return false;
  }
  if (!receipt && !googleIntegrationApprovalRequired(permissions.approvalPolicy, descriptor.risk)) {
    receipt = await createAuthorizedIntegrationReceipt(receiptInput);
  }
  if (receipt) {
    res.once("finish", () => {
      void completeIntegrationActionReceipt(receipt!.id, res.statusCode).catch((error) => {
        logger.error("Failed to complete integration action receipt", { userId, receiptId: receipt!.id, errorType: error instanceof Error ? error.name : "unknown" });
      });
    });
    return true;
  }
  const pending = await createPendingIntegrationApproval(receiptInput);
  res.status(428).json({
    error: `${GOOGLE_SERVICE_CONFIG[service].providerName} requires your approval before this action.`,
    code: "integration_action_approval_required",
    service,
    capability: descriptor.capability,
    approvalPolicy: permissions.approvalPolicy,
    approvalRequest: {
      id: pending.id,
      app: GOOGLE_SERVICE_CONFIG[service].providerName,
      title: pending.title,
      summary: pending.summary,
      capability: pending.capability,
      risk: pending.risk,
      expiresAt: pending.expiresAt?.toISOString() || null,
      choices: ["deny", "allow_once", "always_allow"],
    },
  });
  return false;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

async function fetchGoogleTasksSnapshot(oauth2Client: ReturnType<typeof getOAuth2Client>): Promise<any[]> {
  const tasks = google.tasks({ version: "v1", auth: oauth2Client });
  const taskListsResponse = await tasks.tasklists.list({ maxResults: 10 });
  const allTasks: any[] = [];
  for (const list of taskListsResponse.data.items || []) {
    if (!list.id) continue;
    const tasksResponse = await tasks.tasks.list({ tasklist: list.id, maxResults: 100, showCompleted: false, showHidden: false });
    allTasks.push(...(tasksResponse.data.items || []).map((task) => ({
      id: task.id,
      title: task.title || "Untitled",
      notes: task.notes || "",
      due: task.due || null,
      status: task.status,
      listId: list.id,
      listName: list.title || "Tasks",
    })));
  }
  return allTasks;
}

type GoogleTaskAddress = { listId: string; taskId: string };
const googleTaskExternalIdPrefix = "gt1:";

function encodeGoogleTaskExternalId(address: GoogleTaskAddress): string {
  return `${googleTaskExternalIdPrefix}${Buffer.from(JSON.stringify([address.listId, address.taskId])).toString("base64url")}`;
}

function decodeGoogleTaskExternalId(value: string | null | undefined): GoogleTaskAddress | null {
  if (!value?.startsWith(googleTaskExternalIdPrefix)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(googleTaskExternalIdPrefix.length), "base64url").toString("utf8"));
    return Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string"
      ? { listId: parsed[0], taskId: parsed[1] }
      : null;
  } catch {
    return null;
  }
}

async function findGoogleTaskAddress(oauth2Client: ReturnType<typeof getOAuth2Client>, externalId: string): Promise<GoogleTaskAddress | null> {
  const encoded = decodeGoogleTaskExternalId(externalId);
  if (encoded) return encoded;
  // Older imports stored only Google’s task ID. Resolve those records once so
  // they remain fully usable after the writeback upgrade.
  const task = (await fetchGoogleTasksSnapshot(oauth2Client)).find((item) => item.id === externalId);
  return task?.listId ? { listId: task.listId, taskId: task.id } : null;
}

type MissionExternalLink = { provider: "google_calendar" | "google_tasks" | "google_drive"; externalId: string };

async function getMissionExternalLink(userId: number, questId: number, provider: MissionExternalLink["provider"]): Promise<MissionExternalLink | null> {
  const [link] = await db.select({ provider: missionExternalLinks.provider, externalId: missionExternalLinks.externalId })
    .from(missionExternalLinks)
    .where(and(eq(missionExternalLinks.userId, userId), eq(missionExternalLinks.questId, questId), eq(missionExternalLinks.provider, provider)))
    .limit(1);
  return link ? { provider: link.provider as MissionExternalLink["provider"], externalId: link.externalId } : null;
}

async function listMissionExternalLinks(userId: number, provider: MissionExternalLink["provider"]): Promise<Array<MissionExternalLink & { questId: number }>> {
  const links = await db.select({ questId: missionExternalLinks.questId, provider: missionExternalLinks.provider, externalId: missionExternalLinks.externalId })
    .from(missionExternalLinks)
    .where(and(eq(missionExternalLinks.userId, userId), eq(missionExternalLinks.provider, provider)));
  return links.map((link) => ({ questId: link.questId, provider: link.provider as MissionExternalLink["provider"], externalId: link.externalId }));
}

async function saveMissionExternalLink(input: { userId: number; questId: number; provider: MissionExternalLink["provider"]; externalId: string }): Promise<void> {
  await db.insert(missionExternalLinks).values(input).onConflictDoUpdate({
    target: [missionExternalLinks.questId, missionExternalLinks.provider],
    set: { externalId: input.externalId, updatedAt: new Date() },
  });
}

async function removeMissionExternalLink(userId: number, questId: number, provider: MissionExternalLink["provider"]): Promise<void> {
  await db.delete(missionExternalLinks).where(and(eq(missionExternalLinks.userId, userId), eq(missionExternalLinks.questId, questId), eq(missionExternalLinks.provider, provider)));
}

function googleTaskRequestBody(mission: { title: string; description?: string | null; startDate?: string | null; completed?: boolean | null }) {
  return {
    title: mission.title,
    notes: mission.description || undefined,
    due: mission.startDate ? `${mission.startDate}T00:00:00.000Z` : undefined,
    status: mission.completed ? "completed" : "needsAction",
  };
}

export function registerGoogleRoutes(app: Express): void {
  app.get("/api/google/:service/auth-url", isAuthenticated, (req: Request, res: Response) => {
    const service = parseGoogleService(req.params.service);
    if (!service) return res.status(404).json({ error: "Unknown Google integration." });
    if (!isGoogleOAuthConfigured(service)) {
      return res.status(503).json({ error: `${GOOGLE_SERVICE_CONFIG[service].providerName} is not configured for this environment.` });
    }
    try {
      const oauth2Client = getOAuth2Client(service);
      const state = crypto.randomUUID();
      req.session.googleOAuthState = state;
      req.session.googleOAuthUserId = req.session.userId;
      req.session.googleOAuthStartedAt = Date.now();
      req.session.googleOAuthService = service;

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [GOOGLE_SERVICE_CONFIG[service].scope],
        state,
        prompt: "consent",
      });

      return res.json({ url: authUrl });
    } catch (error) {
      logger.error("Error generating Google auth URL", { userId: req.session.userId, service, errorType: error instanceof Error ? error.name : "unknown" });
      return res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  const completeGoogleOAuth = async (req: Request, res: Response) => {
    const service = parseGoogleService(req.params.service) || req.session.googleOAuthService || null;
    try {
      const { code, state, error: providerError } = req.query;
      const startedAt = req.session.googleOAuthStartedAt;

      if (!service || providerError || !code || typeof code !== "string") {
        clearGoogleOAuthSession(req);
        return res.redirect(`/profile?google=error&service=${service || "unknown"}&reason=no_code`);
      }

      if (!googleStateMatches(state, req.session.googleOAuthState) || req.session.googleOAuthUserId !== req.session.userId || req.session.googleOAuthService !== service || typeof startedAt !== "number" || Date.now() - startedAt < 0 || Date.now() - startedAt > googleOAuthStateLifetimeMs) {
        clearGoogleOAuthSession(req);
        return res.redirect(`/profile?google=error&service=${service}&reason=session_mismatch`);
      }
      const userId = req.session.userId!;
      clearGoogleOAuthSession(req);

      const config = GOOGLE_SERVICE_CONFIG[service];
      const oauth2Client = getOAuth2Client(service);
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) throw new Error("Google did not return an access token.");
      const grantedScopes = await resolveGoogleGrantedScopes(service, oauth2Client, tokens.access_token, tokens.scope);
      const grantedScope = grantedScopes.join(" ");
      const existingIntegrations = await storage.getUserIntegrations(userId);
      const existingGoogle = existingIntegrations.find((i) => i.provider === config.provider);
      const accountPreferences = await getGoogleAccountPreferences(userId);
      const previousCredential = existingGoogle ? await readIntegrationCredential({ userId, integrationId: existingGoogle.id, provider: config.provider }) : null;
      const permissionSettings = writeGoogleIntegrationPermissions(
        service === "calendar" && existingGoogle ? writeGoogleCalendarSyncState(existingGoogle.settings, null) : existingGoogle?.settings,
        service,
        existingGoogle
          ? normalizeGoogleIntegrationPermissions(service, existingGoogle.settings, accountPreferences)
          : defaultGoogleIntegrationPermissions(service, accountPreferences),
      );
      const integration = existingGoogle
        ? await storage.updateIntegration(existingGoogle.id, {
          accessToken: null, refreshToken: null, tokenExpiry: null, status: "pending", scope: grantedScope, settings: permissionSettings,
        })
        : await storage.createIntegration({
          userId,
          provider: config.provider,
          providerName: config.providerName,
          accessToken: null, refreshToken: null, tokenExpiry: null,
          scope: grantedScope,
          status: "pending",
          settings: permissionSettings,
        });
      await writeIntegrationCredential({ userId, integrationId: integration.id, provider: config.provider }, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || previousCredential?.refreshToken || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        tokenType: tokens.token_type || "Bearer",
        grantedScopes,
      });
      await storage.updateIntegration(integration.id, { status: "active" });

      return res.redirect(`/profile?google=connected&service=${service}`);
    } catch (error) {
      logger.error("Google OAuth callback failed", { userId: req.session.userId, service, errorType: error instanceof Error ? error.name : "unknown" });
      return res.redirect(`/profile?google=error&service=${service || "unknown"}&reason=token_exchange`);
    }
  };

  app.get("/api/google/:service/callback", isAuthenticated, completeGoogleOAuth);
  app.get("/api/google/callback", isAuthenticated, completeGoogleOAuth);

  app.get("/api/google/calendar/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "calendar");

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_CALENDAR_SCOPE)) return res.status(403).json({ error: "Google Calendar permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "calendar", "read")) return;
      if (!await requireGoogleActionApproval(req, res, client, "calendar", GOOGLE_ACTIONS.calendarRead)) return;

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });

      const now = new Date();
      const fourWeeksLater = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: fourWeeksLater.toISOString(),
        maxResults: 250,
        singleEvents: true,
        showDeleted: true,
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
      logGoogleFailure("Google Calendar event fetch failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.post("/api/google/calendar/sync", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    let lockClient: PoolClient | undefined;
    let lockHeld = false;
    let lockedUserId: number | undefined;
    const lockNamespace = 1280922711;
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "calendar");

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_CALENDAR_SCOPE)) return res.status(403).json({ error: "Google Calendar permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "calendar", "read") || !requireGoogleCapability(res, client, "calendar", "import")) return;
      if (!await requireGoogleActionApproval(req, res, client, "calendar", GOOGLE_ACTIONS.calendarSync)) return;

      lockClient = await pool.connect();
      lockedUserId = userId;
      const lockResult = await lockClient.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1, $2) AS acquired",
        [lockNamespace, userId],
      );
      lockHeld = lockResult.rows[0]?.acquired === true;
      if (!lockHeld) return res.status(409).json({ error: "Google Calendar sync is already running." });

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });
      const syncBatch = await fetchGoogleCalendarSyncBatch({
        priorState: readGoogleCalendarSyncState(client.integration.settings),
        maxPages: 8,
        listPage: async (request) => {
          const response = await calendar.events.list(request);
          return {
            items: response.data.items || [],
            nextPageToken: response.data.nextPageToken,
            nextSyncToken: response.data.nextSyncToken,
          };
        },
      });
      const googleEvents = syncBatch.events;
      const existingQuests = await storage.getQuests(userId);
      const calendarLinks = await listMissionExternalLinks(userId, "google_calendar");

      const externalIdMap = new Map<string, number>();
      const questFingerprints = new Map<string, number>();
      for (const link of calendarLinks) externalIdMap.set(link.externalId, link.questId);
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
      let cancelled = 0;

      for (const gEvent of googleEvents) {
        if (!gEvent.id) {
          skipped++;
          continue;
        }

        if (gEvent.status === "cancelled") {
          const linkedQuestId = externalIdMap.get(gEvent.id);
          if (!linkedQuestId) {
            skipped++;
            continue;
          }
          await updateMissionLifecycle({
            questId: linkedQuestId,
            userId,
            updates: { missionStatus: "cancelled" },
            source: "google",
          });
          cancelled++;
          continue;
        }

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

        const start = parseGoogleCalendarDateTime(startRaw, gEvent.start?.timeZone);
        const end = parseGoogleCalendarDateTime(endRaw, gEvent.end?.timeZone || gEvent.start?.timeZone);
        if (!start || !end || (isAllDay && end.date <= start.date)) {
          skipped++;
          continue;
        }

        const questFields: any = {
          title: gTitle,
          description: gDescription,
          startDate: start.date,
          startTime: isAllDay ? null : start.time,
          endDate: isAllDay ? (shiftCalendarDate(end.date, -1) || start.date) : end.date,
          endTime: isAllDay ? null : end.time,
          location: gLocation || null,
          allDay: isAllDay,
          timezone: gTimezone,
          url: gUrl,
          missionStatus: gStatus,
          attendees: gAttendees,
        };

        if (externalIdMap.has(gEvent.id)) {
          await updateMissionLifecycle({
            questId: externalIdMap.get(gEvent.id)!,
            userId,
            updates: questFields,
            source: "google",
          });
          updated++;
          continue;
        }

        const fingerprint = `${normalizeTitle(gTitle)}|${start.date}|${isAllDay ? "00:00" : start.time}`;

        if (questFingerprints.has(fingerprint)) {
          const questId = questFingerprints.get(fingerprint)!;
          await updateMissionLifecycle({
            questId,
            userId,
            updates: {
              ...questFields,
              externalId: gEvent.id,
              externalSource: "google_calendar",
            },
            source: "google",
          });
          await saveMissionExternalLink({ userId, questId, provider: "google_calendar", externalId: gEvent.id });
          linkedExisting++;
          continue;
        }

        const creation = await createMissionLifecycleResult({
          userId,
          ...questFields,
          category: "general",
          completed: false,
          energyCost: 1,
          experienceReward: 25,
          externalId: gEvent.id,
          externalSource: "google_calendar",
          lifecycleKey: `google-calendar:${gEvent.id}`,
          source: "google",
        });
        await saveMissionExternalLink({ userId, questId: creation.quest.id, provider: "google_calendar", externalId: gEvent.id });
        if (creation.replayed) skipped++;
        else imported++;
      }

      const latestIntegration = await storage.getIntegration(client.integration.id);
      if (!latestIntegration || latestIntegration.userId !== userId || latestIntegration.status !== "active") {
        return res.status(409).json({ error: "Google was disconnected before Calendar sync completed." });
      }
      await storage.updateIntegration(latestIntegration.id, {
        settings: writeGoogleCalendarSyncState(latestIntegration.settings, syncBatch.state),
        lastSyncedAt: new Date(),
      });

      return res.json({
        imported,
        updated,
        cancelled,
        skipped,
        linkedExisting,
        total: googleEvents.length,
        pages: syncBatch.pages,
        complete: syncBatch.complete,
        moreAvailable: !syncBatch.complete,
        resetFromExpiredToken: syncBatch.resetFromExpiredToken,
      });
    } catch (error: any) {
      if (error instanceof MissionLifecycleError) return res.status(error.status).json({ error: error.message });
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Calendar sync failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to sync calendar" });
    } finally {
      if (lockClient) {
        if (lockHeld) {
          try {
            await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [lockNamespace, lockedUserId]);
          } catch (unlockError) {
            logger.error("Failed to release Google Calendar sync lock", { userId: lockedUserId, errorType: unlockError instanceof Error ? unlockError.name : "unknown" });
          }
        }
        lockClient.release();
      }
    }
  });

  app.post("/api/google/calendar/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "calendar");

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_CALENDAR_SCOPE)) return res.status(403).json({ error: "Google Calendar permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "calendar", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "calendar", GOOGLE_ACTIONS.calendarPush)) return;

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
      const googleAllDayEndDate = mission.allDay ? shiftCalendarDate(endDate, 1) : null;
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
          ? { date: googleAllDayEndDate }
          : { dateTime: endDateTime, timeZone: tz },
      };

      if (mission.url) eventBody.source = { url: mission.url };
      if (mission.attendees && Array.isArray(mission.attendees) && (mission.attendees as any[]).length > 0) {
        eventBody.attendees = (mission.attendees as any[]).map((a: any) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      const calendarLink = await getMissionExternalLink(userId, mission.id, "google_calendar");
      if (calendarLink) {
        await calendar.events.update({
          calendarId: "primary",
          eventId: calendarLink.externalId,
          requestBody: eventBody,
        });
        return res.json({ success: true, action: "updated", externalId: calendarLink.externalId, externalSource: "google_calendar" });
      } else {
        const created = await calendar.events.insert({
          calendarId: "primary",
          requestBody: eventBody,
        });
        if (created.data.id) {
          await saveMissionExternalLink({ userId, questId: mission.id, provider: "google_calendar", externalId: created.data.id });
        }
        return res.json({ success: true, action: "created", googleEventId: created.data.id, externalId: created.data.id, externalSource: "google_calendar" });
      }
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Calendar push failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to push mission to Google" });
    }
  });

  app.delete("/api/google/calendar/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "calendar");

      if (!client) return res.status(401).json({ error: "Google not connected" });
      if (!hasGoogleScope(client, GOOGLE_CALENDAR_SCOPE)) return res.status(403).json({ error: "Google Calendar permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "calendar", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "calendar", GOOGLE_ACTIONS.calendarDelete)) return;

      const { missionId } = req.body;
      if (!missionId) return res.status(400).json({ error: "missionId is required" });

      const mission = await storage.getQuest(missionId);
      if (!mission || mission.userId !== userId) return res.status(404).json({ error: "Mission not found" });
      const calendarLink = await getMissionExternalLink(userId, mission.id, "google_calendar");
      if (!calendarLink) {
        return res.status(409).json({ error: "This mission is not linked to a Google Calendar event." });
      }

      const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });
      let action: "removed" | "already_removed" = "removed";
      try {
        await calendar.events.delete({ calendarId: "primary", eventId: calendarLink.externalId });
      } catch (error: any) {
        if (error?.code === 404 || error?.response?.status === 404) action = "already_removed";
        else throw error;
      }

      await removeMissionExternalLink(userId, mission.id, "google_calendar");
      if (mission.externalSource === "google_calendar" && mission.externalId === calendarLink.externalId) {
        await updateMissionLifecycle({ questId: mission.id, userId, updates: { externalId: null, externalSource: null }, source: "google" });
      }
      return res.json({ success: true, action });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Calendar event removal failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to remove the Google Calendar event" });
    }
  });

  app.get("/api/google/tasks", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "tasks");

      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_TASKS_SCOPE)) return res.status(403).json({ error: "Google Tasks permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "tasks", "read")) return;
      if (!await requireGoogleActionApproval(req, res, client, "tasks", GOOGLE_ACTIONS.tasksRead)) return;

      return res.json({ tasks: await fetchGoogleTasksSnapshot(client.oauth2Client) });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Tasks fetch failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/google/tasks/import", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "tasks");
      if (!client) return res.status(401).json({ error: "Google not connected" });
      if (!hasGoogleScope(client, GOOGLE_TASKS_SCOPE)) return res.status(403).json({ error: "Google Tasks permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "tasks", "read") || !requireGoogleCapability(res, client, "tasks", "import")) return;
      if (!await requireGoogleActionApproval(req, res, client, "tasks", GOOGLE_ACTIONS.tasksImport)) return;
      // Re-read tasks from Google at mutation time. Browser-submitted task
      // bodies are deliberately ignored so provider provenance cannot be forged.
      const tasksToImport = await fetchGoogleTasksSnapshot(client.oauth2Client);
      if (tasksToImport.length === 0) return res.json({ imported: 0, skipped: 0, total: 0 });

      const existingQuests = await storage.getQuests(userId);
      const taskLinks = await listMissionExternalLinks(userId, "google_tasks");
      const externalIdSet = new Set(taskLinks.map((link) => link.externalId));
      const externalTaskIdSet = new Set(taskLinks.map((link) => decodeGoogleTaskExternalId(link.externalId)?.taskId || link.externalId));

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
        if (externalIdSet.has(task.id) || externalTaskIdSet.has(task.id)) {
          skipped++;
          continue;
        }

        const startDate = typeof task.due === "string" && /^\d{4}-\d{2}-\d{2}/.test(task.due)
          ? task.due.slice(0, 10)
          : null;

        const titleNorm = normalizeTitle(task.title);
        if (startDate && missionFingerprints.has(`${titleNorm}|${startDate}`)) {
          skipped++;
          continue;
        }
        if (missionFingerprints.has(titleNorm)) {
          skipped++;
          continue;
        }

        const creation = await createMissionLifecycleResult({
          userId,
          title: task.title,
          description: task.notes || `Imported from Google Tasks (${task.listName})`,
          category: "general",
          completed: false,
          energyCost: 1,
          experienceReward: 25,
          startDate,
          lifecycleKey: `google-task:${task.id}`,
          source: "google",
        });
        await saveMissionExternalLink({ userId, questId: creation.quest.id, provider: "google_tasks", externalId: encodeGoogleTaskExternalId({ listId: task.listId, taskId: task.id }) });

        if (creation.replayed) skipped++;
        else imported++;
      }

      return res.json({ imported, skipped, total: tasksToImport.length });
    } catch (error) {
      if (error instanceof MissionLifecycleError) return res.status(error.status).json({ error: error.message });
      logGoogleFailure("Google Tasks import failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to import tasks" });
    }
  });

  app.post("/api/google/tasks/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "tasks");
      if (!client) return res.status(401).json({ error: "Google Tasks is not connected" });
      if (!hasGoogleScope(client, GOOGLE_TASKS_SCOPE)) return res.status(403).json({ error: "Google Tasks write permission was not granted. Reconnect Google Tasks to enable this feature." });
      if (!requireGoogleCapability(res, client, "tasks", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "tasks", GOOGLE_ACTIONS.tasksPush)) return;

      const missionId = Number(req.body?.missionId);
      if (!Number.isInteger(missionId) || missionId <= 0) return res.status(400).json({ error: "missionId is required" });
      const mission = await storage.getQuest(missionId);
      if (!mission || mission.userId !== userId) return res.status(404).json({ error: "Mission not found" });
      const tasks = google.tasks({ version: "v1", auth: client.oauth2Client });
      const requestBody = googleTaskRequestBody(mission);
      const taskLink = await getMissionExternalLink(userId, mission.id, "google_tasks");
      const existingAddress = taskLink ? await findGoogleTaskAddress(client.oauth2Client, taskLink.externalId) : null;
      if (existingAddress) {
        try {
          await tasks.tasks.patch({ tasklist: existingAddress.listId, task: existingAddress.taskId, requestBody });
          return res.json({ success: true, action: "updated", externalId: taskLink!.externalId, externalSource: "google_tasks" });
        } catch (error: any) {
          if (error?.code !== 404 && error?.response?.status !== 404) throw error;
        }
      }

      const created = await tasks.tasks.insert({ tasklist: "@default", requestBody });
      if (!created.data.id) throw new Error("Google Tasks did not return a task ID.");
      const externalId = encodeGoogleTaskExternalId({ listId: "@default", taskId: created.data.id });
      await saveMissionExternalLink({ userId, questId: mission.id, provider: "google_tasks", externalId });
      return res.json({ success: true, action: "created", googleTaskId: created.data.id, externalId, externalSource: "google_tasks" });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) return res.status(401).json({ error: "Google token expired. Please reconnect." });
      logGoogleFailure("Google Tasks push failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to update Google Tasks" });
    }
  });

  app.delete("/api/google/tasks/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "tasks");
      if (!client) return res.status(401).json({ error: "Google Tasks is not connected" });
      if (!hasGoogleScope(client, GOOGLE_TASKS_SCOPE)) return res.status(403).json({ error: "Google Tasks write permission was not granted. Reconnect Google Tasks to enable this feature." });
      if (!requireGoogleCapability(res, client, "tasks", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "tasks", GOOGLE_ACTIONS.tasksDelete)) return;

      const missionId = Number(req.body?.missionId);
      if (!Number.isInteger(missionId) || missionId <= 0) return res.status(400).json({ error: "missionId is required" });
      const mission = await storage.getQuest(missionId);
      if (!mission || mission.userId !== userId) return res.status(404).json({ error: "Mission not found" });
      const taskLink = await getMissionExternalLink(userId, mission.id, "google_tasks");
      if (!taskLink) return res.status(409).json({ error: "This mission is not linked to a Google Task." });

      const address = await findGoogleTaskAddress(client.oauth2Client, taskLink.externalId);
      let action: "removed" | "already_removed" = "removed";
      if (address) {
        try {
          await google.tasks({ version: "v1", auth: client.oauth2Client }).tasks.delete({ tasklist: address.listId, task: address.taskId });
        } catch (error: any) {
          if (error?.code === 404 || error?.response?.status === 404) action = "already_removed";
          else throw error;
        }
      } else {
        action = "already_removed";
      }
      await removeMissionExternalLink(userId, mission.id, "google_tasks");
      if (mission.externalSource === "google_tasks" && mission.externalId === taskLink.externalId) {
        await updateMissionLifecycle({ questId: mission.id, userId, updates: { externalId: null, externalSource: null }, source: "google" });
      }
      return res.json({ success: true, action });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) return res.status(401).json({ error: "Google token expired. Please reconnect." });
      logGoogleFailure("Google Tasks removal failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to remove the Google Task" });
    }
  });

  app.patch("/api/google/preferences", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = parseGoogleAccountPermissionPreferences(req.body);
    if (!parsed) return res.status(400).json({ error: "Choose valid account-level app permission settings." });
    try {
      const userId = req.session.userId as number;
      const existing = await storage.getUserIntegration(userId);
      const otherIntegrations = writeGoogleAccountPermissionPreferences(existing?.otherIntegrations, parsed);
      if (existing) await storage.updateUserIntegration(userId, { otherIntegrations });
      else await storage.createUserIntegration({ userId, appleHealthConnected: false, googleCalendarConnected: false, notionConnected: false, otherIntegrations });
      logger.info("Google account permission preferences updated", { userId, defaultApprovalPolicy: parsed.defaultApprovalPolicy, futureActionPolicy: parsed.futureActionPolicy });
      return res.json({ preferences: parsed });
    } catch (error) {
      logGoogleFailure("Google account permission preference update failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to update account app permissions." });
    }
  });

  app.patch("/api/google/approvals/:id", isAuthenticated, async (req: Request, res: Response) => {
    const decision = req.body?.decision as IntegrationApprovalDecision | undefined;
    if (!decision || !(["allow_once", "always_allow", "deny"] as const).includes(decision)) {
      return res.status(400).json({ error: "Choose Allow once, Always allow, or Deny." });
    }
    try {
      const userId = req.session.userId as number;
      const receipt = decision === "always_allow"
        ? await alwaysAllowIntegrationApproval({ id: req.params.id, userId })
        : await decideIntegrationApproval({ id: req.params.id, userId, decision });
      if (!receipt) return res.status(409).json({ error: "This approval request expired or was already decided.", code: "integration_action_approval_unavailable" });

      logger.info("Integration action approval decided", { userId, receiptId: receipt.id, service: receipt.service, actionKey: receipt.actionKey, decision });
      return res.json({ approval: { id: receipt.id, state: receipt.state, decision, service: receipt.service }, permissionsChanged: decision === "always_allow" });
    } catch (error) {
      logGoogleFailure("Integration action approval decision failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to record your app-action decision." });
    }
  });

  app.get("/api/google/action-receipts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const receipts = await listIntegrationActionReceipts(req.session.userId as number, Number(req.query.limit) || 20);
      return res.json({ receipts: receipts.map(({ id, service, actionKey, capability, risk, title, summary, state, approvalPolicy, decision, createdAt, completedAt, httpStatus }) => ({
        id, service, actionKey, capability, risk, title, summary, state, approvalPolicy, decision,
        createdAt: createdAt.toISOString(), completedAt: completedAt?.toISOString() || null, httpStatus,
      })) });
    } catch (error) {
      logGoogleFailure("Integration action receipt listing failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to load connected-app activity." });
    }
  });

  app.patch("/api/google/:service/permissions", isAuthenticated, async (req: Request, res: Response) => {
    const service = parseGoogleService(req.params.service);
    if (!service) return res.status(404).json({ error: "Unknown Google integration." });
    const parsed = parseGoogleIntegrationPermissionPatch(service, req.body);
    if (!parsed) return res.status(400).json({ error: "Invalid Google integration permission settings." });

    try {
      const userId = req.session.userId as number;
      const config = GOOGLE_SERVICE_CONFIG[service];
      const integrations = await storage.getUserIntegrations(userId);
      const integration = integrations.find((item) => item.provider === config.provider && item.status === "active");
      if (!integration) return res.status(409).json({ error: `Connect ${config.providerName} before changing its LyfeOS permissions.` });

      const accountPreferences = await getGoogleAccountPreferences(userId);
      const updated = await storage.updateIntegration(integration.id, {
        settings: writeGoogleIntegrationPermissions(integration.settings, service, parsed),
      });
      const permissions = normalizeGoogleIntegrationPermissions(service, updated.settings, accountPreferences);
      logger.info("Google integration permissions updated", {
        userId,
        service,
        approvalPolicy: permissions.approvalPolicy,
        enabledCapabilities: Object.entries(permissions.capabilities).filter(([, enabled]) => enabled).map(([capability]) => capability),
      });
      return res.json({ service, permissions });
    } catch (error) {
      logGoogleFailure(`${GOOGLE_SERVICE_CONFIG[service].providerName} permission update failed`, error, req.session.userId);
      return res.status(500).json({ error: `Failed to update ${GOOGLE_SERVICE_CONFIG[service].providerName} permissions.` });
    }
  });

  app.post("/api/google/:service/disconnect", isAuthenticated, async (req: Request, res: Response) => {
    const service = parseGoogleService(req.params.service);
    if (!service) return res.status(404).json({ error: "Unknown Google integration." });
    try {
      const userId = req.session.userId as number;
      const integrations = await storage.getUserIntegrations(userId);
      const config = GOOGLE_SERVICE_CONFIG[service];
      const googleIntegration = integrations.find((i) => i.provider === config.provider);
      const retainedMissionCount = (await listMissionExternalLinks(userId, `google_${service}` as MissionExternalLink["provider"])).length;
      let providerRevocation: "confirmed" | "unconfirmed" | "not_needed" = "not_needed";

      if (googleIntegration) {
        const credential = await readIntegrationCredential({ userId, integrationId: googleIntegration.id, provider: config.provider });
        if (credential?.accessToken) {
          try {
            const oauth2Client = getOAuth2Client(service);
            await oauth2Client.revokeToken(credential.accessToken);
            providerRevocation = "confirmed";
          } catch (error) {
            providerRevocation = "unconfirmed";
            logGoogleFailure(`${config.providerName} provider revocation was not confirmed`, error, userId);
          }
        }
        await deleteIntegrationCredential({ userId, integrationId: googleIntegration.id, provider: config.provider });
        await storage.updateIntegration(googleIntegration.id, {
          status: "revoked",
          settings: service === "calendar" ? writeGoogleCalendarSyncState(googleIntegration.settings, null) : googleIntegration.settings as any,
        });
      }

      return res.json({
        success: true,
        service,
        providerRevocation,
        retainedMissionCount,
        message: providerRevocation === "unconfirmed"
          ? `${config.providerName} was disconnected locally and its stored credential was destroyed, but Google did not confirm remote revocation. Remove LyfeOS from your Google Account permissions to finish revocation.`
          : retainedMissionCount > 0
            ? `${config.providerName} access was revoked. Imported LyfeOS missions were retained and will not sync until you reconnect.`
            : `${config.providerName} access was revoked.`,
      });
    } catch (error) {
      logGoogleFailure(`${GOOGLE_SERVICE_CONFIG[service].providerName} disconnect failed`, error, req.session.userId);
      return res.status(500).json({ error: `Failed to disconnect ${GOOGLE_SERVICE_CONFIG[service].providerName}` });
    }
  });

  app.get("/api/google/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const integrations = await storage.getUserIntegrations(userId);
      const preferences = await getGoogleAccountPreferences(userId);
      const services = Object.fromEntries(await Promise.all(GOOGLE_SERVICES.map(async (service) => {
        const config = GOOGLE_SERVICE_CONFIG[service];
        const record = integrations.find((integration) => integration.provider === config.provider)
          || integrations.find((integration) => integration.provider === "google" && (integration.scope || "").split(/\s+/).includes(config.scope));
        const integration = record?.status === "active" ? record : undefined;
        const credential = integration
          ? await readIntegrationCredential({ userId, integrationId: integration.id, provider: integration.provider })
          : null;
        return [service, {
          connected: Boolean(integration && credential?.accessToken && credential.grantedScopes.includes(config.scope)),
          configured: isGoogleOAuthConfigured(service),
          scope: credential?.grantedScopes.join(" ") || null,
          connectedAt: integration?.connectedAt || null,
          status: record?.status || null,
          permissions: normalizeGoogleIntegrationPermissions(service, record?.settings, preferences),
        }];
      })));

      return res.json({
        connected: GOOGLE_SERVICES.some((service) => services[service].connected),
        configured: GOOGLE_SERVICES.some((service) => services[service].configured),
        preferences,
        services,
        capabilities: {
          calendar: services.calendar.connected,
          tasks: services.tasks.connected,
          drive: services.drive.connected,
        },
      });
    } catch (error) {
      logGoogleFailure("Google status check failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to check status" });
    }
  });

  app.get("/api/google/drive/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "drive");
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_DRIVE_SCOPE)) return res.status(403).json({ error: "Google Drive permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "drive", "read")) return;
      if (!await requireGoogleActionApproval(req, res, client, "drive", GOOGLE_ACTIONS.driveFolders)) return;

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
      logGoogleFailure("Google Drive folder fetch failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to fetch Drive folders" });
    }
  });

  app.get("/api/google/drive/files", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "drive");
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_DRIVE_SCOPE)) return res.status(403).json({ error: "Google Drive permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "drive", "read")) return;
      if (!await requireGoogleActionApproval(req, res, client, "drive", GOOGLE_ACTIONS.driveFiles)) return;

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
      logGoogleFailure("Google Drive file fetch failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to fetch Drive files" });
    }
  });

  app.post("/api/google/drive/sync", isAuthenticated, async (req: Request, res: Response) => {
    let backgroundStarted = false;
    let driveSyncState: GoogleDriveSyncState | null = null;
    let integrationId: number | null = null;
    let userId: number | null = null;
    try {
      userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "drive");
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_DRIVE_SCOPE)) return res.status(403).json({ error: "Google Drive permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "drive", "read") || !requireGoogleCapability(res, client, "drive", "import")) return;
      if (!await requireGoogleActionApproval(req, res, client, "drive", GOOGLE_ACTIONS.driveSync)) return;

      integrationId = client.integration.id;
      const now = new Date().toISOString();
      driveSyncState = { version: 1, state: "running", startedAt: now, updatedAt: now, imported: 0, updated: 0, skipped: 0, folders: 0 };
      await saveGoogleDriveSyncState(userId, integrationId, driveSyncState);
      backgroundStarted = true;
      // The approved action continues after this acknowledgement. The browser
      // is free to navigate away while LyfeOS imports the connected Drive.
      res.status(202).json({ status: "started", ...driveSyncState });

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

      let folders = 0;
      const syncFolderChildren = async (parentDriveId: string, parentVaultId: number): Promise<void> => {
        let folderPageToken: string | undefined;
        do {
          const folderRes = await drive.files.list({
            q: `'${parentDriveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "nextPageToken, files(id, name, webViewLink)",
            pageSize: googleDriveFolderPageSize,
            pageToken: folderPageToken,
          });

          for (const driveFolder of folderRes.data.files || []) {
            if (!driveFolder.id || !driveFolder.name) continue;
            const existingFolder = await storage.getFolderByExternalId(userId, "google_drive", driveFolder.id);
            const vaultFolder = existingFolder
              ? await storage.updateFolder(existingFolder.id, {
                name: driveFolder.name,
                parentId: parentVaultId,
                externalUrl: driveFolder.webViewLink || undefined,
              })
              : await storage.createFolder({
                userId,
                name: driveFolder.name,
                parentId: parentVaultId,
                source: "google_drive",
                externalId: driveFolder.id,
                externalUrl: driveFolder.webViewLink || undefined,
                favorite: false,
              });
            folders++;
            await syncFolderChildren(driveFolder.id, vaultFolder.id);
          }

          folderPageToken = folderRes.data.nextPageToken || undefined;
          driveSyncState = { ...driveSyncState, updatedAt: new Date().toISOString(), imported, updated, skipped, folders };
          await saveGoogleDriveSyncState(userId, integrationId, driveSyncState);
        } while (folderPageToken);
      };

      await syncFolderChildren("root", rootFolder.id);

      let filePageToken: string | undefined;
      do {
        const fileRes = await drive.files.list({
          q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
          fields: "nextPageToken, files(id, name, mimeType, parents, webViewLink, modifiedTime, size)",
          pageSize: googleDriveFilePageSize,
          pageToken: filePageToken,
        });

        const files = fileRes.data.files || [];

        for (const file of files) {
          if (!file.id || !file.name) continue;

          const driveParentId = file.parents?.[0] || "root";
          const parentVaultFolder = driveParentId === "root"
            ? rootFolder
            : await storage.getFolderByExternalId(userId, "google_drive", driveParentId);
          const vaultFolderId = parentVaultFolder?.id || rootFolder.id;
          const mimeType = file.mimeType || "";

          const existingDoc = await storage.getDocumentByExternalId(userId, "google_drive", file.id);

          if (mimeType === "application/vnd.google-apps.document") {
            let markdownContent = "";
            try {
              const exported = await drive.files.export({
                fileId: file.id,
                mimeType: "text/plain",
              }, { responseType: "stream" });
              markdownContent = await readGoogleDriveTextImport(exported.data) || "";
            } catch (exportErr) {
              logGoogleFailure("Google document export failed", exportErr, userId);
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

            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title: file.name,
                folderId: vaultFolderId,
                externalUrl: file.webViewLink || undefined,
                fileType,
                mimeType,
                fileSize: file.size ? parseInt(file.size) : undefined,
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
        driveSyncState = { ...driveSyncState, updatedAt: new Date().toISOString(), imported, updated, skipped, folders };
        await saveGoogleDriveSyncState(userId, integrationId, driveSyncState);
      } while (filePageToken);

      driveSyncState = { ...driveSyncState, state: "succeeded", updatedAt: new Date().toISOString(), imported, updated, skipped, folders };
      await saveGoogleDriveSyncState(userId, integrationId, driveSyncState);
      return;
    } catch (error: any) {
      if (backgroundStarted && driveSyncState && integrationId && userId) {
        const failureState: GoogleDriveSyncState = {
          ...driveSyncState,
          state: "failed",
          updatedAt: new Date().toISOString(),
          error: error?.code === 401 || error?.response?.status === 401 || error?.message === "GOOGLE_DRIVE_CONNECTION_REVOKED" ? "connection_revoked" : "provider_unavailable",
        };
        try { await saveGoogleDriveSyncState(userId, integrationId, failureState); } catch { /* A revoked connection cannot retain a sync state. */ }
        logGoogleFailure("Google Drive background sync failed", error, userId);
        return;
      }
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Drive sync failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to sync Google Drive" });
    }
  });

  app.get("/api/google/drive/sync-status", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId as number;
    const client = await getAuthenticatedClient(userId, "drive");
    if (!client) return res.status(401).json({ error: "Google Drive is not connected" });
    let state = readGoogleDriveSyncState(client.integration.settings);
    if (state && isStaleGoogleDriveSync(state)) {
      state = { ...state, state: "failed", updatedAt: new Date().toISOString(), error: "provider_unavailable" };
      try { await saveGoogleDriveSyncState(userId, client.integration.id, state); } catch { /* The connection may have been revoked. */ }
    }
    return res.json(state
      ? { status: state.state, ...state }
      : { version: 1, status: "succeeded", imported: 0, updated: 0, skipped: 0, folders: 0, startedAt: null, updatedAt: null });
  });

  app.post("/api/google/drive/push", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const client = await getAuthenticatedClient(userId, "drive");
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_DRIVE_SCOPE)) return res.status(403).json({ error: "Google Drive permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "drive", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "drive", GOOGLE_ACTIONS.drivePush)) return;

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
          logGoogleFailure("Google Drive document update failed", pushErr, userId);
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
            logGoogleFailure("Google Drive document creation failed", createErr, userId);
          }
        }
      }

      return res.json({ pushed, created, skipped: skippedCount });
    } catch (error: any) {
      if (error?.code === 401 || error?.response?.status === 401) {
        return res.status(401).json({ error: "Google token expired. Please reconnect." });
      }
      logGoogleFailure("Google Drive push failed", error, req.session.userId);
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

      const client = await getAuthenticatedClient(userId, "drive");
      if (!client) {
        return res.status(401).json({ error: "Google not connected" });
      }
      if (!hasGoogleScope(client, GOOGLE_DRIVE_SCOPE)) return res.status(403).json({ error: "Google Drive permission was not granted. Reconnect Google to enable this feature." });
      if (!requireGoogleCapability(res, client, "drive", "write")) return;
      if (!await requireGoogleActionApproval(req, res, client, "drive", GOOGLE_ACTIONS.drivePushDocument)) return;

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
      logGoogleFailure("Google Drive single-document push failed", error, req.session.userId);
      return res.status(500).json({ error: "Failed to push document to Google Drive" });
    }
  });
}
