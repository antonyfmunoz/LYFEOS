import {
  defaultGoogleAccountPermissionPreferences,
  type GoogleAccountPermissionPreferences,
  type GoogleApprovalPolicy,
  type GoogleFutureActionPolicy,
} from "./google-integration-permissions";

/**
 * Ecosystem products use the same permission vocabulary as every other
 * connected app. The product itself owns its data; UMH only carries a
 * purpose-limited projection after the owner has enabled a capability here.
 */
export const ECOSYSTEM_INTEGRATION_SERVICES = ["entrepreneuros", "creativesos"] as const;
export type EcosystemIntegrationService = typeof ECOSYSTEM_INTEGRATION_SERVICES[number];

export const ECOSYSTEM_INTEGRATION_CAPABILITIES = ["coordination", "correlation"] as const;
export type EcosystemIntegrationCapability = typeof ECOSYSTEM_INTEGRATION_CAPABILITIES[number];

export type EcosystemIntegrationPermissions = {
  version: 1;
  capabilities: Record<EcosystemIntegrationCapability, boolean>;
  approvalPolicy: GoogleApprovalPolicy;
  approvalPolicyOverride: GoogleApprovalPolicy | null;
  futureActionPolicy: GoogleFutureActionPolicy;
  futureActionPolicyOverride: GoogleFutureActionPolicy | null;
};

export type EcosystemIntegrationPermissionPatch = Pick<
  EcosystemIntegrationPermissions,
  "capabilities" | "approvalPolicyOverride" | "futureActionPolicyOverride"
>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const isApprovalPolicy = (value: unknown): value is GoogleApprovalPolicy =>
  typeof value === "string" && ["always_ask", "changes", "important", "never"].includes(value);

const isFutureActionPolicy = (value: unknown): value is GoogleFutureActionPolicy =>
  typeof value === "string" && ["disabled", "read_only", "allow_all"].includes(value);

export function ecosystemIntegrationProvider(service: EcosystemIntegrationService): string {
  return `ecosystem_${service}`;
}

export function defaultEcosystemIntegrationPermissions(
  accountPreferences: GoogleAccountPermissionPreferences = defaultGoogleAccountPermissionPreferences(),
): EcosystemIntegrationPermissions {
  return {
    version: 1,
    capabilities: { coordination: false, correlation: false },
    approvalPolicy: accountPreferences.defaultApprovalPolicy,
    approvalPolicyOverride: null,
    futureActionPolicy: accountPreferences.futureActionPolicy,
    futureActionPolicyOverride: null,
  };
}

export function normalizeEcosystemIntegrationPermissions(
  settings: unknown,
  accountPreferences: GoogleAccountPermissionPreferences = defaultGoogleAccountPermissionPreferences(),
): EcosystemIntegrationPermissions {
  const defaults = defaultEcosystemIntegrationPermissions(accountPreferences);
  const root = asRecord(settings);
  const stored = asRecord(root?.permissions);
  const capabilities = asRecord(stored?.capabilities);
  const approvalPolicyOverride = stored?.approvalPolicyOverride === null
    ? null
    : isApprovalPolicy(stored?.approvalPolicyOverride) ? stored.approvalPolicyOverride : null;
  const futureActionPolicyOverride = stored?.futureActionPolicyOverride === null
    ? null
    : isFutureActionPolicy(stored?.futureActionPolicyOverride) ? stored.futureActionPolicyOverride : null;
  return {
    version: 1,
    capabilities: {
      coordination: typeof capabilities?.coordination === "boolean" ? capabilities.coordination : false,
      correlation: typeof capabilities?.correlation === "boolean" ? capabilities.correlation : false,
    },
    approvalPolicy: approvalPolicyOverride ?? defaults.approvalPolicy,
    approvalPolicyOverride,
    futureActionPolicy: futureActionPolicyOverride ?? defaults.futureActionPolicy,
    futureActionPolicyOverride,
  };
}

export function parseEcosystemIntegrationPermissionPatch(value: unknown): EcosystemIntegrationPermissionPatch | null {
  const input = asRecord(value);
  const capabilities = asRecord(input?.capabilities);
  if (!input || !capabilities || typeof capabilities.coordination !== "boolean" || typeof capabilities.correlation !== "boolean") return null;
  const approvalPolicyOverride = input.approvalPolicyOverride === null ? null
    : isApprovalPolicy(input.approvalPolicyOverride) ? input.approvalPolicyOverride : undefined;
  const futureActionPolicyOverride = input.futureActionPolicyOverride === null ? null
    : isFutureActionPolicy(input.futureActionPolicyOverride) ? input.futureActionPolicyOverride : undefined;
  if (approvalPolicyOverride === undefined || futureActionPolicyOverride === undefined) return null;
  return { capabilities: { coordination: capabilities.coordination, correlation: capabilities.correlation }, approvalPolicyOverride, futureActionPolicyOverride };
}

export function writeEcosystemIntegrationPermissions(
  settings: unknown,
  permissions: EcosystemIntegrationPermissionPatch | EcosystemIntegrationPermissions,
): Record<string, unknown> {
  return {
    ...(asRecord(settings) || {}),
    permissions: {
      version: 1,
      capabilities: permissions.capabilities,
      approvalPolicyOverride: permissions.approvalPolicyOverride,
      futureActionPolicyOverride: permissions.futureActionPolicyOverride,
    },
  };
}
