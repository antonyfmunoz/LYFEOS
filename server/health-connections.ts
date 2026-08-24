export const healthProviderCatalog = [
  { id: "apple_health", name: "Apple Health", availability: "requires_native_ios" as const, scopes: ["activity", "workouts", "sleep", "heart_rate", "body_measurements", "vitals"] },
  { id: "health_connect", name: "Health Connect", availability: "requires_native_android" as const, scopes: ["activity", "workouts", "sleep", "heart_rate", "body_measurements", "vitals"] },
  { id: "oura", name: "Oura", availability: "requires_vendor_approval" as const, scopes: ["activity", "workouts", "sleep", "heart_rate"] },
  { id: "whoop", name: "WHOOP", availability: "requires_vendor_approval" as const, scopes: ["activity", "workouts", "sleep", "heart_rate"] },
  { id: "strava", name: "Strava", availability: "requires_vendor_approval" as const, scopes: ["activity", "workouts"] },
  { id: "garmin", name: "Garmin", availability: "requires_vendor_approval" as const, scopes: ["activity", "workouts", "sleep", "heart_rate", "body_measurements"] },
] as const;

export type HealthProviderId = typeof healthProviderCatalog[number]["id"];
export type HealthConnectionState = "pending" | "active" | "paused" | "error" | "revoked";
export type HealthConnectionAction = "cancel" | "pause" | "resume" | "retry" | "revoke";

export function healthConnectionLockKey(connectionId: number): string {
  return `health-connection:${connectionId}`;
}

export function healthProviderDefinition(provider: string) {
  return healthProviderCatalog.find((definition) => definition.id === provider) || null;
}

export function nextHealthConnectionState(current: HealthConnectionState, action: HealthConnectionAction, hasCredential: boolean): HealthConnectionState | null {
  if (action === "revoke" && current !== "revoked") return "revoked";
  if (action === "cancel" && current === "pending") return "revoked";
  if (action === "pause" && (current === "active" || current === "error")) return "paused";
  if (action === "resume" && current === "paused" && hasCredential) return "active";
  if (action === "retry" && current === "error" && hasCredential) return "pending";
  return null;
}
