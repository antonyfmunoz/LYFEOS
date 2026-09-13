import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Transformation Thread continuation", () => {
  it("waits for every live Mission to be positively reviewed before preparing one canonical next step", () => {
    const continuation = source("server/transformation-thread-continuation.ts");
    expect(continuation).toContain("export async function prepareThreadContinuationAfterReview");
    expect(continuation).toContain("mission.completed && mission.contractState === \"reviewed\"");
    expect(continuation).toContain("thread-continuation:${thread.id}:after-review:${input.reviewedQuestId}");
    expect(continuation).toContain("createMissionLifecycleResult");
    expect(continuation).toContain("onConflictDoNothing()");
    expect(continuation).toContain("export async function reconcileThreadContinuation");
    expect(continuation).toContain("isNotNull(missionContracts.progressionAppliedAt)");
    expect(continuation).toContain("reason: \"focus_completion_window\"");
    expect(continuation).toContain("MIN_TRANSFORMATION_THREAD_COMPLETION_DAYS");
  });

  it("can be triggered only from positive evidence review progression and preserves review authority if planning is unavailable", () => {
    const lifecycle = source("server/mission-lifecycle.ts");
    expect(lifecycle).toContain('await import("./transformation-thread-continuation")');
    expect(lifecycle).toContain("Could not prepare the next Thread mission after review");
    expect(lifecycle).toContain("return { skillExperienceAwarded, applied: true, progression, continuation };");
  });

  it("does not send a person back to manual mission creation while their Thread is sequencing", () => {
    const routes = source("server/routes/transformation-threads.ts");
    expect(routes).toContain("LyfeOS will prepare the next bounded, evidence-backed practice step");
    expect(routes).toContain("does not create a new step from a checkmark alone");
    expect(routes).not.toContain("Create one real-world mission for this unlocked skill");
  });

  it("repairs a transient continuation failure when the active Thread is loaded", () => {
    const routes = source("server/routes/transformation-threads.ts");
    expect(routes).toContain("await reconcileThreadContinuation(userId)");
    expect(routes).toContain("Could not reconcile the next Thread mission");
  });
});
