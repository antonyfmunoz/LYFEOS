import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Mission evidence corrections", () => {
  it("keeps evidence append-only through a linked correction record", () => {
    expect(read("migrations/0161_mission_evidence_corrections.sql")).toContain('"supersedes_evidence_id" integer REFERENCES "mission_evidence"("id")');
    expect(read("shared/schema.ts")).toContain('supersedesEvidenceId: integer("supersedes_evidence_id")');
    expect(read("server/release-migrate.ts")).toContain('id: "0161_mission_evidence_corrections"');
  });

  it("allows an owner to correct manual evidence without overwriting the original or provider provenance", () => {
    const routes = read("server/routes/mission-contracts.ts");
    expect(routes).toContain('app.post("/api/quests/:questId/evidence/:evidenceId/corrections"');
    expect(routes).toContain('supersedesEvidenceId: original.id');
    expect(routes).toContain('original.sourceType === "provider"');
  });

  it("shows the linked history and a correction reason in the Mission proof surface", () => {
    const page = read("client/src/pages/MissionDetailPage.tsx");
    expect(page).toContain('Evidence correction reason');
    expect(page).toContain('correction of evidence #${item.supersedesEvidenceId}');
    expect(page).toContain('corrected by a later record');
    expect(page).toContain('Record evidence correction');
  });
});
