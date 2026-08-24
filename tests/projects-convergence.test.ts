import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canTransitionProject, createProjectSchema, updateProjectSchema } from "../shared/projects";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Projects convergence", () => {
  it("requires a declared outcome, valid dates, and explicit state transitions", () => {
    expect(createProjectSchema.safeParse({ title: "Launch", outcome: "Public release", description: null, startDate: "2026-08-01", dueDate: "2026-09-01" }).success).toBe(true);
    expect(createProjectSchema.safeParse({ title: "Launch", outcome: "", description: null, startDate: null, dueDate: null }).success).toBe(false);
    expect(createProjectSchema.safeParse({ title: "Launch", outcome: "Public release", description: null, startDate: "2026-09-01", dueDate: "2026-08-01" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(canTransitionProject("planned", "active")).toBe(true);
    expect(canTransitionProject("planned", "completed")).toBe(false);
    expect(canTransitionProject("completed", "active")).toBe(true);
  });

  it("evolves stored boards into revisioned projects without deleting legacy records", () => {
    const migration = source("migrations/0097_projects_convergence.sql");
    const release = source("server/release-migrate.ts");
    for (const field of ["outcome", "state", "start_date", "due_date", "completed_at", "revision"]) expect(migration).toContain(`"${field}"`);
    expect(migration).toContain('ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "project_id"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "project_events"');
    expect(migration).not.toContain('DROP TABLE "kanban');
    expect(release).toContain('id: "0097_projects_convergence"');
    expect(release).toContain('quests_project_id_kanban_boards_id_fk');
  });

  it("uses Missions as Project tasks and never writes duplicate kanban tasks", () => {
    const routes = source("server/routes/projects.ts");
    expect(routes).toContain("createMissionLifecycle({");
    expect(routes).toContain("updateMissionLifecycle({");
    expect(routes).toContain("eq(quests.projectId, id)");
    expect(routes).toContain("Complete or unlink every open mission");
    expect(routes).not.toContain("kanbanTasks");
    expect(routes).not.toContain("kanban_tasks");
  });

  it("owner-scopes private APIs, enforces revisions, and records project events", () => {
    const routes = source("server/routes/projects.ts");
    expect(routes).toContain('app.get("/api/projects", isAuthenticated');
    expect(routes).toContain("eq(kanbanBoards.userId, userId)");
    expect(routes).toContain("eq(kanbanBoards.revision, expectedRevision)");
    expect(routes).toContain('eventType: "ProjectCreated.v1"');
    expect(routes).toContain('eventType: "ProjectTaskLinked.v1"');
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(routes).not.toContain("userId: req.body");
  });

  it("replaces the client-only Kanban entry with the protected Projects surface and preserves legacy detail", () => {
    const app = source("client/src/App.tsx");
    expect(app).toContain('React.lazy(() => import("./pages/ProjectsPage"))');
    expect(app).toContain('<Route path="/projects">');
    expect(app).toContain('<Route path="/kanban">');
    expect(app).toContain("<ProjectsPage />");
    expect(app).toContain('<Route path="/kanban/board/:boardId">');
    const page = source("client/src/pages/ProjectsPage.tsx");
    expect(page).toContain("Missions remain the only task, completion, and activity-XP authority");
  });

  it("includes project history in account export and cascaded deletion", () => {
    const profile = source("server/routes/profile.ts");
    expect(profile).toContain('"project_events"');
    expect(profile).toContain('DELETE FROM "kanban_boards" WHERE "user_id"');
  });
});
