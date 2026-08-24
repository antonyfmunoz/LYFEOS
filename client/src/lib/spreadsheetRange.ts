import type { SpreadsheetSheet } from "@shared/spreadsheets";
import { spreadsheetAddressPattern } from "@shared/spreadsheets";
import { columnLabel, parseCellAddress } from "./spreadsheetFormula";

const MAX_RANGE_CELLS = 5_000;
const MAX_CELL_INPUT_LENGTH = 10_000;

function position(address: string) {
  const parsed = parseCellAddress(address);
  if (!parsed || !spreadsheetAddressPattern.test(address.toUpperCase())) throw new Error("Choose a valid spreadsheet cell.");
  return parsed;
}

export function spreadsheetRangeBounds(startAddress: string, endAddress: string) {
  const start = position(startAddress);
  const end = position(endAddress);
  const bounds = {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
  };
  const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1);
  return { ...bounds, cellCount };
}

function encodeTsvCell(value: string): string {
  return /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeSpreadsheetRange(sheet: SpreadsheetSheet, startAddress: string, endAddress: string): string {
  const bounds = spreadsheetRangeBounds(startAddress, endAddress);
  if (bounds.cellCount > MAX_RANGE_CELLS) throw new Error("A copied or pasted range can contain at most 5,000 cells.");
  if (bounds.endRow >= sheet.rowCount || bounds.endColumn >= sheet.columnCount) throw new Error("The selected range extends beyond this sheet.");
  const lines: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const values: string[] = [];
    for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
      values.push(encodeTsvCell(sheet.cells[`${columnLabel(column)}${row + 1}`]?.input || ""));
    }
    lines.push(values.join("\t"));
  }
  return lines.join("\r\n");
}

export function parseSpreadsheetClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else if (char === "\r") { if (text[index + 1] === "\n") index += 1; field += "\n"; }
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) quoted = true;
    else if (char === "\t") { row.push(field); field = ""; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Clipboard text contains an unfinished quoted cell.");
  row.push(field); rows.push(row);
  if (rows.length > 1 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "" && /(?:\r\n|\r|\n)$/.test(text)) rows.pop();
  if (!rows.length) rows.push([""]);
  const columnCount = Math.max(...rows.map((candidate) => candidate.length));
  const cellCount = rows.length * columnCount;
  if (cellCount > MAX_RANGE_CELLS) throw new Error("A copied or pasted range can contain at most 5,000 cells.");
  if (rows.some((candidate) => candidate.some((value) => value.length > MAX_CELL_INPUT_LENGTH))) throw new Error("A pasted cell can contain at most 10,000 characters.");
  return rows.map((candidate) => [...candidate, ...Array.from({ length: columnCount - candidate.length }, () => "")]);
}

export function pasteSpreadsheetRange(sheet: SpreadsheetSheet, startAddress: string, clipboardText: string) {
  const start = position(startAddress);
  const values = parseSpreadsheetClipboard(clipboardText);
  const rowCount = values.length;
  const columnCount = values[0].length;
  if (start.row + rowCount > sheet.rowCount || start.column + columnCount > sheet.columnCount) {
    throw new Error("The pasted range would extend beyond this sheet. Insert rows or columns first.");
  }
  const cells = { ...sheet.cells };
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const address = `${columnLabel(start.column + column)}${start.row + row + 1}`;
      const input = values[row][column];
      if (input) cells[address] = { input };
      else delete cells[address];
    }
  }
  if (Object.keys(cells).length > MAX_RANGE_CELLS) throw new Error("A sheet can contain at most 5,000 populated cells.");
  return {
    sheet: { ...sheet, cells },
    endAddress: `${columnLabel(start.column + columnCount - 1)}${start.row + rowCount}`,
    rowCount,
    columnCount,
  };
}
