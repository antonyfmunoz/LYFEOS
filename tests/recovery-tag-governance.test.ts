import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeRecoveryTag } from "../shared/recovery-tags";

describe("recovery tag governance", () => {
  it("normalizes equivalent private vocabulary without exposing it", () => {
    expect(normalizeRecoveryTag("  Post Workout ")).toBe("post workout");
    expect(normalizeRecoveryTag("POST   WORKOUT")).toBe("post workout");
  });

  it("defaults tags to private sensitive and keeps both classifications excluded", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/recovery.ts"), "utf8");
    expect(routes).toContain('app.get("/api/recovery-tag-policies", isAuthenticated');
    expect(routes).toContain('app.put("/api/recovery-tag-policies", isAuthenticated');
    expect(routes).toContain('|| "private_sensitive"');
    expect(routes).toContain('sharing: "excluded"');
    expect(routes).toContain("excluded from AI, planning, social, and cross-product federation");
  });

  it("includes tag policies in release migration and account data rights", () => {
    expect(readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8")).toContain('id: "0086_recovery_tag_policies"');
    expect(readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8")).toContain('"recovery_tag_policies"');
    expect(readFileSync(resolve(process.cwd(), "server/routes/health-insights.ts"), "utf8")).toContain('"recovery_tag_policies"');
  });
});
