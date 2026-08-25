import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

describeApi("Transformation intelligence API", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const owner = { email: `transformation_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `transformowner_${stamp}` };
  const reviewer = { email: `transformation_reviewer_${stamp}@example.com`, password: "TestPass123!", displayName: `transformreviewer_${stamp}` };
  let ownerCookie = "";
  let reviewerCookie = "";
  let ownerId = 0;
  let threadId = 0;
  let primarySkillId = 0;
  let initialPrimaryExperience = 0;
  let questId = 0;
  let reviewToken = "";
  let appealId = 0;

  afterAll(async () => {
    for (const account of [{ ...owner, cookie: ownerCookie }, { ...reviewer, cookie: reviewerCookie }]) {
      let cookie = account.cookie;
      if (!cookie) cookie = (await request("POST", "/api/auth/login", { identifier: account.displayName, password: account.password })).cookie;
      if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    }
  });

  it("creates isolated owner and reviewer accounts", async () => {
    const ownerRegistration = await request("POST", "/api/auth/complete-registration", { ...owner, termsAccepted: true });
    const reviewerRegistration = await request("POST", "/api/auth/complete-registration", { ...reviewer, termsAccepted: true });
    expect(ownerRegistration.status).toBe(201);
    expect(reviewerRegistration.status).toBe(201);
    ownerCookie = ownerRegistration.cookie;
    reviewerCookie = reviewerRegistration.cookie;
    ownerId = ownerRegistration.data.user.id;
    expect((await request("PATCH", "/api/profile", {
      completedOnboardingMissions: [0, 1, 2, 3, 4, 5, 6, 7],
      primaryCraft: "Discovery conversations",
      desiredTrait: "Curious communication",
      weeklyCapacity: { hours: 5 },
    }, ownerCookie)).status).toBe(200);
    const initialized = await request("POST", "/api/transformation-thread/initialize", undefined, ownerCookie);
    expect(initialized.status).toBe(201);
    threadId = initialized.data.thread.id;
    expect((await request("POST", `/api/transformation-thread/${threadId}/activate`, undefined, ownerCookie)).status).toBe(200);
    const thread = await request("GET", "/api/transformation-thread", undefined, ownerCookie);
    const primary = thread.data.thread.skills.find((skill: any) => skill.key === "primary");
    primarySkillId = primary.id;
    initialPrimaryExperience = primary.recordedExperience;
    expect(thread.data.thread.skillGraph.nextPractice.contract.methodSteps).toHaveLength(3);
    expect(thread.data.thread.skillGraph.nextPractice.contract.toolRequirements).toEqual([]);
    expect(thread.data.thread.skillGraph.nextPractice.advancement.disclosure).toContain("not certification");
  });

  it("stores explainable creation context and calibration for a canonical mission", async () => {
    const created = await request("POST", "/api/quests", {
      userId: ownerId,
      title: "Practice a discovery conversation",
      description: "Run one bounded conversation and record what happened.",
      category: "learning",
      experienceReward: 25,
      transformationThreadId: threadId,
      completed: false,
    }, ownerCookie);
    expect(created.status).toBe(201);
    questId = created.data.quest.id;
    const bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.status).toBe(200);
    expect(bundle.data.planningDecision.source).toBe("ui");
    expect(bundle.data.planningDecision.context.capturedAt).toBeTruthy();
    expect(bundle.data.planningDecision.calibration.version).toBe("transformation-difficulty.v1");
    expect(bundle.data.planningDecision.calibration.confidence).toBe("limited");
    expect((await request("PUT", `/api/quests/${questId}/skill-contributions`, { skillNodeIds: [primarySkillId] }, ownerCookie)).status).toBe(200);
  });

  it("accepts a versioned weighted proof rubric with a fresh decision context", async () => {
    const contract = await request("PUT", `/api/quests/${questId}/contract`, {
      purpose: "Practice an observable discovery conversation.",
      expectedOutput: "A concise observation of the questions asked and what was learned.",
      methodSteps: ["Prepare three open questions.", "Run one bounded conversation.", "Record what changed after the response."],
      toolRequirements: ["Conversation notes"],
      capabilityTargets: ["Discovery"],
      prerequisites: [],
      requiredEvidence: ["Conversation observation"],
      rubricDefinition: [{ id: "conversation-proof", requirement: "Conversation observation", guidance: "Compare the recorded observation with the expected output.", weight: 3, required: true }],
      reviewMode: "human",
      riskLevel: "low",
      stopConditions: [],
      escalationPath: null,
      state: "accepted",
    }, ownerCookie);
    expect(contract.status).toBe(200);
    // Mapping the mission creates its default proof plan at v1; replacing that
    // rubric with the owner's weighted definition produces the immutable v2.
    expect(contract.data.contract.rubricVersion).toBe(2);
    expect(contract.data.contract.rubricDefinition[0].weight).toBe(3);
    expect(contract.data.contract.methodSteps).toEqual(["Prepare three open questions.", "Run one bounded conversation.", "Record what changed after the response."]);
    expect(contract.data.contract.toolRequirements).toEqual(["Conversation notes"]);
    expect(contract.data.contract.acceptanceContextSnapshot.capturedAt).toBeTruthy();
    expect((await request("POST", `/api/quests/${questId}/evidence`, { sourceType: "observation", summary: "Recorded the questions, response, and next correction.", confidence: "self_reported" }, ownerCookie)).status).toBe(201);
    expect((await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie)).status).toBe(200);
  });

  it("binds a revision review to its exact rubric snapshot", async () => {
    const invitation = await request("POST", `/api/quests/${questId}/review-invitations`, { expiresInDays: 7 }, ownerCookie);
    expect(invitation.status).toBe(201);
    reviewToken = new URL(`https://lyfeos.test${invitation.data.reviewPath}`).hash.replace(/^#token=/, "");
    const reviewHeaders = { "x-lyfeos-review-token": reviewToken };
    expect((await request("GET", "/api/mission-review-invitations/resolve", undefined, reviewerCookie, reviewHeaders)).status).toBe(200);
    expect((await request("POST", "/api/mission-review-invitations/accept", undefined, reviewerCookie, reviewHeaders)).status).toBe(200);
    const reviewed = await request("POST", "/api/mission-review-invitations/review", {
      decision: "revisions_needed",
      summary: "The observation needs a clearer account of what changed after the response.",
      rubric: { evidenceChecks: [{ criterionId: "conversation-proof", requirement: "Conversation observation", met: false, note: "Outcome correction is missing." }] },
    }, reviewerCookie, reviewHeaders);
    expect(reviewed.status).toBe(201);
    const bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.data.contract.state).toBe("revisions_needed");
    expect(bundle.data.reviews[0].rubric.definition[0].id).toBe("conversation-proof");
  });

  it("preserves the original decision through a scoped appeal and reconsideration", async () => {
    const appeal = await request("POST", `/api/quests/${questId}/review-appeals`, { reason: "Please reconsider the final sentence of the observation, which records the correction after the response." }, ownerCookie);
    expect(appeal.status).toBe(201);
    appealId = appeal.data.appeal.id;
    const assigned = await request("GET", "/api/mission-review-appeals/assigned", undefined, reviewerCookie);
    expect(assigned.status).toBe(200);
    expect(assigned.data.appeals.find((item: any) => item.id === appealId).rubricDefinition[0].id).toBe("conversation-proof");
    const resolved = await request("POST", `/api/mission-review-appeals/${appealId}/resolve`, {
      decision: "reconsidered",
      summary: "The cited final sentence satisfies the original criterion.",
      rubric: { evidenceChecks: [{ criterionId: "conversation-proof", requirement: "Conversation observation", met: true, note: "Correction is present." }] },
    }, reviewerCookie);
    expect(resolved.status).toBe(200);
    expect(resolved.data.progression.applied).toBe(true);
    expect(resolved.data.progression.skillExperienceAwarded).toBeGreaterThan(0);
    const bundle = await request("GET", `/api/quests/${questId}/contract`, undefined, ownerCookie);
    expect(bundle.data.contract.state).toBe("reviewed");
    expect(bundle.data.appeals[0].status).toBe("reconsidered");
    expect(bundle.data.reviews.map((item: any) => item.decision)).toEqual(expect.arrayContaining(["revisions_needed", "meets_evidence"]));
    const thread = await request("GET", "/api/transformation-thread", undefined, ownerCookie);
    expect(thread.data.thread.skills.find((skill: any) => skill.id === primarySkillId).recordedExperience).toBeGreaterThan(initialPrimaryExperience);
  });

  it("reverses reviewed competence when its supporting mission is reopened", async () => {
    const reopened = await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie);
    expect(reopened.status).toBe(200);
    const thread = await request("GET", "/api/transformation-thread", undefined, ownerCookie);
    expect(thread.data.thread.skills.find((skill: any) => skill.id === primarySkillId).recordedExperience).toBe(initialPrimaryExperience);
  });

  it("keeps the Mission method pack in the owner's portable export", async () => {
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    const contract = exported.data.data.mission_contracts.find((row: any) => row.quest_id === questId);
    expect(contract.method_steps).toEqual(["Prepare three open questions.", "Run one bounded conversation.", "Record what changed after the response."]);
    expect(contract.tool_requirements).toEqual(["Conversation notes"]);
  });
});
