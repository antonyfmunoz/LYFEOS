import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("first-class sleep sessions", () => {
  it("release-migrates bounded raw sessions and stage invariants", () => {
    const migration = source("migrations/0076_sleep_sessions.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "sleep_sessions"');
    expect(migration).toContain('"ended_at" <= "started_at" + interval \'36 hours\'');
    expect(migration).toContain('CONSTRAINT "sleep_sessions_stages_valid"');
    expect(migration).toContain('COALESCE("awake_minutes", 0)');
    expect(release).toContain('id: "0076_sleep_sessions"');
  });

  it("keeps source, measured stage durations, and subjective reflection separate", () => {
    const schema = source("shared/schema.ts");
    const routes = source("server/routes/health-fitness.ts");
    expect(schema).toContain('export const sleepSessions = pgTable("sleep_sessions"');
    expect(schema).toContain('subjectiveQuality: integer("subjective_quality")');
    expect(routes).toContain('source: z.enum(["manual", "transcribed_device"])');
    expect(routes).toContain("Recorded stage minutes cannot exceed elapsed session time.");
    expect(routes).toContain("Name the device when transcribing device data.");
    expect(routes).toContain("does not interpret them as sleep quality, diagnosis, readiness, or medical guidance");
  });

  it("requires an opened revision for corrections and owner-scopes every mutation", () => {
    const routes = source("server/routes/health-fitness.ts");
    expect(routes).toContain('app.patch("/api/health-fitness/sleep/sessions/:id"');
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain("current.revision !== revision.revision");
    expect(routes).toContain("eq(sleepSessions.userId, req.session.userId!)");
    expect(routes.match(/SELECT id FROM sleep_sessions[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes).toContain("It was not deleted.");
    const client = source("client/src/components/health/SleepLog.tsx");
    expect(client).toContain('"x-lyfeos-expected-revision": String(session.revision)');
  });

  it("surfaces sessions in the timeline, trends, progression, export, and deletion", () => {
    const fitness = source("server/routes/health-fitness.ts");
    const insights = source("server/routes/health-insights.ts");
    const progression = source("server/health-progression.ts");
    const profile = source("server/routes/profile.ts");
    expect(fitness).toContain("sleep-session:${entry.id}");
    expect(insights).toContain('id: "sleep_session_minutes"');
    expect(progression).toContain("sessions.map((row) => dateInTimeZone");
    expect(insights).toContain('"sleep_sessions"');
    expect(profile).toContain('"sleep_sessions"');
  });

  it("labels transcribed device data without claiming a direct connection", () => {
    const client = source("client/src/components/health/SleepLog.tsx");
    expect(client).toContain("Detailed sleep sessions");
    expect(client).toContain("does not claim a direct device connection");
    expect(client).toContain("Awake minutes");
    expect(client).toContain("REM sleep minutes");
  });
});
