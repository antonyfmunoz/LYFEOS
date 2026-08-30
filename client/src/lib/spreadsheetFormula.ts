import type { SpreadsheetDocument, SpreadsheetNumberFormat, SpreadsheetSheet } from "@shared/spreadsheets";
import { parseSpreadsheetSheetQualifier, spreadsheetAddressPattern } from "@shared/spreadsheets";

type FormulaError = "#ERROR!" | "#VALUE!" | "#DIV/0!" | "#CYCLE!" | "#REF!";
type FormulaValue = number | string | boolean | FormulaError;
type FormulaArithmeticOperator = "+" | "-" | "*" | "/";
type FormulaComparisonOperator = "=" | "<>" | "<" | "<=" | ">" | ">=";
type FormulaBinaryOperator = FormulaArithmeticOperator | FormulaComparisonOperator;

type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "cell"; address: string; sheetName?: string }
  | { kind: "range"; start: string; end: string; sheetName?: string }
  | { kind: "unary"; operator: "+" | "-"; operand: FormulaNode }
  | { kind: "binary"; operator: FormulaBinaryOperator; left: FormulaNode; right: FormulaNode }
  | { kind: "function"; name: string; arguments: FormulaNode[] };

type FormulaToken =
  | { kind: "number"; value: string }
  | { kind: "string"; value: string }
  | { kind: "identifier"; value: string }
  | { kind: "cell"; value: string; sheetName?: string }
  | { kind: "operator"; value: string }
  | { kind: "punctuation"; value: string };

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
  const match = /^\$?([A-Z]{1,3})\$?([1-9][0-9]{0,3})$/.exec(address.toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  return { column: column - 1, row: Number(match[2]) - 1 };
}

type SpreadsheetInsertionAxis = "row" | "column";

function shiftFormulaReferences(input: string, axis: SpreadsheetInsertionAxis, beforeIndex: number, formulaSheetName?: string, targetSheetName?: string): string {
  if (!input.startsWith("=")) return input;
  let shiftedFormula = "";
  let position = 0;
  let insideString = false;
  let inheritedRangeEnd: { position: number; sheetName: string } | null = null;
  while (position < input.length) {
    if (input[position] === '"') {
      shiftedFormula += '"';
      if (insideString && input[position + 1] === '"') {
        shiftedFormula += '"';
        position += 2;
        continue;
      }
      insideString = !insideString;
      position += 1;
      continue;
    }
    if (inheritedRangeEnd && position > inheritedRangeEnd.position) inheritedRangeEnd = null;
    const qualifier = insideString ? null : parseSpreadsheetSheetQualifier(input.slice(position));
    const referenceOffset = qualifier?.length ?? 0;
    const reference = insideString ? null : /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,3})/.exec(input.slice(position + referenceOffset));
    const previous = position > 0 ? input[position - 1] : "";
    const next = reference ? input[position + referenceOffset + reference[0].length] || "" : "";
    const inheritedSheetName = inheritedRangeEnd?.position === position ? inheritedRangeEnd.sheetName : undefined;
    if (reference && !/[A-Za-z0-9_.$]/.test(previous) && !/[A-Za-z0-9_$]/.test(next)) {
      const parsed = parseCellAddress(reference[0]);
      if (!parsed) {
        if (qualifier) shiftedFormula += input.slice(position, position + qualifier.length);
        shiftedFormula += reference[0];
        position += referenceOffset + reference[0].length;
        continue;
      }
      const effectiveSheetName = qualifier?.sheetName ?? inheritedSheetName ?? formulaSheetName;
      const shouldShift = targetSheetName
        ? effectiveSheetName?.toLocaleLowerCase() === targetSheetName.toLocaleLowerCase()
        : !qualifier && !inheritedSheetName;
      const column = shouldShift && axis === "column" && parsed.column >= beforeIndex ? parsed.column + 1 : parsed.column;
      const row = shouldShift && axis === "row" && parsed.row >= beforeIndex ? parsed.row + 1 : parsed.row;
      const shifted = `${columnLabel(column)}${row + 1}`;
      if (!spreadsheetAddressPattern.test(shifted)) throw new Error("A formula reference would exceed the supported sheet boundary.");
      if (qualifier) shiftedFormula += input.slice(position, position + qualifier.length);
      shiftedFormula += `${reference[1]}${columnLabel(column)}${reference[3]}${row + 1}`;
      const referenceEnd = position + referenceOffset + reference[0].length;
      if (qualifier) {
        const separator = /^(\s*:\s*)/.exec(input.slice(referenceEnd));
        if (separator) {
          const rangeEndPosition = referenceEnd + separator[0].length;
          const endQualifier = parseSpreadsheetSheetQualifier(input.slice(rangeEndPosition));
          const endReference = /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,3}(?![A-Za-z0-9_$])/.exec(input.slice(rangeEndPosition + (endQualifier?.length ?? 0)));
          if (endReference && !endQualifier) inheritedRangeEnd = { position: rangeEndPosition, sheetName: qualifier.sheetName };
        }
      }
      position = referenceEnd;
      continue;
    }
    shiftedFormula += input[position];
    position += 1;
  }
  return shiftedFormula;
}

function validateSpreadsheetInsertion(sheet: SpreadsheetSheet, axis: SpreadsheetInsertionAxis, beforeIndex: number): void {
  const dimension = axis === "row" ? sheet.rowCount : sheet.columnCount;
  const maximum = axis === "row" ? 500 : 100;
  if (!Number.isInteger(beforeIndex) || beforeIndex < 0 || beforeIndex >= dimension) throw new Error("Choose a visible row or column before inserting.");
  if (dimension >= maximum) throw new Error(`This sheet already has the maximum supported ${axis} count.`);
}

function shiftPopulatedCells(sheet: SpreadsheetSheet, axis: SpreadsheetInsertionAxis, beforeIndex: number, rewriteInput: (input: string) => string): SpreadsheetSheet {
  const cells: SpreadsheetSheet["cells"] = {};
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const parsed = parseCellAddress(address);
    if (!parsed) throw new Error(`Invalid persisted cell address: ${address}`);
    const column = axis === "column" && parsed.column >= beforeIndex ? parsed.column + 1 : parsed.column;
    const row = axis === "row" && parsed.row >= beforeIndex ? parsed.row + 1 : parsed.row;
    const shiftedAddress = `${columnLabel(column)}${row + 1}`;
    if (!spreadsheetAddressPattern.test(shiftedAddress)) throw new Error("A populated cell would exceed the supported sheet boundary.");
    cells[shiftedAddress] = { ...cell, input: rewriteInput(cell.input) };
  }
  return {
    ...sheet,
    rowCount: axis === "row" ? sheet.rowCount + 1 : sheet.rowCount,
    columnCount: axis === "column" ? sheet.columnCount + 1 : sheet.columnCount,
    cells,
  };
}

export function insertSpreadsheetAxis(sheet: SpreadsheetSheet, axis: SpreadsheetInsertionAxis, beforeIndex: number): SpreadsheetSheet {
  validateSpreadsheetInsertion(sheet, axis, beforeIndex);
  return shiftPopulatedCells(sheet, axis, beforeIndex, (input) => shiftFormulaReferences(input, axis, beforeIndex));
}

export function insertSpreadsheetDocumentAxis(document: SpreadsheetDocument, sheetId: string, axis: SpreadsheetInsertionAxis, beforeIndex: number): SpreadsheetDocument {
  const targetSheet = document.sheets.find((sheet) => sheet.id === sheetId);
  if (!targetSheet) throw new Error("That sheet no longer exists.");
  if (document.sheets.filter((sheet) => sheet.name.toLocaleLowerCase() === targetSheet.name.toLocaleLowerCase()).length !== 1) {
    throw new Error("Resolve duplicate sheet names before inserting rows or columns used by cross-sheet formulas.");
  }
  validateSpreadsheetInsertion(targetSheet, axis, beforeIndex);
  const sheets = document.sheets.map((sheet) => {
    const rewriteInput = (input: string) => shiftFormulaReferences(input, axis, beforeIndex, sheet.name, targetSheet.name);
    if (sheet.id === targetSheet.id) return shiftPopulatedCells(sheet, axis, beforeIndex, rewriteInput);
    return {
      ...sheet,
      cells: Object.fromEntries(Object.entries(sheet.cells).map(([address, cell]) => [address, { ...cell, input: rewriteInput(cell.input) }])),
    };
  });
  return { ...document, sheets };
}

export function evaluateSpreadsheetCell(document: SpreadsheetDocument, sheetId: string, address: string): string {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet || !spreadsheetAddressPattern.test(address)) return "";
  const result = evaluateAddress(document, sheet, address, new Set());
  if (typeof result === "number") return formatNumber(result);
  if (typeof result === "boolean") return result ? "TRUE" : "FALSE";
  return result;
}

export function formatSpreadsheetDisplayValue(value: string, numberFormat?: SpreadsheetNumberFormat): string {
  if (!numberFormat || !value.trim() || value.startsWith("#")) return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  if (numberFormat === "decimal") return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue);
  if (numberFormat === "percent") return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericValue);
}

function evaluateAddress(document: SpreadsheetDocument, sheet: SpreadsheetSheet, address: string, stack: Set<string>): FormulaValue | string {
  const stackKey = `${sheet.id}!${address}`;
  if (stack.has(stackKey)) return "#CYCLE!";
  if (stack.size >= 200) return "#ERROR!";
  const input = sheet.cells[address]?.input ?? "";
  if (!input.startsWith("=")) return input;
  const nextStack = new Set(stack).add(stackKey);
  return evaluateFormula(document, sheet, input.slice(1), nextStack);
}

function evaluateFormula(document: SpreadsheetDocument, sheet: SpreadsheetSheet, formula: string, stack: Set<string>): FormulaValue {
  const tokens = tokenize(formula);
  if (!tokens || tokens.length > 500) return "#ERROR!";
  const root = parseFormula(tokens);
  if (!root) return "#ERROR!";

  const isError = (value: FormulaValue): value is FormulaError => typeof value === "string" && ["#ERROR!", "#VALUE!", "#DIV/0!", "#CYCLE!", "#REF!"].includes(value);
  const resolveSheet = (sheetName?: string): SpreadsheetSheet | null => {
    if (!sheetName) return sheet;
    const matches = document.sheets.filter((candidate) => candidate.name.toLocaleLowerCase() === sheetName.toLocaleLowerCase());
    return matches.length === 1 ? matches[0] : null;
  };
  const evaluateCell = (address: string, sheetName?: string): FormulaValue => {
    const referencedSheet = resolveSheet(sheetName);
    return referencedSheet ? evaluateAddress(document, referencedSheet, address, stack) : "#REF!";
  };
  const toNumber = (value: FormulaValue): number | FormulaError => {
    if (isError(value)) return value;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value.trim() === "") return 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "#VALUE!";
  };
  const toBoolean = (value: FormulaValue): boolean | FormulaError => {
    if (isError(value)) return value;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (value.trim() === "") return false;
    if (value.toUpperCase() === "TRUE") return true;
    if (value.toUpperCase() === "FALSE") return false;
    return "#VALUE!";
  };
  const compare = (left: FormulaValue, right: FormulaValue, operator: FormulaComparisonOperator): FormulaValue => {
    if (isError(left)) return left;
    if (isError(right)) return right;
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    const numeric = typeof leftNumber === "number" && typeof rightNumber === "number";
    if (numeric) {
      if (operator === "=") return leftNumber === rightNumber;
      if (operator === "<>") return leftNumber !== rightNumber;
      if (operator === "<") return leftNumber < rightNumber;
      if (operator === "<=") return leftNumber <= rightNumber;
      if (operator === ">") return leftNumber > rightNumber;
      return leftNumber >= rightNumber;
    }
    const first = String(left).toLocaleLowerCase();
    const second = String(right).toLocaleLowerCase();
    if (operator === "=") return first === second;
    if (operator === "<>") return first !== second;
    if (operator === "<") return first < second;
    if (operator === "<=") return first <= second;
    if (operator === ">") return first > second;
    return first >= second;
  };
  let rangedCellReads = 0;
  const flattenedArguments = (nodes: FormulaNode[]): Array<{ value: FormulaValue; fromRange: boolean }> => {
    const values: Array<{ value: FormulaValue; fromRange: boolean }> = [];
    for (const node of nodes) {
      if (node.kind === "range") {
        const addresses = expandRange(node.start, node.end);
        rangedCellReads += addresses.length;
        if (rangedCellReads > 100_000) return [{ value: "#ERROR!", fromRange: false }];
        for (const address of addresses) values.push({ value: evaluateCell(address, node.sheetName), fromRange: true });
      } else {
        values.push({ value: evaluateNode(node), fromRange: false });
      }
    }
    return values;
  };
  const aggregateNumbers = (nodes: FormulaNode[]): number[] | FormulaError => {
    const values: number[] = [];
    for (const entry of flattenedArguments(nodes)) {
      if (isError(entry.value)) return entry.value;
      if (entry.fromRange && (typeof entry.value === "boolean" || (typeof entry.value === "string" && entry.value.trim() !== "" && !Number.isFinite(Number(entry.value))))) continue;
      if (entry.fromRange && entry.value === "") continue;
      const numeric = toNumber(entry.value);
      if (typeof numeric !== "number") return numeric;
      values.push(numeric);
    }
    return values;
  };
  const evaluateFunction = (node: Extract<FormulaNode, { kind: "function" }>): FormulaValue => {
    if (node.name === "IF") {
      if (node.arguments.length !== 3) return "#ERROR!";
      const condition = toBoolean(evaluateNode(node.arguments[0]));
      if (typeof condition !== "boolean") return condition;
      return evaluateNode(node.arguments[condition ? 1 : 2]);
    }
    if (node.name === "ABS") {
      if (node.arguments.length !== 1 || node.arguments[0].kind === "range") return "#ERROR!";
      const value = toNumber(evaluateNode(node.arguments[0]));
      return typeof value === "number" ? Math.abs(value) : value;
    }
    if (node.name === "ROUND") {
      if (node.arguments.length !== 2 || node.arguments.some((argument) => argument.kind === "range")) return "#ERROR!";
      const value = toNumber(evaluateNode(node.arguments[0]));
      if (typeof value !== "number") return value;
      const digits = toNumber(evaluateNode(node.arguments[1]));
      if (typeof digits !== "number") return digits;
      if (!Number.isInteger(digits) || digits < -15 || digits > 15) return "#VALUE!";
      const factor = 10 ** Math.abs(digits);
      const magnitude = Math.abs(value);
      const rounded = digits >= 0
        ? Math.round((magnitude + Number.EPSILON) * factor) / factor
        : Math.round((magnitude + Number.EPSILON) / factor) * factor;
      return value < 0 ? -rounded : rounded;
    }
    if (node.name === "COUNT" || node.name === "COUNTA") {
      const entries = flattenedArguments(node.arguments);
      if (node.name === "COUNTA") return entries.filter(({ value }) => value !== "").length;
      return entries.filter(({ value, fromRange }) => !isError(value) && value !== "" && !(fromRange && typeof value === "boolean") && typeof toNumber(value) === "number").length;
    }
    const values = aggregateNumbers(node.arguments);
    if (!Array.isArray(values)) return values;
    if (node.name === "SUM") return values.reduce((sum, value) => sum + value, 0);
    if (!values.length) return node.name === "AVERAGE" ? "#DIV/0!" : 0;
    if (node.name === "AVERAGE") return values.reduce((sum, value) => sum + value, 0) / values.length;
    if (node.name === "MIN") return Math.min(...values);
    return Math.max(...values);
  };
  const evaluateNode = (node: FormulaNode): FormulaValue => {
    if (node.kind === "number" || node.kind === "string" || node.kind === "boolean") return node.value;
    if (node.kind === "cell") return evaluateCell(node.address, node.sheetName);
    if (node.kind === "range") return "#VALUE!";
    if (node.kind === "function") return evaluateFunction(node);
    if (node.kind === "unary") {
      const value = toNumber(evaluateNode(node.operand));
      return typeof value === "number" ? (node.operator === "-" ? -value : value) : value;
    }
    const left = evaluateNode(node.left);
    if (["=", "<>", "<", "<=", ">", ">="].includes(node.operator)) return compare(left, evaluateNode(node.right), node.operator as FormulaComparisonOperator);
    const leftNumber = toNumber(left);
    if (typeof leftNumber !== "number") return leftNumber;
    const rightNumber = toNumber(evaluateNode(node.right));
    if (typeof rightNumber !== "number") return rightNumber;
    if (node.operator === "+") return leftNumber + rightNumber;
    if (node.operator === "-") return leftNumber - rightNumber;
    if (node.operator === "*") return leftNumber * rightNumber;
    if (rightNumber === 0) return "#DIV/0!";
    return leftNumber / rightNumber;
  };

  return evaluateNode(root);
}

function parseFormula(tokens: FormulaToken[]): FormulaNode | null {
  let index = 0;
  const current = () => tokens[index];
  const consume = (value?: string) => {
    const token = tokens[index];
    if (!token || (value !== undefined && token.value !== value)) return null;
    index += 1;
    return token;
  };

  const parseComparison = (): FormulaNode | null => {
    let left = parseExpression();
    if (!left) return null;
    const token = current();
    if (token?.kind === "operator" && ["=", "<>", "<", "<=", ">", ">="].includes(token.value)) {
      consume();
      const right = parseExpression();
      if (!right) return null;
      left = { kind: "binary", operator: token.value as FormulaComparisonOperator, left, right };
    }
    return left;
  };
  const parseExpression = (): FormulaNode | null => {
    let left = parseTerm();
    if (!left) return null;
    while (current()?.value === "+" || current()?.value === "-") {
      const operator = consume()!.value as "+" | "-";
      const right = parseTerm();
      if (!right) return null;
      left = { kind: "binary", operator, left, right };
    }
    return left;
  };
  const parseTerm = (): FormulaNode | null => {
    let left = parseFactor();
    if (!left) return null;
    while (current()?.value === "*" || current()?.value === "/") {
      const operator = consume()!.value as "*" | "/";
      const right = parseFactor();
      if (!right) return null;
      left = { kind: "binary", operator, left, right };
    }
    return left;
  };
  const parseFunction = (name: string): FormulaNode | null => {
    consume("(");
    const argumentsList: FormulaNode[] = [];
    if (current()?.value !== ")") {
      while (true) {
        const argument = parseComparison();
        if (!argument) return null;
        argumentsList.push(argument);
        if (current()?.value !== ",") break;
        consume(",");
      }
    }
    if (!consume(")")) return null;
    return { kind: "function", name, arguments: argumentsList };
  };
  const parseFactor = (): FormulaNode | null => {
    const token = current();
    if (!token) return null;
    if (token.value === "+" || token.value === "-") {
      consume();
      const operand = parseFactor();
      return operand ? { kind: "unary", operator: token.value as "+" | "-", operand } : null;
    }
    if (token.value === "(") {
      consume("(");
      const value = parseComparison();
      return value && consume(")") ? value : null;
    }
    if (token.kind === "number") {
      consume();
      return { kind: "number", value: Number(token.value) };
    }
    if (token.kind === "string") {
      consume();
      return { kind: "string", value: token.value };
    }
    if (token.kind === "cell") {
      consume();
      if (current()?.value === ":") {
        consume(":");
        const end = current();
        if (end?.kind !== "cell") return null;
        if (!token.sheetName && end.sheetName) return null;
        if (token.sheetName && end.sheetName && token.sheetName.toLocaleLowerCase() !== end.sheetName.toLocaleLowerCase()) return null;
        consume();
        return { kind: "range", start: token.value, end: end.value, ...(token.sheetName ? { sheetName: token.sheetName } : {}) };
      }
      return { kind: "cell", address: token.value, ...(token.sheetName ? { sheetName: token.sheetName } : {}) };
    }
    if (token.kind === "identifier") {
      consume();
      if (token.value === "TRUE" || token.value === "FALSE") return { kind: "boolean", value: token.value === "TRUE" };
      if (!["SUM", "AVERAGE", "MIN", "MAX", "COUNT", "COUNTA", "ROUND", "ABS", "IF"].includes(token.value) || current()?.value !== "(") return null;
      return parseFunction(token.value);
    }
    return null;
  };

  const root = parseComparison();
  return root && index === tokens.length ? root : null;
}

export function isSupportedSpreadsheetFormula(input: string): boolean {
  if (!input.startsWith("=") || input.length > 10_000) return false;
  const tokens = tokenize(input.slice(1));
  return Boolean(tokens && tokens.length <= 500 && parseFormula(tokens));
}

function tokenize(formula: string): FormulaToken[] | null {
  const tokens: FormulaToken[] = [];
  let position = 0;
  while (position < formula.length) {
    const rest = formula.slice(position);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      position += whitespace[0].length;
      continue;
    }
    if (rest[0] === '"') {
      let value = "";
      let cursor = 1;
      let closed = false;
      while (cursor < rest.length) {
        if (rest[cursor] !== '"') {
          value += rest[cursor++];
          continue;
        }
        if (rest[cursor + 1] === '"') {
          value += '"';
          cursor += 2;
          continue;
        }
        cursor += 1;
        closed = true;
        break;
      }
      if (!closed) return null;
      tokens.push({ kind: "string", value });
      position += cursor;
      continue;
    }
    const comparison = /^(<=|>=|<>)/.exec(rest);
    if (comparison) {
      tokens.push({ kind: "operator", value: comparison[1] });
      position += comparison[1].length;
      continue;
    }
    if (/^[+\-*/=<>]/.test(rest)) {
      tokens.push({ kind: "operator", value: rest[0] });
      position += 1;
      continue;
    }
    if (/^[(),:]/.test(rest)) {
      tokens.push({ kind: "punctuation", value: rest[0] });
      position += 1;
      continue;
    }
    const qualifier = parseSpreadsheetSheetQualifier(rest);
    const cell = /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,3}(?![A-Za-z0-9_$])/.exec(rest.slice(qualifier?.length ?? 0));
    if (cell) {
      const value = cell[0].replaceAll("$", "").toUpperCase();
      if (!spreadsheetAddressPattern.test(value)) return null;
      tokens.push({ kind: "cell", value, ...(qualifier ? { sheetName: qualifier.sheetName } : {}) });
      position += (qualifier?.length ?? 0) + cell[0].length;
      continue;
    }
    if (qualifier) return null;
    const number = /^\d+(?:\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      position += number[0].length;
      continue;
    }
    const word = /^[A-Za-z]+[0-9]*/.exec(rest);
    if (!word) return null;
    const value = word[0].toUpperCase();
    tokens.push({ kind: "identifier", value });
    position += word[0].length;
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
