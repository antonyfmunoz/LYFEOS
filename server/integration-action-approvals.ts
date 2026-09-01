import { pool } from "./db";
import type {
  GoogleApprovalPolicy,
  GoogleIntegrationCapability,
  GoogleIntegrationRisk,
  GoogleIntegrationService,
} from "@shared/google-integration-permissions";
import { normalizeGoogleIntegrationPermissions, writeGoogleIntegrationPermissions } from "@shared/google-integration-permissions";
import {
  ECOSYSTEM_INTEGRATION_SERVICES,
  normalizeEcosystemIntegrationPermissions,
  writeEcosystemIntegrationPermissions,
  type EcosystemIntegrationCapability,
  type EcosystemIntegrationService,
} from "@shared/ecosystem-integration-permissions";

export type ConnectedAppService = GoogleIntegrationService | EcosystemIntegrationService;
export type ConnectedAppCapability = GoogleIntegrationCapability | EcosystemIntegrationCapability;

export type IntegrationActionDescriptor = {
  key: string;
  title: string;
  summary: string;
  capability: ConnectedAppCapability;
  risk: GoogleIntegrationRisk;
  futureAction: boolean;
};

export type IntegrationApprovalDecision = "allow_once" | "always_allow" | "deny";

export type IntegrationActionReceipt = {
  id: string;
  userId: number;
  integrationId: number | null;
  service: ConnectedAppService;
  actionKey: string;
  capability: ConnectedAppCapability;
  risk: GoogleIntegrationRisk;
  title: string;
  summary: string;
  state: string;
  approvalPolicy: GoogleApprovalPolicy;
  decision: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  httpStatus: number | null;
};

function mapReceipt(row: Record<string, unknown>): IntegrationActionReceipt {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    integrationId: row.integration_id === null ? null : Number(row.integration_id),
    service: row.service as ConnectedAppService,
    actionKey: String(row.action_key),
    capability: row.capability as ConnectedAppCapability,
    risk: row.risk as GoogleIntegrationRisk,
    title: String(row.title),
    summary: String(row.summary),
    state: String(row.state),
    approvalPolicy: row.approval_policy as GoogleApprovalPolicy,
    decision: row.decision === null ? null : String(row.decision),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)) : null,
    createdAt: new Date(String(row.created_at)),
    completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
    httpStatus: row.http_status === null ? null : Number(row.http_status),
  };
}

type ActionReceiptInput = {
  userId: number;
  integrationId: number;
  service: ConnectedAppService;
  descriptor: IntegrationActionDescriptor;
  fingerprint: string;
  approvalPolicy: GoogleApprovalPolicy;
};

export async function createPendingIntegrationApproval(input: ActionReceiptInput): Promise<IntegrationActionReceipt> {
  const existing = await pool.query(
    `SELECT * FROM integration_action_receipts
       WHERE user_id = $1 AND integration_id = $2 AND action_key = $3
         AND request_fingerprint = $4 AND state = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
    [input.userId, input.integrationId, input.descriptor.key, input.fingerprint],
  );
  if (existing.rows[0]) return mapReceipt(existing.rows[0]);

  const result = await pool.query(
    `INSERT INTO integration_action_receipts
      (user_id, integration_id, service, action_key, capability, risk, request_fingerprint,
       title, summary, state, approval_policy, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,NOW() + INTERVAL '10 minutes')
     RETURNING *`,
    [input.userId, input.integrationId, input.service, input.descriptor.key, input.descriptor.capability,
      input.descriptor.risk, input.fingerprint, input.descriptor.title, input.descriptor.summary, input.approvalPolicy],
  );
  return mapReceipt(result.rows[0]);
}

export async function createAuthorizedIntegrationReceipt(input: ActionReceiptInput): Promise<IntegrationActionReceipt> {
  const result = await pool.query(
    `INSERT INTO integration_action_receipts
      (user_id, integration_id, service, action_key, capability, risk, request_fingerprint,
       title, summary, state, approval_policy, decision, decided_at, consumed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'executing',$10,'not_required',NOW(),NOW())
     RETURNING *`,
    [input.userId, input.integrationId, input.service, input.descriptor.key, input.descriptor.capability,
      input.descriptor.risk, input.fingerprint, input.descriptor.title, input.descriptor.summary, input.approvalPolicy],
  );
  return mapReceipt(result.rows[0]);
}

export async function decideIntegrationApproval(input: {
  id: string;
  userId: number;
  decision: IntegrationApprovalDecision;
}): Promise<IntegrationActionReceipt | null> {
  const state = input.decision === "deny" ? "denied" : "approved";
  const result = await pool.query(
    `UPDATE integration_action_receipts
       SET state = $3, decision = $4, decided_at = NOW(),
           completed_at = CASE WHEN $3 = 'denied' THEN NOW() ELSE completed_at END
     WHERE id = $1 AND user_id = $2 AND state = 'pending' AND expires_at > NOW()
     RETURNING *`,
    [input.id, input.userId, state, input.decision],
  );
  return result.rows[0] ? mapReceipt(result.rows[0]) : null;
}

export async function alwaysAllowIntegrationApproval(input: {
  id: string;
  userId: number;
}): Promise<IntegrationActionReceipt | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pending = await client.query(
      `SELECT * FROM integration_action_receipts
        WHERE id = $1 AND user_id = $2 AND state = 'pending' AND expires_at > NOW()
        FOR UPDATE`,
      [input.id, input.userId],
    );
    if (!pending.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const receipt = mapReceipt(pending.rows[0]);
    if (!receipt.integrationId) {
      await client.query("ROLLBACK");
      return null;
    }
    const integrationResult = await client.query(
      `SELECT settings FROM integrations WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [receipt.integrationId, input.userId],
    );
    if (!integrationResult.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const settings = integrationResult.rows[0].settings;
    const updatedSettings = (ECOSYSTEM_INTEGRATION_SERVICES as readonly string[]).includes(receipt.service)
      ? (() => {
          const current = normalizeEcosystemIntegrationPermissions(settings);
          return writeEcosystemIntegrationPermissions(settings, {
            capabilities: current.capabilities,
            approvalPolicyOverride: "never",
            futureActionPolicyOverride: current.futureActionPolicyOverride,
          });
        })()
      : (() => {
          const current = normalizeGoogleIntegrationPermissions(receipt.service as GoogleIntegrationService, settings);
          return writeGoogleIntegrationPermissions(settings, receipt.service as GoogleIntegrationService, {
            capabilities: current.capabilities,
            approvalPolicyOverride: "never",
            futureActionPolicyOverride: current.futureActionPolicyOverride,
          });
        })();
    await client.query(`UPDATE integrations SET settings = $2 WHERE id = $1`, [receipt.integrationId, updatedSettings]);
    const decided = await client.query(
      `UPDATE integration_action_receipts
        SET state = 'approved', decision = 'always_allow', decided_at = NOW()
        WHERE id = $1 RETURNING *`,
      [receipt.id],
    );
    await client.query("COMMIT");
    return mapReceipt(decided.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeIntegrationApproval(input: ActionReceiptInput & { id: string }): Promise<IntegrationActionReceipt | null> {
  const result = await pool.query(
    `UPDATE integration_action_receipts
       SET state = 'executing', consumed_at = NOW()
     WHERE id = $1 AND user_id = $2 AND integration_id = $3 AND service = $4
       AND action_key = $5 AND request_fingerprint = $6 AND state = 'approved'
       AND (expires_at IS NULL OR expires_at > NOW())
     RETURNING *`,
    [input.id, input.userId, input.integrationId, input.service, input.descriptor.key, input.fingerprint],
  );
  return result.rows[0] ? mapReceipt(result.rows[0]) : null;
}

export async function completeIntegrationActionReceipt(id: string, httpStatus: number): Promise<void> {
  await pool.query(
    `UPDATE integration_action_receipts
       SET state = CASE WHEN $2 BETWEEN 200 AND 299 THEN 'succeeded' ELSE 'failed' END,
           http_status = $2, completed_at = NOW()
     WHERE id = $1 AND state = 'executing'`,
    [id, httpStatus],
  );
}

export async function listIntegrationActionReceipts(userId: number, limit = 20): Promise<IntegrationActionReceipt[]> {
  await pool.query(
    `UPDATE integration_action_receipts SET state = 'expired', completed_at = NOW()
      WHERE user_id = $1 AND state IN ('pending','approved') AND expires_at <= NOW()`,
    [userId],
  );
  const result = await pool.query(
    `SELECT * FROM integration_action_receipts WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.max(1, Math.min(limit, 50))],
  );
  return result.rows.map(mapReceipt);
}
