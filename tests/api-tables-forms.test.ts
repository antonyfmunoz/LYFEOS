import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

const textColumn = (id: string, name: string, required = false) => ({ id, name, type: "text", required, options: [] });

describeApi("Tables, relations, and governed Forms API", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const owner = { email: `tables_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `tablesowner_${stamp}` };
  const other = { email: `tables_other_${stamp}@example.com`, password: "TestPass123!", displayName: `tablesother_${stamp}` };
  let ownerCookie = ""; let otherCookie = ""; let targetId = 0; let sourceId = 0; let targetRowId = 0; let sourceRowId = 0; let formTableId = 0; let formId = 0; let publicId = ""; let token = "";

  afterAll(async () => {
    for (const account of [{ ...owner, cookie: ownerCookie }, { ...other, cookie: otherCookie }]) {
      let cookie = account.cookie; if (!cookie) cookie = (await request("POST", "/api/auth/login", { identifier: account.displayName, password: account.password })).cookie;
      if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie);
    }
  });

  it("creates isolated owners and canonical related Tables", async () => {
    const ownerRegistration = await request("POST", "/api/auth/complete-registration", { ...owner, termsAccepted: true });
    const otherRegistration = await request("POST", "/api/auth/complete-registration", { ...other, termsAccepted: true });
    expect(ownerRegistration.status).toBe(201); expect(otherRegistration.status).toBe(201); ownerCookie = ownerRegistration.cookie; otherCookie = otherRegistration.cookie;
    const target = await request("POST", "/api/databases", { title: "People", description: null, category: "test", favorite: false, definition: { version: 1, columns: [textColumn("name", "Name", true)] } }, ownerCookie);
    expect(target.status).toBe(201); targetId = target.data.database.id;
    const source = await request("POST", "/api/databases", { title: "Projects", description: null, category: "test", favorite: false, definition: { version: 1, columns: [textColumn("title", "Title", true), { id: "people", name: "People", type: "relation", required: false, options: [], relation: { databaseId: targetId, displayColumnId: "name" } }] } }, ownerCookie);
    expect(source.status).toBe(201); sourceId = source.data.database.id;
    const targetRow = await request("POST", `/api/databases/${targetId}/rows`, { values: { name: "Avery" } }, ownerCookie); targetRowId = targetRow.data.row.id;
    const sourceRow = await request("POST", `/api/databases/${sourceId}/rows`, { values: { title: "Launch", people: [targetRowId] } }, ownerCookie); sourceRowId = sourceRow.data.row.id;
    expect(sourceRow.status).toBe(201);
    expect((await request("GET", `/api/databases/${targetId}`, undefined, otherCookie)).status).toBe(404);
  });

  it("derives backlinks and unlinks through a new immutable source revision", async () => {
    const before = await request("GET", `/api/databases/${targetId}`, undefined, ownerCookie);
    expect(before.status).toBe(200); expect(before.data.rows[0].backlinks).toEqual([{ sourceDatabaseId: sourceId, sourceDatabaseTitle: "Projects", sourceRowId, relationColumnId: "people", relationColumnName: "People" }]);
    const reviewed = await request("GET", `/api/databases/${targetId}/rows/${targetRowId}/references`, undefined, ownerCookie);
    expect(reviewed.status).toBe(200); expect(reviewed.data).toMatchObject({ referenceCount: 1, truncated: false, references: before.data.rows[0].backlinks });
    expect((await request("DELETE", `/api/databases/${targetId}/rows/${targetRowId}`, undefined, ownerCookie)).status).toBe(409);
    const forged = await request("POST", `/api/databases/${targetId}/rows/${targetRowId}/unlink-references`, { referenceCount: 1, confirmation: "UNLINK 1", reviewedReferences: [{ sourceDatabaseId: sourceId, sourceRowId, relationColumnId: "title" }] }, ownerCookie);
    expect(forged.status).toBe(409); expect(forged.data.error).toContain("reviewed references changed");
    const unlinked = await request("POST", `/api/databases/${targetId}/rows/${targetRowId}/unlink-references`, { referenceCount: 1, confirmation: "UNLINK 1", reviewedReferences: [{ sourceDatabaseId: sourceId, sourceRowId, relationColumnId: "people" }] }, ownerCookie);
    expect(unlinked.status).toBe(200); expect(unlinked.data).toEqual({ unlinkedReferenceCount: 1, affectedRowCount: 1 });
    const source = await request("GET", `/api/databases/${sourceId}`, undefined, ownerCookie);
    expect(source.data.rows.find((row: any) => row.id === sourceRowId)).toMatchObject({ revision: 2, values: { title: "Launch", people: [] } });
    const history = await request("GET", `/api/databases/${sourceId}/rows/${sourceRowId}/revisions`, undefined, ownerCookie);
    expect(history.data.revisions.map((revision: any) => revision.revisionNumber)).toEqual([2, 1]);
    expect((await request("DELETE", `/api/databases/${targetId}/rows/${targetRowId}`, undefined, ownerCookie)).status).toBe(204);
  });

  it("enforces sectioned conditional Forms over canonical rows", async () => {
    const table = await request("POST", "/api/databases", { title: "Check-ins", description: null, category: "test", favorite: false, definition: { version: 1, columns: [textColumn("name", "Name", true), { id: "state", name: "State", type: "select", required: false, options: ["Open", "Done"] }, { id: "score", name: "Score", type: "number", required: false, options: [] }] } }, ownerCookie);
    formTableId = table.data.database.id;
    const definition = { version: 1, sections: [{ id: "identity", title: "Identity", description: null, fieldIds: ["name", "state"] }, { id: "details", title: "Details", description: null, fieldIds: ["score"] }], conditions: [{ id: "score_when_open", sourceFieldId: "state", targetFieldId: "score", operator: "equals", value: "Open" }] };
    const form = await request("POST", "/api/forms", { databaseId: formTableId, title: "Weekly check-in", description: "Purpose-bound check-in", fieldIds: ["name", "state", "score"], definition, confirmationText: "Check-in saved.", active: true }, ownerCookie);
    expect(form.status).toBe(201); formId = form.data.form.id;
    expect((await request("POST", `/api/forms/${formId}/submissions`, { values: { name: "Hidden", state: "Done", score: 9 } }, ownerCookie)).status).toBe(400);
    expect((await request("POST", `/api/forms/${formId}/submissions`, { values: { name: "Visible", state: "Open", score: 9 } }, ownerCookie)).status).toBe(201);
  });

  it("allows exactly one anonymous final-slot response without disclosing its token", async () => {
    const grant = await request("POST", `/api/forms/${formId}/access-grants`, { label: "One response", expiresAt: new Date(Date.now() + 86400000).toISOString(), maxSubmissions: 1 }, ownerCookie);
    expect(grant.status).toBe(201); const share = new URL(`https://lyfeos.test${grant.data.shareUrl}`); publicId = share.pathname.split("/").at(-1)!; token = new URLSearchParams(share.hash.slice(1)).get("token")!;
    expect(token).toHaveLength(43); expect(JSON.stringify(grant.data)).not.toContain("tokenHash");
    const publicHeaders = { Authorization: `Bearer ${token}` };
    const projection = await request("GET", `/api/public/forms/${publicId}`, undefined, "", publicHeaders);
    expect(projection.status).toBe(200); expect(projection.data.columns.map((column: any) => column.id)).toEqual(["name", "state", "score"]); expect(projection.data).not.toHaveProperty("database");
    const attempts = await Promise.all([request("POST", `/api/public/forms/${publicId}/submissions`, { values: { name: "First", state: "Done" } }, "", publicHeaders), request("POST", `/api/public/forms/${publicId}/submissions`, { values: { name: "Second", state: "Done" } }, "", publicHeaders)]);
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([201, 404]);
    const grants = await request("GET", `/api/forms/${formId}/access-grants`, undefined, ownerCookie);
    expect(grants.data.grants[0]).toMatchObject({ submissionCount: 1, maxSubmissions: 1 }); expect(JSON.stringify(grants.data)).not.toContain("token_hash"); expect(JSON.stringify(grants.data)).not.toContain("tokenHash");
    const table = await request("GET", `/api/databases/${formTableId}`, undefined, ownerCookie);
    expect(table.data.rows).toHaveLength(2); expect(table.data.rows.filter((row: any) => ["First", "Second"].includes(row.values.name))).toHaveLength(1);
  });

  it("revokes access and erases all governed Form records with the owner account", async () => {
    const grant = await request("POST", `/api/forms/${formId}/access-grants`, { label: "Revocable", expiresAt: new Date(Date.now() + 86400000).toISOString(), maxSubmissions: 2 }, ownerCookie);
    const share = new URL(`https://lyfeos.test${grant.data.shareUrl}`); const revokePublicId = share.pathname.split("/").at(-1)!; const revokeToken = new URLSearchParams(share.hash.slice(1)).get("token")!;
    const list = await request("GET", `/api/forms/${formId}/access-grants`, undefined, ownerCookie); const record = list.data.grants.find((item: any) => item.publicId === revokePublicId);
    expect((await request("POST", `/api/forms/${formId}/access-grants/${record.id}/revoke`, undefined, ownerCookie)).status).toBe(204);
    expect((await request("GET", `/api/public/forms/${revokePublicId}`, undefined, "", { Authorization: `Bearer ${revokeToken}` })).status).toBe(404);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    expect((await request("GET", `/api/public/forms/${publicId}`, undefined, "", { Authorization: `Bearer ${token}` })).status).toBe(404);
  });
});
