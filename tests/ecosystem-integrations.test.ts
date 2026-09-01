import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultEcosystemIntegrationPermissions,
  normalizeEcosystemIntegrationPermissions,
  parseEcosystemIntegrationPermissionPatch,
} from "../shared/ecosystem-integration-permissions";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("ecosystem connected-app grants", () => {
  it("fails closed and inherits the same account defaults as other connected apps", () => {
    expect(defaultEcosystemIntegrationPermissions()).toMatchObject({
      capabilities: { coordination: false, correlation: false },
      approvalPolicy: "changes",
      futureActionPolicy: "disabled",
    });
    expect(normalizeEcosystemIntegrationPermissions({ permissions: { capabilities: { coordination: true, correlation: false } } }, {
      version: 1, defaultApprovalPolicy: "important", futureActionPolicy: "read_only",
    })).toMatchObject({
      capabilities: { coordination: true, correlation: false }, approvalPolicy: "important", futureActionPolicy: "read_only",
    });
    expect(parseEcosystemIntegrationPermissionPatch({ capabilities: { coordination: true, correlation: false }, approvalPolicyOverride: null, futureActionPolicyOverride: null })).not.toBeNull();
    expect(parseEcosystemIntegrationPermissionPatch({ capabilities: { coordination: true }, approvalPolicyOverride: null, futureActionPolicyOverride: null })).toBeNull();
  });

  it("keeps each product as a distinct integration and filters outbound context by that product's grant", () => {
    const service = source("server/cross-product.ts");
    const permissions = source("shared/ecosystem-integration-permissions.ts");
    const routes = source("server/routes/cross-product-sharing.ts");
    expect(permissions).toContain("ecosystem_${service}");
    expect(service).toContain("enabledDestinationsForPurpose");
    expect(service).toContain("coordinationDestinations");
    expect(routes).toContain("/api/ecosystem-integrations/:service/connect");
    expect(routes).toContain("/api/ecosystem-integrations/:service/permissions");
    expect(routes).toContain("/api/ecosystem-integrations/:service/disconnect");
  });
});
