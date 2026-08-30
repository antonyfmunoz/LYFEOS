import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createEmptySpreadsheetDocument } from "../shared/spreadsheets";
import { evaluateSpreadsheetCell } from "../client/src/lib/spreadsheetFormula";
import {
  exportSpreadsheetOds,
  importSpreadsheetOds,
  spreadsheetFormulaFromOds,
  spreadsheetFormulaToOds,
  spreadsheetOdsFileName,
} from "../client/src/lib/spreadsheetOds";

const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
const mime = "application/vnd.oasis.opendocument.spreadsheet";

function minimalOds(spreadsheetXml: string, extras: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    mimetype: [strToU8(mime), { level: 0 }],
    "content.xml": strToU8(`${declaration}<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:spreadsheet>${spreadsheetXml}</office:spreadsheet></office:body></office:document-content>`),
    "META-INF/manifest.xml": strToU8(`${declaration}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/></manifest:manifest>`),
    ...extras,
  }, { level: 1 });
}

describe("local ODS workbook transfer", () => {
  it("exports deterministic multi-sheet ODS and round-trips supported values and formulas", async () => {
    const document = createEmptySpreadsheetDocument();
    document.sheets[0] = {
      ...document.sheets[0],
      name: "Data & Inputs",
      cells: {
        A1: { input: "Revenue" },
        A2: { input: "12.5" },
        B2: { input: "TRUE" },
      },
    };
    document.sheets.push({
      ...document.sheets[0],
      id: "sheet_summary",
      name: "Summary",
      cells: {
        A1: { input: "='Data & Inputs'!A2*2" },
        A2: { input: "00123" },
        B2: { input: '=IF(A1>20,"yes","no")' },
      },
    });
    const first = exportSpreadsheetOds(document);
    const second = exportSpreadsheetOds(document);
    expect(first).toEqual(second);
    const files = unzipSync(first);
    expect(strFromU8(files.mimetype)).toBe(mime);
    expect(Object.keys(files).sort()).toEqual(["META-INF/manifest.xml", "content.xml", "mimetype"]);
    expect(strFromU8(files["content.xml"])).toContain("of:=[&apos;Data &amp; Inputs&apos;.A2]*2");

    const imported = await importSpreadsheetOds(first, (index) => `sheet_import_${index + 1}`);
    expect(imported).toMatchObject({ sourceSheetCount: 2, populatedCellCount: 6, formulaCount: 2, presentationImported: false });
    expect(imported.sheets.map((sheet) => sheet.name)).toEqual(["Data & Inputs", "Summary"]);
    expect(imported.sheets[0].cells).toMatchObject({ A1: { input: "Revenue" }, A2: { input: "12.5" }, B2: { input: "TRUE" } });
    expect(imported.sheets[1].cells).toMatchObject({
      A1: { input: "='Data & Inputs'!A2*2" },
      A2: { input: "00123" },
      B2: { input: '=IF(A1>20,"yes","no")' },
    });
    const roundTripped = { version: 1 as const, activeSheetId: imported.sheets[1].id, sheets: imported.sheets, charts: [] };
    expect(evaluateSpreadsheetCell(roundTripped, imported.sheets[1].id, "A1")).toBe("25");
    expect(evaluateSpreadsheetCell(roundTripped, imported.sheets[1].id, "B2")).toBe("yes");
    expect(spreadsheetOdsFileName(" 2026 Growth / Plan ")).toBe("2026-Growth-Plan.ods");
  });

  it("converts the governed formula subset between LyfeOS and OpenFormula", () => {
    expect(spreadsheetFormulaToOds("=SUM(A1:B2)")).toBe("of:=SUM([.A1:.B2])");
    expect(spreadsheetFormulaToOds("='Plan Q1'!$A$1+IF(B2>0,1,0)")).toBe("of:=['Plan Q1'.$A$1]+IF([.B2]>0;1;0)");
    expect(spreadsheetFormulaFromOds("of:=SUM([.A1:.B2])")).toBe("=SUM(A1:B2)");
    expect(spreadsheetFormulaFromOds("of:=['Plan Q1'.$A$1]+IF([.B2]>0;1;0)")).toBe("='Plan Q1'!$A$1+IF(B2>0,1,0)");
    expect(() => spreadsheetFormulaFromOds("of:=RAND()")).toThrow("outside LyfeOS's supported formula set");
    expect(() => spreadsheetFormulaFromOds("msoxl:=A1+1")).toThrow("formula dialect");
  });

  it("imports repeated cells without expanding empty archive padding and discloses omitted presentation", async () => {
    const bytes = minimalOds(`<office:automatic-styles><style:style xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" style:name="ce1" style:family="table-cell"/></office:automatic-styles><table:table table:name="Imported"><table:table-row><table:table-cell table:number-columns-repeated="2" office:value-type="float" office:value="4"><text:p>4</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row><table:table-row table:number-rows-repeated="1000"><table:table-cell/></table:table-row></table:table>`);
    const imported = await importSpreadsheetOds(bytes, () => "sheet_import");
    expect(imported.sheets[0].cells).toEqual({ A1: { input: "4" }, B1: { input: "4" } });
    expect(imported.sheets[0]).toMatchObject({ rowCount: 40, columnCount: 10 });
    expect(imported.omittedFeatureKinds).toContain("presentation formatting");
  });

  it("fails closed on unsafe archives, XML entities, unsupported formulas, and populated grid overflow", async () => {
    const wrongMime = zipSync({ mimetype: strToU8("application/zip"), "content.xml": strToU8("<x/>") });
    await expect(importSpreadsheetOds(wrongMime)).rejects.toThrow("not an OpenDocument spreadsheet");
    const entity = zipSync({ mimetype: strToU8(mime), "content.xml": strToU8(`${declaration}<!DOCTYPE x [<!ENTITY y "z">]><x>&y;</x>`) });
    await expect(importSpreadsheetOds(entity)).rejects.toThrow("disallowed XML declaration");
    const unsupported = minimalOds(`<table:table table:name="Imported"><table:table-row><table:table-cell table:formula="of:=RAND()" office:value-type="float" office:value="1"><text:p>1</text:p></table:table-cell></table:table-row></table:table>`);
    await expect(importSpreadsheetOds(unsupported)).rejects.toThrow("outside LyfeOS's supported formula set");
    const overflow = minimalOds(`<table:table table:name="Imported"><table:table-row><table:table-cell table:number-columns-repeated="101" office:value-type="float" office:value="1"><text:p>1</text:p></table:table-cell></table:table-row></table:table>`);
    await expect(importSpreadsheetOds(overflow)).rejects.toThrow("100-column");
    const merged = minimalOds(`<table:table table:name="Imported"><table:table-row><table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>merged</text:p></table:table-cell><table:covered-table-cell/></table:table-row></table:table>`);
    await expect(importSpreadsheetOds(merged)).rejects.toThrow("Unmerge them before importing");
    const groupedRows = minimalOds(`<table:table table:name="Imported"><table:table-row-group><table:table-row><table:table-cell office:value-type="string"><text:p>nested</text:p></table:table-cell></table:table-row></table:table-row-group></table:table>`);
    await expect(importSpreadsheetOds(groupedRows)).rejects.toThrow("Convert them to ordinary rows before importing");
    await expect(importSpreadsheetOds(new Uint8Array(10_000_001))).rejects.toThrow("at most 10 MB");
  });
});
