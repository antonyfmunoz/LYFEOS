import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptySpreadsheetDocument, nextSpreadsheetSheetName, removeSpreadsheetSheet, renameSpreadsheetSheet, spreadsheetDocumentSchema, uniqueSpreadsheetSheetName } from "../shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, insertSpreadsheetAxis, parseCellAddress } from "../client/src/lib/spreadsheetFormula";
import { createSpreadsheetSheetFromDelimited, formatSpreadsheetRange, parseSpreadsheetClipboard, parseSpreadsheetCsv, pasteSpreadsheetRange, serializeSpreadsheetRange, spreadsheetRangeBounds } from "../client/src/lib/spreadsheetRange";

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

  it("adds bounded display dimensions to legacy version-one documents without losing cells", () => {
    const parsed = spreadsheetDocumentSchema.parse({
      version: 1,
      activeSheetId: "sheet_legacy",
      sheets: [{ id: "sheet_legacy", name: "Legacy", cells: { J40: { input: "kept" } } }],
    });
    expect(parsed.sheets[0]).toMatchObject({ rowCount: 40, columnCount: 10, cells: { J40: { input: "kept" } } });
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
    sheet.cells = { B2: { input: "replace" }, C2: { input: "clear" }, A1: { input: "untouched" } };
    const pasted = pasteSpreadsheetRange(sheet, "B2", "3\t\r\n4\t=B2+B3\r\n");
    expect(pasted).toMatchObject({ endAddress: "C3", rowCount: 2, columnCount: 2 });
    expect(pasted.sheet.cells).toMatchObject({ A1: { input: "untouched" }, B2: { input: "3" }, B3: { input: "4" }, C3: { input: "=B2+B3" } });
    expect(pasted.sheet.cells.C2).toBeUndefined();
    expect(sheet.cells).toEqual({ B2: { input: "replace" }, C2: { input: "clear" }, A1: { input: "untouched" } });
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

  it("rejects ungoverned cell formats in persisted documents", () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0].cells.A1 = { input: "x", format: { align: "diagonal" } as any };
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
    expect(editor).toContain("clipboard and CSV/TSV transfer values and formulas, not presentation");
  });
});
