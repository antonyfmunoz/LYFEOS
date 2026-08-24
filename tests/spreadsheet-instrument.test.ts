import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptySpreadsheetDocument, spreadsheetDocumentSchema } from "../shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, insertSpreadsheetAxis, parseCellAddress } from "../client/src/lib/spreadsheetFormula";

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
      A2: { input: "2" },
      B1: { input: "=SUM(A1:A2)" },
      C1: { input: "=B1+A2" },
    };

    const withRow = insertSpreadsheetAxis(sourceSheet, "row", 1);
    expect(withRow.rowCount).toBe(41);
    expect(withRow.cells).toMatchObject({ A1: { input: "1" }, A3: { input: "2" }, B1: { input: "=SUM(A1:A3)" }, C1: { input: "=B1+A3" } });
    expect(withRow.cells.A2).toBeUndefined();
    expect(sourceSheet.cells.A2).toEqual({ input: "2" });

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
});
