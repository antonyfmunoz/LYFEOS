import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

describeDb("database-backed integration action governance", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const stamp = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  let userId = 0;
  let otherUserId = 0;
  let integrationId = 0;
  let actions: typeof import("../server/integration-action-approvals");

  beforeAll(async () => {
    const database = await pool.query<{ current_database: string }>("SELECT current_database()");
    expect(database.rows[0].current_database).toMatch(/ci|test/i);
    actions = await import("../server/integration-action-approvals");
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, display_name, terms_accepted, email_verified)
       VALUES ($1,$2,true,true),($3,$4,true,true) RETURNING id`,
      [`approval_${stamp}@example.com`, `approval_${stamp}`, `approval_other_${stamp}@example.com`, `approval_other_${stamp}`],
    );
    [userId, otherUserId] = users.rows.map((row) => row.id);
    const integration = await pool.query<{ id: number }>(
      `INSERT INTO integrations (user_id, provider, provider_name, status, settings)
       VALUES ($1,'google_drive','Google Drive','active',$2::jsonb) RETURNING id`,
      [userId, JSON.stringify({ permissions: { version: 2, capabilities: { read: true, import: true, write: true }, approvalPolicyOverride: "changes", futureActionPolicyOverride: null } })],
    );
    integrationId = integration.rows[0].id;
  });

  afterAll(async () => {
    if (userId || otherUserId) await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [[userId, otherUserId].filter(Boolean)]);
    await pool.end();
  });

  it("binds allow-once to one exact request and records its terminal outcome", async () => {
    const descriptor = { key: "google.drive.push", title: "Change Google Drive", summary: "Update one document.", capability: "write", risk: "important", futureAction: false } as const;
    const base = { userId, integrationId, service: "drive" as const, descriptor, fingerprint: "a".repeat(64), approvalPolicy: "changes" as const };
    const pending = await actions.createPendingIntegrationApproval(base);
    expect(await actions.decideIntegrationApproval({ id: pending.id, userId: otherUserId, decision: "allow_once" })).toBeNull();
    expect((await actions.decideIntegrationApproval({ id: pending.id, userId, decision: "allow_once" }))?.state).toBe("approved");
    expect(await actions.consumeIntegrationApproval({ ...base, fingerprint: "b".repeat(64), id: pending.id })).toBeNull();
    expect((await actions.consumeIntegrationApproval({ ...base, id: pending.id }))?.state).toBe("executing");
    expect(await actions.consumeIntegrationApproval({ ...base, id: pending.id })).toBeNull();
    await actions.completeIntegrationActionReceipt(pending.id, 204);
    expect((await actions.listIntegrationActionReceipts(userId, 10)).find((receipt) => receipt.id === pending.id)).toMatchObject({ state: "succeeded", httpStatus: 204 });
  });

  it("atomically applies an app-only Always allow override and supports denial", async () => {
    const descriptor = { key: "google.drive.sync", title: "Sync Google Drive", summary: "Import supported files.", capability: "import", risk: "medium", futureAction: false } as const;
    const input = { userId, integrationId, service: "drive" as const, descriptor, fingerprint: "c".repeat(64), approvalPolicy: "changes" as const };
    const pending = await actions.createPendingIntegrationApproval(input);
    expect((await actions.alwaysAllowIntegrationApproval({ id: pending.id, userId }))?.decision).toBe("always_allow");
    const integration = await pool.query(`SELECT settings FROM integrations WHERE id = $1`, [integrationId]);
    expect(integration.rows[0].settings.permissions).toMatchObject({ approvalPolicyOverride: "never", capabilities: { read: true, import: true, write: true } });

    const denied = await actions.createPendingIntegrationApproval({ ...input, fingerprint: "d".repeat(64) });
    expect((await actions.decideIntegrationApproval({ id: denied.id, userId, decision: "deny" }))?.state).toBe("denied");
    expect(await actions.consumeIntegrationApproval({ ...input, fingerprint: "d".repeat(64), id: denied.id })).toBeNull();
  });
});
