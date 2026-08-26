import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("append-only mission planning context", () => {
  it("stores corrections separately from the immutable creation snapshot", () => {
    const migration = source("migrations/0124_mission_planning_context_amendments.sql");
    const route = source("server/routes/mission-contracts.ts");
    expect(migration).toContain('"previous_snapshot" jsonb NOT NULL');
    expect(migration).toContain('"snapshot" jsonb NOT NULL');
    expect(migration).toContain('UNIQUE ("quest_id", "revision")');
    expect(route).toContain("expectedRevision");
    expect(route).toContain("currentContext: amendments[0]?.snapshot || quest.planningContextSnapshot");
    expect(route).not.toMatch(/update\(quests\)[\s\S]{0,200}planningContextSnapshot/);
  });

  it("exposes source drill-down and a compact correction control in the existing Mission surface", () => {
    const route = source("server/routes/mission-contracts.ts");
    const page = source("client/src/pages/MissionDetailPage.tsx");
    for (const href of ['/profile', '/dashboard', '/tracker']) expect(route).toContain(`href: "${href}"`);
    expect(page).toContain("Review sources or correct current context");
    expect(page).toContain("The creation snapshot and every prior correction remain immutable");
    expect(page).toContain("Record context revision");
  });

  it("includes revisions in export and release migration convergence", () => {
    expect(source("server/routes/profile.ts")).toContain('"mission_planning_context_amendments"');
    expect(source("server/release-migrate.ts")).toContain('id: "0124_mission_planning_context_amendments"');
  });
});
