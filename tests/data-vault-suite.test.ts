import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Data Vault suite navigation", () => {
  it("keeps the existing private workspaces discoverable through one shared suite shell", () => {
    const navigation = source("client/src/components/data-vault/DataVaultSuiteNavigation.tsx");
    for (const label of ["Vault", "Files & Docs", "Sheets", "Canvas", "Slides", "Forms", "Tables"]) {
      expect(navigation).toContain(`label: "${label}"`);
    }
    for (const href of ["/data-vault", "/document-vault", "/spreadsheets", "/canvases", "/slides", "/forms", "/databases"]) {
      expect(navigation).toContain(`href: "${href}"`);
    }
    expect(navigation).toContain('ArrowLeft className="h-4 w-4"');
    expect(navigation).toContain('href="/chronilog" className="inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/20');
  });

  it("keeps Automations and Personal Finance as Chronilog workspaces, not Vault launchers", () => {
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    const chronilog = source("client/src/pages/ChronilogPage.tsx");
    expect(vault).not.toContain("navigate('/automations')");
    expect(chronilog).toContain('id: "automations"');
    expect(chronilog).toContain("navigate('/automations')");
    expect(chronilog).toContain('id: "personal-finance"');
    expect(chronilog).toContain("navigate('/finance')");
  });
});
