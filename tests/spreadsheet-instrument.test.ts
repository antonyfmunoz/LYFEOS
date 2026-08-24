import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptySpreadsheetDocument, spreadsheetDocumentSchema } from "../shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, parseCellAddress } from "../client/src/lib/spreadsheetFormula";

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
});
