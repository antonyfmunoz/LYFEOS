import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseExpectedResourceRevision } from "../server/revision-concurrency";

const root = path.resolve(import.meta.dirname, "..");

describe("submitted workout correction concurrency", () => {
  it("requires a bounded positive expected revision", () => {
    expect(parseExpectedResourceRevision(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(parseExpectedResourceRevision("0")).toEqual({ ok: false, reason: "invalid" });
    expect(parseExpectedResourceRevision("1.5")).toEqual({ ok: false, reason: "invalid" });
    expect(parseExpectedResourceRevision("0001")).toEqual({ ok: false, reason: "invalid" });
    expect(parseExpectedResourceRevision("12")).toEqual({ ok: true, revision: 12 });
  });

  it("serializes owned corrections before comparing and appending revisions", () => {
    const routes = fs.readFileSync(path.join(root, "server/routes/workouts.ts"), "utf8");
    const lock = routes.indexOf("FOR UPDATE");
    const compare = routes.indexOf("expectedRevision.revision !== currentRevision");
    const append = routes.indexOf("revisionNumber: nextRevision");
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain('res.status(expectedRevision.reason === "missing" ? 428 : 400)');
    expect(routes).toContain('res.status(409)');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(compare);
    expect(compare).toBeLessThan(append);
  });

  it("keeps unsaved user fields until the user explicitly reloads a conflict", () => {
    const ui = fs.readFileSync(path.join(root, "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(ui).toContain('"x-lyfeos-expected-revision": String(editingWorkoutRevision)');
    expect(ui).toContain("Your unsaved fields remain above");
    expect(ui).toContain("Reload latest version");
    expect(ui).toContain("refuses to overwrite a newer correction");
  });

  it("locks and revision-checks a workout again immediately before deletion", () => {
    const routes = fs.readFileSync(path.join(root, "server/routes/workouts.ts"), "utf8");
    const ui = fs.readFileSync(path.join(root, "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(routes.match(/SELECT id FROM workouts[^`]+FOR UPDATE/g)?.length).toBe(2);
    expect(routes).toContain("currentRevision !== expectedRevision.revision");
    expect(routes).toContain("It was not deleted");
    expect(ui).toContain('"x-lyfeos-expected-revision": String(workout.currentRevision)');
  });
});
