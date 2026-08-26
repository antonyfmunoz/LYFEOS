import { db } from "./db";
import { sql } from "drizzle-orm";
import { logger } from "./utils";

export const PRODUCT_ANALYTICS_POLICY_VERSION = "lyfeos.product-analytics.v1" as const;

export const PRODUCT_ANALYTICS_EVENT_CATALOG = [
  "lyfeos_session_started",
  "lyfeos_area_viewed",
  "onboarding_completed",
  "mission_created",
  "mission_completed",
  "mission_reopened",
  "mission_evidence_submitted",
  "mission_review_completed",
  "transformation_thread_completed",
] as const;

type ProductAnalyticsConfig = {
  projectKey: string;
  ingestionHost: string;
  personalApiKey: string;
  projectId: string;
  adminHost: string;
};

function normalizedHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function productAnalyticsConfig(): ProductAnalyticsConfig | null {
  const projectKey = process.env.POSTHOG_PROJECT_KEY?.trim();
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const ingestionHost = normalizedHttpsUrl(process.env.POSTHOG_HOST);
  const adminHost = normalizedHttpsUrl(process.env.POSTHOG_ADMIN_HOST);
  if (!projectKey || !personalApiKey || !projectId || !ingestionHost || !adminHost) return null;
  return { projectKey, personalApiKey, projectId, ingestionHost, adminHost };
}

type ConsentRow = {
  subject_id: string;
  state: "enabled" | "revoked";
  policy_version: string;
  created_at: Date | string;
};

export async function latestProductAnalyticsConsent(userId: number): Promise<ConsentRow | null> {
  const result = await db.execute(sql`
    SELECT "subject_id", "state", "policy_version", "created_at"
    FROM "product_analytics_consents"
    WHERE "user_id" = ${userId}
    ORDER BY "id" DESC
    LIMIT 1
  `);
  return ((result as unknown as { rows?: ConsentRow[] }).rows || [])[0] || null;
}

export function productAnalyticsStatus(row: ConsentRow | null) {
  const config = productAnalyticsConfig();
  const enabled = row?.state === "enabled";
  return {
    policyVersion: PRODUCT_ANALYTICS_POLICY_VERSION,
    configured: Boolean(config),
    enabled,
    consentedAt: enabled ? new Date(row!.created_at).toISOString() : null,
    capture: enabled && config ? {
      projectKey: config.projectKey,
      host: config.ingestionHost,
      distinctId: row!.subject_id,
    } : null,
    events: PRODUCT_ANALYTICS_EVENT_CATALOG,
    collection: {
      automaticClicks: false,
      sessionReplay: false,
      exceptionCapture: false,
      messageContent: false,
      missionContent: false,
      healthContent: false,
      profileProperties: false,
      preciseUrls: false,
    },
    deletion: {
      onWithdrawal: "queued_with_provider",
      onAccountDeletion: "queued_with_provider",
      providerProcessing: "asynchronous",
      identifiersAreReused: false,
    },
  };
}

type PostHogPerson = { id?: string; distinct_ids?: string[] };

async function deletePostHogSubject(subjectId: string, config: ProductAnalyticsConfig): Promise<void> {
  const searchUrl = new URL(`/api/projects/${encodeURIComponent(config.projectId)}/persons/`, config.adminHost);
  searchUrl.searchParams.set("search", subjectId);
  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${config.personalApiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`PostHog person lookup failed (${response.status})`);
  const payload = await response.json() as { results?: PostHogPerson[] };
  const matches = (payload.results || []).filter((person) => person.id && person.distinct_ids?.includes(subjectId));
  for (const person of matches) {
    const deleteUrl = new URL(`/api/projects/${encodeURIComponent(config.projectId)}/persons/${encodeURIComponent(person.id!)}`, config.adminHost);
    deleteUrl.searchParams.set("delete_events", "true");
    deleteUrl.searchParams.set("delete_recordings", "true");
    const deletion = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.personalApiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!deletion.ok) throw new Error(`PostHog person deletion failed (${deletion.status})`);
  }
}

let deletionWorkerRunning = false;

export async function processProductAnalyticsDeletionQueue(): Promise<void> {
  if (deletionWorkerRunning) return;
  const config = productAnalyticsConfig();
  if (!config) return;
  deletionWorkerRunning = true;
  try {
    const result = await db.execute(sql`
      SELECT "id", "subject_id"
      FROM "product_analytics_deletion_queue"
      WHERE "completed_at" IS NULL
        AND "requested_at" <= now() - interval '15 minutes'
      ORDER BY "requested_at", "id"
      LIMIT 20
    `);
    const rows = (result as unknown as { rows?: Array<{ id: number; subject_id: string }> }).rows || [];
    for (const row of rows) {
      try {
        await deletePostHogSubject(row.subject_id, config);
        await db.execute(sql`
          UPDATE "product_analytics_deletion_queue"
          SET "attempts" = "attempts" + 1, "last_attempt_at" = now(), "last_error" = NULL, "completed_at" = now()
          WHERE "id" = ${row.id} AND "completed_at" IS NULL
        `);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "PostHog deletion failed";
        await db.execute(sql`
          UPDATE "product_analytics_deletion_queue"
          SET "attempts" = "attempts" + 1, "last_attempt_at" = now(), "last_error" = ${message}
          WHERE "id" = ${row.id} AND "completed_at" IS NULL
        `);
        logger.error("Product analytics deletion retry failed", { queueId: row.id, error: message });
      }
    }
  } finally {
    deletionWorkerRunning = false;
  }
}

let deletionTimer: NodeJS.Timeout | null = null;

export function startProductAnalyticsDeletionWorker(): void {
  if (deletionTimer) return;
  if (!productAnalyticsConfig()) {
    logger.info("Product analytics remains disabled until capture and deletion credentials are configured.");
    return;
  }
  void processProductAnalyticsDeletionQueue();
  deletionTimer = setInterval(() => void processProductAnalyticsDeletionQueue(), 60_000);
  deletionTimer.unref();
}
