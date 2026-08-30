import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { appendSpreadsheetImportedSheets, createEmptySpreadsheetDocument, type SpreadsheetSheet } from "../shared/spreadsheets";
import { evaluateSpreadsheetCell } from "../client/src/lib/spreadsheetFormula";
import { exportSpreadsheetXlsx, exportSpreadsheetXlsxWithReport, importSpreadsheetXlsx, spreadsheetXlsxFileName } from "../client/src/lib/spreadsheetXlsx";

const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function minimalWorkbook(sheetXml: string, extras: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    "xl/workbook.xml": strToU8(`${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Imported" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
    ...extras,
  }, { level: 1 });
}

describe("local XLSX workbook transfer", () => {
  it("exports deterministic multi-sheet XLSX and imports supported inputs without server state", async () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0] = {
      ...document.sheets[0],
      name: "Data & Inputs",
      cells: {
        A1: { input: "Revenue", format: { bold: true, textColor: "blue", backgroundColor: "amber" } },
        A2: { input: "12.5", format: { numberFormat: "currency_usd", align: "right" } },
        B2: { input: "TRUE" },
      },
    };
    document.sheets.push({
      ...document.sheets[0],
      id: "sheet_summary",
      name: "Summary",
      cells: {
        A1: { input: "='Data & Inputs'!A2*2", format: { numberFormat: "decimal" } },
        A2: { input: "00123" },
      },
    });
    const first = exportSpreadsheetXlsx(document);
    const second = exportSpreadsheetXlsx(document);
    expect(first).toEqual(second);
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual(expect.arrayContaining([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]));
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain('<c r="A2" s="2"><v>12.5</v></c>');
    expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">00123</t></is></c>');
    const imported = await importSpreadsheetXlsx(first, (index) => `sheet_import_${index + 1}`);
    expect(imported).toMatchObject({ sourceSheetCount: 2, populatedCellCount: 5, formulaCount: 1, presentationImported: false });
    expect(imported.sheets.map((sheet) => sheet.name)).toEqual(["Data & Inputs", "Summary"]);
    expect(imported.sheets[0].cells).toMatchObject({ A1: { input: "Revenue" }, A2: { input: "12.5" }, B2: { input: "TRUE" } });
    expect(imported.sheets[1].cells).toMatchObject({ A1: { input: "='Data & Inputs'!A2*2" }, A2: { input: "00123" } });
    expect(evaluateSpreadsheetCell({ version: 1, activeSheetId: imported.sheets[1].id, sheets: imported.sheets, charts: [] }, imported.sheets[1].id, "A1")).toBe("25");
    expect(spreadsheetXlsxFileName(" 2026 Growth / Plan ")).toBe("2026-Growth-Plan.xlsx");
  });

  it("reads shared and inline strings, booleans, numbers, and ordinary formulas", async () => {
    const workbook = minimalWorkbook(
      `${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t xml:space="preserve"> inline </t></is></c><c r="C1" t="b"><v>1</v></c></row><row r="2"><c r="A2"><v>-4.5</v></c><c r="B2"><f>A2*2</f><v>-9</v></c></row></sheetData></worksheet>`,
      { "xl/sharedStrings.xml": strToU8(`${declaration}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>`) },
    );
    const imported = await importSpreadsheetXlsx(workbook, () => "sheet_import");
    expect(imported.sheets[0].cells).toEqual({
      A1: { input: "Rich text" },
      B1: { input: " inline " },
      C1: { input: "TRUE" },
      A2: { input: "-4.5" },
      B2: { input: "=A2*2" },
    });
  });

  it("exports collision-safe Excel tab names and rewrites their cross-tab formulas transparently", async () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0] = { ...document.sheets[0], name: "Revenue/Forecast", cells: { A1: { input: "4" } } };
    document.sheets.push({ ...document.sheets[0], id: "sheet_second", name: "Revenue:Forecast", cells: { A1: { input: "='Revenue/Forecast'!A1*2" } } });
    const exported = exportSpreadsheetXlsxWithReport(document);
    expect(exported.renamedSheets).toEqual([
      { from: "Revenue/Forecast", to: "Revenue Forecast" },
      { from: "Revenue:Forecast", to: "Revenue Forecast (2)" },
    ]);
    const imported = await importSpreadsheetXlsx(exported.bytes, (index) => `sheet_${index}`);
    expect(imported.sheets.map((sheet) => sheet.name)).toEqual(["Revenue Forecast", "Revenue Forecast (2)"]);
    expect(imported.sheets[1].cells.A1.input).toBe("='Revenue Forecast'!A1*2");
    document.sheets[0].cells.B1 = { input: "unsafe\u0001text" };
    expect(() => exportSpreadsheetXlsx(document)).toThrow("XML control characters");
  });

  it("accepts package-root worksheet targets and discloses hidden sheet state", async () => {
    const files = unzipSync(minimalWorkbook(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>`));
    files["xl/workbook.xml"] = strToU8(`${declaration}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Imported" sheetId="1" state="hidden" r:id="rId1"/></sheets></workbook>`);
    files["xl/_rels/workbook.xml.rels"] = strToU8(`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="xl/worksheets/sheet1.xml"/></Relationships>`);
    const imported = await importSpreadsheetXlsx(zipSync(files, { level: 1 }), () => "sheet_import");
    expect(imported.sheets[0].cells.A1.input).toBe("7");
    expect(imported.omittedFeatureKinds).toContain("hidden sheet state");
  });

  it("adds reviewed workbook tabs atomically and rewrites only imported cross-sheet references after name collisions", () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0] = { ...document.sheets[0], name: "Data", cells: { A1: { input: "existing" } } };
    const imported: SpreadsheetSheet[] = [
      { id: "import_data", name: "Data", rowCount: 40, columnCount: 10, cells: { A1: { input: "2" }, B1: { input: "='Data (2)'!A1" } } },
      { id: "import_data_2", name: "Data (2)", rowCount: 40, columnCount: 10, cells: { A1: { input: "3" }, B1: { input: "=Data!A1" } } },
    ];
    const appended = appendSpreadsheetImportedSheets(document, imported);
    expect(appended.sheets.map((sheet) => sheet.name)).toEqual(["Data", "Data (2)", "Data (2) (2)"]);
    expect(appended.sheets[1].cells.B1.input).toBe("='Data (2) (2)'!A1");
    expect(appended.sheets[2].cells.B1.input).toBe("='Data (2)'!A1");
    expect(document.sheets).toHaveLength(1);
  });

  it("fails closed on shared formulas, out-of-bounds cells, macros, malformed XML, and oversized archives", async () => {
    const sharedFormula = minimalWorkbook(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f t="shared" si="0">1+1</f><v>2</v></c></row></sheetData></worksheet>`);
    await expect(importSpreadsheetXlsx(sharedFormula)).rejects.toThrow("unsupported shared formulas");
    const outside = minimalWorkbook(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="501"><c r="A501"><v>1</v></c></row></sheetData></worksheet>`);
    await expect(importSpreadsheetXlsx(outside)).rejects.toThrow("500-row or 100-column");
    const macro = minimalWorkbook(`${declaration}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`, { "xl/vbaProject.bin": new Uint8Array([1, 2, 3]) });
    await expect(importSpreadsheetXlsx(macro)).rejects.toThrow("Macro-enabled");
    const malformed = minimalWorkbook("<worksheet><sheetData>");
    await expect(importSpreadsheetXlsx(malformed)).rejects.toThrow("not valid workbook XML");
    await expect(importSpreadsheetXlsx(new Uint8Array(10_000_001))).rejects.toThrow("at most 10 MB");
  });
});
