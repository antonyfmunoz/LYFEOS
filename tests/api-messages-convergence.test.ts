import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

type ApiResult = { status: number; data: any; cookie: string };

async function request(method: string, path: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

async function download(path: string, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) } });
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
    checksum: response.headers.get("x-content-sha256"),
    cacheControl: response.headers.get("cache-control"),
  };
}

describeApi("Native Messages authenticated multi-account convergence", () => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
  const password = "TestPass123!";
  const accounts = ["alpha", "bravo", "charlie"].map((name) => ({
    displayName: `msg_${name}_${stamp}`,
    email: `msg_${name}_${stamp}@example.com`,
    password,
    cookie: "",
    id: 0,
  }));
  let directId = "";
  let groupId = "";
  let helloMessageId = "";
  let attachmentMessageId = "";
  let attachmentId = "";
  let attachmentVersion = 0;
  let documentId = 0;

  beforeAll(async () => {
    for (const account of accounts) {
      const registration = await request("POST", "/api/auth/complete-registration", { ...account, termsAccepted: true });
      expect(registration.status).toBe(201);
      account.cookie = registration.cookie;
      account.id = registration.data.user.id;
    }
  });

  afterAll(async () => {
    for (const account of accounts) {
      if (!account.cookie) continue;
      await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie);
    }
  });

  it("fails closed anonymously and discovers only bounded signed-in users", async () => {
    expect((await request("GET", "/api/message-hub/conversations")).status).toBe(401);
    const search = await request("GET", `/api/message-hub/users?q=${encodeURIComponent(accounts[1].displayName.slice(0, -2))}`, undefined, accounts[0].cookie);
    expect(search.status).toBe(200);
    expect(search.data.users).toEqual(expect.arrayContaining([expect.objectContaining({ id: accounts[1].id, displayName: accounts[1].displayName })]));
  });

  it("creates one direct thread and deterministically replays one concurrent send", async () => {
    const created = await request("POST", "/api/message-hub/conversations", { participantUserIds: [accounts[1].id], title: null }, accounts[0].cookie);
    expect(created.status).toBe(201);
    directId = created.data.conversation.id;

    const idempotencyKey = `isolated-${randomUUID()}`;
    const payload = { body: "Hello from the isolated Messages proof", idempotencyKey, replyToMessageId: null, documentIds: [] };
    const sends = await Promise.all([
      request("POST", `/api/message-hub/conversations/${directId}/messages`, payload, accounts[0].cookie),
      request("POST", `/api/message-hub/conversations/${directId}/messages`, payload, accounts[0].cookie),
    ]);
    expect(sends.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(new Set(sends.map((result) => result.data.message.id)).size).toBe(1);
    expect(sends.filter((result) => result.data.replayed)).toHaveLength(1);
    helloMessageId = sends[0].data.message.id;

    const conflict = await request("POST", `/api/message-hub/conversations/${directId}/messages`, { ...payload, body: "Changed retry payload" }, accounts[0].cookie);
    expect(conflict.status).toBe(409);
    const recipientDetail = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[1].cookie);
    expect(recipientDetail.status).toBe(200);
    expect(recipientDetail.data.conversation.messages.filter((message: any) => message.id === helloMessageId)).toHaveLength(1);
  });

  it("proves private notes, read receipts, edit concurrency, and bounded reactions", async () => {
    const note = await request("POST", `/api/message-hub/conversations/${directId}/notes`, { body: "Alpha-only operational note" }, accounts[0].cookie);
    expect(note.status).toBe(201);
    const alphaDetail = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[0].cookie);
    const bravoDetail = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[1].cookie);
    expect(alphaDetail.data.conversation.notes).toHaveLength(1);
    expect(bravoDetail.data.conversation.notes).toHaveLength(0);

    expect((await request("POST", `/api/message-hub/conversations/${directId}/read`, undefined, accounts[1].cookie)).status).toBe(200);
    const initial = alphaDetail.data.conversation.messages.find((message: any) => message.id === helloMessageId);
    const edits = await Promise.all([
      request("PATCH", `/api/message-hub/messages/${helloMessageId}`, { body: "Concurrent edit alpha", expectedVersion: initial.version }, accounts[0].cookie),
      request("PATCH", `/api/message-hub/messages/${helloMessageId}`, { body: "Concurrent edit beta", expectedVersion: initial.version }, accounts[0].cookie),
    ]);
    expect(edits.filter((result) => result.status === 200)).toHaveLength(1);
    expect(edits.filter((result) => result.status === 409)).toHaveLength(1);

    const reacted = await request("POST", `/api/message-hub/messages/${helloMessageId}/reaction`, { reaction: "❤️" }, accounts[1].cookie);
    expect(reacted).toMatchObject({ status: 200, data: { active: true } });
    const withReaction = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[0].cookie);
    expect(withReaction.data.conversation.messages.find((message: any) => message.id === helloMessageId).reactions).toEqual([
      expect.objectContaining({ userId: accounts[1].id, reaction: "❤️" }),
    ]);
    expect((await request("POST", `/api/message-hub/messages/${helloMessageId}/reaction`, { reaction: "❤️" }, accounts[1].cookie)).data.active).toBe(false);
    expect((await request("POST", `/api/message-hub/messages/${helloMessageId}/reaction`, { reaction: "unbounded" }, accounts[1].cookie)).status).toBe(400);
  });

  it("preserves exact attachment bytes across Vault mutation and revokes them on message deletion", async () => {
    const original = "Immutable attachment evidence";
    const createdDocument = await request("POST", "/api/documents", { title: `Evidence ${stamp}`, content: original, format: "markdown", source: "local" }, accounts[0].cookie);
    expect(createdDocument.status).toBe(201);
    expect(createdDocument.data.document.id).toEqual(expect.any(Number));
    documentId = createdDocument.data.document.id;
    expect((await request("GET", `/api/documents/${documentId}`, undefined, accounts[1].cookie)).status).toBe(404);

    const sent = await request("POST", `/api/message-hub/conversations/${directId}/messages`, {
      body: "Explicit attachment share",
      idempotencyKey: `attachment-${randomUUID()}`,
      replyToMessageId: helloMessageId,
      documentIds: [documentId],
    }, accounts[0].cookie);
    expect(sent.status).toBe(201);
    attachmentMessageId = sent.data.message.id;
    const detail = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[1].cookie);
    const attachmentMessage = detail.data.conversation.messages.find((message: any) => message.id === attachmentMessageId);
    attachmentVersion = attachmentMessage.version;
    attachmentId = attachmentMessage.attachments[0].id;

    expect((await request("PATCH", `/api/documents/${documentId}`, { content: "Mutated after sharing" }, accounts[0].cookie)).status).toBe(200);
    const firstDownload = await download(`/api/message-hub/attachments/${attachmentId}/file`, accounts[1].cookie);
    expect(firstDownload).toMatchObject({ status: 200, body: Buffer.from(original), cacheControl: expect.stringContaining("private") });
    expect(firstDownload.checksum).toBe(createHash("sha256").update(original).digest("hex"));

    expect((await request("DELETE", `/api/documents/${documentId}`, undefined, accounts[0].cookie)).status).toBe(200);
    expect((await download(`/api/message-hub/attachments/${attachmentId}/file`, accounts[1].cookie)).body.toString()).toBe(original);
    expect((await download(`/api/message-hub/attachments/${attachmentId}/file`)).status).toBe(401);

    expect((await request("DELETE", `/api/message-hub/messages/${attachmentMessageId}?expectedVersion=${attachmentVersion}`, undefined, accounts[0].cookie)).status).toBe(200);
    expect((await download(`/api/message-hub/attachments/${attachmentId}/file`, accounts[1].cookie)).status).toBe(404);
  });

  it("enforces block consent without erasing prior history", async () => {
    expect((await request("POST", `/api/message-hub/conversations/${directId}/block`, { blocked: true }, accounts[1].cookie)).status).toBe(200);
    const blockedSend = await request("POST", `/api/message-hub/conversations/${directId}/messages`, { body: "Must not deliver", idempotencyKey: `blocked-${randomUUID()}`, replyToMessageId: null, documentIds: [] }, accounts[0].cookie);
    expect(blockedSend.status).toBe(409);
    const priorHistory = await request("GET", `/api/message-hub/conversations/${directId}`, undefined, accounts[1].cookie);
    expect(priorHistory.status).toBe(200);
    expect(priorHistory.data.conversation.messages.some((message: any) => message.id === helloMessageId)).toBe(true);
    expect((await request("POST", `/api/message-hub/conversations/${directId}/block`, { blocked: false }, accounts[1].cookie)).status).toBe(200);
  });

  it("enforces group admin continuity, removal, leave, and reactivation", async () => {
    const created = await request("POST", "/api/message-hub/conversations", { participantUserIds: [accounts[1].id, accounts[2].id], title: `Proof group ${stamp}` }, accounts[0].cookie);
    expect(created.status).toBe(201);
    groupId = created.data.conversation.id;
    expect((await request("POST", `/api/message-hub/conversations/${groupId}/leave`, undefined, accounts[0].cookie)).status).toBe(409);
    expect((await request("POST", `/api/message-hub/conversations/${groupId}/participants/${accounts[2].id}/role`, { role: "admin" }, accounts[0].cookie)).status).toBe(200);
    expect((await request("POST", `/api/message-hub/conversations/${groupId}/leave`, undefined, accounts[0].cookie)).status).toBe(200);
    expect((await request("GET", `/api/message-hub/conversations/${groupId}`, undefined, accounts[0].cookie)).status).toBe(404);

    expect((await request("DELETE", `/api/message-hub/conversations/${groupId}/participants/${accounts[1].id}`, undefined, accounts[2].cookie)).status).toBe(200);
    expect((await request("GET", `/api/message-hub/conversations/${groupId}`, undefined, accounts[1].cookie)).status).toBe(404);
    expect((await request("POST", `/api/message-hub/conversations/${groupId}/participants`, { userIds: [accounts[1].id] }, accounts[2].cookie)).status).toBe(200);
    const restored = await request("GET", `/api/message-hub/conversations/${groupId}`, undefined, accounts[1].cookie);
    expect(restored.status).toBe(200);
    expect(restored.data.conversation.participants.map((participant: any) => participant.id)).toEqual(expect.arrayContaining([accounts[1].id, accounts[2].id]));
  });
});
