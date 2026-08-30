import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { SpreadsheetDocument, SpreadsheetSheet } from "@shared/spreadsheets";
import { rewriteSpreadsheetFormulaSheetNames, spreadsheetDocumentSchema, spreadsheetSheetSchema } from "@shared/spreadsheets";
import { columnLabel, parseCellAddress } from "./spreadsheetFormula";

const MAX_XLSX_BYTES = 10_000_000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 50_000_000;
const MAX_XLSX_FILES = 250;
const MAX_SHEETS = 20;
const MAX_ROWS = 500;
const MAX_COLUMNS = 100;
const MAX_POPULATED_CELLS = 5_000;
const MAX_CELL_INPUT_LENGTH = 10_000;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const FIXED_ZIP_TIME = new Date("2020-01-01T00:00:00.000Z");

type XmlNode = Record<string, unknown> & { $?: Record<string, string>; _?: string };

export type SpreadsheetXlsxImport = {
  sheets: SpreadsheetSheet[];
  sourceSheetCount: number;
  populatedCellCount: number;
  formulaCount: number;
  presentationImported: false;
  omittedFeatureKinds: string[];
};

function localName(name: string): string {
  return name.split(":").at(-1) || name;
}

function childArray(node: unknown, name: string): XmlNode[] {
  if (!node || typeof node !== "object") return [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (localName(key) === name && Array.isArray(value)) return value as XmlNode[];
  }
  return [];
}

function firstChild(node: unknown, name: string): XmlNode | undefined {
  return childArray(node, name)[0];
}

function rootNode(parsed: unknown, name: string): XmlNode | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (localName(key) !== name) continue;
    if (Array.isArray(value)) return value[0] as XmlNode | undefined;
    if (value && typeof value === "object") return value as XmlNode;
  }
  return undefined;
}

function nodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const record = node as XmlNode;
  if (typeof record._ === "string") return record._;
  return Object.entries(record)
    .filter(([key]) => key !== "$")
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .map(nodeText)
    .join("");
}

function xmlEscape(value: string): string {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error("Workbook export cannot include XML control characters.");
  }
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function parseXml(bytes: Uint8Array, label: string): Promise<unknown> {
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${label} contains a disallowed XML declaration.`);
  try {
    if (XMLValidator.validate(xml) !== true) throw new Error("invalid XML");
    return new XMLParser({
      ignoreAttributes: false,
      attributesGroupName: "$",
      attributeNamePrefix: "",
      textNodeName: "_",
      trimValues: false,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: true,
      ignoreDeclaration: true,
      isArray: (_tagName, _path, _isLeafNode, isAttribute) => !isAttribute,
    }).parse(xml);
  } catch {
    throw new Error(`${label} is not valid workbook XML.`);
  }
}

function normalizeWorkbookTarget(target: string): string {
  const normalized = target.replaceAll("\\", "/");
  if (!normalized || normalized.includes("..") || normalized.includes("\0") || /^[a-z]+:/i.test(normalized)) {
    throw new Error("The workbook contains an unsafe worksheet relationship.");
  }
  const relative = normalized.startsWith("/") ? normalized.slice(1) : normalized.replace(/^\.\//, "");
  return relative.startsWith("xl/") ? relative : `xl/${relative}`;
}

function workbookSheetId(index: number, createId?: (index: number) => string): string {
  return createId?.(index) || `sheet_xlsx_${index + 1}_${Math.random().toString(36).slice(2, 10)}`;
}

function requireCellAddress(address: string): { row: number; column: number; normalized: string } {
  const normalized = address.replaceAll("$", "").toUpperCase();
  const parsed = parseCellAddress(normalized);
  if (!parsed) throw new Error(`Workbook cell ${address || "(missing)"} has an invalid address.`);
  if (parsed.row >= MAX_ROWS || parsed.column >= MAX_COLUMNS) {
    throw new Error("The workbook exceeds LyfeOS's 500-row or 100-column sheet boundary.");
  }
  return { ...parsed, normalized };
}

function compatibleCellInput(cell: XmlNode, sharedStrings: string[]): { input: string; formula: boolean } | null {
  const formulaNode = firstChild(cell, "f");
  if (formulaNode) {
    const formulaKind = formulaNode.$?.t;
    if (formulaKind && formulaKind !== "normal") {
      throw new Error(`The workbook uses unsupported ${formulaKind} formulas. Convert them to ordinary cell formulas before importing.`);
    }
    const formula = nodeText(formulaNode);
    if (!formula) throw new Error("The workbook contains a formula without an importable expression.");
    const input = `=${formula}`;
    if (input.length > MAX_CELL_INPUT_LENGTH) throw new Error("A workbook formula exceeds 10,000 characters.");
    return { input, formula: true };
  }

  const type = cell.$?.t || "n";
  let input = "";
  if (type === "inlineStr") input = nodeText(firstChild(cell, "is"));
  else {
    const value = nodeText(firstChild(cell, "v"));
    if (type === "s") {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) throw new Error("The workbook contains an invalid shared-string reference.");
      input = sharedStrings[index];
    } else if (type === "b") {
      if (value !== "0" && value !== "1") throw new Error("The workbook contains an invalid boolean cell.");
      input = value === "1" ? "TRUE" : "FALSE";
    } else if (["n", "str", "e", "d"].includes(type)) input = value;
    else throw new Error(`The workbook contains unsupported cell type ${type}.`);
  }
  if (!input) return null;
  if (input.length > MAX_CELL_INPUT_LENGTH) throw new Error("A workbook cell exceeds 10,000 characters.");
  return { input, formula: false };
}

function importedSheetName(name: string, index: number): string {
  const trimmed = name.trim();
  if (!trimmed) return `Imported ${index + 1}`;
  return trimmed.slice(0, 80);
}

export async function importSpreadsheetXlsx(bytes: Uint8Array, createId?: (index: number) => string): Promise<SpreadsheetXlsxImport> {
  if (!bytes.length || bytes.length > MAX_XLSX_BYTES) throw new Error("XLSX files can be at most 10 MB.");
  let uncompressedBytes = 0;
  let fileCount = 0;
  const observedKinds = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        fileCount += 1;
        if (fileCount > MAX_XLSX_FILES) throw new Error("The workbook contains too many archive entries.");
        uncompressedBytes += file.originalSize;
        if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) throw new Error("The expanded workbook exceeds the 50 MB safety boundary.");
        const name = file.name.replaceAll("\\", "/");
        if (name.includes("../") || name.startsWith("/")) throw new Error("The workbook contains an unsafe archive path.");
        if (/^xl\/charts\//i.test(name)) observedKinds.add("charts");
        if (/^xl\/(drawings|media)\//i.test(name)) observedKinds.add("drawings or media");
        if (/^xl\/(pivot|pivotTables|pivotCache)\//i.test(name)) observedKinds.add("pivot tables");
        if (/^xl\/externalLinks\//i.test(name)) observedKinds.add("external links");
        if (/vbaProject\.bin$/i.test(name)) throw new Error("Macro-enabled workbook content is not accepted.");
        return name === "xl/workbook.xml"
          || name === "xl/_rels/workbook.xml.rels"
          || name === "xl/sharedStrings.xml"
          || /^xl\/worksheets\/[^/]+\.xml$/i.test(name);
      },
    });
  } catch (error) {
    if (error instanceof Error && /workbook|archive|XLSX|Macro/i.test(error.message)) throw error;
    throw new Error("The selected file is not a readable XLSX workbook.");
  }

  const workbookBytes = files["xl/workbook.xml"];
  const relationshipBytes = files["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !relationshipBytes) throw new Error("The XLSX workbook is missing its sheet index.");
  const [workbookXml, relationshipsXml, sharedStringsXml] = await Promise.all([
    parseXml(workbookBytes, "Workbook index"),
    parseXml(relationshipBytes, "Workbook relationships"),
    files["xl/sharedStrings.xml"] ? parseXml(files["xl/sharedStrings.xml"], "Shared strings") : Promise.resolve(null),
  ]);

  const workbook = rootNode(workbookXml, "workbook");
  const sheetsNode = firstChild(workbook, "sheets");
  const sheetEntries = childArray(sheetsNode, "sheet");
  if (!sheetEntries.length) throw new Error("The workbook does not contain any sheets.");
  if (sheetEntries.length > MAX_SHEETS) throw new Error("A LyfeOS spreadsheet can contain at most 20 sheets.");

  const relationships = rootNode(relationshipsXml, "Relationships");
  const relationshipTargets = new Map<string, string>();
  for (const relationship of childArray(relationships, "Relationship")) {
    const id = relationship.$?.Id;
    const target = relationship.$?.Target;
    const type = relationship.$?.Type || "";
    if (id && target && type.endsWith("/worksheet")) relationshipTargets.set(id, normalizeWorkbookTarget(target));
  }

  const sharedStringsRoot = sharedStringsXml ? rootNode(sharedStringsXml, "sst") : undefined;
  const sharedStrings = childArray(sharedStringsRoot, "si").map(nodeText);
  if (sharedStrings.some((value) => value.length > MAX_CELL_INPUT_LENGTH)) throw new Error("A workbook shared string exceeds 10,000 characters.");

  const names = new Set<string>();
  const sheets: SpreadsheetSheet[] = [];
  let populatedCellCount = 0;
  let formulaCount = 0;
  for (let index = 0; index < sheetEntries.length; index += 1) {
    const entry = sheetEntries[index];
    if (entry.$?.state && entry.$.state !== "visible") observedKinds.add("hidden sheet state");
    const name = importedSheetName(entry.$?.name || "", index);
    const normalizedName = name.toLocaleLowerCase();
    if (names.has(normalizedName)) throw new Error("The workbook contains duplicate sheet names.");
    names.add(normalizedName);
    const relationshipId = entry.$?.["r:id"] || Object.entries(entry.$ || {}).find(([key]) => localName(key) === "id")?.[1];
    const target = relationshipId ? relationshipTargets.get(relationshipId) : undefined;
    const worksheetBytes = target ? files[target] : undefined;
    if (!worksheetBytes) throw new Error(`Workbook sheet ${name} is missing its worksheet data.`);
    const worksheetXml = await parseXml(worksheetBytes, `Worksheet ${name}`);
    const worksheet = rootNode(worksheetXml, "worksheet");
    const sheetData = firstChild(worksheet, "sheetData");
    const cells: SpreadsheetSheet["cells"] = {};
    let populatedSheetCellCount = 0;
    let maxRow = 0;
    let maxColumn = 0;
    for (const row of childArray(sheetData, "row")) {
      for (const cell of childArray(row, "c")) {
        const position = requireCellAddress(cell.$?.r || "");
        const converted = compatibleCellInput(cell, sharedStrings);
        if (!converted) continue;
        if (populatedSheetCellCount >= MAX_POPULATED_CELLS) throw new Error(`Workbook sheet ${name} exceeds 5,000 populated cells.`);
        cells[position.normalized] = { input: converted.input };
        populatedSheetCellCount += 1;
        maxRow = Math.max(maxRow, position.row + 1);
        maxColumn = Math.max(maxColumn, position.column + 1);
        populatedCellCount += 1;
        if (converted.formula) formulaCount += 1;
      }
    }
    sheets.push(spreadsheetSheetSchema.parse({
      id: workbookSheetId(index, createId),
      name,
      rowCount: Math.max(40, maxRow || 1),
      columnCount: Math.max(10, maxColumn || 1),
      cells,
    }));
  }

  return {
    sheets,
    sourceSheetCount: sheets.length,
    populatedCellCount,
    formulaCount,
    presentationImported: false,
    omittedFeatureKinds: Array.from(observedKinds).sort(),
  };
}

const strictNumericInput = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const colorArgb: Record<string, string> = {
  red: "FFB91C1C",
  amber: "FFB45309",
  green: "FF047857",
  blue: "FF0369A1",
  purple: "FF6D28D9",
};

function cellXml(address: string, cell: SpreadsheetSheet["cells"][string], styleId: number): string {
  const style = styleId ? ` s="${styleId}"` : "";
  const input = cell.input;
  if (input.startsWith("=")) return `<c r="${address}"${style}><f>${xmlEscape(input.slice(1))}</f></c>`;
  if (input === "TRUE" || input === "FALSE") return `<c r="${address}" t="b"${style}><v>${input === "TRUE" ? "1" : "0"}</v></c>`;
  if (strictNumericInput.test(input) && Number.isFinite(Number(input))) return `<c r="${address}"${style}><v>${xmlEscape(input)}</v></c>`;
  return `<c r="${address}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(input)}</t></is></c>`;
}

function formatKey(cell: SpreadsheetSheet["cells"][string]): string {
  const format = cell.format;
  return format ? JSON.stringify({
    bold: Boolean(format.bold),
    italic: Boolean(format.italic),
    align: format.align || "left",
    numberFormat: format.numberFormat || "automatic",
    textColor: format.textColor || "none",
    backgroundColor: format.backgroundColor || "none",
  }) : "";
}

function workbookStyles(document: SpreadsheetDocument): { xml: string; styleIds: Map<string, number> } {
  const keys = Array.from(new Set(document.sheets.flatMap((sheet) => Object.values(sheet.cells).map(formatKey)).filter(Boolean)));
  const styleIds = new Map(keys.map((key, index) => [key, index + 1]));
  const fonts = [`<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>`];
  const fills = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`];
  const fontIds = new Map<string, number>();
  const fillIds = new Map<string, number>();
  const xfs = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];
  for (const key of keys) {
    const format = JSON.parse(key) as { bold: boolean; italic: boolean; align: string; numberFormat: string; textColor: string; backgroundColor: string };
    const fontKey = `${format.bold}:${format.italic}:${format.textColor}`;
    if (!fontIds.has(fontKey)) {
      const id = fonts.length;
      fontIds.set(fontKey, id);
      fonts.push(`<font>${format.bold ? "<b/>" : ""}${format.italic ? "<i/>" : ""}<sz val="11"/>${format.textColor !== "none" ? `<color rgb="${colorArgb[format.textColor]}"/>` : ""}<name val="Calibri"/><family val="2"/></font>`);
    }
    const fillKey = format.backgroundColor;
    if (!fillIds.has(fillKey)) {
      const id = format.backgroundColor === "none" ? 0 : fills.length;
      fillIds.set(fillKey, id);
      if (format.backgroundColor !== "none") fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${colorArgb[format.backgroundColor]}"/><bgColor indexed="64"/></patternFill></fill>`);
    }
    const numFmtId = format.numberFormat === "percent" ? 165 : format.numberFormat === "currency_usd" ? 166 : format.numberFormat === "decimal" ? 164 : 0;
    const alignment = format.align !== "left" ? `<alignment horizontal="${format.align}"/>` : "";
    xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontIds.get(fontKey)}" fillId="${fillIds.get(fillKey)}" borderId="0" xfId="0"${alignment ? " applyAlignment=\"1\"" : ""}${numFmtId ? " applyNumberFormat=\"1\"" : ""}${format.bold || format.italic || format.textColor !== "none" ? " applyFont=\"1\"" : ""}${format.backgroundColor !== "none" ? " applyFill=\"1\"" : ""}>${alignment}</xf>`);
  }
  return {
    styleIds,
    xml: `${XML_DECLARATION}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
}

function worksheetXml(sheet: SpreadsheetSheet, styleIds: Map<string, number>): string {
  const rows = new Map<number, Array<{ address: string; cell: SpreadsheetSheet["cells"][string] }>>();
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const parsed = parseCellAddress(address);
    if (!parsed) continue;
    const row = rows.get(parsed.row + 1) || [];
    row.push({ address, cell });
    rows.set(parsed.row + 1, row);
  }
  const rowXml = Array.from(rows.entries()).sort(([a], [b]) => a - b).map(([rowNumber, cells]) => {
    const sorted = cells.sort((a, b) => (parseCellAddress(a.address)?.column || 0) - (parseCellAddress(b.address)?.column || 0));
    return `<row r="${rowNumber}">${sorted.map(({ address, cell }) => cellXml(address, cell, styleIds.get(formatKey(cell)) || 0)).join("")}</row>`;
  }).join("");
  const dimension = `A1:${columnLabel(sheet.columnCount - 1)}${sheet.rowCount}`;
  return `${XML_DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rowXml}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

function excelSheetNames(document: SpreadsheetDocument): { document: SpreadsheetDocument; renamedSheets: Array<{ from: string; to: string }> } {
  const used = new Set<string>();
  const renames = new Map<string, string>();
  const renamedSheets: Array<{ from: string; to: string }> = [];
  const names = document.sheets.map((sheet, index) => {
    const safeCharacters = sheet.name.replace(/[\\/?*\[\]:\u0000-\u001F]/g, " ").replace(/^'+|'+$/g, "").trim();
    const base = Array.from(safeCharacters || `Sheet ${index + 1}`).slice(0, 31).join("");
    let candidate = base;
    if (used.has(candidate.toLocaleLowerCase())) {
      for (let suffixIndex = 2; suffixIndex <= 20; suffixIndex += 1) {
        const suffix = ` (${suffixIndex})`;
        const prefix = Array.from(base).slice(0, 31 - suffix.length).join("").trimEnd();
        const next = `${prefix}${suffix}`;
        if (!used.has(next.toLocaleLowerCase())) {
          candidate = next;
          break;
        }
      }
    }
    if (used.has(candidate.toLocaleLowerCase())) throw new Error("No unique Excel-compatible sheet name is available.");
    used.add(candidate.toLocaleLowerCase());
    if (candidate !== sheet.name) {
      renames.set(sheet.name.toLocaleLowerCase(), candidate);
      renamedSheets.push({ from: sheet.name, to: candidate });
    }
    return candidate;
  });
  if (!renames.size) return { document, renamedSheets };
  return {
    renamedSheets,
    document: spreadsheetDocumentSchema.parse({
      ...document,
      sheets: document.sheets.map((sheet, index) => ({
        ...sheet,
        name: names[index],
        cells: Object.fromEntries(Object.entries(sheet.cells).map(([address, cell]) => [address, {
          ...cell,
          input: rewriteSpreadsheetFormulaSheetNames(cell.input, renames),
        }])),
      })),
    }),
  };
}

export function exportSpreadsheetXlsxWithReport(input: SpreadsheetDocument): { bytes: Uint8Array; renamedSheets: Array<{ from: string; to: string }> } {
  const prepared = excelSheetNames(spreadsheetDocumentSchema.parse(input));
  const document = prepared.document;
  const { xml: stylesXml, styleIds } = workbookStyles(document);
  const workbookSheets = document.sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbookRelationships = document.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const styleRelationshipId = document.sheets.length + 1;
  const sheetOverrides = document.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const files: Zippable = {
    "[Content_Types].xml": [strToU8(`${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`), { level: 6, mtime: FIXED_ZIP_TIME }],
    "_rels/.rels": [strToU8(`${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`), { level: 6, mtime: FIXED_ZIP_TIME }],
    "xl/workbook.xml": [strToU8(`${XML_DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`), { level: 6, mtime: FIXED_ZIP_TIME }],
    "xl/_rels/workbook.xml.rels": [strToU8(`${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${styleRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`), { level: 6, mtime: FIXED_ZIP_TIME }],
    "xl/styles.xml": [strToU8(stylesXml), { level: 6, mtime: FIXED_ZIP_TIME }],
  };
  document.sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = [strToU8(worksheetXml(sheet, styleIds)), { level: 6, mtime: FIXED_ZIP_TIME }];
  });
  return { bytes: zipSync(files), renamedSheets: prepared.renamedSheets };
}

export function exportSpreadsheetXlsx(input: SpreadsheetDocument): Uint8Array {
  return exportSpreadsheetXlsxWithReport(input).bytes;
}

export function spreadsheetXlsxFileName(title: string): string {
  return `${title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "lyfeos-sheet"}.xlsx`;
}
