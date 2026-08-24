import type { SpreadsheetDocument, SpreadsheetSheet } from "@shared/spreadsheets";
import { spreadsheetAddressPattern } from "@shared/spreadsheets";

type FormulaValue = number | "#ERROR!" | "#VALUE!" | "#DIV/0!" | "#CYCLE!";

export function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function parseCellAddress(address: string): { column: number; row: number } | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,3})$/.exec(address.toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  return { column: column - 1, row: Number(match[2]) - 1 };
}

export function evaluateSpreadsheetCell(document: SpreadsheetDocument, sheetId: string, address: string): string {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet || !spreadsheetAddressPattern.test(address)) return "";
  const result = evaluateAddress(sheet, address, new Set());
  return typeof result === "number" ? formatNumber(result) : result;
}

function evaluateAddress(sheet: SpreadsheetSheet, address: string, stack: Set<string>): FormulaValue | string {
  if (stack.has(address)) return "#CYCLE!";
  const input = sheet.cells[address]?.input ?? "";
  if (!input.startsWith("=")) return input;
  const nextStack = new Set(stack).add(address);
  return evaluateFormula(sheet, input.slice(1), nextStack);
}

function evaluateFormula(sheet: SpreadsheetSheet, formula: string, stack: Set<string>): FormulaValue {
  const parsedTokens = tokenize(formula);
  if (!parsedTokens) return "#ERROR!";
  const tokens: string[] = parsedTokens;
  let index = 0;

  const numericCell = (address: string): FormulaValue => {
    const value = evaluateAddress(sheet, address, stack);
    if (typeof value === "number") return value;
    if (value === "") return 0;
    if (typeof value === "string" && value.startsWith("#")) return value as FormulaValue;
    const number = Number(value);
    return Number.isFinite(number) ? number : "#VALUE!";
  };

  const parseExpression = (): FormulaValue => {
    let left = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = parseTerm();
      if (typeof left !== "number") return left;
      if (typeof right !== "number") return right;
      left = operator === "+" ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): FormulaValue => {
    let left = parseFactor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = parseFactor();
      if (typeof left !== "number") return left;
      if (typeof right !== "number") return right;
      if (operator === "/" && right === 0) return "#DIV/0!";
      left = operator === "*" ? left * right : left / right;
    }
    return left;
  };

  const parseFunction = (name: string): FormulaValue => {
    index += 2; // function name and opening parenthesis
    const values: number[] = [];
    while (index < tokens.length && tokens[index] !== ")") {
      const start = tokens[index];
      if (spreadsheetAddressPattern.test(start) && tokens[index + 1] === ":" && spreadsheetAddressPattern.test(tokens[index + 2] || "")) {
        index += 3;
        for (const address of expandRange(start, tokens[index - 1])) {
          const value = numericCell(address);
          if (typeof value !== "number") return value;
          values.push(value);
        }
      } else {
        const value = parseExpression();
        if (typeof value !== "number") return value;
        values.push(value);
      }
      if (tokens[index] === ",") index += 1;
      else if (tokens[index] !== ")") return "#ERROR!";
    }
    if (tokens[index] !== ")") return "#ERROR!";
    index += 1;
    if (!values.length) return 0;
    if (name === "SUM") return values.reduce((sum, value) => sum + value, 0);
    if (name === "AVERAGE") return values.reduce((sum, value) => sum + value, 0) / values.length;
    if (name === "MIN") return Math.min(...values);
    return Math.max(...values);
  };

  function parseFactor(): FormulaValue {
    const token = tokens[index];
    if (token === "+" || token === "-") {
      index += 1;
      const value = parseFactor();
      return typeof value === "number" ? (token === "-" ? -value : value) : value;
    }
    if (token === "(") {
      index += 1;
      const value = parseExpression();
      if (tokens[index] !== ")") return "#ERROR!";
      index += 1;
      return value;
    }
    if (["SUM", "AVERAGE", "MIN", "MAX"].includes(token) && tokens[index + 1] === "(") return parseFunction(token);
    if (spreadsheetAddressPattern.test(token || "")) {
      index += 1;
      return numericCell(token);
    }
    if (token && /^\d+(?:\.\d+)?$/.test(token)) {
      index += 1;
      return Number(token);
    }
    return "#ERROR!";
  }

  const result = parseExpression();
  return index === tokens.length ? result : "#ERROR!";
}

function tokenize(formula: string): string[] | null {
  const normalized = formula.toUpperCase();
  const tokens: string[] = [];
  let position = 0;
  const pattern = /^\s*(AVERAGE|SUM|MIN|MAX|[A-Z]{1,3}[1-9][0-9]{0,3}|\d+(?:\.\d+)?|[()+\-*/,:])/;
  while (position < normalized.length) {
    const match = pattern.exec(normalized.slice(position));
    if (!match) return null;
    tokens.push(match[1]);
    position += match[0].length;
  }
  return tokens;
}

function expandRange(start: string, end: string): string[] {
  const first = parseCellAddress(start);
  const last = parseCellAddress(end);
  if (!first || !last) return [];
  const addresses: string[] = [];
  for (let row = Math.min(first.row, last.row); row <= Math.max(first.row, last.row); row += 1) {
    for (let column = Math.min(first.column, last.column); column <= Math.max(first.column, last.column); column += 1) {
      addresses.push(`${columnLabel(column)}${row + 1}`);
    }
  }
  return addresses;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "#ERROR!";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}
