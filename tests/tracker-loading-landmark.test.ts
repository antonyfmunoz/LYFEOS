import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "client/src/pages/AnalyticsPage.tsx"), "utf8");

describe("Tracker loading state", () => {
  it("keeps a named main landmark while analytics load", () => {
    const tracker = source();
    expect(tracker).toContain('aria-labelledby="tracker-loading-heading"');
    expect(tracker).toContain('<h1 id="tracker-loading-heading"');
    expect(tracker).toContain('Loading Tracker');
    expect(tracker).toContain('aria-busy="true"');
  });
});
