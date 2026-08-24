import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("API not-found boundary", () => {
  it("returns JSON 404s before the SPA fallback", () => {
    const source = fs.readFileSync(path.resolve("server/index.ts"), "utf8");
    const apiBoundary = source.indexOf('app.use("/api"');
    const viteSetup = source.indexOf("await setupVite");
    expect(apiBoundary).toBeGreaterThan(-1);
    expect(viteSetup).toBeGreaterThan(apiBoundary);
    expect(source).toContain('res.status(404).json({ error: "API route not found"');
  });
});
