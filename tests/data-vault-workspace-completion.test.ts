import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Data Vault workspace completion", () => {
  it("keeps Slides as a real persisted presentation domain rather than Canvas", () => {
    const schema = read("shared/schema.ts"); const routes = read("server/routes/data-vault.ts"); const editor = read("client/src/pages/SlideEditorPage.tsx");
    expect(schema).toContain('pgTable("slides"'); expect(schema).toContain('pgTable("slide_revisions"');
    expect(routes).toContain('app.post("/api/slides"'); expect(routes).toContain("slideRevisions");
    expect(editor).toContain("Speaker notes"); expect(editor).toContain("Add slide"); expect(editor).not.toContain("CanvasEditorPage");
  });

  it("stores catalog Forms and their responses outside the legacy table-bound form domain", () => {
    const schema = read("shared/schema.ts"); const routes = read("server/routes/data-vault.ts"); const catalog = read("client/src/pages/FormsCatalogPage.tsx");
    expect(schema).toContain('pgTable("vault_forms"'); expect(schema).toContain('pgTable("vault_form_responses"');
    expect(routes).toContain('app.post("/api/vault-forms/:id/responses"'); expect(routes).toContain("backingDatabaseId");
    expect(catalog).toContain("Forms catalog");
  });

  it("provides one overlay for workspace recency, favorites, and trash", () => {
    const schema = read("shared/schema.ts"); const routes = read("server/routes/data-vault.ts"); const page = read("client/src/pages/VaultWorkspacePage.tsx"); const navigation = read("client/src/components/data-vault/DataVaultSuiteNavigation.tsx");
    expect(schema).toContain('pgTable("vault_item_states"'); expect(routes).toContain('app.get("/api/vault/items"'); expect(routes).toContain('"favorite", "trash", "restore", "open", "delete"');
    expect(page).toContain("Workspace status"); expect(page).toContain("favorites"); expect(page).toContain("trash"); expect(navigation).toContain('href: "/data-vault"');
  });

  it("ships the matching raw and release migration", () => {
    expect(read("migrations/0163_data_vault_workspace_completion.sql")).toContain('CREATE TABLE IF NOT EXISTS "vault_item_states"');
    expect(read("server/release-migrate.ts")).toContain('id: "0163_data_vault_workspace_completion"');
  });
});
