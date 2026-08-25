import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { missionMutationId, missionMutationPayloadHash } from "../server/mission-mutation-integrity";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Calendar offline and conflict contract", () => {
  it("uses stable canonical hashes and bounded mutation identities", () => {
    expect(missionMutationPayloadHash({ b: 2, a: { d: 4, c: 3 } })).toBe(missionMutationPayloadHash({ a: { c: 3, d: 4 }, b: 2 }));
    expect(missionMutationId("calendar_mutation_123456")).toBe("calendar_mutation_123456");
    expect(missionMutationId("short")).toBeNull();
    expect(missionMutationId("calendar mutation with spaces")).toBeNull();
  });

  it("ships a server-owned revision, automatic bump, and owner-scoped receipts", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0113_calendar_offline_concurrency.sql");
    const release = source("server/release-migrate.ts");
    expect(schema).toContain('revision: integer("revision").notNull().default(1)');
    expect(schema).toContain('pgTable("mission_mutation_receipts"');
    expect(migration).toContain('NEW."revision" := OLD."revision" + 1');
    expect(migration).toContain('UNIQUE("user_id", "mutation_id")');
    expect(release).toContain('id: "0113_calendar_offline_concurrency"');
  });

  it("requires a version for queued edits and returns the current mission on conflict", () => {
    const routes = source("server/routes/quests.ts");
    const lifecycle = source("server/mission-lifecycle.ts");
    expect(routes).toContain('req.header("x-lyfeos-mutation-id")');
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain('return res.status(428)');
    expect(routes).toContain('currentQuest: conflictMission(error.currentQuest)');
    expect(lifecycle).toContain('eq(quests.revision, input.expectedRevision)');
    expect(lifecycle).toContain('Review the current version before applying your queued change');
  });

  it("keeps queued payloads in IndexedDB and makes conflicts explicit", () => {
    const queue = source("client/src/lib/calendarOfflineQueue.ts");
    const status = source("client/src/components/calendar/OfflineCalendarQueueStatus.tsx");
    const context = source("client/src/lib/context.tsx");
    expect(queue).toContain('indexedDB.open(DATABASE_NAME');
    expect(queue).toContain('const MAX_QUEUED_MUTATIONS = 100');
    expect(queue).toContain('status: "conflict"');
    expect(queue).toContain('"x-lyfeos-expected-revision"');
    expect(status).toContain("Conflicts never overwrite a newer mission automatically");
    expect(status).toContain("Apply my change");
    expect(status).toContain("Keep server");
    expect(context).toContain("Completion needs a connection");
    expect(context).toContain("Archiving needs a connection");
  });

  it("includes mutation receipts in account export and erasure", () => {
    const profile = source("server/routes/profile.ts");
    expect((profile.match(/"mission_mutation_receipts"/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
