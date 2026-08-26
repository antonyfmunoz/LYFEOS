import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("AI execution and signed extension product boundary", () => {
  it("ships the migration through both raw and release paths", () => {
    const migration = source("migrations/0137_ai_execution_and_signed_extensions.sql");
    expect(migration).toContain('"ai_execution_preferences_fallback_valid"');
    expect(migration).toContain('"ai_orchestration_runs_execution_mode_valid"');
    expect(migration).toContain('"extension_packages_digest_valid"');
    expect(migration).toContain('"extension_installations_user_package_unique"');
    expect(migration).toContain('"extension_installations_user_active_slug_unique_idx"');
    expect(source("server/release-migrate.ts")).toContain('id: "0137_ai_execution_and_signed_extensions"');
  });

  it("keeps endpoints private, registry authority fail-closed, and provider credentials server-side", () => {
    const routes = source("server/routes/extensions.ts");
    expect(routes).toContain('app.get("/api/extensions", isAuthenticated');
    expect(routes).toContain('app.post("/api/extensions/installations/:id/revoke", isAuthenticated');
    expect(routes).toContain('hasExtensionRegistryAuthority');
    expect(source("server/extension-registry.ts")).toContain('LYFEOS_EXTENSION_REGISTRY_ADMIN_TOKEN');
    expect(source("server/ai-providers.ts")).not.toContain("req.body");
    expect(source("server/ai-providers.ts")).toContain("LYFEOS_SELF_HOSTED_AI_BASE_URL");
  });

  it("exposes both controls through existing surfaces and covers export and erasure", () => {
    expect(source("client/src/components/ai/AgentWorkspace.tsx")).toContain("Execution and privacy");
    expect(source("client/src/pages/ProfilePage.tsx")).toContain("<ExtensionSettings />");
    const profile = source("server/routes/profile.ts");
    for (const table of ["ai_execution_preferences", "extension_installations", "extension_audit_events"]) expect(profile).toContain(`\"${table}\"`);
  });
});
