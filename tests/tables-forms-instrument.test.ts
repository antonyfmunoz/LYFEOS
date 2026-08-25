import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterAndSortWorkspaceRows, validateWorkspaceFormFields, validateWorkspaceRow, workspaceBulkRowDeleteSchema, workspaceDatabaseDefinitionSchema, type WorkspaceDatabaseDefinition } from "../shared/tables";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const definition: WorkspaceDatabaseDefinition = { version: 1, columns: [
  { id: "name", name: "Name", type: "text", required: true, options: [] },
  { id: "score", name: "Score", type: "number", required: false, options: [] },
  { id: "state", name: "State", type: "select", required: false, options: ["Open", "Done"] },
] };

describe("Tables and Forms instruments", () => {
  it("enforces bounded, unique typed definitions", () => {
    expect(workspaceDatabaseDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(workspaceDatabaseDefinitionSchema.safeParse({ ...definition, columns: [...definition.columns, definition.columns[0]] }).success).toBe(false);
    expect(workspaceDatabaseDefinitionSchema.safeParse({ version: 1, columns: [{ ...definition.columns[0], type: "select", options: [] }] }).success).toBe(false);
  });

  it("validates values against required fields and exact column types", () => {
    expect(validateWorkspaceRow(definition, { name: "Practice", score: 4, state: "Open" })).toEqual({ name: "Practice", score: 4, state: "Open" });
    expect(() => validateWorkspaceRow(definition, { score: 4 })).toThrow("Name is required");
    expect(() => validateWorkspaceRow(definition, { name: "Practice", score: "4" })).toThrow("finite number");
    expect(() => validateWorkspaceRow(definition, { name: "Practice", state: "Unknown" })).toThrow("allowed option");
    expect(() => validateWorkspaceRow(definition, { name: "Practice", hidden: "value" })).toThrow("Unknown field");
  });

  it("makes forms constrained views over the table rather than separate response storage", () => {
    expect(() => validateWorkspaceFormFields(definition, ["score"])).toThrow("Required field Name");
    expect(() => validateWorkspaceFormFields(definition, ["name", "missing"])).toThrow("must exist");
    expect(() => validateWorkspaceRow(definition, { name: "Practice", score: 2 }, ["name"])).toThrow("not part of this form");
    expect(validateWorkspaceRow(definition, { name: "Practice" }, ["name"])).toEqual({ name: "Practice" });
  });

  it("ships the three owned tables through migration and the release runner", () => {
    const migration = source("migrations/0095_workspace_tables_forms.sql");
    const release = source("server/release-migrate.ts");
    for (const table of ["workspace_databases", "workspace_database_rows", "workspace_forms"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(release).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(release).toContain('id: "0095_workspace_tables_forms"');
    }
  });

  it("owner-scopes tables, rows, forms, and submissions and never accepts a caller owner", () => {
    const routes = source("server/routes/tables.ts");
    expect(routes).toContain('app.post("/api/forms/:id/submissions", isAuthenticated');
    expect(routes).toContain("eq(workspaceDatabases.userId, userId)");
    expect(routes).toContain("eq(workspaceDatabaseRows.userId, req.session.userId!)");
    expect(routes).toContain("eq(workspaceForms.userId, req.session.userId!)");
    expect(routes).toContain("userId: req.session.userId!");
    expect(routes).not.toContain("userId: req.body");
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
  });

  it("includes the instruments in account export/deletion and protected journeys", () => {
    const profile = source("server/routes/profile.ts"); const app = source("client/src/App.tsx"); const vault = source("client/src/pages/DocumentVaultPage.tsx");
    for (const table of ["workspace_databases", "workspace_database_rows", "workspace_forms"]) expect(profile).toContain(`"${table}"`);
    expect(app).toContain('<Route path="/databases/:databaseId">');
    expect(app).toContain('<Route path="/forms/:formId">');
    expect(vault).toContain("navigate('/databases')");
  });

  it("filters and sorts typed rows deterministically without changing source records", () => {
    const rows = [
      { id: 2, values: { name: "Deep work", score: 10, state: "Open" } },
      { id: 1, values: { name: "Practice", score: 4, state: "Done" } },
      { id: 3, values: { name: "Rest", state: "Open" } },
    ];
    expect(filterAndSortWorkspaceRows(rows, definition, "open", null, "asc").map((row) => row.id)).toEqual([2, 3]);
    expect(filterAndSortWorkspaceRows(rows, definition, "", "score", "asc").map((row) => row.id)).toEqual([1, 2, 3]);
    expect(filterAndSortWorkspaceRows(rows, definition, "", "score", "desc").map((row) => row.id)).toEqual([2, 1, 3]);
    expect(rows.map((row) => row.id)).toEqual([2, 1, 3]);
    expect(() => filterAndSortWorkspaceRows(rows, definition, "", "missing", "asc")).toThrow("column from this table");
  });

  it("bounds bulk row deletion and owner-scopes every deleted row", () => {
    expect(workspaceBulkRowDeleteSchema.parse({ rowIds: [3, 1] })).toEqual({ rowIds: [3, 1] });
    expect(workspaceBulkRowDeleteSchema.safeParse({ rowIds: [1, 1] }).success).toBe(false);
    expect(workspaceBulkRowDeleteSchema.safeParse({ rowIds: Array.from({ length: 101 }, (_, index) => index + 1) }).success).toBe(false);
    const routes = source("server/routes/tables.ts");
    expect(routes).toContain('app.post("/api/databases/:id/rows/bulk-delete", isAuthenticated');
    expect(routes).toContain("workspaceBulkRowDeleteSchema.parse(req.body)");
    expect(routes).toContain("eq(workspaceDatabaseRows.databaseId, id)");
    expect(routes).toContain("eq(workspaceDatabaseRows.userId, req.session.userId!)");
    expect(routes).toContain("inArray(workspaceDatabaseRows.id, rowIds)");
  });

  it("exposes reviewed row editing, local views, and explicit destructive controls", () => {
    const editor = source("client/src/pages/TableEditorPage.tsx");
    expect(editor).toContain('aria-label="Filter table rows"');
    expect(editor).toContain("filterAndSortWorkspaceRows");
    expect(editor).toContain("toggleSort(column.id)");
    expect(editor).toContain("updateRow.mutate({ rowId: row.id, values: editingValues })");
    expect(editor).toContain("Delete selected");
    expect(editor).toContain("This cannot be undone.");
    expect(editor).toContain("bulkRemoveRows.mutate(selectedRowIds)");
  });
});
