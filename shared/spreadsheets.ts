import { z } from "zod";

export const spreadsheetAddressPattern = /^[A-Z]{1,3}[1-9][0-9]{0,3}$/;
export const spreadsheetNumberFormats = ["decimal", "percent", "currency_usd"] as const;
export const spreadsheetColorTokens = ["red", "amber", "green", "blue", "purple"] as const;
export const spreadsheetChartKinds = ["line", "bar", "stacked_bar", "area", "combo", "pie", "scatter"] as const;
export const spreadsheetChartAxisModes = ["shared", "dual"] as const;
export const spreadsheetChartSeriesRoles = ["bar", "line"] as const;
export type SpreadsheetNumberFormat = typeof spreadsheetNumberFormats[number];
export type SpreadsheetColorToken = typeof spreadsheetColorTokens[number];
export type SpreadsheetChartKind = typeof spreadsheetChartKinds[number];
export type SpreadsheetChartAxisMode = typeof spreadsheetChartAxisModes[number];
export type SpreadsheetChartSeriesRole = typeof spreadsheetChartSeriesRoles[number];

export function quoteSpreadsheetSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

export function parseSpreadsheetSheetQualifier(input: string): { sheetName: string; length: number } | null {
  if (input.startsWith("'")) {
    let sheetName = "";
    let cursor = 1;
    while (cursor < input.length) {
      if (input[cursor] !== "'") {
        sheetName += input[cursor++];
        continue;
      }
      if (input[cursor + 1] === "'") {
        sheetName += "'";
        cursor += 2;
        continue;
      }
      return input[cursor + 1] === "!" && sheetName.length > 0
        ? { sheetName, length: cursor + 2 }
        : null;
    }
    return null;
  }
  const unquoted = /^([A-Za-z_][A-Za-z0-9_.]{0,79})!/.exec(input);
  return unquoted ? { sheetName: unquoted[1], length: unquoted[0].length } : null;
}

export function rewriteSpreadsheetFormulaSheetName(input: string, previousName: string, nextName: string): string {
  if (!input.startsWith("=")) return input;
  let rewritten = "";
  let position = 0;
  let insideString = false;
  while (position < input.length) {
    if (input[position] === '"') {
      rewritten += '"';
      if (insideString && input[position + 1] === '"') {
        rewritten += '"';
        position += 2;
        continue;
      }
      insideString = !insideString;
      position += 1;
      continue;
    }
    const qualifier = insideString ? null : parseSpreadsheetSheetQualifier(input.slice(position));
    const previous = position > 0 ? input[position - 1] : "";
    const cell = qualifier ? /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,3}(?![A-Za-z0-9_$])/.exec(input.slice(position + qualifier.length)) : null;
    if (qualifier && cell && !/[A-Za-z0-9_.]/.test(previous)) {
      rewritten += qualifier.sheetName.toLocaleLowerCase() === previousName.toLocaleLowerCase()
        ? quoteSpreadsheetSheetName(nextName)
        : input.slice(position, position + qualifier.length - 1);
      rewritten += "!";
      position += qualifier.length;
      continue;
    }
    rewritten += input[position];
    position += 1;
  }
  return rewritten;
}

export const spreadsheetCellSchema = z.object({
  input: z.string().max(10_000),
  format: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    numberFormat: z.enum(spreadsheetNumberFormats).optional(),
    textColor: z.enum(spreadsheetColorTokens).optional(),
    backgroundColor: z.enum(spreadsheetColorTokens).optional(),
  }).optional(),
});

export const spreadsheetSheetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
  rowCount: z.number().int().min(1).max(500).default(40),
  columnCount: z.number().int().min(1).max(100).default(10),
  cells: z.record(z.string().regex(spreadsheetAddressPattern), spreadsheetCellSchema).refine(
    (cells) => Object.keys(cells).length <= 5_000,
    "A sheet can contain at most 5,000 populated cells.",
  ),
});

export const spreadsheetChartSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(spreadsheetChartKinds),
  axisMode: z.enum(spreadsheetChartAxisModes).default("shared"),
  seriesRoles: z.array(z.enum(spreadsheetChartSeriesRoles)).max(99).default([]),
  sheetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  range: z.object({
    startRow: z.number().int().min(0).max(499),
    endRow: z.number().int().min(1).max(499),
    startColumn: z.number().int().min(0).max(99),
    endColumn: z.number().int().min(1).max(99),
  }).refine((range) => range.endRow > range.startRow && range.endColumn > range.startColumn, {
    message: "A chart source needs a header row, a label column, and at least one data cell.",
  }).refine((range) => (range.endRow - range.startRow) * (range.endColumn - range.startColumn) <= 500, {
    message: "A chart can render at most 500 data points.",
  }),
}).superRefine((chart, ctx) => {
  const dataColumnCount = chart.range.endColumn - chart.range.startColumn;
  if (chart.kind === "pie" && dataColumnCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pie charts require one label column and exactly one value column.", path: ["range"] });
  }
  if (chart.kind === "scatter" && dataColumnCount !== 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scatter charts require one label column and exactly two numeric series columns.", path: ["range"] });
  }
  if ((chart.kind === "stacked_bar" || chart.kind === "combo") && dataColumnCount < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${chart.kind === "stacked_bar" ? "Stacked bar" : "Combination"} charts require one label column and at least two numeric series columns.`, path: ["range"] });
  }
  if (chart.kind !== "combo" && chart.axisMode !== "shared") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Dual axes are available only for combination charts.", path: ["axisMode"] });
  }
  if (chart.kind !== "combo" && chart.seriesRoles.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Per-series rendering roles are available only for combination charts.", path: ["seriesRoles"] });
  }
  if (chart.kind === "combo" && chart.seriesRoles.length > 0 && chart.seriesRoles.length !== dataColumnCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Combination chart roles must cover every source series.", path: ["seriesRoles"] });
  }
  if (chart.kind === "combo" && chart.seriesRoles.length > 0 && (!chart.seriesRoles.includes("bar") || !chart.seriesRoles.includes("line"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Combination charts must retain at least one bar series and one line series.", path: ["seriesRoles"] });
  }
});

export const spreadsheetDocumentSchema = z.object({
  version: z.literal(1),
  activeSheetId: z.string().min(1).max(64),
  sheets: z.array(spreadsheetSheetSchema).min(1).max(20),
  charts: z.array(spreadsheetChartSchema).max(20).default([]),
}).superRefine((document, ctx) => {
  const ids = document.sheets.map((sheet) => sheet.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sheet IDs must be unique." });
  if (!ids.includes(document.activeSheetId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The active sheet must exist." });
  const chartIds = document.charts.map((chart) => chart.id);
  if (new Set(chartIds).size !== chartIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chart IDs must be unique.", path: ["charts"] });
  document.charts.forEach((chart, index) => {
    const sheet = document.sheets.find((candidate) => candidate.id === chart.sheetId);
    if (!sheet) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Every chart must reference an existing sheet.", path: ["charts", index, "sheetId"] });
      return;
    }
    if (chart.range.endRow >= sheet.rowCount || chart.range.endColumn >= sheet.columnCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chart sources must remain inside their sheet dimensions.", path: ["charts", index, "range"] });
    }
  });
});

const spreadsheetMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/).default("general"),
  favorite: z.boolean().default(false),
});

export const createSpreadsheetRequestSchema = spreadsheetMetadataSchema.extend({
  content: spreadsheetDocumentSchema,
});

export const updateSpreadsheetRequestSchema = spreadsheetMetadataSchema.partial().extend({
  content: spreadsheetDocumentSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one spreadsheet field to update.");

export const spreadsheetRevisionSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/),
  content: spreadsheetDocumentSchema,
});

export type SpreadsheetDocument = z.infer<typeof spreadsheetDocumentSchema>;
export type SpreadsheetSheet = z.infer<typeof spreadsheetSheetSchema>;
export type SpreadsheetChart = z.infer<typeof spreadsheetChartSchema>;

export function createEmptySpreadsheetDocument(): SpreadsheetDocument {
  const id = `sheet_${Math.random().toString(36).slice(2, 12)}`;
  return { version: 1, activeSheetId: id, sheets: [{ id, name: "Sheet 1", rowCount: 40, columnCount: 10, cells: {} }], charts: [] };
}

export function normalizeSpreadsheetDocument(value: unknown): SpreadsheetDocument {
  const parsed = spreadsheetDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : createEmptySpreadsheetDocument();
}

export function nextSpreadsheetSheetName(document: SpreadsheetDocument): string {
  const existing = new Set(document.sheets.map((sheet) => sheet.name.trim().toLocaleLowerCase()));
  for (let index = 1; index <= 20; index += 1) {
    const candidate = `Sheet ${index}`;
    if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new Error("No additional sheet name is available.");
}

export function uniqueSpreadsheetSheetName(document: SpreadsheetDocument, requestedName: string): string {
  const requested = requestedName.trim() || "Imported";
  const existing = new Set(document.sheets.map((sheet) => sheet.name.trim().toLocaleLowerCase()));
  const base = requested.slice(0, 80);
  if (!existing.has(base.toLocaleLowerCase())) return base;
  for (let index = 2; index <= 20; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new Error("No unique imported sheet name is available.");
}

export function renameSpreadsheetSheet(document: SpreadsheetDocument, sheetId: string, requestedName: string): SpreadsheetDocument {
  const name = requestedName.trim();
  if (!name || name.length > 80) throw new Error("Sheet names must contain 1 to 80 characters.");
  if (!document.sheets.some((sheet) => sheet.id === sheetId)) throw new Error("That sheet no longer exists.");
  if (document.sheets.some((sheet) => sheet.id !== sheetId && sheet.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("Each sheet tab needs a unique name.");
  }
  const previousName = document.sheets.find((sheet) => sheet.id === sheetId)!.name;
  return spreadsheetDocumentSchema.parse({
    ...document,
    sheets: document.sheets.map((sheet) => ({
      ...sheet,
      name: sheet.id === sheetId ? name : sheet.name,
      cells: Object.fromEntries(Object.entries(sheet.cells).map(([address, cell]) => [address, {
        ...cell,
        input: rewriteSpreadsheetFormulaSheetName(cell.input, previousName, name),
      }])),
    })),
  });
}

export function removeSpreadsheetSheet(document: SpreadsheetDocument, sheetId: string): SpreadsheetDocument {
  if (document.sheets.length <= 1) throw new Error("A spreadsheet must keep at least one sheet tab.");
  const removedIndex = document.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (removedIndex < 0) throw new Error("That sheet no longer exists.");
  const sheets = document.sheets.filter((sheet) => sheet.id !== sheetId);
  const activeSheetId = document.activeSheetId === sheetId
    ? sheets[Math.min(removedIndex, sheets.length - 1)].id
    : document.activeSheetId;
  return spreadsheetDocumentSchema.parse({ ...document, activeSheetId, sheets, charts: document.charts.filter((chart) => chart.sheetId !== sheetId) });
}

export function createSpreadsheetChart(document: SpreadsheetDocument, input: {
  id: string;
  title: string;
  kind: SpreadsheetChartKind;
  axisMode?: SpreadsheetChartAxisMode;
  seriesRoles?: SpreadsheetChartSeriesRole[];
  sheetId: string;
  range: SpreadsheetChart["range"];
}): SpreadsheetDocument {
  if (document.charts.length >= 20) throw new Error("A spreadsheet can contain at most 20 charts.");
  return spreadsheetDocumentSchema.parse({ ...document, charts: [...document.charts, spreadsheetChartSchema.parse(input)] });
}

export function updateSpreadsheetChart(document: SpreadsheetDocument, chartId: string, patch: { title?: string; kind?: SpreadsheetChartKind; axisMode?: SpreadsheetChartAxisMode; seriesRoles?: SpreadsheetChartSeriesRole[] }): SpreadsheetDocument {
  if (!document.charts.some((chart) => chart.id === chartId)) throw new Error("That chart no longer exists.");
  return spreadsheetDocumentSchema.parse({
    ...document,
    charts: document.charts.map((chart) => {
      if (chart.id !== chartId) return chart;
      const updated = { ...chart, ...patch };
      return updated.kind === "combo" ? updated : { ...updated, axisMode: "shared" as const, seriesRoles: [] };
    }),
  });
}

export function removeSpreadsheetChart(document: SpreadsheetDocument, chartId: string): SpreadsheetDocument {
  if (!document.charts.some((chart) => chart.id === chartId)) throw new Error("That chart no longer exists.");
  return spreadsheetDocumentSchema.parse({ ...document, charts: document.charts.filter((chart) => chart.id !== chartId) });
}

export function resolveSpreadsheetChartSeriesRoles(chart: SpreadsheetChart): SpreadsheetChartSeriesRole[] {
  if (chart.kind !== "combo") return [];
  const seriesCount = chart.range.endColumn - chart.range.startColumn;
  if (chart.seriesRoles.length === seriesCount) return [...chart.seriesRoles];
  return Array.from({ length: seriesCount }, (_, index) => index === 0 ? "bar" : "line");
}

export function shiftSpreadsheetChartsForAxis(document: SpreadsheetDocument, sheetId: string, axis: "row" | "column", atIndex: number): SpreadsheetDocument {
  return spreadsheetDocumentSchema.parse({
    ...document,
    charts: document.charts.map((chart) => {
      if (chart.sheetId !== sheetId) return chart;
      const range = { ...chart.range };
      if (axis === "row") {
        if (atIndex <= range.startRow) { range.startRow += 1; range.endRow += 1; }
        else if (atIndex <= range.endRow) range.endRow += 1;
      } else {
        if (atIndex <= range.startColumn) { range.startColumn += 1; range.endColumn += 1; }
        else if (atIndex <= range.endColumn) {
          range.endColumn += 1;
          if (chart.kind === "combo" && chart.seriesRoles.length > 0) {
            const insertionIndex = atIndex - chart.range.startColumn - 1;
            const seriesRoles = [...chart.seriesRoles];
            seriesRoles.splice(insertionIndex, 0, "line");
            return { ...chart, range, seriesRoles };
          }
        }
      }
      return { ...chart, range };
    }),
  });
}
