import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { activityLevelProgress, getNextProgressionRank } from "@shared/progression";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("unified gamification contract", () => {
  it("uses one bounded activity-level curve and rank horizon", () => {
    expect(activityLevelProgress(0)).toMatchObject({ level: 1, currentLevelExperience: 0, nextLevelExperience: 1000, percent: 0 });
    expect(activityLevelProgress(999).level).toBe(1);
    expect(activityLevelProgress(1000)).toMatchObject({ level: 2, currentLevelExperience: 0 });
    expect(activityLevelProgress(-50).totalExperience).toBe(0);
    expect(getNextProgressionRank(4)?.name).toBe("Apprentice");
    expect(getNextProgressionRank(100)).toBeNull();
  });

  it("ships immutable reversible activity and badge ledgers through both migration paths", () => {
    const migration = source("migrations/0101_gamification_contract.sql");
    const release = source("server/release-migrate.ts");
    for (const table of ["activity_progression_events", "progression_badge_events"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(release).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(migration).toContain('"reversal_of_id" integer REFERENCES "activity_progression_events"');
    expect(migration).toContain('"reversal_of_id" integer REFERENCES "progression_badge_events"');
    expect(release).toContain('id: "0101_gamification_contract"');
  });

  it("separates activity, consistency, capability, health practice, and authority", () => {
    const progression = source("server/progression.ts");
    for (const track of ["activity", "consistency", "capability", "healthPractice", "authority"]) {
      expect(progression).toContain(`${track}: {`);
    }
    expect(progression).toContain("Capability XP moves only through reviewed mission evidence");
    expect(progression).toContain("does not currently grant external certification");
  });

  it("does not advertise imaginary feature, XP, certification, or authority unlocks", () => {
    const levelUp = source("client/src/components/dashboard/LevelUpModal.tsx");
    const streaks = source("client/src/pages/StreakDetailPage.tsx");
    for (const falseUnlock of ["Premium templates access", "Extended storage limits", "Mentorship program eligibility", "New Features Unlocked"]) {
      expect(levelUp).not.toContain(falseUnlock);
    }
    expect(streaks).not.toContain('reward: "+');
    expect(streaks).toContain("Opening LyfeOS alone does not count");
  });

  it("celebrates only after the canonical toggle succeeds and blocks client-forged progression", () => {
    const context = source("client/src/lib/context.tsx");
    expect(context.indexOf("const data = await response.json()"))
      .toBeLessThan(context.indexOf("missionCompleteToast(data.quest.title"));
    const profileRoutes = source("server/routes/profile.ts");
    expect(profileRoutes).toContain("they can never write progression state directly");
    expect(profileRoutes).not.toContain("dbStatsUpdate.streakDays = frontendStats.streakDays");
    expect(profileRoutes).not.toContain("dbStatsUpdate.level = frontendStats.experience.level");
  });
});
