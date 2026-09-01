export const GOOGLE_INTEGRATION_SERVICES = ["calendar", "tasks", "drive"] as const;
export type GoogleIntegrationService = typeof GOOGLE_INTEGRATION_SERVICES[number];

export const GOOGLE_INTEGRATION_CAPABILITIES = ["read", "import", "write"] as const;
export type GoogleIntegrationCapability = typeof GOOGLE_INTEGRATION_CAPABILITIES[number];

export const GOOGLE_APPROVAL_POLICIES = ["always_ask", "changes", "important", "never"] as const;
export type GoogleApprovalPolicy = typeof GOOGLE_APPROVAL_POLICIES[number];

export type GoogleIntegrationPermissions = {
  version: 1;
  capabilities: Record<GoogleIntegrationCapability, boolean>;
  approvalPolicy: GoogleApprovalPolicy;
};

export type GoogleIntegrationPermissionPatch = {
  capabilities: Record<GoogleIntegrationCapability, boolean>;
  approvalPolicy: GoogleApprovalPolicy;
};

const serviceCapabilities: Record<GoogleIntegrationService, readonly GoogleIntegrationCapability[]> = {
  calendar: ["read", "import", "write"],
  tasks: ["read", "import"],
  drive: ["read", "import", "write"],
};

export function googleServiceCapabilities(service: GoogleIntegrationService): readonly GoogleIntegrationCapability[] {
  return serviceCapabilities[service];
}

export function defaultGoogleIntegrationPermissions(service: GoogleIntegrationService): GoogleIntegrationPermissions {
  return {
    version: 1,
    capabilities: {
      read: true,
      import: true,
      write: false,
    },
    approvalPolicy: "changes",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeGoogleIntegrationPermissions(
  service: GoogleIntegrationService,
  settings: unknown,
): GoogleIntegrationPermissions {
  const defaults = defaultGoogleIntegrationPermissions(service);
  const root = asRecord(settings);
  const stored = asRecord(root?.permissions);
  const capabilities = asRecord(stored?.capabilities);
  const allowedCapabilities = new Set(googleServiceCapabilities(service));
  const approvalPolicy = typeof stored?.approvalPolicy === "string"
    && (GOOGLE_APPROVAL_POLICIES as readonly string[]).includes(stored.approvalPolicy)
    ? stored.approvalPolicy as GoogleApprovalPolicy
    : defaults.approvalPolicy;

  return {
    version: 1,
    capabilities: {
      read: allowedCapabilities.has("read") && typeof capabilities?.read === "boolean" ? capabilities.read : defaults.capabilities.read,
      import: allowedCapabilities.has("import") && typeof capabilities?.import === "boolean" ? capabilities.import : defaults.capabilities.import,
      write: allowedCapabilities.has("write") && typeof capabilities?.write === "boolean" ? capabilities.write : false,
    },
    approvalPolicy,
  };
}

export function parseGoogleIntegrationPermissionPatch(
  service: GoogleIntegrationService,
  value: unknown,
): GoogleIntegrationPermissionPatch | null {
  const input = asRecord(value);
  const capabilities = asRecord(input?.capabilities);
  if (!input || !capabilities || typeof input.approvalPolicy !== "string") return null;
  if (!(GOOGLE_APPROVAL_POLICIES as readonly string[]).includes(input.approvalPolicy)) return null;

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
    approvalPolicy: input.approvalPolicy as GoogleApprovalPolicy,
  };
}

export function writeGoogleIntegrationPermissions(
  settings: unknown,
  service: GoogleIntegrationService,
  permissions: GoogleIntegrationPermissionPatch | GoogleIntegrationPermissions,
): Record<string, unknown> {
  const root = asRecord(settings) || {};
  const normalized = normalizeGoogleIntegrationPermissions(service, { permissions });
  return { ...root, permissions: normalized };
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
  capability: GoogleIntegrationCapability,
): boolean {
  if (policy === "never") return false;
  if (policy === "always_ask") return true;
  if (policy === "changes") return capability === "import" || capability === "write";
  return capability === "write";
}

export function googlePermissionPreset(
  service: GoogleIntegrationService,
  preset: "read_only" | "standard" | "full",
  approvalPolicy: GoogleApprovalPolicy = "changes",
): GoogleIntegrationPermissionPatch {
  const allowedCapabilities = new Set(googleServiceCapabilities(service));
  return {
    capabilities: {
      read: allowedCapabilities.has("read"),
      import: allowedCapabilities.has("import") && preset !== "read_only",
      write: allowedCapabilities.has("write") && preset === "full",
    },
    approvalPolicy,
  };
}
