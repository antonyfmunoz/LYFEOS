import { describe, expect, it } from "vitest";
import { LYFEOS_DATA_CLASSES, LYFEOS_DATA_RIGHTS, LYFEOS_DATA_RIGHTS_VERSION } from "../shared/data-rights";
import fs from "node:fs";

const source = (path: string) => fs.readFileSync(path, "utf8");

describe("LyfeOS data-rights contract", () => {
  it("classifies every current product domain with explicit purpose, access, retention, and rights", () => {
    expect(LYFEOS_DATA_RIGHTS.version).toBe(LYFEOS_DATA_RIGHTS_VERSION);
    expect(LYFEOS_DATA_RIGHTS.legalStatus).toBe("product_contract_not_approved_legal_policy");
    expect(LYFEOS_DATA_CLASSES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(LYFEOS_DATA_CLASSES.map((entry) => entry.id)).size).toBe(LYFEOS_DATA_CLASSES.length);
    for (const entry of LYFEOS_DATA_CLASSES) {
      expect(entry.purpose.length).toBeGreaterThan(20);
      expect(entry.examples.length).toBeGreaterThan(0);
      expect(entry.retentionDetail.length).toBeGreaterThan(20);
      expect(entry.rightsDetail.length).toBeGreaterThan(20);
    }
  });

  it("keeps local, shared, operational, and provider-held rights boundaries explicit", () => {
    expect(LYFEOS_DATA_CLASSES.find((entry) => entry.id === "health_fitness")).toMatchObject({ access: "owner_private", rights: { export: true, erase: true, revoke: true } });
    expect(LYFEOS_DATA_CLASSES.find((entry) => entry.id === "relationships_messages")).toMatchObject({ access: "purpose_bound_participants", retention: "shared_record_lifecycle" });
    expect(LYFEOS_DATA_CLASSES.find((entry) => entry.id === "security_operations")).toMatchObject({ access: "restricted_operations", rights: { export: false, erase: false, revoke: false } });
    expect(LYFEOS_DATA_CLASSES.find((entry) => entry.id === "external_providers")).toMatchObject({ access: "provider_managed", retention: "provider_policy", rights: { export: false, erase: false, revoke: true } });
  });

  it("exposes the contract privately, embeds it in export, and preserves the existing account-erasure path", () => {
    const profileRoutes = source("server/routes/profile.ts");
    const authRoutes = source("server/routes/auth.ts");
    const sessionConfig = source("server/session-config.ts");
    const profilePage = source("client/src/pages/ProfilePage.tsx");
    expect(profileRoutes).toContain('app.get("/api/account/data-rights", isAuthenticated');
    expect(profileRoutes).toContain("dataRights: LYFEOS_DATA_RIGHTS");
    expect(profileRoutes).toContain('app.delete("/api/account", isAuthenticated');
    expect(profileRoutes).toContain("await deleteLocalAccountData(userId)");
    expect(profileRoutes).toContain("await new Promise<void>");
    expect(sessionConfig).toContain('SESSION_COOKIE_NAME = "lyfeos.sid"');
    expect(profileRoutes).toContain("res.clearCookie(SESSION_COOKIE_NAME");
    expect(authRoutes).toContain("res.clearCookie(SESSION_COOKIE_NAME");
    expect(authRoutes).not.toContain('clearCookie("connect.sid"');
    expect(profilePage).toContain('queryKey: ["/api/account/data-rights"]');
    expect(profilePage).toContain("What LyfeOS stores and why");
  });
});
