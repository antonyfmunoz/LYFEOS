import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("isolated rendered successor-focus evidence custody", () => {
  const script = source("scripts/thread-successor-browser-acceptance.ts");
  const workflow = source(".github/workflows/verify.yml");
  const packageJson = source("package.json");
  const panel = source("client/src/components/dashboard/TransformationThreadPanel.tsx");

  it("runs the real reviewed Mission and Thread lifecycle before rendered successor activation", () => {
    expect(script).toContain('activated.body.createdMissions === 3');
    expect(script).toContain('`/api/quests/${mission.id}/evidence`');
    expect(script).toContain('decision: "meets_evidence"');
    expect(script).toContain('`/api/transformation-thread/${firstThreadId}/review`');
    expect(script).toContain('`/api/transformation-thread/${firstThreadId}/complete`');
    expect(script).toContain('async function activateRenderedControl');
    expect(script).toContain('activateRenderedControl(page, \'[data-testid="prepare-thread-focus"]\')');
    expect(script).toContain('activateRenderedControl(page, \'[data-testid="activate-thread-plan"]\')');
    expect(script).toContain('async function dismissBlockingTutorial');
    expect(script).toContain('button[aria-label="Skip this tutorial"]');
    expect(script).toContain('Number(graphPrimary?.threadExperience) === 0');
    expect(script).toContain('capability?.focusCount === 2');
  });

  it("is SHA-bound, responsive, isolated, and explicit about its evidence boundary", () => {
    expect(script).toContain('schema: "lyfeos.isolated-thread-successor-browser.v1"');
    expect(script).toContain('process.env.GITHUB_SHA');
    expect(script).toContain('desktop-1440x900');
    expect(script).toContain('mobile-390x844');
    expect(script).toContain('DELETE", "/api/account"');
    expect(script).toContain('Account erasure left successor-focus residue');
    expect(script).toContain('does not prove longitudinal usefulness, external certification, authority, or a production user\'s comprehension');
  });

  it("keeps rendered controls discoverable and archives the artifact in the protected workflow", () => {
    expect(packageJson).toContain('"acceptance:thread-successor": "tsx scripts/thread-successor-browser-acceptance.ts"');
    expect(panel).toContain('data-testid="transformation-thread-initialization"');
    expect(panel).toContain('data-testid="next-capability-focus"');
    expect(panel).toContain('data-testid="prepare-thread-focus"');
    expect(panel).toContain('data-testid="activate-thread-plan"');
    expect(workflow).toContain('npm run acceptance:thread-successor');
    expect(workflow).toContain('name: lyfeos-isolated-thread-successor-${{ github.sha }}');
    expect(workflow).toContain('path: ${{ runner.temp }}/lyfeos-thread-successor-browser');
    expect(workflow).toContain('if: always()');
  });
});
