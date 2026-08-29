import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stat-tip reload budget", () => {
  it("reuses a bounded per-user session cache instead of regenerating tips on every full load", () => {
    const context = readFileSync(resolve(process.cwd(), "client/src/lib/context.tsx"), "utf8");
    expect(context).toContain("STAT_TIPS_SESSION_TTL_MS = 5 * 60 * 1000");
    expect(context).toContain("readSessionStatTips(user.id)");
    expect(context).toContain("writeSessionStatTips(user.id, data.tips)");
    expect(context).toContain("discardSessionStatTips(key)");
    expect(context).toContain("lyfeos_stat_tips_${userId}");
    expect(context).toContain("Array.isArray(tips)");
    expect(context).toContain("Date.now() - cached.fetchedAt > STAT_TIPS_SESSION_TTL_MS");
  });
});
