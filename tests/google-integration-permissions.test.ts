import { describe, expect, it } from "vitest";
import {
  defaultGoogleIntegrationPermissions,
  googleIntegrationApprovalRequired,
  googleIntegrationCapabilityAllowed,
  googlePermissionPreset,
  normalizeGoogleIntegrationPermissions,
  parseGoogleIntegrationPermissionPatch,
  writeGoogleIntegrationPermissions,
} from "../shared/google-integration-permissions";

describe("Google integration permissions", () => {
  it("defaults to useful local sync without external write authority", () => {
    for (const service of ["calendar", "tasks", "drive"] as const) {
      expect(defaultGoogleIntegrationPermissions(service)).toEqual({
        version: 1,
        capabilities: { read: true, import: true, write: false },
        approvalPolicy: "changes",
      });
    }
  });

  it("keeps provider capabilities service-specific", () => {
    expect(googlePermissionPreset("calendar", "full").capabilities).toEqual({ read: true, import: true, write: true });
    expect(googlePermissionPreset("drive", "read_only").capabilities).toEqual({ read: true, import: false, write: false });
    expect(googlePermissionPreset("tasks", "full").capabilities).toEqual({ read: true, import: true, write: false });
    expect(parseGoogleIntegrationPermissionPatch("tasks", {
      capabilities: { read: true, import: true, write: true },
      approvalPolicy: "changes",
    })).toBeNull();
  });

  it("preserves unrelated integration settings while normalizing permission values", () => {
    const settings = writeGoogleIntegrationPermissions(
      { syncToken: "opaque", other: { retained: true } },
      "calendar",
      { capabilities: { read: true, import: false, write: true }, approvalPolicy: "important" },
    );
    expect(settings).toMatchObject({ syncToken: "opaque", other: { retained: true } });
    expect(normalizeGoogleIntegrationPermissions("calendar", settings)).toEqual({
      version: 1,
      capabilities: { read: true, import: false, write: true },
      approvalPolicy: "important",
    });
    expect(googleIntegrationCapabilityAllowed("calendar", settings, "import")).toBe(false);
  });

  it("fails closed on malformed updates and distinguishes approval levels", () => {
    expect(parseGoogleIntegrationPermissionPatch("drive", { capabilities: { read: true }, approvalPolicy: "root" })).toBeNull();
    expect(googleIntegrationApprovalRequired("always_ask", "read")).toBe(true);
    expect(googleIntegrationApprovalRequired("changes", "read")).toBe(false);
    expect(googleIntegrationApprovalRequired("changes", "import")).toBe(true);
    expect(googleIntegrationApprovalRequired("important", "import")).toBe(false);
    expect(googleIntegrationApprovalRequired("important", "write")).toBe(true);
    expect(googleIntegrationApprovalRequired("never", "write")).toBe(false);
  });
});
