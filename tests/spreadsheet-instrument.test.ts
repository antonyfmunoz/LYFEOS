import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptySpreadsheetDocument, createSpreadsheetChart, nextSpreadsheetSheetName, removeSpreadsheetChart, removeSpreadsheetSheet, renameSpreadsheetSheet, shiftSpreadsheetChartsForAxis, spreadsheetDocumentSchema, spreadsheetRevisionSnapshotSchema, uniqueSpreadsheetSheetName, updateSpreadsheetChart } from "../shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, formatSpreadsheetDisplayValue, insertSpreadsheetAxis, parseCellAddress } from "../client/src/lib/spreadsheetFormula";
import { buildSpreadsheetChartData, spreadsheetChartRangeLabel } from "../client/src/lib/spreadsheetChart";
import { createSpreadsheetSheetFromDelimited, formatSpreadsheetRange, parseSpreadsheetClipboard, parseSpreadsheetCsv, pasteSpreadsheetRange, serializeSpreadsheetRange, spreadsheetRangeBounds } from "../client/src/lib/spreadsheetRange";
import { calculateSpreadsheetViewportWindow, moveSpreadsheetAddress } from "../client/src/lib/spreadsheetViewport";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Sheets instrument", () => {
  it("uses stable spreadsheet addresses beyond column Z", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
    expect(parseCellAddress("AA12")).toEqual({ column: 26, row: 11 });
  });

  it("evaluates safe arithmetic, references, ranges, and aggregate functions", () => {
    const document = createEmptySpreadsheetDocument();
    const sheet = document.sheets[0];
    sheet.cells = {
      A1: { input: "2" },
      A2: { input: "3" },
      B1: { input: "=A1+A2*4" },
      B2: { input: "=SUM(A1:A2)" },
      B3: { input: "=AVERAGE(A1:A2)" },
      C1: { input: "=B1/0" },
    };
    expect(evaluateSpreadsheetCell(document, sheet.id, "B1")).toBe("14");
    expect(evaluateSpreadsheetCell(document, sheet.id, "B2")).toBe("5");
    expect(evaluateSpreadsheetCell(document, sheet.id, "B3")).toBe("2.5");
    expect(evaluateSpreadsheetCell(document, sheet.id, "C1")).toBe("#DIV/0!");
  });

  it("detects circular references instead of recursively trusting them", () => {
    const document = createEmptySpreadsheetDocument();
    const sheet = document.sheets[0];
    sheet.cells = { A1: { input: "=B1" }, B1: { input: "=A1" } };
    expect(evaluateSpreadsheetCell(document, sheet.id, "A1")).toBe("#CYCLE!");
  });

  it("rejects invalid or oversized persisted documents", () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0].cells["not-a-cell"] = { input: "x" };
    expect(spreadsheetDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("bounds maximum-grid rendering to the visible viewport plus overscan", () => {
    const top = calculateSpreadsheetViewportWindow({ rowCount: 500, columnCount: 100, scrollLeft: 0, scrollTop: 0, viewportWidth: 1280, viewportHeight: 720 });
    expect(top).toMatchObject({ startColumn: 0, startRow: 0, totalWidth: 12_048, totalHeight: 18_032 });
    expect(top.renderedCellCount).toBeLessThanOrEqual(400);
    const bottom = calculateSpreadsheetViewportWindow({ rowCount: 500, columnCount: 100, scrollLeft: 12_048 - 1280, scrollTop: 18_032 - 720, viewportWidth: 1280, viewportHeight: 720 });
    expect(bottom).toMatchObject({ endColumn: 99, endRow: 499 });
    expect(bottom.renderedCellCount).toBeLessThanOrEqual(400);
  });

  it("normalizes invalid viewport measurements and clamps overscan", () => {
    const viewport = calculateSpreadsheetViewportWindow({ rowCount: 0, columnCount: 1_000, scrollLeft: Number.NaN, scrollTop: -100, viewportWidth: 0, viewportHeight: 0, overscanRows: 99, overscanColumns: -2 });
    expect(viewport).toMatchObject({ startColumn: 0, startRow: 0, endRow: 0, renderedRowCount: 1 });
    expect(viewport.endColumn).toBeLessThan(100);
  });

  it("accounts for row and column headers when deriving the first visible cell", () => {
    const viewport = calculateSpreadsheetViewportWindow({ rowCount: 500, columnCount: 100, scrollLeft: 48 + 5 * 120, scrollTop: 32 + 10 * 36, viewportWidth: 120, viewportHeight: 36, overscanRows: 0, overscanColumns: 0 });
    expect(viewport).toMatchObject({ startColumn: 5, startRow: 10 });
  });

  it("moves keyboard selection within sheet boundaries", () => {
    expect(moveSpreadsheetAddress("B2", "left", 40, 10)).toBe("A2");
    expect(moveSpreadsheetAddress("B2", "up", 40, 10)).toBe("B1");
    expect(moveSpreadsheetAddress("A1", "left", 40, 10)).toBe("A1");
    expect(moveSpreadsheetAddress("J40", "right", 40, 10)).toBe("J40");
    expect(moveSpreadsheetAddress("J40", "down", 40, 10)).toBe("J40");
    expect(() => moveSpreadsheetAddress("bad", "down", 40, 10)).toThrow("valid spreadsheet cell");
  });

  it("formats numeric display deterministically without converting authoritative values", () => {
    expect(formatSpreadsheetDisplayValue("1234.5", "decimal")).toBe("1,234.50");
    expect(formatSpreadsheetDisplayValue("0.125", "percent")).toBe("12.50%");
    expect(formatSpreadsheetDisplayValue("-42", "currency_usd")).toBe("-$42.00");
    expect(formatSpreadsheetDisplayValue("planning", "decimal")).toBe("planning");
    expect(formatSpreadsheetDisplayValue("#DIV/0!", "currency_usd")).toBe("#DIV/0!");
    expect(formatSpreadsheetDisplayValue("001.20")).toBe("001.20");
  });

  it("adds bounded display dimensions to legacy version-one documents without losing cells", () => {
    const parsed = spreadsheetDocumentSchema.parse({
      version: 1,
      activeSheetId: "sheet_legacy",
      sheets: [{ id: "sheet_legacy", name: "Legacy", cells: { J40: { input: "kept" } } }],
    });
    expect(parsed.sheets[0]).toMatchObject({ rowCount: 40, columnCount: 10, cells: { J40: { input: "kept" } } });
    expect(parsed.charts).toEqual([]);
  });

  it("persists bounded chart definitions only over an existing in-sheet range", () => {
    const document = createEmptySpreadsheetDocument();
    const charted = createSpreadsheetChart(document, { id: "chart_one", title: "  Weekly output  ", kind: "line", sheetId: document.activeSheetId, range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 } });
    expect(charted.charts[0]).toMatchObject({ title: "Weekly output", kind: "line", range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 } });
    expect(document.charts).toEqual([]);
    expect(spreadsheetDocumentSchema.safeParse({ ...charted, charts: [{ ...charted.charts[0], sheetId: "missing" }] }).success).toBe(false);
    expect(spreadsheetDocumentSchema.safeParse({ ...charted, charts: [{ ...charted.charts[0], range: { startRow: 0, endRow: 40, startColumn: 0, endColumn: 2 } }] }).success).toBe(false);
    expect(() => createSpreadsheetChart(document, { id: "bad", title: "No labels", kind: "bar", sheetId: document.activeSheetId, range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 } })).toThrow("header row");
  });

  it("derives chart values from canonical cells and never converts missing or invalid values to zero", () => {
    const document = createEmptySpreadsheetDocument();
    const sheet = document.sheets[0];
    sheet.cells = {
      A1: { input: "Week" }, B1: { input: "Calls" }, C1: { input: "Sales" },
      A2: { input: "One" }, B2: { input: "4" }, C2: { input: "=B2/2" },
      A3: { input: "Two" }, B3: { input: "" }, C3: { input: "not measured" },
      A4: { input: "Three" }, B4: { input: "0" }, C4: { input: "=B4+3" },
    };
    const charted = createSpreadsheetChart(document, { id: "chart_values", title: "Calls and sales", kind: "bar", sheetId: sheet.id, range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 } });
    const data = buildSpreadsheetChartData(charted, charted.charts[0]);
    expect(spreadsheetChartRangeLabel(charted.charts[0])).toBe("A1:C4");
    expect(data.series.map((series) => [series.name, series.validCount, series.missingCount])).toEqual([["Calls", 2, 1], ["Sales", 2, 1]]);
    expect(data.rows).toEqual([
      { label: "One", values: { series_1: 4, series_2: 2 } },
      { label: "Two", values: { series_1: null, series_2: null } },
      { label: "Three", values: { series_1: 0, series_2: 3 } },
    ]);
    expect(data).toMatchObject({ numericValueCount: 4, missingValueCount: 2 });
  });

  it("updates and removes chart definitions without mutating source cells", () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0].cells = { A1: { input: "Day" }, B1: { input: "Value" }, A2: { input: "Mon" }, B2: { input: "1" } };
    const charted = createSpreadsheetChart(document, { id: "chart_edit", title: "Original", kind: "line", sheetId: document.activeSheetId, range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 } });
    const updated = updateSpreadsheetChart(charted, "chart_edit", { title: "Revised", kind: "bar" });
    const removed = removeSpreadsheetChart(updated, "chart_edit");
    expect(updated.charts[0]).toMatchObject({ title: "Revised", kind: "bar" });
    expect(removed.charts).toEqual([]);
    expect(removed.sheets[0].cells).toEqual(document.sheets[0].cells);
    expect(charted.charts[0]).toMatchObject({ title: "Original", kind: "line" });
  });

  it("keeps chart ranges aligned through structural insertion and removes only charts owned by a removed tab", () => {
    const document = createEmptySpreadsheetDocument();
    const firstId = document.activeSheetId;
    document.sheets.push({ ...document.sheets[0], id: "sheet_second", name: "Second", cells: {} });
    let charted = createSpreadsheetChart(document, { id: "chart_first", title: "First", kind: "line", sheetId: firstId, range: { startRow: 2, endRow: 4, startColumn: 2, endColumn: 4 } });
    charted = createSpreadsheetChart(charted, { id: "chart_second", title: "Second", kind: "bar", sheetId: "sheet_second", range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 } });
    const shiftedBefore = shiftSpreadsheetChartsForAxis(charted, firstId, "row", 1);
    expect(shiftedBefore.charts[0].range).toMatchObject({ startRow: 3, endRow: 5, startColumn: 2, endColumn: 4 });
    const shiftedInside = shiftSpreadsheetChartsForAxis(shiftedBefore, firstId, "column", 3);
    expect(shiftedInside.charts[0].range).toMatchObject({ startRow: 3, endRow: 5, startColumn: 2, endColumn: 5 });
    expect(shiftedInside.charts[1].range).toMatchObject({ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 });
    const removed = removeSpreadsheetSheet(shiftedInside, firstId);
    expect(removed.charts.map((chart) => chart.id)).toEqual(["chart_second"]);
  });

  it("inserts rows and columns without mutating source cells and shifts affected formula references", () => {
    const document = createEmptySpreadsheetDocument();
    const sourceSheet = document.sheets[0];
    sourceSheet.cells = {
      A1: { input: "1" },
      A2: { input: "2", format: { bold: true, align: "right" } },
      B1: { input: "=SUM(A1:A2)" },
      C1: { input: "=B1+A2" },
    };

    const withRow = insertSpreadsheetAxis(sourceSheet, "row", 1);
    expect(withRow.rowCount).toBe(41);
    expect(withRow.cells).toMatchObject({ A1: { input: "1" }, A3: { input: "2", format: { bold: true, align: "right" } }, B1: { input: "=SUM(A1:A3)" }, C1: { input: "=B1+A3" } });
    expect(withRow.cells.A2).toBeUndefined();
    expect(sourceSheet.cells.A2).toEqual({ input: "2", format: { bold: true, align: "right" } });

    const withColumn = insertSpreadsheetAxis(withRow, "column", 1);
    expect(withColumn.columnCount).toBe(11);
    expect(withColumn.cells.C1).toEqual({ input: "=SUM(A1:A3)" });
    expect(withColumn.cells.D1).toEqual({ input: "=C1+A3" });
    expect(evaluateSpreadsheetCell({ ...document, sheets: [withColumn] }, withColumn.id, "D1")).toBe("5");
  });

  it("fails closed at structural and formula address boundaries", () => {
    const document = createEmptySpreadsheetDocument();
    expect(() => insertSpreadsheetAxis({ ...document.sheets[0], rowCount: 500 }, "row", 0)).toThrow("maximum supported row count");
    expect(() => insertSpreadsheetAxis({ ...document.sheets[0], cells: { A9999: { input: "=A9999" } } }, "row", 0)).toThrow("supported sheet boundary");
  });

  it("renames sheet tabs with trimmed unique names and keeps the source document unchanged", () => {
    const document = createEmptySpreadsheetDocument();
    const second = { ...document.sheets[0], id: "sheet_second", name: "Research", cells: {} };
    document.sheets.push(second);
    const renamed = renameSpreadsheetSheet(document, document.sheets[0].id, "  Planning  ");
    expect(renamed.sheets.map((sheet) => sheet.name)).toEqual(["Planning", "Research"]);
    expect(document.sheets[0].name).toBe("Sheet 1");
    expect(() => renameSpreadsheetSheet(document, document.sheets[0].id, " research ")).toThrow("unique name");
    expect(() => renameSpreadsheetSheet(document, "missing", "Valid")).toThrow("no longer exists");
  });

  it("removes only a requested tab, preserves cells in remaining tabs, and selects a deterministic neighbor", () => {
    const document = createEmptySpreadsheetDocument();
    const firstId = document.sheets[0].id;
    document.sheets.push(
      { ...document.sheets[0], id: "sheet_second", name: "Sheet 2", cells: { A1: { input: "kept" } } },
      { ...document.sheets[0], id: "sheet_third", name: "Sheet 3", cells: {} },
    );
    document.activeSheetId = "sheet_second";
    const removed = removeSpreadsheetSheet(document, "sheet_second");
    expect(removed.activeSheetId).toBe("sheet_third");
    expect(removed.sheets.map((sheet) => sheet.id)).toEqual([firstId, "sheet_third"]);
    expect(document.sheets[1].cells.A1).toEqual({ input: "kept" });
    expect(nextSpreadsheetSheetName(removed)).toBe("Sheet 2");
    expect(() => removeSpreadsheetSheet(createEmptySpreadsheetDocument(), firstId)).toThrow("at least one sheet tab");
  });

  it("serializes rectangular raw-input ranges as interoperable quoted tabular text", () => {
    const sheet = createEmptySpreadsheetDocument().sheets[0];
    sheet.cells = {
      A1: { input: "plain" },
      B1: { input: "=SUM(A1:A2)" },
      A2: { input: "tab\tquote\"" },
      B2: { input: "two\nlines" },
    };
    const serialized = serializeSpreadsheetRange(sheet, "B2", "A1");
    expect(serialized).toBe('plain\t=SUM(A1:A2)\r\n"tab\tquote"""\t"two\nlines"');
    expect(parseSpreadsheetClipboard(serialized)).toEqual([["plain", "=SUM(A1:A2)"], ["tab\tquote\"", "two\nlines"]]);
    expect(spreadsheetRangeBounds("B2", "A1")).toMatchObject({ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1, cellCount: 4 });
  });

  it("pastes bounded ranges without mutating source cells and preserves formulas as raw inputs", () => {
    const sheet = createEmptySpreadsheetDocument().sheets[0];
    sheet.cells = { B2: { input: "replace", format: { numberFormat: "decimal", textColor: "green" } }, C2: { input: "clear" }, A1: { input: "untouched" } };
    const pasted = pasteSpreadsheetRange(sheet, "B2", "3\t\r\n4\t=B2+B3\r\n");
    expect(pasted).toMatchObject({ endAddress: "C3", rowCount: 2, columnCount: 2 });
    expect(pasted.sheet.cells).toMatchObject({ A1: { input: "untouched" }, B2: { input: "3", format: { numberFormat: "decimal", textColor: "green" } }, B3: { input: "4" }, C3: { input: "=B2+B3" } });
    expect(pasted.sheet.cells.C2).toBeUndefined();
    expect(sheet.cells).toEqual({ B2: { input: "replace", format: { numberFormat: "decimal", textColor: "green" } }, C2: { input: "clear" }, A1: { input: "untouched" } });
    expect(evaluateSpreadsheetCell({ version: 1, activeSheetId: sheet.id, sheets: [pasted.sheet] }, sheet.id, "C3")).toBe("7");
  });

  it("fails closed on malformed, oversized, or out-of-grid clipboard data", () => {
    const sheet = createEmptySpreadsheetDocument().sheets[0];
    expect(() => parseSpreadsheetClipboard('"unfinished')).toThrow("unfinished quoted cell");
    expect(() => parseSpreadsheetClipboard("x".repeat(10_001))).toThrow("10,000 characters");
    expect(() => parseSpreadsheetClipboard(Array.from({ length: 5_001 }, () => "x").join("\t"))).toThrow("at most 5,000 cells");
    expect(() => pasteSpreadsheetRange(sheet, "J40", "one\ttwo")).toThrow("extend beyond this sheet");
  });

  it("parses quoted CSV locally and builds a bounded new sheet without converting raw formulas", () => {
    const csv = 'name,note,total\r\n"Oats, cooked","line one\nline two",=SUM(C3:C4)\r\n"quote ""kept""",plain,3\r\n';
    expect(parseSpreadsheetCsv(csv)).toEqual([
      ["name", "note", "total"],
      ["Oats, cooked", "line one\nline two", "=SUM(C3:C4)"],
      ['quote "kept"', "plain", "3"],
    ]);
    const imported = createSpreadsheetSheetFromDelimited("sheet_import", "Meals", csv, "csv");
    expect(imported).toMatchObject({ sourceRows: 3, sourceColumns: 3, populatedCellCount: 9, formulaCount: 1 });
    expect(imported.sheet).toMatchObject({ name: "Meals", rowCount: 40, columnCount: 10, cells: { A2: { input: "Oats, cooked" }, C2: { input: "=SUM(C3:C4)" } } });
  });

  it("reconciles imported tab names and rejects excessive imported dimensions or file text", () => {
    const document = createEmptySpreadsheetDocument();
    expect(uniqueSpreadsheetSheetName(document, "Sheet 1")).toBe("Sheet 1 (2)");
    document.sheets.push({ ...document.sheets[0], id: "sheet_second", name: "Sheet 1 (2)", cells: {} });
    expect(uniqueSpreadsheetSheetName(document, "Sheet 1")).toBe("Sheet 1 (3)");
    expect(() => createSpreadsheetSheetFromDelimited("sheet_import", "Too wide", Array.from({ length: 101 }, () => "x").join(","), "csv")).toThrow("100-column");
    expect(() => parseSpreadsheetCsv("x".repeat(2_000_001))).toThrow("2,000,000 characters");
  });

  it("applies governed formatting only to populated cells and clears it without changing inputs", () => {
    const sheet = createEmptySpreadsheetDocument().sheets[0];
    sheet.cells = { A1: { input: "Heading" }, B1: { input: "=1+2", format: { italic: true } } };
    const formatted = formatSpreadsheetRange(sheet, "A1", "C2", { bold: true, align: "center" });
    expect(formatted.changedCellCount).toBe(2);
    expect(formatted.sheet.cells).toEqual({
      A1: { input: "Heading", format: { bold: true, align: "center" } },
      B1: { input: "=1+2", format: { bold: true, italic: true, align: "center" } },
    });
    expect(formatted.sheet.cells.C2).toBeUndefined();
    expect(sheet.cells.A1).toEqual({ input: "Heading" });
    expect(formatSpreadsheetRange(formatted.sheet, "A1", "B1", null).sheet.cells).toEqual({ A1: { input: "Heading" }, B1: { input: "=1+2" } });
  });

  it("applies constrained display and color formats without changing raw cell input", () => {
    const sheet = createEmptySpreadsheetDocument().sheets[0];
    sheet.cells = { A1: { input: "0.25" }, B1: { input: "=A1*4", format: { bold: true } } };
    const formatted = formatSpreadsheetRange(sheet, "A1", "B1", { numberFormat: "percent", textColor: "blue", backgroundColor: "amber" });
    expect(formatted.sheet.cells).toEqual({
      A1: { input: "0.25", format: { numberFormat: "percent", textColor: "blue", backgroundColor: "amber" } },
      B1: { input: "=A1*4", format: { bold: true, numberFormat: "percent", textColor: "blue", backgroundColor: "amber" } },
    });
    expect(formatted.sheet.cells.A1.input).toBe("0.25");
    const resetNumber = formatSpreadsheetRange(formatted.sheet, "A1", "B1", { numberFormat: undefined });
    expect(resetNumber.sheet.cells.A1.format).toEqual({ textColor: "blue", backgroundColor: "amber" });
  });

  it("rejects ungoverned cell formats in persisted documents", () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0].cells.A1 = { input: "x", format: { align: "diagonal" } as any };
    expect(spreadsheetDocumentSchema.safeParse(document).success).toBe(false);
    document.sheets[0].cells.A1 = { input: "x", format: { textColor: "#123456" } as any };
    expect(spreadsheetDocumentSchema.safeParse(document).success).toBe(false);
    document.sheets[0].cells.A1 = { input: "x", format: { numberFormat: "scientific" } as any };
    expect(spreadsheetDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("validates create and update payloads without accepting a caller-supplied owner", () => {
    const routes = source("server/routes/content.ts");
    expect(routes).toContain("createSpreadsheetRequestSchema.parse(req.body)");
    expect(routes).toContain("updateSpreadsheetRequestSchema.parse(req.body)");
    expect(routes).toContain("userId: req.session.userId!");
    expect(routes).not.toContain("storage.updateSpreadsheet(spreadsheetId, req.body)");
  });

  it("makes the dormant instrument discoverable through real protected routes", () => {
    const app = source("client/src/App.tsx");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    expect(app).toContain('<Route path="/spreadsheets/:spreadsheetId">');
    expect(app).toContain('<Route path="/spreadsheets">');
    expect(vault).toContain("navigate('/spreadsheets')");
  });

  it("recognizes the dedicated new-sheet route without relying on a missing route parameter", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("const [location, navigate] = useLocation()");
    expect(editor).toContain('location === "/spreadsheets/new" || spreadsheetId === "new"');
  });

  it("exposes stable nonvisual seams for production browser qualification", () => {
    const catalog = source("client/src/pages/SpreadsheetsPage.tsx");
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(catalog).toContain('data-testid="sheets-page"');
    expect(catalog).toContain('data-testid="sheets-new"');
    expect(catalog).toContain("sheet-card-${sheet.id}");
    expect(editor).toContain('data-testid="sheet-editor"');
    expect(editor).toContain('data-testid="sheet-save"');
    expect(editor).toContain('data-testid="sheet-revision"');
    expect(editor).toContain('data-testid="sheet-grid"');
    expect(editor).toContain('data-testid="sheet-chart-create"');
    expect(editor).toContain('data-testid="sheet-charts"');
    expect(editor).toContain("SpreadsheetChartCard");
    expect(editor).toContain('data-testid="sheet-history"');
    expect(editor).toContain("sheet-history-version-${revision.revisionNumber}");
  });

  it("persists an immutable, owner-scoped version ledger with a baseline backfill", () => {
    const migration = source("migrations/0106_spreadsheet_revisions.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "spreadsheet_revisions"');
    expect(migration).toContain("spreadsheet_revisions_revision_positive");
    expect(migration).toContain("spreadsheet_revisions_action_valid");
    expect(migration).toContain('ON CONFLICT ("spreadsheet_id", "revision_number") DO NOTHING');
    expect(release).toContain('id: "0106_spreadsheet_revisions"');
    expect(schema).toContain('pgTable("spreadsheet_revisions"');
    expect(schema).toContain('uniqueIndex("spreadsheet_revisions_spreadsheet_revision_unique_idx")');
  });

  it("validates historical snapshots before they can be restored", () => {
    const document = createEmptySpreadsheetDocument();
    expect(spreadsheetRevisionSnapshotSchema.safeParse({ title: "Plan", description: null, category: "general", content: document }).success).toBe(true);
    expect(spreadsheetRevisionSnapshotSchema.safeParse({ title: "Plan", description: null, category: "general", content: { ...document, activeSheetId: "missing" } }).success).toBe(false);
  });

  it("serializes spreadsheet writes and restores history only as a new version", () => {
    const routes = source("server/routes/content.ts");
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain('kind: "conflict"');
    expect(routes).toContain('action: "updated"');
    expect(routes).toContain('action: "restored"');
    expect(routes).toContain("sourceRevision: revisionNumber");
    expect(routes).toContain("spreadsheetRevisionSnapshotSchema.safeParse(source.snapshot)");
    expect(routes).toContain("revisionNumber: spreadsheetRevisions.revisionNumber");
    expect(routes).not.toContain("db.select().from(spreadsheetRevisions).where(and(eq(spreadsheetRevisions.spreadsheetId, spreadsheetId), eq(spreadsheetRevisions.userId, req.session.userId!))).orderBy");
  });

  it("includes spreadsheet history in account export and deletion coverage", () => {
    const profile = source("server/routes/profile.ts");
    expect(profile).toContain('"spreadsheet_revisions"');
  });

  it("exposes accessible row and column insertion controls in the existing editor", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("insertSpreadsheetAxis");
    expect(editor).toContain("Insert row before row");
    expect(editor).toContain("Insert column before column");
  });

  it("keeps tab rename and confirmed removal inside the existing editor", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain('aria-label="Active sheet name"');
    expect(editor).toContain("renameSpreadsheetSheet");
    expect(editor).toContain("removeSpreadsheetSheet");
    expect(editor).toContain("window.confirm");
    expect(editor).toContain("This is not permanent until you save");
  });

  it("keeps bounded range copy and paste review-first in the existing editor", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("serializeSpreadsheetRange");
    expect(editor).toContain("pasteSpreadsheetRange");
    expect(editor).toContain("event.shiftKey");
    expect(editor).toContain("aria-pressed={extendSelection}");
    expect(editor).toContain("on touch devices");
    expect(editor).toContain("Clipboard writing is unavailable");
    expect(editor).toContain("Review before saving");
  });

  it("keeps CSV and TSV import local, additive, and explicitly reviewed", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain('accept=".csv,.tsv,text/csv,text/tab-separated-values"');
    expect(editor).toContain("createSpreadsheetSheetFromDelimited");
    expect(editor).toContain("The file stays on this device");
    expect(editor).toContain("nothing changes until you add the tab, review it, and save");
    expect(editor).toContain("Add as new tab");
    expect(editor).not.toContain("FormData");
  });

  it("renders governed selected-range formatting without changing transfer semantics", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("formatSpreadsheetRange");
    expect(editor).toContain("Toggle bold on selected populated cells");
    expect(editor).toContain("Align selected populated cells center");
    expect(editor).toContain("Clear formatting from selected populated cells");
    expect(editor).toContain('aria-label="Number display format"');
    expect(editor).toContain('aria-label="Text color"');
    expect(editor).toContain('aria-label="Cell fill color"');
    expect(editor).toContain("formatSpreadsheetDisplayValue");
    expect(editor).toContain("raw values and formula inputs remain authoritative");
    expect(editor).toContain("plain-text paste preserves existing destination formatting");
    expect(editor).toContain("clipboard and CSV/TSV transfer values and formulas, not presentation");
  });

  it("virtualizes the bounded grid and supports keyboard cell movement", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("calculateSpreadsheetViewportWindow");
    expect(editor).toContain("visibleColumnIndexes");
    expect(editor).toContain("visibleRowIndexes");
    expect(editor).toContain("navigateCellWithKeyboard");
    expect(editor).toContain('event.key === "ArrowLeft"');
    expect(editor).toContain("event.shiftKey");
    expect(editor).toContain("ensureCellVisible(nextAddress)");
    expect(editor).toContain('aria-selected={selectedAddress === address}');
    expect(editor).toContain("renders only the visible rows and columns");
  });

  it("offers bounded unsaved undo and immutable saved-version restoration", () => {
    const editor = source("client/src/pages/SpreadsheetEditorPage.tsx");
    expect(editor).toContain("Undo last unsaved spreadsheet change");
    expect(editor).toContain("Redo last undone spreadsheet change");
    expect(editor).toContain("slice(-19)");
    expect(editor).toContain('"x-lyfeos-expected-revision"');
    expect(editor).toContain("Saved versions are immutable");
    expect(editor).toContain("Restore version ${revision.revisionNumber} as a new saved version");
    expect(editor).toContain("Save or discard your current unsaved changes before restoring");
  });
});
