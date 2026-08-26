export const PRODUCT_ANALYTICS_POLICY_VERSION = "lyfeos.product-analytics.v1" as const;

export type ProductAnalyticsStatus = {
  policyVersion: typeof PRODUCT_ANALYTICS_POLICY_VERSION;
  configured: boolean;
  enabled: boolean;
  consentedAt: string | null;
  capture: { projectKey: string; host: string; distinctId: string } | null;
  events: string[];
  collection: Record<string, boolean>;
  deletion: Record<string, string | boolean>;
};

type ProductEventName =
  | "lyfeos_session_started"
  | "lyfeos_area_viewed"
  | "onboarding_completed"
  | "mission_created"
  | "mission_completed"
  | "mission_reopened"
  | "mission_evidence_submitted"
  | "mission_review_completed"
  | "transformation_thread_completed";

type SafeEventProperties = {
  area?: string;
  decision?: "meets_evidence" | "revisions_needed";
  source?: "web";
};

let sdk: typeof import("posthog-js").default | null = null;
let sdkPromise: Promise<typeof import("posthog-js").default> | null = null;
let initializedProjectKey: string | null = null;
let activeSubjectId: string | null = null;
let configurationEpoch = 0;

const blockedDefaultProperties = [
  "$current_url", "$pathname", "$referrer", "$referring_domain", "$ip", "$geoip_city_name",
  "$geoip_subdivision_1_name", "$geoip_country_name", "$utm_source", "$utm_medium", "$utm_campaign",
  "$utm_term", "$utm_content", "$gclid", "$fbclid", "$msclkid", "$dclid", "$wbraid", "$gbraid",
];

async function loadSdk() {
  if (sdk) return sdk;
  sdkPromise ||= import("posthog-js").then((module) => module.default);
  sdk = await sdkPromise;
  return sdk;
}

export async function configureProductAnalytics(status: ProductAnalyticsStatus): Promise<boolean> {
  const epoch = ++configurationEpoch;
  if (!status.enabled || !status.capture) {
    await disableProductAnalytics();
    return false;
  }
  const posthog = await loadSdk();
  if (epoch !== configurationEpoch) return false;
  if (!initializedProjectKey) {
    posthog.init(status.capture.projectKey, {
      api_host: status.capture.host,
      defaults: "2026-05-30",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_feature_flags: true,
      person_profiles: "identified_only",
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      persistence: "localStorage",
      respect_dnt: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      property_denylist: blockedDefaultProperties,
    });
    initializedProjectKey = status.capture.projectKey;
  }
  if (initializedProjectKey !== status.capture.projectKey) {
    // Never send a production subject to a different project inside one page
    // lifecycle. A normal reload activates the new configuration safely.
    return false;
  }
  if (activeSubjectId !== status.capture.distinctId) {
    posthog.reset(true);
    posthog.opt_in_capturing();
    posthog.identify(status.capture.distinctId);
    activeSubjectId = status.capture.distinctId;
  }
  return true;
}

export async function disableProductAnalytics(): Promise<void> {
  configurationEpoch += 1;
  if (!sdk) return;
  sdk.reset(true);
  sdk.opt_out_capturing();
  activeSubjectId = null;
}

function safeProperties(properties: SafeEventProperties): Record<string, string | number> {
  const safe: Record<string, string | number> = { source: "web" };
  if (properties.area && /^[a-z][a-z0-9_]{0,39}$/.test(properties.area)) safe.area = properties.area;
  if (properties.decision === "meets_evidence" || properties.decision === "revisions_needed") safe.decision = properties.decision;
  return safe;
}

export function captureProductEvent(event: ProductEventName, properties: SafeEventProperties = {}): void {
  if (!sdk || !activeSubjectId || sdk.has_opted_out_capturing()) return;
  const safe = safeProperties(properties);
  sdk.capture(event, { ...safe, $insert_id: crypto.randomUUID() });
}

export function analyticsAreaForPath(pathname: string): string | null {
  const routes: Array<[string, string]> = [
    ["/dashboard", "dashboard"], ["/missions", "missions"], ["/calendar", "calendar"], ["/ai", "assistant"],
    ["/chronilog", "chronilog"], ["/timeline", "timeline"], ["/profile", "profile"], ["/health", "health"],
    ["/tracker", "tracker"], ["/rolodex", "relationships"], ["/messages", "messages"], ["/projects", "projects"],
    ["/kanban", "projects"], ["/document-vault", "documents"], ["/spreadsheets", "sheets"], ["/canvases", "canvas"],
    ["/databases", "tables"], ["/forms", "forms"], ["/automations", "automations"], ["/search", "search"],
    ["/onboarding", "onboarding"], ["/ceremony", "ceremony"],
  ];
  return routes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || null;
}

export function captureProductMutation(url: string, options: RequestInit | undefined, response: unknown): void {
  const method = (options?.method || "GET").toUpperCase();
  const path = new URL(url, window.location.origin).pathname;
  if (method === "POST" && path === "/api/quests") return captureProductEvent("mission_created");
  if (method === "POST" && /^\/api\/quests\/\d+\/toggle$/.test(path)) {
    const completed = Boolean((response as any)?.completed ?? (response as any)?.quest?.completed);
    return captureProductEvent(completed ? "mission_completed" : "mission_reopened");
  }
  if (method === "POST" && /^\/api\/quests\/\d+\/evidence$/.test(path)) return captureProductEvent("mission_evidence_submitted");
  if (method === "POST" && /^\/api\/quests\/\d+\/reviews$/.test(path)) {
    const decision = (response as any)?.decision ?? (response as any)?.review?.decision;
    return captureProductEvent("mission_review_completed", { decision });
  }
  if (method === "POST" && /^\/api\/transformation-thread\/\d+\/complete$/.test(path)) return captureProductEvent("transformation_thread_completed");
  if (method === "PATCH" && path === "/api/profile") {
    try {
      const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
      if (body?.onboardingCompleted === true) captureProductEvent("onboarding_completed");
    } catch {
      // Analytics never changes the result of a successful product mutation.
    }
  }
}
