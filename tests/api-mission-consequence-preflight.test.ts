import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

const contractBody = (expectedOutput: string) => ({
  purpose: "Make a consequential business commitment only after explicit downside review.",
  expectedOutput,
  methodSteps: ["Review the bounded commitment.", "Stop if an early warning signal appears."],
  toolRequirements: ["Written terms"],
  capabilityTargets: [],
  prerequisites: [],
  requiredEvidence: ["Signed decision receipt"],
  reviewMode: "self",
  riskLevel: "high",
  stopConditions: ["Stop before sending if the downside cannot be contained."],
  escalationPath: "Consult a qualified advisor before any external commitment.",
  state: "accepted",
});

const preflightBody = (contractRevision: number, decision: "proceed" | "revise" | "do_not_proceed") => ({
  contractRevision,
  assumptions: ["The written terms match the bounded commitment."],
  affectedParties: ["The account owner", "The external counterparty"],
  scenarios: [
    { kind: "expected", outcome: "The bounded commitment produces the declared deliverable without expanding scope.", earlySignals: ["Terms remain within the written scope"] },
    { kind: "upside", outcome: "The parties discover a useful follow-on opportunity without changing this commitment.", earlySignals: ["Both parties request a separate discussion"] },
    { kind: "downside", outcome: "Ambiguous terms create financial or reputation exposure beyond the intended scope.", earlySignals: ["A requested term exceeds the written boundary"] },
  ],
  reversibility: "partly_reversible",
  mitigationPlan: "Pause before external acceptance, preserve the written record, and escalate any scope change for qualified review.",
  uncertaintyNote: "LyfeOS cannot verify the counterparty, legal effect, or future outcome of these terms.",
  decision,
  decisionRationale: decision === "proceed" ? "The bounded version has explicit stop signals and a contained escalation path." : "The current version needs a narrower commitment before execution.",
  acknowledgedNoAuthority: true,
});

describeApi("Mission consequence preflight authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let outsiderCookie = "";
  let ownerId = 0;
  let outsiderId = 0;
  let questId = 0;
  let contractId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (outsiderCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, outsiderCookie);
    await pool.end();
  });

  it("creates isolated owners and keeps a high-risk contract in draft", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", { email: `preflight_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `preflight_owner_${stamp}`, termsAccepted: true });
    const outsider = await request("POST", "/api/auth/complete-registration", { email: `preflight_outsider_${stamp}@example.com`, password: "TestPass123!", displayName: `preflight_outsider_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201);
    expect(outsider.status).toBe(201);
    ownerCookie = owner.cookie;
    outsiderCookie = outsider.cookie;
    ownerId = owner.data.user.id;
    outsiderId = outsider.data.user.id;
    const mission = await request("POST", "/api/quests", { userId: ownerId, title: "Review consequential commitment", description: "Bound the commitment before any external action.", category: "work", experienceReward: 10, completed: false }, ownerCookie);
    expect(mission.status).toBe(201);
    questId = mission.data.quest.id;
    const saved = await request("PUT", `/api/quests/${questId}/contract`, contractBody("A reviewed and explicitly bounded commitment."), ownerCookie);
    expect(saved.status).toBe(200);
    contractId = saved.data.contract.id;
    expect(saved.data.contract).toMatchObject({ riskLevel: "high", state: "draft", contractRevision: 1 });
    expect(saved.data.preflightRequirement).toMatchObject({ required: true, satisfied: false, contractRevision: 1 });
    expect((await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie)).status).toBe(409);
    expect((await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(1, "proceed"), outsiderCookie)).status).toBe(404);
  });

  it("records revise without allowing acceptance, then records proceed", async () => {
    const malformed = preflightBody(1, "proceed") as any;
    malformed.scenarios = malformed.scenarios.slice(0, 2);
    expect((await request("POST", `/api/quests/${questId}/contract/preflights`, malformed, ownerCookie)).status).toBe(400);
    const revise = await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(1, "revise"), ownerCookie);
    expect(revise.status).toBe(201);
    expect(revise.data.preflights[0]).toMatchObject({ contractRevision: 1, decision: "revise", status: "revise" });
    expect(revise.data.preflightRequirement.satisfied).toBe(false);
    expect((await request("POST", `/api/quests/${questId}/contract/accept`, { contractRevision: 1 }, ownerCookie)).status).toBe(409);
    const proceed = await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(1, "proceed"), ownerCookie);
    expect(proceed.status).toBe(201);
    expect(proceed.data.preflightRequirement).toMatchObject({ satisfied: true, currentPreflightId: proceed.data.preflights[0].id });
    const accepted = await request("POST", `/api/quests/${questId}/contract/accept`, { contractRevision: 1 }, ownerCookie);
    expect(accepted.status).toBe(200);
    expect(accepted.data.contract.state).toBe("accepted");
    const unchanged = await request("PUT", `/api/quests/${questId}/contract`, contractBody("A reviewed and explicitly bounded commitment."), ownerCookie);
    expect(unchanged.status).toBe(200);
    expect(unchanged.data.contract).toMatchObject({ state: "accepted", contractRevision: 1 });
  });

  it("serializes concurrent material edits into distinct contract revisions", async () => {
    const mission = await request("POST", "/api/quests", {
      userId: ownerId,
      title: "Concurrent consequence revision probe",
      description: "Prove that simultaneous material edits cannot share one approval revision.",
      category: "work",
      experienceReward: 10,
      completed: false,
    }, ownerCookie);
    expect(mission.status).toBe(201);
    const concurrentQuestId = mission.data.quest.id;
    expect((await request("PUT", `/api/quests/${concurrentQuestId}/contract`, contractBody("Initial bounded output."), ownerCookie)).status).toBe(200);
    const edits = await Promise.all([
      request("PUT", `/api/quests/${concurrentQuestId}/contract`, contractBody("First independently bounded output."), ownerCookie),
      request("PUT", `/api/quests/${concurrentQuestId}/contract`, contractBody("Second independently bounded output."), ownerCookie),
    ]);
    expect(edits.map((response) => response.status)).toEqual([200, 200]);
    const current = await pool.query(`SELECT "contract_revision", "state", "expected_output" FROM "mission_contracts" WHERE "quest_id" = $1`, [concurrentQuestId]);
    expect(current.rows[0]).toMatchObject({ contract_revision: 3, state: "draft" });
    expect(["First independently bounded output.", "Second independently bounded output."]).toContain(current.rows[0].expected_output);
  });

  it("invalidates the decision after a material contract revision", async () => {
    const changed = await request("PUT", `/api/quests/${questId}/contract`, contractBody("A narrower commitment with a separately reviewed financial ceiling."), ownerCookie);
    expect(changed.status).toBe(200);
    expect(changed.data.contract).toMatchObject({ contractRevision: 2, state: "draft" });
    expect(changed.data.preflightRequirement).toMatchObject({ satisfied: false, contractRevision: 2, currentPreflightId: null });
    expect((await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie)).status).toBe(409);
    const stale = await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(1, "proceed"), ownerCookie);
    expect(stale.status).toBe(409);
    expect(stale.data.currentRevision).toBe(2);
  });

  it("invalidates review-authority changes and then permits canonical completion only after a fresh decision", async () => {
    const proceed = await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(2, "proceed"), ownerCookie);
    expect(proceed.status).toBe(201);
    expect(proceed.data.preflights[0].stopConditionsSnapshot).toEqual(["Stop before sending if the downside cannot be contained."]);
    expect((await request("POST", `/api/quests/${questId}/contract/accept`, { contractRevision: 2 }, ownerCookie)).status).toBe(200);
    const authorityChanged = await request("PATCH", `/api/quests/${questId}/contract/review-mode`, { reviewMode: "human" }, ownerCookie);
    expect(authorityChanged.status).toBe(200);
    expect(authorityChanged.data.contract).toMatchObject({ reviewMode: "human", contractRevision: 3, state: "draft" });
    expect((await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie)).status).toBe(409);
    expect((await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(3, "proceed"), ownerCookie)).status).toBe(201);
    expect((await request("POST", `/api/quests/${questId}/contract/accept`, { contractRevision: 3 }, ownerCookie)).status).toBe(200);
    const completed = await request("POST", `/api/quests/${questId}/toggle`, undefined, ownerCookie);
    expect(completed.status).toBe(200);
    expect(completed.data.quest.completed).toBe(true);
    expect((await request("POST", `/api/quests/${questId}/contract/preflights`, preflightBody(3, "proceed"), ownerCookie)).status).toBe(409);
  });

  it("exports the append-only decisions and erases them exactly", async () => {
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    const preflights = exported.data.data.mission_consequence_preflights.filter((row: any) => row.mission_contract_id === contractId).sort((left: any, right: any) => left.id - right.id);
    expect(preflights).toHaveLength(4);
    expect(preflights.map((row: any) => row.decision)).toEqual(["revise", "proceed", "proceed", "proceed"]);
    expect(preflights.every((row: any) => row.acknowledged_no_authority === true)).toBe(true);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200);
    ownerCookie = "";
    const remaining = await pool.query(`SELECT (SELECT count(*)::int FROM "users" WHERE "id" = $1) AS owner, (SELECT count(*)::int FROM "mission_consequence_preflights" WHERE "user_id" = $1) AS preflights, (SELECT count(*)::int FROM "users" WHERE "id" = $2) AS outsider`, [ownerId, outsiderId]);
    expect(remaining.rows[0]).toEqual({ owner: 0, preflights: 0, outsider: 1 });
  });
});
