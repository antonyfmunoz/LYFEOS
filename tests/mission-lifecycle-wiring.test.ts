import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function serverTypeScriptFiles(directory = resolve(process.cwd(), "server")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return serverTypeScriptFiles(fullPath);
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("mission lifecycle wiring", () => {
  it("routes assistant-created and assistant-completed missions through the lifecycle service", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    expect(chat).toContain('createMissionLifecycle({');
    expect(chat).toContain('toggleMissionLifecycle({ questId: input.mission_id, userId, source: "ai" })');
    expect(chat).not.toContain("storage.toggleQuestCompletion(input.mission_id)");
    expect(chat).toContain("updateMissionLifecycle({ questId: input.mission_id, userId, updates: updateData, source: \"ai\" })");
  });

  it("routes mission UI completion through the same lifecycle service", () => {
    const quests = readSource("server/routes/quests.ts");
    expect(quests).toContain('toggleMissionLifecycle({ questId, userId: req.session.userId!, source: "ui" })');
    expect(quests).toContain('toggleMissionLifecycle({ questId: existingOnboardingQuest.id, userId: questData.userId, source: "onboarding" })');
    expect(quests).toContain('updateMissionLifecycle({');
    expect(quests).toContain('source: "onboarding"');
  });

  it("does not allow a newly-created completed mission to bypass lifecycle effects", () => {
    const lifecycle = readSource("server/mission-lifecycle.ts");
    expect(lifecycle).toContain("const shouldComplete = questInput.completed === true;");
    expect(lifecycle).toContain("quest: (await toggleMissionLifecycle({ questId: quest.id, userId: quest.userId, source })).quest");
  });

  it("keeps activity completion separate from evidence-backed capability progression", () => {
    const lifecycle = readSource("server/mission-lifecycle.ts");
    const contracts = readSource("server/routes/mission-contracts.ts");
    const progression = readSource("server/progression.ts");
    expect(lifecycle).toContain('sourceType: "mission_activity"');
    expect(lifecycle).toContain("applyReviewedMissionProgression");
    expect(contracts).toContain("applyReviewedMissionProgression");
    expect(progression).toContain('sourceType === "mission_evidence_review"');
  });

  it("requires declared evidence criteria to be explicitly checked before reviewed progression", () => {
    const contracts = readSource("server/routes/mission-contracts.ts");
    const reviewAuthorization = readSource("server/mission-review-authorization.ts");
    const detail = readSource("client/src/pages/MissionDetailPage.tsx");
    expect(contracts).toContain("validateEvidenceChecks");
    expect(reviewAuthorization).toContain("Review each declared evidence requirement");
    expect(reviewAuthorization).toContain("Every declared evidence requirement must be marked met");
    expect(detail).toContain("Confirm each declared requirement against the evidence you attached");
    expect(detail).toContain("evidenceChecks");
    expect(detail).toContain('reviewMission.mutate("revisions_needed")');
  });

  it("keeps risk, stop, and escalation context in the user-visible Proof Plan", () => {
    const detail = readSource("client/src/pages/MissionDetailPage.tsx");
    expect(detail).toContain("Mission risk level");
    expect(detail).toContain("stopConditions: stopCondition");
    expect(detail).toContain("escalationPath: escalationPath");
  });

  it("keeps activity XP distinct from evidence-backed capability claims on analytics surfaces", () => {
    const experience = readSource("client/src/pages/ExperienceDetailPage.tsx");
    const analytics = readSource("client/src/pages/AnalyticsPage.tsx");
    expect(experience).toContain("Evidence-backed capability progress is tracked separately");
    expect(analytics).toContain("not external certification or causal proof");
  });

  it("normalizes non-UI mission origins through the same creation policy", () => {
    const threads = readSource("server/routes/transformation-threads.ts");
    const profile = readSource("server/routes/profile.ts");
    const google = readSource("server/routes/google.ts");
    const federation = readSource("server/umh/service.ts");
    expect(threads).toContain("prepareMissionCreation");
    expect(profile).toContain("convertTodoIdeasToMissions");
    expect(google).toContain('source: "google"');
    expect(federation).toContain("prepareMissionCreation");
  });

  it("records local mission-created activity for transaction-bound sources", () => {
    const threads = readSource("server/routes/transformation-threads.ts");
    const federation = readSource("server/umh/service.ts");
    expect(threads).toContain("userActivityEvents");
    expect(threads).toContain('source: "system"');
    expect(federation).toContain("userActivityEvents");
    expect(federation).toContain('source: "umh"');
  });

  it("keeps imported calendar edits inside the same mission update policy", () => {
    const google = readSource("server/routes/google.ts");
    expect(google).toContain("updateMissionLifecycle");
    expect(google).toContain('source: "google"');
  });

  it("routes universal capture through the lifecycle instead of a side path", () => {
    const inbox = readSource("server/routes/inbox.ts");
    expect(inbox).toContain("createMissionLifecycleResult");
    expect(inbox).toContain('category: "todo"');
    expect(inbox).toContain('"/api/inbox/captures/batch"');
  });

  it("makes canonical mission creation atomic, source-aware, and replay safe", () => {
    const lifecycle = readSource("server/mission-lifecycle.ts");
    const inbox = readSource("server/routes/inbox.ts");
    const google = readSource("server/routes/google.ts");
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    expect(lifecycle).toContain("await db.transaction(async (tx) =>");
    expect(lifecycle).toContain("await tx.insert(userActivityEvents).values");
    expect(lifecycle).toContain("target: [quests.userId, quests.lifecycleKey]");
    expect(lifecycle).toContain("where: sql`${quests.lifecycleKey} IS NOT NULL`");
    expect(lifecycle).toContain("existing.lifecyclePayloadHash !== questInput.lifecyclePayloadHash");
    expect(inbox).toContain("`inbox:${parsed.data.mutationId}`");
    expect(inbox).toContain("captureRoute(async");
    expect(google).toContain("`google-calendar:${gEvent.id}`");
    expect(chat).toContain("`ai-action:${recordId}`");
  });

  it("uses one lifecycle-backed conversion path for captured todo ideas", () => {
    const profile = readSource("server/routes/profile.ts");
    const quests = readSource("server/routes/quests.ts");
    expect(profile).toContain("convertTodoIdeasToMissions");
    expect(quests).toContain("convertTodoIdeasToMissions");
    expect(profile).not.toContain("Auto-created from To-Do Ideas");
    expect(quests).not.toContain("Auto-created from To-Do Ideas");
  });

  it("turns repeated capacity deferrals into a visible, non-judgmental planning signal", () => {
    const threads = readSource("server/routes/transformation-threads.ts");
    const panel = readSource("client/src/components/dashboard/TransformationThreadPanel.tsx");
    expect(threads).toContain("missionDeferrals");
    expect(threads).toContain("deferralCount");
    expect(panel).toContain("scheduling signal, not a failure");
    expect(panel).toContain("Review or right-size mission");
  });

  it("captures current, explainable planning context before proposing a Thread", () => {
    const threads = readSource("server/routes/transformation-threads.ts");
    const panel = readSource("client/src/components/dashboard/TransformationThreadPanel.tsx");
    expect(threads).toContain("buildPlanningContextSnapshot");
    expect(threads).toContain("storage.getUserStats(userId)");
    expect(threads).toContain("storage.getUserDailyLogByDate(userId, new Date())");
    expect(panel).toContain("Plan context at setup");
    expect(panel).toContain("Sources: Profile direction and constraints");
    expect(panel).toContain("Update inputs");
  });

  it("captures decision context for assistant proposals and every canonical mission creation", () => {
    const lifecycle = readSource("server/mission-lifecycle.ts");
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    const detail = readSource("client/src/pages/MissionDetailPage.tsx");
    expect(lifecycle).toContain("planningContextSnapshot");
    expect(lifecycle).toContain("difficultyCalibration");
    expect(chat).toContain("CURRENT DECISION CONTEXT");
    expect(chat).toContain("planningContextSnapshot");
    expect(detail).toContain("Creation context");
    expect(detail).toContain("Accepted with capacity recorded as");
  });

  it("selects only capability-linked practice and exposes non-punitive remediation", () => {
    const threads = readSource("server/routes/transformation-threads.ts");
    const intelligence = readSource("server/transformation-intelligence.ts");
    const panel = readSource("client/src/components/dashboard/TransformationThreadPanel.tsx");
    expect(threads).toContain("selectNextPracticeMission");
    expect(intelligence).toContain("skillNodeIds.includes(input.skillNodeId)");
    expect(intelligence).toContain("buildMissionSupportPlan");
    expect(panel).toContain("Suggested scope: Rank");
    expect(intelligence).toContain("does not change the mission");
  });

  it("uses a session-bound opaque anti-forgery state for Google OAuth", () => {
    const google = readSource("server/routes/google.ts");
    expect(google).toContain("crypto.randomUUID()");
    expect(google).toContain("req.session.googleOAuthState = state");
    expect(google).toContain("state !== req.session.googleOAuthState");
    expect(google).not.toContain("JSON.stringify({ userId: req.session.userId })");
  });

  it("does not present placeholder integrations as real connections", () => {
    const profilePage = readSource("client/src/pages/ProfilePage.tsx");
    expect(profilePage).toContain("Not available yet");
    expect(profilePage).toContain("Planned");
    expect(profilePage).not.toContain('body: JSON.stringify({ provider, providerName, status: "active" })');
  });

  it("keeps mission proof records in the user-owned export", () => {
    const profile = readSource("server/routes/profile.ts");
    const profilePage = readSource("client/src/pages/ProfilePage.tsx");
    expect(profile).toContain('"mission_contracts"');
    expect(profile).toContain('"mission_evidence"');
    expect(profile).toContain('"mission_reviews"');
    expect(profile).toContain('"mission_deferrals"');
    expect(profile).toContain('"mission_dependencies"');
    expect(profile).toContain('"ai_pending_actions"');
    expect(profile).toContain('selectFederationAuditRows');
    expect(profile).toContain('"umh_inbound_commands"');
    expect(profile).toContain('"umh_approval_requests"');
    expect(profile).toContain('"umh_audit_records"');
    expect(profile).toContain('"umh_outbox_events"');
    expect(profilePage).toContain("planning history, and LyfeOS-side federation audit records");
  });

  it("does not present fixed player stats during the system ceremony", () => {
    const ceremony = readSource("client/src/pages/CeremonyPage.tsx");
    expect(ceremony).toContain('const { stats } = useLYFEOS()');
    expect(ceremony).toContain('stats.experience.level');
    expect(ceremony).toContain('stats.energyPoints.current');
    expect(ceremony).toContain('stats.efficiencyScore');
    expect(ceremony).not.toContain('value="100 / 100"');
  });

  it("keeps registration on the direct onboarding path without an obsolete verification screen", () => {
    const app = readSource("client/src/App.tsx");
    const queryClient = readSource("client/src/lib/queryClient.ts");
    expect(app).not.toContain('path="/verify-email"');
    expect(queryClient).not.toContain('"/verify-email"');
    expect(existsSync(resolve(process.cwd(), "client/src/pages/VerifyEmailPage.tsx"))).toBe(false);
  });

  it("creates a proof plan whenever skill practice is linked to a mission", () => {
    const quests = readSource("server/routes/quests.ts");
    expect(quests).toContain("ensurePracticeContract");
    expect(quests).toContain("await ensurePracticeContract(quest, skillNodeIds)");
  });

  it("prevents route and assistant code from bypassing mission creation or completion authority", () => {
    const lifecyclePath = resolve(process.cwd(), "server", "mission-lifecycle.ts");
    const forbidden = ["storage.createQuest(", "storage.toggleQuestCompletion("];
    for (const path of serverTypeScriptFiles()) {
      if (path === lifecyclePath || path.endsWith("\\storage.ts")) continue;
      const source = readFileSync(path, "utf8");
      for (const operation of forbidden) {
        expect(source, `${path} must use mission-lifecycle instead of ${operation}`).not.toContain(operation);
      }
    }
  });
});
