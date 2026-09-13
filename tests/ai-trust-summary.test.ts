import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI trust summary", () => {
  it("keeps the guide's context and action limits visible without creating a second settings workflow", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/AIPage.tsx"), "utf8");
    expect(page).toContain('data-testid="ai-trust-summary"');
    expect(page).toContain("It uses only the context you enable");
    expect(page).toContain("External sending, purchases, and publishing are disabled");
    expect(page).toContain('href="/profile"');
  });
});
