import { describe, expect, it } from "vitest";
import {
  defaultGoogleAccountPermissionPreferences,
  defaultGoogleIntegrationPermissions,
  googleFutureActionAllowed,
  googleIntegrationApprovalRequired,
  googleIntegrationCapabilityAllowed,
  googlePermissionPreset,
  normalizeGoogleAccountPermissionPreferences,
  normalizeGoogleIntegrationPermissions,
  parseGoogleIntegrationPermissionPatch,
  parseGoogleAccountPermissionPreferences,
  writeGoogleAccountPermissionPreferences,
  writeGoogleIntegrationPermissions,
} from "../shared/google-integration-permissions";

describe("Google integration permissions", () => {
  it("defaults to useful local sync without external write authority", () => {
    for (const service of ["calendar", "tasks", "drive"] as const) {
      expect(defaultGoogleIntegrationPermissions(service)).toEqual({
        version: 2,
        capabilities: { read: true, import: true, write: false },
        approvalPolicy: "changes",
        approvalPolicyOverride: null,
        futureActionPolicy: "disabled",
        futureActionPolicyOverride: null,
      });
    }
  });

  it("keeps provider capabilities service-specific", () => {
    expect(googlePermissionPreset("calendar", "full").capabilities).toEqual({ read: true, import: true, write: true });
    expect(googlePermissionPreset("drive", "read_only").capabilities).toEqual({ read: true, import: false, write: false });
    expect(googlePermissionPreset("tasks", "full").capabilities).toEqual({ read: true, import: true, write: false });
    expect(parseGoogleIntegrationPermissionPatch("tasks", {
      capabilities: { read: true, import: true, write: true },
      approvalPolicyOverride: "changes",
      futureActionPolicyOverride: null,
    })).toBeNull();
    expect(parseGoogleIntegrationPermissionPatch("drive", {
      capabilities: { read: true, import: true, write: false },
      approvalPolicy: "changes",
    })).toMatchObject({ approvalPolicyOverride: "changes", futureActionPolicyOverride: null });
  });

  it("preserves unrelated integration settings while normalizing permission values", () => {
    const settings = writeGoogleIntegrationPermissions(
      { syncToken: "opaque", other: { retained: true } },
      "calendar",
      { capabilities: { read: true, import: false, write: true }, approvalPolicyOverride: "important", futureActionPolicyOverride: "disabled" },
    );
    expect(settings).toMatchObject({ syncToken: "opaque", other: { retained: true } });
    expect(normalizeGoogleIntegrationPermissions("calendar", settings)).toEqual({
      version: 2,
      capabilities: { read: true, import: false, write: true },
      approvalPolicy: "important",
      approvalPolicyOverride: "important",
      futureActionPolicy: "disabled",
      futureActionPolicyOverride: "disabled",
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
    expect(googleIntegrationApprovalRequired("never", "high")).toBe(true);
  });

  it("supports account defaults, app inheritance, and fail-closed future actions", () => {
    const preferences = { version: 1 as const, defaultApprovalPolicy: "changes" as const, futureActionPolicy: "disabled" as const };
    const stored = writeGoogleAccountPermissionPreferences({ retained: true }, preferences);
    expect(normalizeGoogleAccountPermissionPreferences(stored)).toEqual(preferences);
    expect(stored).toMatchObject({ retained: true });
    expect(defaultGoogleAccountPermissionPreferences()).toEqual({ version: 1, defaultApprovalPolicy: "changes", futureActionPolicy: "disabled" });
    expect(parseGoogleAccountPermissionPreferences(preferences)).toEqual(preferences);
    expect(parseGoogleAccountPermissionPreferences({ defaultApprovalPolicy: "root", futureActionPolicy: "allow_all" })).toBeNull();
    expect(normalizeGoogleIntegrationPermissions("drive", {}, preferences)).toMatchObject({ approvalPolicy: "changes", futureActionPolicy: "disabled" });
    expect(googleFutureActionAllowed("disabled", "read")).toBe(false);
    expect(googleFutureActionAllowed("read_only", "read")).toBe(true);
    expect(googleFutureActionAllowed("read_only", "import")).toBe(false);
    expect(googleFutureActionAllowed("allow_all", "write")).toBe(true);
  });
});
