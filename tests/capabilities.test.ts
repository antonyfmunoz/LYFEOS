import { describe, expect, it } from "vitest";
import { capabilityKey, capabilityLevelForExperience } from "../server/capabilities";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("private capability registry", () => {
  it("normalizes equivalent labels into one durable capability key", () => {
    expect(capabilityKey("  Sales & Negotiation ")).toBe("sales-negotiation");
    expect(capabilityKey("Communication")).toBe("communication");
  });

  it("uses the same progressive level curve as Thread-local practice", () => {
    expect(capabilityLevelForExperience(0)).toBe(1);
    expect(capabilityLevelForExperience(100)).toBe(2);
    expect(capabilityLevelForExperience(235)).toBe(3);
  });

  it("includes the capability migration in the production release runner", () => {
    const releaseMigration = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(releaseMigration).toContain('id: "0019_personal_capabilities"');
    expect(releaseMigration).toContain('ALTER TABLE "skill_nodes" ADD COLUMN IF NOT EXISTS "capability_id"');
  });

  it("chooses a skill-linked next Thread mission using calibrated difficulty and current capacity", () => {
    const threads = readFileSync(resolve(process.cwd(), "server/routes/transformation-threads.ts"), "utf8");
    expect(threads).toContain("selectNextPracticeMission");
    expect(threads).toContain("mission.skillNodeIds.includes(recommendedSkill.id)");
    expect(threads).toContain("recommendedDifficulty: difficultyCalibration.recommendedDifficulty");
    expect(threads).toContain("missionFitsResources");
    expect(threads).toContain("fitsCurrentCapacity");
  });

  it("lets a user explain how two private skills are connected without granting progression", () => {
    const threads = readFileSync(resolve(process.cwd(), "server/routes/transformation-threads.ts"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "client/src/components/dashboard/TransformationThreadPanel.tsx"), "utf8");
    expect(threads).toContain('"/api/transformation-thread/:id/skill-edges"');
    expect(threads).toContain("They do not");
    expect(threads).toContain("silently grant XP");
    expect(panel).toContain("Skill relationship");
    expect(threads).toContain('"/api/transformation-thread/:id/skill-edges/:edgeId"');
    expect(panel).toContain("Could not remove connection");
  });

  it("keeps user-stated relationship strength visual rather than a hidden XP multiplier", () => {
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    const constellation = readFileSync(resolve(process.cwd(), "client/src/components/dashboard/CapabilityConstellation.tsx"), "utf8");
    const releaseMigration = readFileSync(resolve(process.cwd(), "server/release-migrate.ts"), "utf8");
    expect(schema).toContain('influenceWeight: integer("influence_weight").notNull().default(1)');
    expect(constellation).toContain("Line strength shows your stated connection");
    expect(releaseMigration).toContain('id: "0024_skill_edge_weights"');
  });
});
