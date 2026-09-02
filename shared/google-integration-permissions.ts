export const GOOGLE_INTEGRATION_SERVICES = ["calendar", "tasks", "drive"] as const;
export type GoogleIntegrationService = typeof GOOGLE_INTEGRATION_SERVICES[number];

export const GOOGLE_INTEGRATION_CAPABILITIES = ["read", "import", "write"] as const;
export type GoogleIntegrationCapability = typeof GOOGLE_INTEGRATION_CAPABILITIES[number];

export const GOOGLE_APPROVAL_POLICIES = ["always_ask", "changes", "important", "never"] as const;
export type GoogleApprovalPolicy = typeof GOOGLE_APPROVAL_POLICIES[number];

export const GOOGLE_FUTURE_ACTION_POLICIES = ["disabled", "read_only", "allow_all"] as const;
export type GoogleFutureActionPolicy = typeof GOOGLE_FUTURE_ACTION_POLICIES[number];

export const GOOGLE_INTEGRATION_RISKS = ["low", "medium", "important", "high"] as const;
export type GoogleIntegrationRisk = typeof GOOGLE_INTEGRATION_RISKS[number];

export type GoogleAccountPermissionPreferences = {
  version: 1;
  defaultApprovalPolicy: GoogleApprovalPolicy;
  futureActionPolicy: GoogleFutureActionPolicy;
};

export type GoogleIntegrationPermissions = {
  version: 2;
  capabilities: Record<GoogleIntegrationCapability, boolean>;
  approvalPolicy: GoogleApprovalPolicy;
  approvalPolicyOverride: GoogleApprovalPolicy | null;
  futureActionPolicy: GoogleFutureActionPolicy;
  futureActionPolicyOverride: GoogleFutureActionPolicy | null;
};

export type GoogleIntegrationPermissionPatch = {
  capabilities: Record<GoogleIntegrationCapability, boolean>;
  approvalPolicyOverride: GoogleApprovalPolicy | null;
  futureActionPolicyOverride: GoogleFutureActionPolicy | null;
};

const serviceCapabilities: Record<GoogleIntegrationService, readonly GoogleIntegrationCapability[]> = {
  calendar: ["read", "import", "write"],
  tasks: ["read", "import", "write"],
  drive: ["read", "import", "write"],
};

export function googleServiceCapabilities(service: GoogleIntegrationService): readonly GoogleIntegrationCapability[] {
  return serviceCapabilities[service];
}

export function defaultGoogleAccountPermissionPreferences(): GoogleAccountPermissionPreferences {
  return { version: 1, defaultApprovalPolicy: "changes", futureActionPolicy: "disabled" };
}

export function defaultGoogleIntegrationPermissions(
  service: GoogleIntegrationService,
  accountPreferences = defaultGoogleAccountPermissionPreferences(),
): GoogleIntegrationPermissions {
  return {
    version: 2,
    capabilities: { read: true, import: true, write: false },
    approvalPolicy: accountPreferences.defaultApprovalPolicy,
    approvalPolicyOverride: null,
    futureActionPolicy: accountPreferences.futureActionPolicy,
    futureActionPolicyOverride: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isApprovalPolicy(value: unknown): value is GoogleApprovalPolicy {
  return typeof value === "string" && (GOOGLE_APPROVAL_POLICIES as readonly string[]).includes(value);
}

function isFutureActionPolicy(value: unknown): value is GoogleFutureActionPolicy {
  return typeof value === "string" && (GOOGLE_FUTURE_ACTION_POLICIES as readonly string[]).includes(value);
}

export function normalizeGoogleAccountPermissionPreferences(value: unknown): GoogleAccountPermissionPreferences {
  const defaults = defaultGoogleAccountPermissionPreferences();
  const root = asRecord(value);
  const stored = asRecord(root?.googlePermissionPreferences);
  return {
    version: 1,
    defaultApprovalPolicy: isApprovalPolicy(stored?.defaultApprovalPolicy) ? stored.defaultApprovalPolicy : defaults.defaultApprovalPolicy,
    futureActionPolicy: isFutureActionPolicy(stored?.futureActionPolicy) ? stored.futureActionPolicy : defaults.futureActionPolicy,
  };
}

export function parseGoogleAccountPermissionPreferences(value: unknown): GoogleAccountPermissionPreferences | null {
  const input = asRecord(value);
  if (!input || !isApprovalPolicy(input.defaultApprovalPolicy) || !isFutureActionPolicy(input.futureActionPolicy)) return null;
  return { version: 1, defaultApprovalPolicy: input.defaultApprovalPolicy, futureActionPolicy: input.futureActionPolicy };
}

export function writeGoogleAccountPermissionPreferences(
  otherIntegrations: unknown,
  preferences: GoogleAccountPermissionPreferences,
): Record<string, unknown> {
  return { ...(asRecord(otherIntegrations) || {}), googlePermissionPreferences: preferences };
}

export function normalizeGoogleIntegrationPermissions(
  service: GoogleIntegrationService,
  settings: unknown,
  accountPreferences = defaultGoogleAccountPermissionPreferences(),
): GoogleIntegrationPermissions {
  const defaults = defaultGoogleIntegrationPermissions(service, accountPreferences);
  const root = asRecord(settings);
  const stored = asRecord(root?.permissions);
  const capabilities = asRecord(stored?.capabilities);
  const allowedCapabilities = new Set(googleServiceCapabilities(service));
  // Version-one records stored approvalPolicy directly. Preserve it as an app
  // override so an account-default rollout never silently broadens authority.
  const approvalPolicyOverride = stored?.approvalPolicyOverride === null
    ? null
    : isApprovalPolicy(stored?.approvalPolicyOverride)
      ? stored.approvalPolicyOverride
      : isApprovalPolicy(stored?.approvalPolicy)
        ? stored.approvalPolicy
        : null;
  const futureActionPolicyOverride = stored?.futureActionPolicyOverride === null
    ? null
    : isFutureActionPolicy(stored?.futureActionPolicyOverride)
      ? stored.futureActionPolicyOverride
      : null;

  return {
    version: 2,
    capabilities: {
      read: allowedCapabilities.has("read") && typeof capabilities?.read === "boolean" ? capabilities.read : defaults.capabilities.read,
      import: allowedCapabilities.has("import") && typeof capabilities?.import === "boolean" ? capabilities.import : defaults.capabilities.import,
      write: allowedCapabilities.has("write") && typeof capabilities?.write === "boolean" ? capabilities.write : false,
    },
    approvalPolicy: approvalPolicyOverride ?? accountPreferences.defaultApprovalPolicy,
    approvalPolicyOverride,
    futureActionPolicy: futureActionPolicyOverride ?? accountPreferences.futureActionPolicy,
    futureActionPolicyOverride,
  };
}

export function parseGoogleIntegrationPermissionPatch(
  service: GoogleIntegrationService,
  value: unknown,
): GoogleIntegrationPermissionPatch | null {
  const input = asRecord(value);
  const capabilities = asRecord(input?.capabilities);
  if (!input || !capabilities) return null;
  const approvalPolicyOverride = input.approvalPolicyOverride === null
    ? null
    : isApprovalPolicy(input.approvalPolicyOverride)
      ? input.approvalPolicyOverride
      : isApprovalPolicy(input.approvalPolicy)
        ? input.approvalPolicy
        : undefined;
  const futureActionPolicyOverride = input.futureActionPolicyOverride === undefined || input.futureActionPolicyOverride === null
    ? null
    : isFutureActionPolicy(input.futureActionPolicyOverride)
      ? input.futureActionPolicyOverride
      : undefined;
  if (approvalPolicyOverride === undefined || futureActionPolicyOverride === undefined) return null;

  const allowedCapabilities = new Set(googleServiceCapabilities(service));
  for (const capability of GOOGLE_INTEGRATION_CAPABILITIES) {
    if (allowedCapabilities.has(capability) && typeof capabilities[capability] !== "boolean") return null;
    if (!allowedCapabilities.has(capability) && capabilities[capability] === true) return null;
  }

  return {
    capabilities: {
      read: allowedCapabilities.has("read") ? capabilities.read as boolean : false,
      import: allowedCapabilities.has("import") ? capabilities.import as boolean : false,
      write: allowedCapabilities.has("write") ? capabilities.write as boolean : false,
    },
    approvalPolicyOverride,
    futureActionPolicyOverride,
  };
}

export function writeGoogleIntegrationPermissions(
  settings: unknown,
  service: GoogleIntegrationService,
  permissions: GoogleIntegrationPermissionPatch | GoogleIntegrationPermissions,
): Record<string, unknown> {
  const root = asRecord(settings) || {};
  return {
    ...root,
    permissions: {
      version: 2,
      capabilities: permissions.capabilities,
      approvalPolicyOverride: permissions.approvalPolicyOverride,
      futureActionPolicyOverride: permissions.futureActionPolicyOverride,
    },
  };
}

export function googleIntegrationCapabilityAllowed(
  service: GoogleIntegrationService,
  settings: unknown,
  capability: GoogleIntegrationCapability,
): boolean {
  return googleServiceCapabilities(service).includes(capability)
    && normalizeGoogleIntegrationPermissions(service, settings).capabilities[capability];
}

export function googleIntegrationApprovalRequired(
  policy: GoogleApprovalPolicy,
  riskOrCapability: GoogleIntegrationRisk | GoogleIntegrationCapability,
): boolean {
  const risk: GoogleIntegrationRisk = riskOrCapability === "read" ? "low"
    : riskOrCapability === "import" ? "medium"
      : riskOrCapability === "write" ? "important"
        : riskOrCapability;
  if (risk === "high") return true;
  if (policy === "never") return false;
  if (policy === "always_ask") return true;
  if (policy === "changes") return risk !== "low";
  return risk === "important";
}

export function googleFutureActionAllowed(
  policy: GoogleFutureActionPolicy,
  capability: GoogleIntegrationCapability,
): boolean {
  if (policy === "disabled") return false;
  if (policy === "read_only") return capability === "read";
  return true;
}

export function googlePermissionPreset(
  service: GoogleIntegrationService,
  preset: "read_only" | "standard" | "full",
  approvalPolicyOverride: GoogleApprovalPolicy | null = null,
  futureActionPolicyOverride: GoogleFutureActionPolicy | null = null,
): GoogleIntegrationPermissionPatch {
  const allowedCapabilities = new Set(googleServiceCapabilities(service));
  return {
    capabilities: {
      read: allowedCapabilities.has("read"),
      import: allowedCapabilities.has("import") && preset !== "read_only",
      write: allowedCapabilities.has("write") && preset === "full",
    },
    approvalPolicyOverride,
    futureActionPolicyOverride,
  };
}
