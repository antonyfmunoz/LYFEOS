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

function documentWith(title: string) {
  return { version: 1, nodes: [{ id: "node_main", type: "note", x: 20, y: 20, width: 220, height: 140, title, body: "", color: "cyan", completed: false, url: null }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

describeApi("canvas version and concurrency contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let ownerCookie = "";
  let otherCookie = "";
  let canvasId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
  });

  it("creates isolated accounts and an immutable baseline", async () => {
    expect((await request("GET", "/api/canvases/1/revisions")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `canvas_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `canvas_owner_${stamp}`, termsAccepted: true });
    const other = await request("POST", "/api/auth/complete-registration", { email: `canvas_other_${stamp}@example.com`, password: "TestPass123!", displayName: `canvas_other_${stamp}`, termsAccepted: true });
    expect([owner.status, other.status]).toEqual([201, 201]);
    ownerCookie = owner.cookie; otherCookie = other.cookie;
    const created = await request("POST", "/api/canvases", { title: "Original map", description: "baseline", category: "planning", favorite: false, content: documentWith("Original") }, ownerCookie);
    expect(created.status).toBe(201);
    expect(created.data.canvas).toMatchObject({ title: "Original map", revision: 1 });
    canvasId = created.data.canvas.id;
    const history = await request("GET", `/api/canvases/${canvasId}/revisions`, undefined, ownerCookie);
    expect(history.data.revisions).toEqual([expect.objectContaining({ revisionNumber: 1, action: "created", sourceRevision: null })]);
  });

  it("rejects missing preconditions and serializes competing writers", async () => {
    expect((await request("PATCH", `/api/canvases/${canvasId}`, { title: "Missing" }, ownerCookie)).status).toBe(428);
    const outcomes = await Promise.all([
      request("PATCH", `/api/canvases/${canvasId}`, { title: "Writer alpha", content: documentWith("Alpha") }, ownerCookie, { "x-lyfeos-expected-revision": "1" }),
      request("PATCH", `/api/canvases/${canvasId}`, { title: "Writer beta", content: documentWith("Beta") }, ownerCookie, { "x-lyfeos-expected-revision": "1" }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
    expect(outcomes.find((outcome) => outcome.status === 200)!.data.canvas.revision).toBe(2);
    expect(outcomes.find((outcome) => outcome.status === 409)!.data.currentRevision).toBe(2);
    expect((await request("GET", `/api/canvases/${canvasId}/revisions`, undefined, otherCookie)).status).toBe(404);
  });

  it("restores a snapshot as a new version and rejects a stale restore", async () => {
    const restored = await request("POST", `/api/canvases/${canvasId}/revisions/1/restore`, undefined, ownerCookie, { "x-lyfeos-expected-revision": "2" });
    expect(restored.status).toBe(200);
    expect(restored.data.canvas).toMatchObject({ title: "Original map", description: "baseline", category: "planning", revision: 3 });
    expect(restored.data.canvas.content.nodes[0].title).toBe("Original");
    const history = await request("GET", `/api/canvases/${canvasId}/revisions`, undefined, ownerCookie);
    expect(history.data.revisions.map((revision: any) => ({ revisionNumber: revision.revisionNumber, action: revision.action, sourceRevision: revision.sourceRevision }))).toEqual([
      { revisionNumber: 3, action: "restored", sourceRevision: 1 },
      { revisionNumber: 2, action: "updated", sourceRevision: null },
      { revisionNumber: 1, action: "created", sourceRevision: null },
    ]);
    const stale = await request("POST", `/api/canvases/${canvasId}/revisions/2/restore`, undefined, ownerCookie, { "x-lyfeos-expected-revision": "2" });
    expect(stale.status).toBe(409);
    expect(stale.data.currentRevision).toBe(3);
  });
});
