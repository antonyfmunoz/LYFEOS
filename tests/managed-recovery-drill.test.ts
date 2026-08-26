import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/managed-recovery-drill.yml"), "utf8");

describe("managed recovery drill workflow", () => {
  it("assigns a monthly isolated-restore checklist without mutating production", () => {
    expect(workflow).toContain('cron: "0 17 1 * *"');
    expect(workflow).toContain("assignees: [context.repo.owner]");
    expect(workflow).toContain("Do not restore over production");
    expect(workflow).toContain("Restore only into an isolated provider branch");
    expect(workflow).toContain("Delete the isolated branch");
    expect(workflow).not.toContain("DATABASE_URL");
    expect(workflow).not.toContain("flyctl");
    expect(workflow).not.toContain("neonctl");
  });
});
