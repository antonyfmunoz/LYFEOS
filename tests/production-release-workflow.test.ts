import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production release workflow", () => {
  it("is manually triggered, mainline-only, source-bound, and verifies the live identity after deployment", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/production-release.yml"), "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('description: "Immutable commit SHA already merged into main"');
    expect(workflow).toContain('git merge-base --is-ancestor "$source" origin/main');
    expect(workflow).toContain('npm run verify');
    expect(workflow).toContain('FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}');
    expect(workflow).toContain('--build-arg "LYFEOS_RELEASE=$SOURCE"');
    expect(workflow).toContain('image-label "source-$SOURCE"');
    expect(workflow).toContain('https://lyfeos.net/api/release');
    expect(workflow).toContain(".migrations.latest");
  });
});
