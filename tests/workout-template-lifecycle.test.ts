import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("workout template lifecycle", () => {
  const routes = readFileSync(resolve(process.cwd(), "server/routes/workouts.ts"), "utf8");
  const ui = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");

  it("duplicates only the owned planned template into an independent version-one template", () => {
    expect(routes).toContain('app.post("/api/workout-templates/:id/duplicate", isAuthenticated');
    expect(routes).toContain("eq(workoutTemplates.userId, req.session.userId!)");
    expect(routes).toContain("revisionNumber: 1");
    expect(ui).toContain("Duplicate plan");
  });

  it("keeps planned targets distinct from the performed-set evidence contract", () => {
    expect(routes).toContain("const plannedSetSchema = z.object");
    expect(routes).toContain("exercises: z.array(plannedExerciseSchema)");
    expect(routes).not.toMatch(/const plannedSetSchema[\s\S]*?\.refine\([^]*?performed value/);
  });

  it("restores an owned immutable snapshot as a new revision", () => {
    expect(routes).toContain('app.post("/api/workout-templates/:id/revisions/:revisionNumber/restore", isAuthenticated');
    expect(routes).toContain("eq(workoutTemplateRevisions.userId, req.session.userId!)");
    expect(routes).toContain("const nextRevision = currentRevision + 1");
    expect(routes).toContain("SELECT id FROM workout_templates");
    expect(routes).toContain("FOR UPDATE");
    expect(ui).toContain("Restore as new version");
    expect(ui).toContain("it never rewrites history");
  });

  it("hands a template to Missions only through a private confirm-first draft", () => {
    expect(routes).toContain('app.post("/api/workout-templates/:id/planning-draft", isAuthenticated');
    expect(routes).toContain("healthPlanningDrafts");
    expect(routes).toContain("No performed workout was inferred");
    expect(ui).toContain("Draft mission");
    expect(ui).toContain("No Mission or workout was created yet");
  });
});
