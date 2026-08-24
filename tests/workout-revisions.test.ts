import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("performed workout correction history", () => {
  it("adds an immutable owned revision ledger to migration, schema, release and data rights", () => {
    expect(source("migrations/0065_workout_revisions.sql")).toContain('CREATE TABLE IF NOT EXISTS "workout_revisions"');
    expect(source("server/release-migrate.ts")).toContain('id: "0065_workout_revisions"');
    expect(source("migrations/0065_workout_revisions.sql")).toContain('WHERE NOT EXISTS (SELECT 1 FROM "workout_revisions"');
    expect(source("shared/schema.ts")).toContain('workoutRevisions = pgTable("workout_revisions"');
    expect(source("server/routes/profile.ts")).toContain('"workout_revisions"');
  });

  it("snapshots creation and every correction without replacing earlier versions", () => {
    const routes = source("server/routes/workouts.ts");
    expect(routes).toContain('app.get("/api/workouts/:id/revisions", isAuthenticated');
    expect(routes).toContain("revisionNumber: 1, snapshot: { workout: created, exercises }");
    expect(routes).toContain("revisionNumber: 1, snapshot: { workout, exercises }");
    expect(routes).toContain("const nextRevision = currentRevision + 1");
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain("expectedRevision.revision !== currentRevision");
    expect(routes).toContain("eq(workoutRevisions.userId, req.session.userId!)");
    expect(source("client/src/components/health/WorkoutLog.tsx")).toContain("immutable submitted-workout revision(s)");
  });
});
