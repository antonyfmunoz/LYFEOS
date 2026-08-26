import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = (name: string) => readFileSync(resolve(process.cwd(), ".github/workflows", name), "utf8");

describe("production operations workflow boundary", () => {
  it("monitors immutable source and migration identity in addition to readiness", () => {
    const monitor = workflow("production-monitor.yml");
    expect(monitor).toContain("Verify immutable release and migration identity");
    expect(monitor).toContain(".sourceRevision");
    expect(monitor).toContain(".migrations.status");
    expect(monitor).toContain("0137_ai_execution_and_signed_extensions");
  });

  it("rehearses a real isolated logical restore and structural comparison", () => {
    const verify = workflow("verify.yml");
    expect(verify).toContain("Rehearse logical backup and isolated restore");
    expect(verify).toContain("pg_dump");
    expect(verify).toContain("pg_restore");
    expect(verify).toContain("schema_fingerprint");
    expect(verify).toContain("lyfeos_restore_ci");
  });
});
