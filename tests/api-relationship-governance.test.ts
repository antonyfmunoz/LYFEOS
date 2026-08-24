import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("relationship intelligence governance authenticated journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let ownerCookie = "";
  let otherCookie = "";
  let contactId = 0;
  let sharingConsentId = "";

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
  });

  it("creates an owner-private relationship and denies another user", async () => {
    const owner = await request("POST", "/api/auth/complete-registration", { email: `relationship_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `owner_${stamp}`, termsAccepted: true });
    const other = await request("POST", "/api/auth/complete-registration", { email: `relationship_other_${stamp}@example.com`, password: "TestPass123!", displayName: `other_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); expect(other.status).toBe(201);
    ownerCookie = owner.cookie; otherCookie = other.cookie;
    const contact = await request("POST", "/api/contacts", { name: "Private relationship test", category: "personal", relationshipType: "friend", email: "never-share@example.com", notes: "never share this note" }, ownerCookie);
    expect(contact.status).toBe(201); contactId = contact.data.contact.id;
    const profile = await request("PUT", `/api/contacts/${contactId}/relationship`, { relationshipKind: "friend", state: "active", purpose: "Mutual support", boundaries: "Keep private details private", desiredCadence: "monthly", privateContext: "Sensitive private context" }, ownerCookie);
    expect(profile.status).toBe(200);
    expect((await request("GET", `/api/contacts/${contactId}/relationship`, undefined, otherCookie)).status).toBe(404);
  });

  it("records structured check-ins and bounded self-assessments", async () => {
    expect((await request("POST", `/api/contacts/${contactId}/relationship/interactions`, { kind: "check_in", summary: "Unstructured should be rejected" }, ownerCookie)).status).toBe(400);
    const checkIn = await request("POST", `/api/contacts/${contactId}/relationship/interactions`, { kind: "check_in", summary: "We reviewed our upcoming plans.", structuredData: { connection: 4, energyImpact: 1, boundaryAlignment: 5, followUpNeeded: false } }, ownerCookie);
    expect(checkIn.status).toBe(201);
    const assessment = await request("POST", `/api/contacts/${contactId}/relationship/assessments`, { assessmentKind: "baseline", dimensions: { connection: 4, trust: 5, reciprocity: 4, communication: 3, boundaryAlignment: 5, repairConfidence: 3 }, reflection: "My own current reflection" }, ownerCookie);
    expect(assessment.status).toBe(201);
    expect(assessment.data.disclosure).toMatch(/self-assessment/i);
  });

  it("keeps AI authorization separate and provider-gated", async () => {
    const blocked = await request("POST", `/api/contacts/${contactId}/relationship/recommendations`, undefined, ownerCookie);
    expect(blocked.status).toBe(403);
    const consent = await request("POST", `/api/contacts/${contactId}/relationship/consents`, { purpose: "ai_recommendation", allowedScopes: ["profile", "assessments", "check_ins"], allowedDestinations: [], expiresInDays: 30, disclosureAccepted: true }, ownerCookie);
    expect(consent.status).toBe(201);
    const providerGate = await request("POST", `/api/contacts/${contactId}/relationship/recommendations`, undefined, ownerCookie);
    expect(providerGate.status).toBe(503);
  });

  it("requires scoped sharing consent and emits no contact or private content", async () => {
    expect((await request("GET", `/api/contacts/${contactId}/relationship/projection?destination=umh`, undefined, ownerCookie)).status).toBe(403);
    expect((await request("POST", `/api/contacts/${contactId}/relationship/consents`, { purpose: "ecosystem_share", allowedScopes: ["check_ins"], allowedDestinations: ["umh"], expiresInDays: 30, disclosureAccepted: true }, ownerCookie)).status).toBe(400);
    const consent = await request("POST", `/api/contacts/${contactId}/relationship/consents`, { purpose: "ecosystem_share", allowedScopes: ["identity", "lifecycle", "commitment_status"], allowedDestinations: ["umh"], expiresInDays: 30, disclosureAccepted: true }, ownerCookie);
    expect(consent.status).toBe(201); sharingConsentId = consent.data.consent.id;
    const projection = await request("GET", `/api/contacts/${contactId}/relationship/projection?destination=umh`, undefined, ownerCookie);
    expect(projection.status).toBe(200);
    expect(projection.data).toMatchObject({ schema: "umh.relationship_event.v1", destination: "umh", data: { relationshipKind: "friend", state: "active", openCommitmentCount: 0 } });
    const keys = JSON.stringify({ ...projection.data, disclosure: undefined });
    for (const privateValue of ["Private relationship test", "never-share@example.com", "never share this note", "Sensitive private context", "My own current reflection", "We reviewed our upcoming plans."]) expect(keys).not.toContain(privateValue);
  });

  it("revokes sharing immediately and leaves a visible audit trail", async () => {
    expect((await request("DELETE", `/api/contacts/${contactId}/relationship/consents/${sharingConsentId}`, undefined, ownerCookie)).status).toBe(200);
    expect((await request("GET", `/api/contacts/${contactId}/relationship/projection?destination=umh`, undefined, ownerCookie)).status).toBe(403);
    const record = await request("GET", `/api/contacts/${contactId}/relationship`, undefined, ownerCookie);
    expect(record.status).toBe(200);
    expect(record.data.governanceAudit.map((event: any) => event.action)).toEqual(expect.arrayContaining(["consent_granted", "projection_built", "consent_revoked"]));
  });
});
