export type ProductAnalyticsProviderConfig = {
  personalApiKey: string;
  projectId: string;
  adminHost: string;
};

export type ProductAnalyticsProviderProject = {
  id?: number | string;
  anonymize_ips?: boolean;
  autocapture_opt_out?: boolean;
  autocapture_web_vitals_opt_in?: boolean;
  capture_console_log_opt_in?: boolean;
  capture_performance_opt_in?: boolean;
  session_recording_opt_in?: boolean;
  heatmaps_opt_in?: boolean;
  capture_dead_clicks?: boolean;
  event_retention_months?: number | null;
  events_retention_enforced?: boolean;
};

export type ProductAnalyticsProviderReadiness = {
  ready: boolean;
  violations: string[];
};

export function productAnalyticsProviderPrivacyViolations(
  project: ProductAnalyticsProviderProject,
  expectedProjectId: string,
): string[] {
  const violations: string[] = [];
  if (String(project.id ?? "") !== expectedProjectId) violations.push("project_identity_unverified");
  if (project.anonymize_ips !== true) violations.push("client_ip_discard_disabled");
  if (project.autocapture_opt_out !== true) violations.push("autocapture_enabled");
  if (project.autocapture_web_vitals_opt_in !== false) violations.push("web_vitals_capture_enabled_or_unverified");
  if (project.capture_console_log_opt_in !== false) violations.push("console_capture_enabled_or_unverified");
  if (project.capture_performance_opt_in !== false) violations.push("performance_capture_enabled_or_unverified");
  if (project.session_recording_opt_in !== false) violations.push("session_recording_enabled_or_unverified");
  if (project.heatmaps_opt_in !== false) violations.push("heatmaps_enabled_or_unverified");
  if (project.capture_dead_clicks !== false) violations.push("dead_click_capture_enabled_or_unverified");
  if (project.events_retention_enforced !== true || !Number.isInteger(project.event_retention_months) || (project.event_retention_months ?? 0) <= 0) {
    violations.push("event_retention_not_explicitly_enforced");
  }
  return violations;
}

export async function inspectProductAnalyticsProvider(
  config: ProductAnalyticsProviderConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductAnalyticsProviderReadiness> {
  const projectUrl = new URL(`/api/projects/${encodeURIComponent(config.projectId)}/`, config.adminHost);
  try {
    const response = await fetchImplementation(projectUrl, {
      headers: { Authorization: `Bearer ${config.personalApiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ready: false, violations: [`project_read_failed_${response.status}`] };
    const project = await response.json() as ProductAnalyticsProviderProject;
    const violations = productAnalyticsProviderPrivacyViolations(project, config.projectId);
    return { ready: violations.length === 0, violations };
  } catch {
    return { ready: false, violations: ["project_read_unavailable"] };
  }
}
