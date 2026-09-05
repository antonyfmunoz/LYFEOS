import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Sentry browser tunnel resilience", () => {
  it("keeps upstream telemetry failure out of the user-facing request path while retaining a sanitized server signal", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
    expect(server).toContain('app.post("/api/sentry-tunnel"');
    expect(server).toContain("[sentry-tunnel] upstream delivery failed status=${upstream.status}");
    expect(server).toContain("[sentry-tunnel] upstream delivery failed reason=${error instanceof Error ? error.name : \"unknown\"}");
    expect(server).toContain("return res.sendStatus(204);");
    expect(server).not.toContain("return res.sendStatus(upstream.ok ? 200 : 502);");
  });
});
