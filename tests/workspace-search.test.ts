import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { escapePostgresLike, plainTextExcerpt, workspaceSearchQuerySchema } from "../shared/search";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("private workspace search", () => {
  it("bounds and normalizes search inputs", () => {
    expect(workspaceSearchQuerySchema.parse({ q: "  focus  " })).toEqual({ q: "focus", limit: 10 });
    expect(workspaceSearchQuerySchema.safeParse({ q: "x" }).success).toBe(false);
    expect(workspaceSearchQuerySchema.safeParse({ q: "valid", limit: 26 }).success).toBe(false);
  });

  it("escapes LIKE wildcard characters so user text is searched literally", () => {
    expect(escapePostgresLike("50%_done\\now")).toBe("50\\%\\_done\\\\now");
  });

  it("returns bounded plain-text excerpts rather than markup fragments", () => {
    const excerpt = plainTextExcerpt("# Heading\nA **private** mission with [proof](https://example.com) and more context.", "mission", 45);
    expect(excerpt.length).toBeLessThanOrEqual(47);
    expect(excerpt).not.toContain("**");
    expect(excerpt).toContain("mission");
  });

  it("scopes every searched source to the authenticated user and omits contact secrets", () => {
    const route = source("server/routes/search.ts");
    for (const table of ["quests", "documents", "spreadsheets", "canvases", "workspaceDatabases", "contacts"]) {
      expect(route).toContain(`eq(${table}.userId, userId)`);
    }
    expect(route).not.toContain("contacts.email");
    expect(route).not.toContain("contacts.phone");
    expect(route).not.toContain("contacts.notes");
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
  });

  it("registers a protected API and protected user journey with a low-density discovery point", () => {
    const routes = source("server/routes.ts");
    const searchRoute = source("server/routes/search.ts");
    const app = source("client/src/App.tsx");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    expect(routes).toContain("registerSearchRoutes(app)");
    expect(searchRoute).toContain('app.get("/api/search", isAuthenticated');
    expect(app).toContain('<Route path="/search">');
    expect(vault).toContain("navigate('/search')");
  });

  it("deep-links document and relationship results into their existing authoritative surfaces", () => {
    const route = source("server/routes/search.ts");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    const rolodex = source("client/src/pages/RolodexPage.tsx");
    expect(route).toContain("/document-vault?openDoc=${row.id}");
    expect(vault).toContain("params.get('openDoc')");
    expect(route).toContain("/rolodex?contact=${row.id}");
    expect(rolodex).toContain("get('contact')");
  });
});
