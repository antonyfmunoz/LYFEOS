import { z } from "zod";

export const spreadsheetAddressPattern = /^[A-Z]{1,3}[1-9][0-9]{0,3}$/;

export const spreadsheetCellSchema = z.object({
  input: z.string().max(10_000),
  format: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
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

export const spreadsheetDocumentSchema = z.object({
  version: z.literal(1),
  activeSheetId: z.string().min(1).max(64),
  sheets: z.array(spreadsheetSheetSchema).min(1).max(20),
}).superRefine((document, ctx) => {
  const ids = document.sheets.map((sheet) => sheet.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sheet IDs must be unique." });
  if (!ids.includes(document.activeSheetId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The active sheet must exist." });
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

export type SpreadsheetDocument = z.infer<typeof spreadsheetDocumentSchema>;
export type SpreadsheetSheet = z.infer<typeof spreadsheetSheetSchema>;

export function createEmptySpreadsheetDocument(): SpreadsheetDocument {
  const id = `sheet_${Math.random().toString(36).slice(2, 12)}`;
  return { version: 1, activeSheetId: id, sheets: [{ id, name: "Sheet 1", rowCount: 40, columnCount: 10, cells: {} }] };
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
  return spreadsheetDocumentSchema.parse({
    ...document,
    sheets: document.sheets.map((sheet) => sheet.id === sheetId ? { ...sheet, name } : sheet),
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
  return spreadsheetDocumentSchema.parse({ ...document, activeSheetId, sheets });
}
