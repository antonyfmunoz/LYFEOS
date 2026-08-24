import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workout history structured filters", () => {
  it("validates bounded source, evidence, program, and effort selectors", () => {
    const routes = source("server/routes/workouts.ts");
    expect(routes).toContain('source: z.enum(["manual", "device", "imported"])');
    expect(routes).toContain('setState: z.enum(["any", "performed", "skipped_only", "no_sets"])');
    expect(routes).toContain('programLink: z.enum(["any", "linked", "unlinked"])');
    expect(routes).toContain('rpeMin: z.coerce.number().int().min(1).max(10)');
    expect(routes).toContain('input.rpeMin <= input.rpeMax');
  });

  it("applies one structured condition builder to list and CSV scopes", () => {
    const routes = source("server/routes/workouts.ts");
    expect(routes.match(/\.\.\.workoutHistoryStructuredConditions\(parsedFilters\.data\)/g)).toHaveLength(2);
    expect(routes).toContain("eq(workoutProgramSessions.completedWorkoutId, workouts.id)");
    expect(routes).toContain("eq(workoutSets.completed, true)");
    expect(routes).toContain("eq(workoutSets.completed, false)");
  });

  it("exposes the filters and factual linkage context in the owner UI", () => {
    const client = source("client/src/components/health/WorkoutLog.tsx");
    expect(client).toContain("Filter workout history by record source");
    expect(client).toContain("Filter workout history by set evidence");
    expect(client).toContain("Filter workout history by program link");
    expect(client).toContain("Minimum workout RPE filter");
    expect(client).toContain("workout.programLink.programId");
  });
});
