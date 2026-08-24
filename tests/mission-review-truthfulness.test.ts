import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mission review truthfulness", () => {
  it("does not present a self-review as a substitute for an authorized human review", () => {
    const page = source("client/src/pages/MissionDetailPage.tsx");
    const routes = source("server/routes/mission-contracts.ts");
    expect(page).toContain('contractQuery.data.contract.reviewMode === "human"');
    expect(page).toContain("Self-review cannot advance this mission");
    expect(page).toContain("not external certification or verification of competence");
    expect(routes).toContain("This mission requires an authorized human reviewer; self-review is not sufficient.");
  });

  it("labels authorized review as in-app progression evidence, not certification", () => {
    const page = source("client/src/pages/MissionReviewPage.tsx");
    expect(page).toContain("does not issue professional certification, legal authority, or a universal judgment of competence");
    expect(page).toContain("no broader access to the mission owner’s LyfeOS account was granted");
  });
});
