import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { SpreadsheetDocument, SpreadsheetSheet } from "@shared/spreadsheets";
import {
  parseSpreadsheetSheetQualifier,
  quoteSpreadsheetSheetName,
  spreadsheetDocumentSchema,
  spreadsheetSheetSchema,
} from "@shared/spreadsheets";
import {
  columnLabel,
  evaluateSpreadsheetCell,
  isSupportedSpreadsheetFormula,
  parseCellAddress,
} from "./spreadsheetFormula";

const ODS_MIME = "application/vnd.oasis.opendocument.spreadsheet";
const MAX_ODS_BYTES = 10_000_000;
const MAX_ODS_UNCOMPRESSED_BYTES = 50_000_000;
const MAX_ODS_FILES = 250;
const MAX_SHEETS = 20;
const MAX_ROWS = 500;
const MAX_COLUMNS = 100;
const MAX_POPULATED_CELLS = 5_000;
const MAX_CELL_INPUT_LENGTH = 10_000;
const MAX_REPEAT = 1_048_576;
const FIXED_ZIP_TIME = new Date("2020-01-01T00:00:00.000Z");
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

type XmlNode = Record<string, unknown> & { $?: Record<string, string>; _?: string };

export type SpreadsheetOdsImport = {
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

function attribute(node: XmlNode | undefined, name: string): string | undefined {
  for (const [key, value] of Object.entries(node?.$ || {})) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

function repeatedCount(node: XmlNode, name: string): number {
  const raw = attribute(node, name);
  if (raw === undefined) return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_REPEAT) {
    throw new Error("The ODS workbook contains an invalid repeated row or column count.");
  }
  return value;
}

function nodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const record = node as XmlNode;
  let text = typeof record._ === "string" ? record._ : "";
  for (const [key, value] of Object.entries(record)) {
    if (key === "$" || key === "_") continue;
    const values = Array.isArray(value) ? value : [value];
    if (localName(key) === "s") {
      for (const entry of values) text += " ".repeat(Math.min(1000, repeatedCount(entry as XmlNode, "c")));
    } else if (localName(key) === "tab") text += "\t".repeat(values.length);
    else if (localName(key) === "line-break") text += "\n".repeat(values.length);
    else for (const entry of values) text += nodeText(entry);
  }
  return text;
}

function cellText(cell: XmlNode): string {
  return childArray(cell, "p").map(nodeText).join("\n");
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
    throw new Error(`${label} is not valid OpenDocument XML.`);
  }
}

function workbookSheetId(index: number, createId?: (index: number) => string): string {
  return createId?.(index) || `sheet_ods_${index + 1}_${Math.random().toString(36).slice(2, 10)}`;
}

function importedSheetName(name: string, index: number): string {
  const trimmed = name.trim();
  return (trimmed || `Imported ${index + 1}`).slice(0, 80);
}

function odsQuotedSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function internalReferenceAt(formula: string, position: number): { text: string; length: number } | null {
  const previous = position > 0 ? formula[position - 1] : "";
  if (/[A-Za-z0-9_.$]/.test(previous)) return null;
  const qualifier = parseSpreadsheetSheetQualifier(formula.slice(position));
  const offset = qualifier?.length || 0;
  const first = /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,3}(?![A-Za-z0-9_$])/.exec(formula.slice(position + offset));
  if (!first || !parseCellAddress(first[0])) return null;
  const firstSheet = qualifier?.sheetName;
  const firstOds = firstSheet ? `${odsQuotedSheetName(firstSheet)}.${first[0].toUpperCase()}` : `.${first[0].toUpperCase()}`;
  let length = offset + first[0].length;
  const separator = /^(\s*:\s*)/.exec(formula.slice(position + length));
  if (!separator) return { text: `[${firstOds}]`, length };
  const secondPosition = position + length + separator[0].length;
  const secondQualifier = parseSpreadsheetSheetQualifier(formula.slice(secondPosition));
  const secondOffset = secondQualifier?.length || 0;
  const second = /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,3}(?![A-Za-z0-9_$])/.exec(formula.slice(secondPosition + secondOffset));
  if (!second || !parseCellAddress(second[0])) return { text: `[${firstOds}]`, length };
  const secondSheet = secondQualifier?.sheetName || firstSheet;
  if (firstSheet && secondSheet?.toLocaleLowerCase() !== firstSheet.toLocaleLowerCase()) {
    throw new Error("ODS export does not support ranges across different sheet tabs.");
  }
  if (!firstSheet && secondQualifier) throw new Error("ODS export does not support a range whose sheet qualifier starts at its end.");
  const secondOds = secondSheet ? `${odsQuotedSheetName(secondSheet)}.${second[0].toUpperCase()}` : `.${second[0].toUpperCase()}`;
  length += separator[0].length + secondOffset + second[0].length;
  return { text: `[${firstOds}:${secondOds}]`, length };
}

export function spreadsheetFormulaToOds(input: string): string {
  if (!isSupportedSpreadsheetFormula(input)) throw new Error("Only supported LyfeOS formulas can be exported to ODS.");
  const formula = input.slice(1);
  let output = "of:=";
  let position = 0;
  let insideString = false;
  while (position < formula.length) {
    if (formula[position] === '"') {
      output += '"';
      if (insideString && formula[position + 1] === '"') {
        output += '"';
        position += 2;
        continue;
      }
      insideString = !insideString;
      position += 1;
      continue;
    }
    const reference = insideString ? null : internalReferenceAt(formula, position);
    if (reference) {
      output += reference.text;
      position += reference.length;
      continue;
    }
    output += !insideString && formula[position] === "," ? ";" : formula[position];
    position += 1;
  }
  return output;
}

function closingBracket(formula: string, start: number): number {
  let insideQuote = false;
  for (let position = start + 1; position < formula.length; position += 1) {
    if (formula[position] === "'") {
      if (insideQuote && formula[position + 1] === "'") position += 1;
      else insideQuote = !insideQuote;
    } else if (formula[position] === "]" && !insideQuote) return position;
  }
  return -1;
}

function splitOdsRange(reference: string): string[] {
  let insideQuote = false;
  for (let position = 0; position < reference.length; position += 1) {
    if (reference[position] === "'") {
      if (insideQuote && reference[position + 1] === "'") position += 1;
      else insideQuote = !insideQuote;
    } else if (reference[position] === ":" && !insideQuote) return [reference.slice(0, position), reference.slice(position + 1)];
  }
  return [reference];
}

function odsReferenceSide(value: string): { sheetName?: string; address: string } {
  const trimmed = value.trim();
  let sheetName: string | undefined;
  let address = trimmed;
  if (trimmed.startsWith(".")) address = trimmed.slice(1);
  else if (trimmed.startsWith("'")) {
    let name = "";
    let cursor = 1;
    let closed = false;
    while (cursor < trimmed.length) {
      if (trimmed[cursor] !== "'") name += trimmed[cursor++];
      else if (trimmed[cursor + 1] === "'") { name += "'"; cursor += 2; }
      else { cursor += 1; closed = true; break; }
    }
    if (!closed || trimmed[cursor] !== ".") throw new Error("The ODS workbook contains an unsupported sheet reference.");
    sheetName = name;
    address = trimmed.slice(cursor + 1);
  } else {
    const unquoted = /^\$?([A-Za-z_][A-Za-z0-9_.]{0,79})\.(.+)$/.exec(trimmed);
    if (!unquoted) throw new Error("The ODS workbook contains an unsupported cell reference.");
    sheetName = unquoted[1];
    address = unquoted[2];
  }
  const normalized = address.toUpperCase();
  if (!parseCellAddress(normalized)) throw new Error("The ODS workbook contains a cell reference outside the supported grid.");
  return { ...(sheetName ? { sheetName } : {}), address: normalized };
}

function odsBracketReference(value: string): string {
  const parts = splitOdsRange(value);
  if (parts.length > 2) throw new Error("The ODS workbook contains an unsupported range reference.");
  const first = odsReferenceSide(parts[0]);
  const firstText = first.sheetName ? `${quoteSpreadsheetSheetName(first.sheetName)}!${first.address}` : first.address;
  if (parts.length === 1) return firstText;
  const second = odsReferenceSide(parts[1]);
  if (first.sheetName && second.sheetName && first.sheetName.toLocaleLowerCase() !== second.sheetName.toLocaleLowerCase()) {
    throw new Error("The ODS workbook contains a range across different sheet tabs.");
  }
  if (!first.sheetName && second.sheetName) throw new Error("The ODS workbook contains an unsupported range qualifier.");
  return `${firstText}:${second.address}`;
}

export function spreadsheetFormulaFromOds(input: string): string {
  const prefix = input.startsWith("of:=") ? "of:=" : input.startsWith("oooc:=") ? "oooc:=" : null;
  if (!prefix) throw new Error("The ODS workbook contains a formula dialect LyfeOS does not support.");
  const formula = input.slice(prefix.length);
  let output = "=";
  let position = 0;
  let insideString = false;
  while (position < formula.length) {
    if (formula[position] === '"') {
      output += '"';
      if (insideString && formula[position + 1] === '"') {
        output += '"';
        position += 2;
        continue;
      }
      insideString = !insideString;
      position += 1;
      continue;
    }
    if (!insideString && formula[position] === "[") {
      const end = closingBracket(formula, position);
      if (end < 0) throw new Error("The ODS workbook contains an incomplete cell reference.");
      output += odsBracketReference(formula.slice(position + 1, end));
      position = end + 1;
      continue;
    }
    output += !insideString && formula[position] === ";" ? "," : formula[position];
    position += 1;
  }
  if (!isSupportedSpreadsheetFormula(output)) {
    throw new Error("The ODS workbook uses a formula outside LyfeOS's supported formula set. Convert that formula to a value before importing.");
  }
  return output;
}

function cellInput(cell: XmlNode): { input: string; formula: boolean } | null {
  const formula = attribute(cell, "formula");
  if (formula) return { input: spreadsheetFormulaFromOds(formula), formula: true };
  const valueType = attribute(cell, "value-type");
  let input = "";
  if (valueType === "boolean") {
    const value = attribute(cell, "boolean-value");
    if (value !== "true" && value !== "false") throw new Error("The ODS workbook contains an invalid boolean value.");
    input = value === "true" ? "TRUE" : "FALSE";
  } else if (["float", "percentage", "currency"].includes(valueType || "")) {
    input = attribute(cell, "value") || "";
    if (!input || !Number.isFinite(Number(input))) throw new Error("The ODS workbook contains an invalid numeric value.");
  } else if (valueType === "date") input = attribute(cell, "date-value") || cellText(cell);
  else if (valueType === "time") input = attribute(cell, "time-value") || cellText(cell);
  else if (!valueType || valueType === "string") input = attribute(cell, "string-value") ?? cellText(cell);
  else throw new Error(`The ODS workbook contains unsupported cell type ${valueType}.`);
  if (!input) return null;
  if (input.length > MAX_CELL_INPUT_LENGTH) throw new Error("An ODS cell exceeds 10,000 characters.");
  return { input, formula: false };
}

function cellHasContent(cell: XmlNode): boolean {
  return Boolean(attribute(cell, "formula") || attribute(cell, "value-type") || attribute(cell, "value") || attribute(cell, "string-value") || cellText(cell));
}

function observeOmittedFeatures(content: string, observed: Set<string>): void {
  if (/<(?:[^:>]+:)?(?:frame|image|object|shapes)\b/i.test(content)) observed.add("drawings or media");
  if (/<(?:[^:>]+:)?(?:chart)\b/i.test(content)) observed.add("charts");
  if (/<(?:[^:>]+:)?(?:annotation)\b/i.test(content)) observed.add("comments");
  if (/<(?:[^:>]+:)?(?:named-expressions|named-range)\b/i.test(content)) observed.add("named ranges");
  if (/<(?:[^:>]+:)?(?:content-validations|content-validation)\b/i.test(content)) observed.add("validation");
  if (/<(?:[^:>]+:)?(?:database-ranges|data-pilot-tables)\b/i.test(content)) observed.add("filters or pivot tables");
  if (/<(?:[^:>]+:)?automatic-styles\b/i.test(content)) observed.add("presentation formatting");
  if (/office:value-type="(?:date|time)"/i.test(content)) observed.add("date or time display semantics");
  if (/office:value-type="(?:percentage|currency)"/i.test(content)) observed.add("percentage or currency display semantics");
}

export async function importSpreadsheetOds(bytes: Uint8Array, createId?: (index: number) => string): Promise<SpreadsheetOdsImport> {
  if (!bytes.length || bytes.length > MAX_ODS_BYTES) throw new Error("ODS files can be at most 10 MB.");
  let uncompressedBytes = 0;
  let fileCount = 0;
  const observedKinds = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        fileCount += 1;
        if (fileCount > MAX_ODS_FILES) throw new Error("The ODS workbook contains too many archive entries.");
        uncompressedBytes += file.originalSize;
        if (uncompressedBytes > MAX_ODS_UNCOMPRESSED_BYTES) throw new Error("The expanded ODS workbook exceeds the 50 MB safety boundary.");
        const name = file.name.replaceAll("\\", "/");
        if (name.includes("../") || name.startsWith("/")) throw new Error("The ODS workbook contains an unsafe archive path.");
        if (/^(Pictures|ObjectReplacements|Thumbnails)\//i.test(name)) observedKinds.add("drawings or media");
        return name === "mimetype" || name === "content.xml" || name === "META-INF/manifest.xml";
      },
    });
  } catch (error) {
    if (error instanceof Error && /ODS|archive|workbook/i.test(error.message)) throw error;
    throw new Error("The selected file is not a readable ODS workbook.");
  }
  const mimetype = files.mimetype ? strFromU8(files.mimetype).trim() : "";
  if (mimetype !== ODS_MIME) throw new Error("The selected archive is not an OpenDocument spreadsheet.");
  const contentBytes = files["content.xml"];
  if (!contentBytes) throw new Error("The ODS workbook is missing content.xml.");
  const contentText = strFromU8(contentBytes);
  if (/<(?:[^:>]+:)?covered-table-cell\b|(?:table:)?number-(?:columns|rows)-spanned=/i.test(contentText)) {
    throw new Error("The ODS workbook contains merged cells. Unmerge them before importing so cell positions remain exact.");
  }
  if (/<(?:[^:>]+:)?(?:table-row-group|table-header-rows)\b/i.test(contentText)) {
    throw new Error("The ODS workbook contains grouped or header rows that LyfeOS cannot position safely. Convert them to ordinary rows before importing.");
  }
  observeOmittedFeatures(contentText, observedKinds);
  const parsed = await parseXml(contentBytes, "ODS content");
  const documentRoot = rootNode(parsed, "document-content");
  const spreadsheet = firstChild(firstChild(documentRoot, "body"), "spreadsheet");
  const tableNodes = childArray(spreadsheet, "table");
  if (!tableNodes.length) throw new Error("The ODS workbook does not contain any sheets.");
  if (tableNodes.length > MAX_SHEETS) throw new Error("A LyfeOS spreadsheet can contain at most 20 sheets.");

  const names = new Set<string>();
  const sheets: SpreadsheetSheet[] = [];
  let populatedCellCount = 0;
  let formulaCount = 0;
  for (let sheetIndex = 0; sheetIndex < tableNodes.length; sheetIndex += 1) {
    const table = tableNodes[sheetIndex];
    const name = importedSheetName(attribute(table, "name") || "", sheetIndex);
    const normalizedName = name.toLocaleLowerCase();
    if (names.has(normalizedName)) throw new Error("The ODS workbook contains duplicate sheet names.");
    names.add(normalizedName);
    if (attribute(table, "display") === "false" || attribute(table, "visibility") === "collapse") observedKinds.add("hidden sheet state");
    const cells: SpreadsheetSheet["cells"] = {};
    let populatedSheetCellCount = 0;
    let rowIndex = 0;
    let maxRow = 0;
    let maxColumn = 0;
    for (const row of childArray(table, "table-row")) {
      const rowRepeat = repeatedCount(row, "number-rows-repeated");
      const entries = Object.entries(row)
        .filter(([key]) => ["table-cell", "covered-table-cell"].includes(localName(key)))
        .flatMap(([key, value]) => Array.isArray(value)
          ? (value as XmlNode[]).map((cell) => ({ cell, covered: localName(key) === "covered-table-cell" }))
          : []);
      const rowHasContent = entries.some(({ cell, covered }) => !covered && cellHasContent(cell));
      if (rowHasContent && rowIndex + rowRepeat > MAX_ROWS) throw new Error("The ODS workbook exceeds LyfeOS's 500-row sheet boundary.");
      if (!rowHasContent) {
        rowIndex += rowRepeat;
        continue;
      }
      for (let rowCopy = 0; rowCopy < rowRepeat; rowCopy += 1) {
        let columnIndex = 0;
        for (const { cell, covered } of entries) {
          const columnRepeat = repeatedCount(cell, "number-columns-repeated");
          const converted = !covered && cellHasContent(cell) ? cellInput(cell) : null;
          if (converted && columnIndex + columnRepeat > MAX_COLUMNS) throw new Error("The ODS workbook exceeds LyfeOS's 100-column sheet boundary.");
          if (converted && populatedSheetCellCount + columnRepeat > MAX_POPULATED_CELLS) throw new Error(`ODS sheet ${name} exceeds 5,000 populated cells.`);
          if (converted) {
            for (let columnCopy = 0; columnCopy < columnRepeat; columnCopy += 1) {
              const address = `${columnLabel(columnIndex + columnCopy)}${rowIndex + rowCopy + 1}`;
              cells[address] = { input: converted.input };
              populatedSheetCellCount += 1;
              populatedCellCount += 1;
              if (converted.formula) formulaCount += 1;
              maxRow = Math.max(maxRow, rowIndex + rowCopy + 1);
              maxColumn = Math.max(maxColumn, columnIndex + columnCopy + 1);
            }
          }
          columnIndex += columnRepeat;
        }
      }
      rowIndex += rowRepeat;
    }
    sheets.push(spreadsheetSheetSchema.parse({
      id: workbookSheetId(sheetIndex, createId),
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

function odsValueAttributes(value: string): string {
  if (value === "TRUE" || value === "FALSE") return `office:value-type="boolean" office:boolean-value="${value === "TRUE" ? "true" : "false"}"`;
  if (strictNumericInput.test(value) && Number.isFinite(Number(value))) return `office:value-type="float" office:value="${xmlEscape(value)}"`;
  return `office:value-type="string" office:string-value="${xmlEscape(value)}"`;
}

function odsCellXml(document: SpreadsheetDocument, sheet: SpreadsheetSheet, address: string): string {
  const cell = sheet.cells[address];
  const input = cell.input;
  if (!input.startsWith("=")) return `<table:table-cell ${odsValueAttributes(input)}><text:p>${xmlEscape(input)}</text:p></table:table-cell>`;
  const calculated = evaluateSpreadsheetCell(document, sheet.id, address);
  return `<table:table-cell table:formula="${xmlEscape(spreadsheetFormulaToOds(input))}" ${odsValueAttributes(calculated)}><text:p>${xmlEscape(calculated)}</text:p></table:table-cell>`;
}

function odsTableXml(document: SpreadsheetDocument, sheet: SpreadsheetSheet): string {
  const populatedRows = new Map<number, Map<number, string>>();
  for (const address of Object.keys(sheet.cells)) {
    const parsed = parseCellAddress(address);
    if (!parsed) continue;
    const row = populatedRows.get(parsed.row) || new Map<number, string>();
    row.set(parsed.column, address);
    populatedRows.set(parsed.row, row);
  }
  const rows: string[] = [];
  let previousRow = -1;
  for (const [rowIndex, columns] of Array.from(populatedRows.entries()).sort(([a], [b]) => a - b)) {
    const skippedRows = rowIndex - previousRow - 1;
    if (skippedRows > 0) rows.push(`<table:table-row${skippedRows > 1 ? ` table:number-rows-repeated="${skippedRows}"` : ""}><table:table-cell/></table:table-row>`);
    const cells: string[] = [];
    let previousColumn = -1;
    for (const [columnIndex, address] of Array.from(columns.entries()).sort(([a], [b]) => a - b)) {
      const skippedColumns = columnIndex - previousColumn - 1;
      if (skippedColumns > 0) cells.push(`<table:table-cell${skippedColumns > 1 ? ` table:number-columns-repeated="${skippedColumns}"` : ""}/>`);
      cells.push(odsCellXml(document, sheet, address));
      previousColumn = columnIndex;
    }
    rows.push(`<table:table-row>${cells.join("")}</table:table-row>`);
    previousRow = rowIndex;
  }
  if (!rows.length) rows.push("<table:table-row><table:table-cell/></table:table-row>");
  return `<table:table table:name="${xmlEscape(sheet.name)}">${rows.join("")}</table:table>`;
}

export function exportSpreadsheetOds(input: SpreadsheetDocument): Uint8Array {
  const document = spreadsheetDocumentSchema.parse(input);
  for (const sheet of document.sheets) {
    for (const cell of Object.values(sheet.cells)) {
      if (cell.input.startsWith("=") && !isSupportedSpreadsheetFormula(cell.input)) {
        throw new Error("The spreadsheet contains a formula outside the supported ODS export set.");
      }
    }
  }
  const content = `${XML_DECLARATION}<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.3"><office:body><office:spreadsheet>${document.sheets.map((sheet) => odsTableXml(document, sheet)).join("")}</office:spreadsheet></office:body></office:document-content>`;
  const manifest = `${XML_DECLARATION}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${ODS_MIME}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  const files: Zippable = {
    mimetype: [strToU8(ODS_MIME), { level: 0, mtime: FIXED_ZIP_TIME }],
    "content.xml": [strToU8(content), { level: 6, mtime: FIXED_ZIP_TIME }],
    "META-INF/manifest.xml": [strToU8(manifest), { level: 6, mtime: FIXED_ZIP_TIME }],
  };
  return zipSync(files);
}

export function spreadsheetOdsFileName(title: string): string {
  const safe = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return `${safe || "lyfeos-sheet"}.ods`;
}
