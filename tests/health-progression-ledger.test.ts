import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { groupedHealthPracticeCandidates, healthBadgeCandidates, healthPracticeRank, isHealthEvidenceMutation, weeklyHealthReviewCandidates } from "../server/health-progression-rules";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("reversible health practice progression", () => {
  it("caps repeat logging to one process award per rule and day", () => {
    expect(groupedHealthPracticeCandidates("hydration_day", ["2026-08-01", "2026-08-01", "2026-08-02"])).toEqual([
      { key: "hydration_day:2026-08-01", ruleKey: "hydration_day", evidenceDate: "2026-08-01", xp: 1, evidence: { recordCount: 2 } },
      { key: "hydration_day:2026-08-02", ruleKey: "hydration_day", evidenceDate: "2026-08-02", xp: 1, evidence: { recordCount: 1 } },
    ]);
    expect(groupedHealthPracticeCandidates("workout_day", ["2026-08-01", "2026-08-01"])[0].xp).toBe(10);
  });

  it("uses transparent recorded-practice thresholds rather than a health score", () => {
    expect(healthPracticeRank(0)).toEqual({ level: 1, name: "Observer", minimumXp: 0 });
    expect(healthPracticeRank(74).name).toBe("Recorder");
    expect(healthPracticeRank(75).name).toBe("Practitioner");
    expect(healthPracticeRank(300).name).toBe("Seasoned recorder");
  });

  it("awards only process badges from qualifying active evidence", () => {
    const dates = Array.from({ length: 10 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`);
    const candidates = [
      ...groupedHealthPracticeCandidates("workout_day", dates),
      ...groupedHealthPracticeCandidates("recovery_day", dates.slice(0, 7)),
      ...groupedHealthPracticeCandidates("nutrition_day", dates.slice(0, 7)),
    ];
    expect(healthBadgeCandidates(candidates).map((badge) => badge.key)).toEqual([
      "first_health_record", "seven_practice_days", "multi_domain_practice", "training_rhythm", "recovery_rhythm",
    ]);
    expect(healthBadgeCandidates([])).toEqual([]);
  });

  it("caps self-authored review recognition to one reversible award per calendar week", () => {
    const reviews = weeklyHealthReviewCandidates(["2026-08-03", "2026-08-05", "2026-08-10", "2026-08-17", "2026-08-24"]);
    expect(reviews).toHaveLength(4);
    expect(reviews[0]).toEqual({ key: "practice_review_week:2026-08-03", ruleKey: "practice_review_week", evidenceDate: "2026-08-03", xp: 6, evidence: { recordCount: 2 } });
    expect(healthBadgeCandidates(reviews).map((badge) => badge.key)).toContain("reflective_practice");
  });

  it("reconciles after factual health mutations but ignores plans and preferences", () => {
    expect(isHealthEvidenceMutation("POST", "/api/nutrition/diary")).toBe(true);
    expect(isHealthEvidenceMutation("DELETE", "/api/workouts/42")).toBe(true);
    expect(isHealthEvidenceMutation("POST", "/api/recovery-routines/2/log")).toBe(true);
    expect(isHealthEvidenceMutation("PATCH", "/api/health-practice-reviews/2")).toBe(true);
    expect(isHealthEvidenceMutation("PATCH", "/api/health-fitness/targets/1")).toBe(false);
    expect(isHealthEvidenceMutation("POST", "/api/workout-templates")).toBe(false);
    expect(isHealthEvidenceMutation("GET", "/api/health-observations")).toBe(false);
  });

  it("uses append-only earning, reversal, and badge events with idempotent keys", () => {
    const migration = source("migrations/0060_health_progression_ledger.sql");
    const releaseRunner = source("server/release-migrate.ts");
    const progression = source("server/health-progression.ts");
    const profile = source("server/routes/profile.ts");
    const rights = source("server/routes/health-insights.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_progression_events"');
    expect(migration).toContain('"reversal_of_id" integer REFERENCES "health_progression_events"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_badge_events"');
    expect(releaseRunner).toContain('id: "0060_health_progression_ledger"');
    expect(progression).toContain('action: "reversed"');
    expect(progression).toContain('xpDelta: -net');
    expect(progression).toContain("underlying_records_removed");
    expect(progression).toContain("qualifying_evidence_removed");
    expect(progression).toContain("onConflictDoNothing");
    expect(progression).toContain("pg_advisory_xact_lock");
    expect(progression).toContain("getHealthProgressionSummary(userId, tx)");
    expect(profile).toContain('"health_progression_events"');
    expect(profile).toContain('"health_badge_events"');
    expect(rights).toContain('"health_progression_events", "health_badge_events"');
  });

  it("labels the UI as process recognition and exposes reversals", () => {
    const client = source("client/src/components/health/HealthProgression.tsx");
    expect(client).toContain("Recorded practice progression");
    expect(client).toContain("not a health, body, readiness, or competence score");
    expect(client).toContain("underlying records removed");
    expect(client).toContain("Only while evidence still qualifies");
    expect(client).toContain("one capped process award per calendar week");
  });

  it("keeps Health progression out of push, streak-loss, random-reward, and confetti paths", () => {
    const progression = source("server/health-progression.ts");
    const scheduler = source("server/notificationScheduler.ts");
    const client = source("client/src/components/health/HealthProgression.tsx");
    for (const forbidden of ["sendPush", "pushSubscription", "Math.random", "streak", "maintain", "lose your", "confetti"]) {
      expect(progression.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(client.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(scheduler).not.toContain("healthProgressionEvents");
    expect(scheduler).not.toContain("healthBadgeEvents");
    expect(scheduler).not.toContain("health_progression_events");
    expect(scheduler).not.toContain("health_badge_events");
  });

  it("owns, versions, exports, and deletes private practice reviews", () => {
    const migration = source("migrations/0085_health_practice_reviews.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/health-insights.ts");
    const profile = source("server/routes/profile.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "health_practice_reviews"');
    expect(migration).toContain('UNIQUE ("user_id", "review_date")');
    expect(release).toContain('id: "0085_health_practice_reviews"');
    expect(routes).toContain('app.post("/api/health-practice-reviews"');
    expect(routes).toContain("x-lyfeos-expected-revision");
    expect(routes).toContain('"health_practice_reviews"');
    expect(profile).toContain('"health_practice_reviews"');
  });
});
