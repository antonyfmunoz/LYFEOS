import { z } from "zod";

export const spreadsheetAddressPattern = /^[A-Z]{1,3}[1-9][0-9]{0,3}$/;

export const spreadsheetCellSchema = z.object({
  input: z.string().max(10_000),
});

export const spreadsheetSheetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
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
  return { version: 1, activeSheetId: id, sheets: [{ id, name: "Sheet 1", cells: {} }] };
}

export function normalizeSpreadsheetDocument(value: unknown): SpreadsheetDocument {
  const parsed = spreadsheetDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : createEmptySpreadsheetDocument();
}
