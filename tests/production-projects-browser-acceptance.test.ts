import fs from "node:fs";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync("scripts/production-projects-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const verifyWorkflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const page = fs.readFileSync("client/src/pages/ProjectsPage.tsx", "utf8");
const lifecycle = fs.readFileSync("server/mission-lifecycle.ts", "utf8");

describe("production Projects browser acceptance custody", () => {
  it("pins production runtime and reviewed harness identity without embedded real credentials", () => {
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("LYFEOS_ACCEPTANCE_SOURCE");
    expect(script).toContain("LYFEOS_ACCEPTANCE_HARNESS_SOURCE");
    expect(script).toContain('release.body?.sourceRevision === SOURCE');
    expect(script).not.toMatch(/[a-z0-9._%+-]+@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(script).not.toContain("demo123456");
  });

  it("proves the rendered Project lifecycle without inventing a second task authority", () => {
    expect(script).toContain('"lyfeos.production-projects-browser.v1"');
    expect(script).toContain('"lyfeos.isolated-projects-browser.v1"');
    for (const invariant of [
      "declaredOutcomeAndDatesPersisted",
      "canonicalMissionCreatedAtomically",
      "prematureCompletionBlocked",
      "unlinkPreservedCanonicalMission",
      "completionAndReopenReconciled",
      "existingMissionRelinked",
      "staleSaveStoppedAsConflict",
      "recoverableRemovalAndRestoreReconciled",
      "deepLinkPersisted",
      "crossOwnerIsolationReconciled",
      "appendOnlyHistoryReconciled",
    ]) expect(script).toContain(invariant);
    expect(script).toContain("Complete or unlink every open mission");
    expect(script).toContain("ownerMissions.body.quests");
    expect(script).toContain("account/session/identifier erasure");
    expect(script).toContain("does not prove human assistive-technology comprehension");
  });

  it("keeps stable nonvisual seams and atomic Project-Mission creation in the qualified source", () => {
    for (const seam of [
      'data-testid="projects-page"',
      'data-testid="project-create"',
      'data-testid="project-save"',
      'data-testid="project-state"',
      'data-testid="project-change-state"',
      'data-testid="project-create-mission"',
      'data-testid="project-link-mission"',
      'data-testid="project-remove"',
    ]) expect(page).toContain(seam);
    expect(page).toContain('window.history.replaceState');
    expect(page).toContain('title: "Project was not saved"');
    expect(page).toContain('queryClient.setQueryData<{ projects: Project[]; removedProjects: Project[] }>(["/api/projects"], projectList)');
    const createdSelection = page.indexOf("setSelectedId(project.id)");
    expect(createdSelection).toBeGreaterThan(-1);
    expect(createdSelection).toBeLessThan(page.indexOf('await queryClient.invalidateQueries({ queryKey: ["/api/projects"], exact: true })', createdSelection));
    expect(lifecycle).toContain("export async function createProjectMissionLifecycle");
    expect(lifecycle).toContain("can never leave behind an unlinked Mission");
    expect(lifecycle).toContain("await tx.insert(quests).values(prepared).returning()");
  });

  it("runs inside the protected production chain and retains its report", () => {
    expect(packageJson).toContain('"acceptance:production-projects": "tsx scripts/production-projects-browser-acceptance.ts"');
    expect(packageJson).toContain('"acceptance:projects": "tsx scripts/production-projects-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Projects acceptance");
    expect(verifyWorkflow).toContain("LYFEOS_PROJECTS_ACCEPTANCE_MODE=isolated npm run acceptance:projects");
    expect(verifyWorkflow).toContain("Upload isolated Projects evidence");
    expect(workflow).toContain("LYFEOS_PROJECTS_OUTPUT_DIR");
    expect(workflow).toContain("run: npm run acceptance:production-projects");
    expect(workflow).toContain("path: ${{ runner.temp }}/lyfeos-browser-acceptance");
  });
});
