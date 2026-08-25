import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspaceTableViewSchema, defaultWorkspaceFormDefinition, evaluateWorkspaceFormulas, filterAndSortWorkspaceRows, groupWorkspaceRows, parseWorkspaceTableCsv, serializeWorkspaceTableCsv, validateWorkspaceFormDefinition, validateWorkspaceFormFields, validateWorkspaceFormSubmission, validateWorkspaceRow, validateWorkspaceTableView, visibleWorkspaceFormFieldIds, workspaceBulkRowDeleteSchema, workspaceDatabaseDefinitionSchema, workspaceDatabaseRevisionSnapshotSchema, workspaceFormulaReferences, workspaceRowRevisionSnapshotSchema, workspaceTableRowImportSchema, workspaceUnlinkReferencesSchema, type WorkspaceDatabaseDefinition, type WorkspaceTableViewDefinition } from "../shared/tables";

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
    expect(editor).toContain("updateRow.mutate({ rowId: row.id, rowRevision: row.revision, values: editingValues })");
    expect(editor).toContain("Delete selected");
    expect(editor).toContain("This cannot be undone.");
    expect(editor).toContain("bulkRemoveRows.mutate(selectedRowIds)");
  });

  it("validates persisted views against current table columns and groups without copying rows", () => {
    const view: WorkspaceTableViewDefinition = { version: 1, filterQuery: "open", sortColumnId: "score", sortDirection: "desc", groupColumnId: "state" };
    expect(createWorkspaceTableViewSchema.safeParse({ name: "Open by state", definition: view }).success).toBe(true);
    expect(() => validateWorkspaceTableView(definition, view)).not.toThrow();
    expect(() => validateWorkspaceTableView(definition, { ...view, groupColumnId: "missing" })).toThrow("group column");
    const rows = [
      { id: 1, values: { name: "Practice", state: "Open" } },
      { id: 2, values: { name: "Ship", state: "Done" } },
      { id: 3, values: { name: "Review", state: "Open" } },
    ];
    const groups = groupWorkspaceRows(rows, definition, "state");
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([["Open", [1, 3]], ["Done", [2]]]);
    expect(rows).toHaveLength(3);
  });

  it("persists owner-scoped named views through migration, routes, and account rights", () => {
    const migration = source("migrations/0109_workspace_table_views.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    const routes = source("server/routes/tables.ts");
    const profile = source("server/routes/profile.ts");
    for (const contract of [migration, release, schema]) {
      expect(contract).toContain("workspace_table_views");
      expect(contract).toContain("workspace_table_views_database_name_unique_idx");
    }
    expect(release).toContain('id: "0109_workspace_table_views"');
    expect(routes).toContain('app.post("/api/databases/:id/views", isAuthenticated');
    expect(routes).toContain('app.patch("/api/databases/:databaseId/views/:viewId", isAuthenticated');
    expect(routes).toContain('app.delete("/api/databases/:databaseId/views/:viewId", isAuthenticated');
    expect(routes).toContain("eq(workspaceTableViews.databaseId, databaseId)");
    expect(routes).toContain("eq(workspaceTableViews.userId, req.session.userId!)");
    expect(profile.match(/"workspace_table_views"/g)?.length).toBe(2);
  });

  it("loads and saves named filter, sort, and group state in the existing editor", () => {
    const editor = source("client/src/pages/TableEditorPage.tsx");
    expect(editor).toContain('aria-label="Saved table view"');
    expect(editor).toContain('aria-label="Group rows by column"');
    expect(editor).toContain("groupWorkspaceRows");
    expect(editor).toContain("Rows remain in this table as the single source of truth.");
    expect(editor).toContain("Save new view");
    expect(editor).toContain("Update view");
    expect(editor).toContain("Table rows will not be deleted.");
  });

  it("strictly validates immutable table and row revision snapshots", () => {
    const tableSnapshot = { title: "Practice", description: null, category: "general", favorite: false, definition };
    expect(workspaceDatabaseRevisionSnapshotSchema.parse(tableSnapshot)).toEqual(tableSnapshot);
    expect(workspaceDatabaseRevisionSnapshotSchema.safeParse({ ...tableSnapshot, hidden: true }).success).toBe(false);
    expect(workspaceRowRevisionSnapshotSchema.parse({ values: { name: "Practice", score: 4 } })).toEqual({ values: { name: "Practice", score: 4 } });
    expect(workspaceRowRevisionSnapshotSchema.safeParse({ values: {}, hidden: true }).success).toBe(false);
  });

  it("ships baseline immutable revision ledgers through schema and release migration", () => {
    const migration = source("migrations/0110_workspace_table_revisions.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    for (const table of ["workspace_database_revisions", "workspace_database_row_revisions"]) {
      for (const contract of [migration, release, schema]) expect(contract).toContain(table);
    }
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1');
    expect(migration).toContain("jsonb_build_object('title'");
    expect(migration).toContain("jsonb_build_object('values'");
    expect(migration).toContain("CHECK (\"action\" IN ('created','updated','restored'))");
    expect(release).toContain('id: "0110_workspace_table_revisions"');
    expect(schema).toContain("workspace_database_revisions_database_revision_unique_idx");
    expect(schema).toContain("workspace_database_row_revisions_row_revision_unique_idx");
  });

  it("serializes schema-dependent writes and restores as new owner-scoped versions", () => {
    const routes = source("server/routes/tables.ts");
    expect(routes).toContain("async function lockedOwnedDatabase");
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain('app.get("/api/databases/:id/revisions", isAuthenticated');
    expect(routes).toContain('app.post("/api/databases/:id/revisions/:revisionNumber/restore", isAuthenticated');
    expect(routes).toContain('app.get("/api/databases/:databaseId/rows/:rowId/revisions", isAuthenticated');
    expect(routes).toContain('app.post("/api/databases/:databaseId/rows/:rowId/revisions/:revisionNumber/restore", isAuthenticated');
    expect(routes).toContain("validateDefinitionDependents(tx");
    expect(routes).toContain("validateWorkspaceRow(definition, snapshot.values)");
    expect(routes).toContain('action: "restored", sourceRevision');
    expect(routes).toContain('disclosure: "History is immutable. Restoring creates a new revision."');
    expect(routes.match(/tx\.insert\(workspaceDatabaseRowRevisions\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("exposes conflict-safe history controls and includes both ledgers in account rights", () => {
    const editor = source("client/src/pages/TableEditorPage.tsx");
    const profile = source("server/routes/profile.ts");
    expect(editor).toContain('headers: { "x-lyfeos-expected-revision": String(query.data!.database.revision) }');
    expect(editor).toContain('headers: { "x-lyfeos-expected-revision": String(rowRevision) }');
    expect(editor).toContain('aria-label="Table history"');
    expect(editor).toContain('aria-label="Row history"');
    expect(editor).toContain("Restoring always creates a new version.");
    for (const table of ["workspace_database_revisions", "workspace_database_row_revisions"]) {
      expect(profile.match(new RegExp(`"${table}"`, "g"))?.length).toBe(2);
    }
  });

  it("reviews quoted CSV against stable columns and typed row truth before import", () => {
    const preview = parseWorkspaceTableCsv(definition, 'name::Name,score::Score,state::State\r\n"Call, lead",4,Open\r\n"line one\nline two",,Done\r\n,,\r\n');
    expect(preview.rows).toEqual([
      { name: "Call, lead", score: 4, state: "Open" },
      { name: "line one\nline two", state: "Done" },
    ]);
    expect(preview.sourceRowCount).toBe(3);
    expect(preview.importRowCount).toBe(2);
    expect(preview.skippedBlankRowCount).toBe(1);
    expect(preview.mappedColumns.map((column) => column.columnId)).toEqual(["name", "score", "state"]);
    expect(() => parseWorkspaceTableCsv(definition, "unknown\nvalue")).toThrow("does not match this Table");
    expect(() => parseWorkspaceTableCsv(definition, "score\n4")).toThrow("Name is required");
    expect(workspaceTableRowImportSchema.safeParse({ rows: Array.from({ length: 501 }, () => ({ name: "x" })) }).success).toBe(false);
  });

  it("exports all typed rows with reconcilable IDs, RFC quoting, and formula-prefix protection", () => {
    const csv = serializeWorkspaceTableCsv(definition, [{ values: { name: '=HYPERLINK("bad")', score: 4, state: "Open" } }]);
    expect(csv).toContain('"name::Name","score::Score","state::State"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")","4","Open"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("commits reviewed CSV rows atomically through canonical rows and revision ledgers", () => {
    const routes = source("server/routes/tables.ts");
    const editor = source("client/src/pages/TableEditorPage.tsx");
    expect(routes).toContain('app.post("/api/databases/:id/rows/import", isAuthenticated');
    expect(routes).toContain("workspaceTableRowImportSchema.parse(req.body)");
    expect(routes).toContain("validatedRows.map((values)");
    expect(routes).toContain("tx.insert(workspaceDatabaseRowRevisions).values(rows.map");
    expect(routes).toContain("Rows were added atomically to this Table; existing rows were not changed.");
    expect(editor).toContain('accept=".csv,text/csv"');
    expect(editor).toContain("parseWorkspaceTableCsv(definition, await file.text())");
    expect(editor).toContain('aria-labelledby="table-import-review-heading"');
    expect(editor).toContain("Import is additive and atomic; existing rows will not be changed.");
    expect(editor).toContain("serializeWorkspaceTableCsv(definition, query.data!.rows)");
  });

  it("evaluates bounded numeric formulas deterministically and rejects unsafe or circular definitions", () => {
    const computedDefinition = workspaceDatabaseDefinitionSchema.parse({ version: 1, columns: [
      { id: "weight", name: "Weight", type: "number", required: false, options: [] },
      { id: "reps", name: "Reps", type: "number", required: false, options: [] },
      { id: "volume", name: "Volume", type: "formula", required: false, options: [], formula: { expression: "[weight] * [reps]" } },
      { id: "double", name: "Double", type: "formula", required: false, options: [], formula: { expression: "([volume] + 2) * 2" } },
    ] });
    expect(workspaceFormulaReferences("([weight] + [reps]) / [weight]")).toEqual(["weight", "reps"]);
    expect(evaluateWorkspaceFormulas(computedDefinition, { weight: 10, reps: 4 })).toEqual({ volume: 40, double: 84 });
    expect(evaluateWorkspaceFormulas(computedDefinition, { weight: 10 })).toEqual({ volume: null, double: null });
    expect(() => workspaceFormulaReferences("process.exit()")).toThrow("numbers");
    expect(workspaceDatabaseDefinitionSchema.safeParse({ version: 1, columns: [
      { id: "a", name: "A", type: "formula", required: false, options: [], formula: { expression: "[b]" } },
      { id: "b", name: "B", type: "formula", required: false, options: [], formula: { expression: "[a]" } },
    ] }).success).toBe(false);
  });

  it("keeps relations bounded and formula/rollup fields outside stored row and form authority", () => {
    const relational = workspaceDatabaseDefinitionSchema.parse({ version: 1, columns: [
      { id: "name", name: "Name", type: "text", required: true, options: [] },
      { id: "sessions", name: "Sessions", type: "relation", required: false, options: [], relation: { databaseId: 9, displayColumnId: "title" } },
      { id: "score", name: "Score", type: "formula", required: false, options: [], formula: { expression: "0" } },
      { id: "total", name: "Total", type: "rollup", required: false, options: [], rollup: { relationColumnId: "sessions", targetColumnId: "load", aggregation: "sum" } },
    ] });
    expect(validateWorkspaceRow(relational, { name: "Week", sessions: [3, 7] })).toEqual({ name: "Week", sessions: [3, 7] });
    expect(() => validateWorkspaceRow(relational, { name: "Week", sessions: [3, 3] })).toThrow("unique related row IDs");
    expect(() => validateWorkspaceRow(relational, { name: "Week", score: 10 })).toThrow("computed");
    expect(() => validateWorkspaceFormFields(relational, ["name", "score"])).toThrow("cannot write formula or rollup");
    expect(() => validateWorkspaceFormFields(relational, ["name", "total"])).toThrow("cannot write formula or rollup");
  });

  it("filters, sorts, groups, and exports derived projections without persisting them", () => {
    const computedDefinition = workspaceDatabaseDefinitionSchema.parse({ version: 1, columns: [
      { id: "name", name: "Name", type: "text", required: true, options: [] },
      { id: "links", name: "Links", type: "relation", required: false, options: [], relation: { databaseId: 9, displayColumnId: "title" } },
      { id: "total", name: "Total", type: "rollup", required: false, options: [], rollup: { relationColumnId: "links", targetColumnId: "load", aggregation: "sum" } },
    ] });
    const rows = [
      { id: 1, values: { name: "First", links: [4] }, computedValues: { links: "Deadlift", total: 90 } },
      { id: 2, values: { name: "Second", links: [5] }, computedValues: { links: "Squat", total: 120 } },
    ];
    expect(filterAndSortWorkspaceRows(rows, computedDefinition, "squat", null, "asc").map((row) => row.id)).toEqual([2]);
    expect(filterAndSortWorkspaceRows(rows, computedDefinition, "", "total", "desc").map((row) => row.id)).toEqual([2, 1]);
    expect(groupWorkspaceRows(rows, computedDefinition, "links").map((group) => group.label)).toEqual(["Deadlift", "Squat"]);
    const csv = serializeWorkspaceTableCsv(computedDefinition, rows);
    expect(csv).toContain('"4","90"');
    const preview = parseWorkspaceTableCsv(computedDefinition, 'name::Name,links::Links,total::Total\r\nWeek,4;5,999');
    expect(preview.rows).toEqual([{ name: "Week", links: [4, 5] }]);
    expect(preview.ignoredComputedColumnCount).toBe(1);
  });

  it("owner-validates the relation graph and prevents destructive dangling references", () => {
    const routes = source("server/routes/tables.ts");
    expect(routes).toContain("async function validateOwnedTableDefinitions");
    expect(routes).toContain("must target one of your Tables");
    expect(routes).toContain("async function validateWorkspaceRelationValues");
    expect(routes).toContain("eq(workspaceDatabaseRows.userId, userId)");
    expect(routes).toContain("async function lockWorkspaceTableDomain");
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("async function relatedRowReferenceExists");
    expect(routes).toContain("jsonb_path_exists");
    expect(routes).toContain("Remove this row from related records before deleting it.");
    expect(routes).toContain("Remove relations from");
    expect(routes).toContain("evaluateWorkspaceFormulas(definition, values)");
    expect(routes).toContain("relationOptions");
  });

  it("derives reciprocal backlinks and unlinks them through reviewed immutable source-row updates", () => {
    expect(workspaceUnlinkReferencesSchema.parse({ referenceCount: 3, confirmation: "UNLINK 3" })).toEqual({ referenceCount: 3, confirmation: "UNLINK 3" });
    expect(workspaceUnlinkReferencesSchema.safeParse({ referenceCount: 3, confirmation: "UNLINK 2" }).success).toBe(false);
    expect(workspaceUnlinkReferencesSchema.safeParse({ referenceCount: 501, confirmation: "UNLINK 501" }).success).toBe(false);
    const routes = source("server/routes/tables.ts"); const editor = source("client/src/pages/TableEditorPage.tsx");
    expect(routes).toContain("async function workspaceRowReferences");
    expect(routes).toContain('app.get("/api/databases/:databaseId/rows/:rowId/references", isAuthenticated');
    expect(routes).toContain('app.post("/api/databases/:databaseId/rows/:rowId/unlink-references", isAuthenticated');
    expect(routes).toContain("references.entries.length !== input.referenceCount");
    expect(routes).toContain("sourceRow.revision + 1");
    expect(routes).toContain("workspaceDatabaseRowRevisions");
    expect(routes).toContain('action: "updated"');
    expect(routes).toContain("It does not delete either record.");
    expect(editor).toContain("Incoming references to row #");
    expect(editor).toContain("Backlinks are derived from canonical relation IDs.");
    expect(editor).toContain("unlinkReferences.mutate");
    expect(editor).toContain("no rows will be deleted");
  });

  it("exposes relation, formula, and rollup controls without making computed fields editable", () => {
    const editor = source("client/src/pages/TableEditorPage.tsx");
    const columnEditor = source("client/src/components/tables/WorkspaceColumnEditor.tsx");
    const field = source("client/src/components/tables/WorkspaceFieldInput.tsx");
    const form = source("client/src/pages/FormPage.tsx");
    expect(columnEditor).toContain('["text", "number", "boolean", "date", "select", "url", "relation", "formula", "rollup"]');
    expect(columnEditor).toContain("Target Table");
    expect(columnEditor).toContain("[weight] * [reps]");
    expect(columnEditor).toContain("Aggregation");
    expect(editor).toContain("Relations store owned row IDs; formulas and rollups are calculated read-only.");
    expect(editor).toContain("!isWorkspaceComputedColumn(column)");
    expect(field).toContain("Calculated after the row is saved");
    expect(field).toContain('role="group"');
    expect(form).toContain("relationOptions={query.data.relationOptions}");
  });

  it("validates sectioned form layouts and evaluates forward-only conditional visibility", () => {
    const formDefinition = validateWorkspaceFormDefinition(definition, ["name", "state", "score"], { version: 1, sections: [
      { id: "identity", title: "Identity", description: null, fieldIds: ["name", "state"] },
      { id: "details", title: "Details", description: "Only when open", fieldIds: ["score"] },
    ], conditions: [{ id: "open_score", sourceFieldId: "state", targetFieldId: "score", operator: "equals", value: "Open" }] });
    expect(visibleWorkspaceFormFieldIds(formDefinition, { name: "Practice", state: "Done" })).toEqual(["name", "state"]);
    expect(visibleWorkspaceFormFieldIds(formDefinition, { name: "Practice", state: "Open" })).toEqual(["name", "state", "score"]);
    expect(validateWorkspaceFormSubmission(definition, formDefinition, { name: "Practice", state: "Open", score: 5 })).toEqual({ name: "Practice", state: "Open", score: 5 });
    expect(() => validateWorkspaceFormSubmission(definition, formDefinition, { name: "Practice", state: "Done", score: 5 })).toThrow("not part of this form");
    expect(() => validateWorkspaceFormDefinition(definition, ["name", "state", "score"], { ...formDefinition, conditions: [{ ...formDefinition.conditions[0], sourceFieldId: "score", targetFieldId: "state" }] })).toThrow("earlier field");
    expect(defaultWorkspaceFormDefinition(["name"]).sections[0].fieldIds).toEqual(["name"]);
  });

  it("governs external respondent links without creating a second response authority", () => {
    const migration = source("migrations/0111_workspace_form_governance.sql"); const release = source("server/release-migrate.ts"); const routes = source("server/routes/tables.ts"); const schema = source("shared/schema.ts"); const profile = source("server/routes/profile.ts"); const app = source("client/src/App.tsx"); const publicPage = source("client/src/pages/PublicFormPage.tsx");
    for (const contract of [migration, release, schema]) for (const table of ["workspace_form_access_grants", "workspace_form_submission_receipts"]) expect(contract).toContain(table);
    expect(release).toContain('id: "0111_workspace_form_governance"');
    expect(routes).toContain('app.get("/api/public/forms/:publicId"');
    expect(routes).toContain('app.post("/api/public/forms/:publicId/submissions"');
    expect(routes).toContain('app.post("/api/forms/:formId/access-grants/:grantId/revoke", isAuthenticated');
    expect(routes).toContain('crypto.randomBytes(32).toString("base64url")');
    expect(routes).toContain('crypto.createHash("sha256")');
    expect(routes).toContain('req.header("authorization")');
    expect(routes).toContain('SELECT id FROM workspace_form_access_grants WHERE public_id = ${publicId} AND token_hash = ${hash} FOR UPDATE');
    expect(routes).toContain("workspaceDatabaseRows");
    expect(routes).toContain("workspaceDatabaseRowRevisions");
    expect(routes).toContain("workspaceFormSubmissionReceipts");
    expect(routes).toContain("External links cannot expose relation fields");
    expect(routes).not.toContain('/api/public/forms/:token');
    expect(profile).toContain('selectSafeWorkspaceFormAccessRows');
    expect(profile).toContain('"workspace_form_submission_receipts", "workspace_form_access_grants", "workspace_forms"');
    expect(app).toContain('<Route path="/forms/respond/:publicId">');
    expect(app).toContain("'/forms/respond'");
    expect(publicPage).toContain('window.location.hash.slice(1)');
    expect(publicPage).toContain('Authorization: `Bearer ${token}`');
    expect(publicPage).toContain('visibleWorkspaceFormFieldIds');
  });
});
