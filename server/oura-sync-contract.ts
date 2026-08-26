import { z } from "zod";
import { dateInTimeZone, validTimeZone } from "./health-fitness";

export const ouraSyncResourceSchema = z.enum(["daily_activity", "workout", "sleep", "heartrate", "daily_spo2", "daily_readiness"]);
export type OuraSyncResource = z.infer<typeof ouraSyncResourceSchema>;

const cursorSchema = z.object({ v: z.literal(1), nextToken: z.string().min(1).max(4_000).nullable(), windowStart: z.string().min(1).max(40), windowEnd: z.string().min(1).max(40), completedAt: z.string().datetime() }).strict();
const ouraApiBase = "https://api.ouraring.com";
const overlapMs = 2 * 24 * 60 * 60 * 1_000;
const initialBackfillMs = 30 * 24 * 60 * 60 * 1_000;

export const ouraResourceDefinition: Record<OuraSyncResource, { endpoint: string; appScope: string; dateTime: boolean; fields: string[] }> = {
  daily_activity: { endpoint: "/v2/usercollection/daily_activity", appScope: "activity", dateTime: false, fields: ["id", "day", "timestamp", "steps", "active_calories", "equivalent_walking_distance"] },
  workout: { endpoint: "/v2/usercollection/workout", appScope: "workouts", dateTime: false, fields: ["id", "start_datetime", "end_datetime", "calories", "distance", "activity", "source"] },
  sleep: { endpoint: "/v2/usercollection/sleep", appScope: "sleep", dateTime: false, fields: ["id", "bedtime_start", "bedtime_end", "total_sleep_duration", "awake_time", "light_sleep_duration", "deep_sleep_duration", "rem_sleep_duration", "average_heart_rate", "average_breath"] },
  heartrate: { endpoint: "/v2/usercollection/heartrate", appScope: "heart_rate", dateTime: true, fields: ["timestamp", "bpm", "source"] },
  daily_spo2: { endpoint: "/v2/usercollection/daily_spo2", appScope: "vitals", dateTime: false, fields: ["id", "day", "spo2_percentage"] },
  daily_readiness: { endpoint: "/v2/usercollection/daily_readiness", appScope: "vitals", dateTime: false, fields: ["id", "day", "timestamp", "temperature_deviation"] },
};

function parseCursor(value: string | null | undefined) {
  if (!value) return null;
  try { return cursorSchema.parse(JSON.parse(value)); } catch { return null; }
}

export function ouraSyncResourcesForScopes(scopes: readonly string[]): OuraSyncResource[] {
  const granted = new Set(scopes);
  return ouraSyncResourceSchema.options.filter((resource) => granted.has(ouraResourceDefinition[resource].appScope));
}

export function buildOuraCollectionRequest(resource: OuraSyncResource, cursorValue: string | null | undefined, timeZone: string, now = new Date()): { url: string; windowStart: string; windowEnd: string } {
  const definition = ouraResourceDefinition[resource]; const cursor = parseCursor(cursorValue); const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  let windowStart: string; let windowEnd: string;
  if (cursor?.nextToken) {
    windowStart = cursor.windowStart; windowEnd = cursor.windowEnd;
  } else {
    const startInstant = new Date((cursor ? new Date(cursor.completedAt).getTime() - overlapMs : now.getTime() - initialBackfillMs));
    if (definition.dateTime) { windowStart = startInstant.toISOString(); windowEnd = now.toISOString(); }
    else { windowStart = dateInTimeZone(startInstant, zone); windowEnd = dateInTimeZone(now, zone); }
  }
  const url = new URL(definition.endpoint, ouraApiBase);
  url.searchParams.set(definition.dateTime ? "start_datetime" : "start_date", windowStart);
  url.searchParams.set(definition.dateTime ? "end_datetime" : "end_date", windowEnd);
  if (cursor?.nextToken) url.searchParams.set("next_token", cursor.nextToken);
  url.searchParams.set("fields", definition.fields.join(","));
  return { url: url.toString(), windowStart, windowEnd };
}
