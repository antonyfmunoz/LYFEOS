import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

function documentWith(value: string) {
  return { version: 1, activeSheetId: "sheet_main", sheets: [{ id: "sheet_main", name: "Sheet 1", rowCount: 40, columnCount: 10, cells: { A1: { input: value } } }] };
}

describeApi("spreadsheet version and concurrency contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let ownerCookie = "";
  let otherCookie = "";
  let spreadsheetId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
  });

  it("requires authentication and creates isolated accounts", async () => {
    expect((await request("GET", "/api/spreadsheets/1/revisions")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `sheets_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `sheets_owner_${stamp}`, termsAccepted: true });
    const other = await request("POST", "/api/auth/complete-registration", { email: `sheets_other_${stamp}@example.com`, password: "TestPass123!", displayName: `sheets_other_${stamp}`, termsAccepted: true });
    expect([owner.status, other.status]).toEqual([201, 201]);
    ownerCookie = owner.cookie; otherCookie = other.cookie;
  });

  it("creates an immutable baseline version", async () => {
    const created = await request("POST", "/api/spreadsheets", { title: "Original plan", description: "baseline", category: "planning", favorite: false, content: documentWith("original") }, ownerCookie);
    expect(created.status).toBe(201);
    expect(created.data.spreadsheet).toMatchObject({ title: "Original plan", revision: 1 });
    spreadsheetId = created.data.spreadsheet.id;
    const history = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, ownerCookie);
    expect(history.status).toBe(200);
    expect(history.data.revisions).toEqual([expect.objectContaining({ revisionNumber: 1, action: "created", sourceRevision: null })]);
  });

  it("rejects missing preconditions and serializes competing writers", async () => {
    const missing = await request("PATCH", `/api/spreadsheets/${spreadsheetId}`, { title: "Missing precondition" }, ownerCookie);
    expect(missing.status).toBe(428);
    const payloads = [
      { title: "Writer alpha", content: documentWith("alpha") },
      { title: "Writer beta", content: documentWith("beta") },
    ];
    const outcomes = await Promise.all(payloads.map((payload) => request("PATCH", `/api/spreadsheets/${spreadsheetId}`, payload, ownerCookie, { "x-lyfeos-expected-revision": "1" })));
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
    const winner = outcomes.find((outcome) => outcome.status === 200)!;
    expect(winner.data.spreadsheet.revision).toBe(2);
    expect(outcomes.find((outcome) => outcome.status === 409)!.data).toMatchObject({ currentRevision: 2 });
    const history = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, ownerCookie);
    expect(history.data.revisions.map((revision: any) => revision.revisionNumber)).toEqual([2, 1]);
  });

  it("keeps revision history private to its owner", async () => {
    const otherHistory = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, otherCookie);
    expect(otherHistory.status).toBe(404);
  });

  it("restores a snapshot as a new immutable version and rejects a stale restore", async () => {
    const restored = await request("POST", `/api/spreadsheets/${spreadsheetId}/revisions/1/restore`, undefined, ownerCookie, { "x-lyfeos-expected-revision": "2" });
    expect(restored.status).toBe(200);
    expect(restored.data.spreadsheet).toMatchObject({ title: "Original plan", description: "baseline", category: "planning", revision: 3 });
    expect(restored.data.spreadsheet.content.sheets[0].cells.A1.input).toBe("original");
    const history = await request("GET", `/api/spreadsheets/${spreadsheetId}/revisions`, undefined, ownerCookie);
    expect(history.data.revisions.map((revision: any) => ({ revisionNumber: revision.revisionNumber, action: revision.action, sourceRevision: revision.sourceRevision }))).toEqual([
      { revisionNumber: 3, action: "restored", sourceRevision: 1 },
      { revisionNumber: 2, action: "updated", sourceRevision: null },
      { revisionNumber: 1, action: "created", sourceRevision: null },
    ]);
    const stale = await request("POST", `/api/spreadsheets/${spreadsheetId}/revisions/2/restore`, undefined, ownerCookie, { "x-lyfeos-expected-revision": "2" });
    expect(stale.status).toBe(409);
    expect(stale.data.currentRevision).toBe(3);
  });
});
