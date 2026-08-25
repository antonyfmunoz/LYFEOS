import { z } from "zod";

export const workspaceColumnTypeSchema = z.enum(["text", "number", "boolean", "date", "select", "url"]);
export const workspaceColumnSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
  type: workspaceColumnTypeSchema,
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(50),
}).strict().superRefine((column, ctx) => {
  if (column.type === "select" && column.options.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Select columns need at least one option." });
  if (column.type !== "select" && column.options.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Only select columns can define options." });
  if (new Set(column.options.map((option) => option.toLowerCase())).size !== column.options.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Select options must be unique." });
});

export const workspaceDatabaseDefinitionSchema = z.object({
  version: z.literal(1),
  columns: z.array(workspaceColumnSchema).min(1).max(50),
}).strict().superRefine((definition, ctx) => {
  const ids = definition.columns.map((column) => column.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns"], message: "Column IDs must be unique." });
});

const databaseMetadata = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/).default("general"),
  favorite: z.boolean().default(false),
};

export const createWorkspaceDatabaseSchema = z.object({ ...databaseMetadata, definition: workspaceDatabaseDefinitionSchema }).strict();
export const updateWorkspaceDatabaseSchema = z.object({
  title: databaseMetadata.title.optional(), description: databaseMetadata.description,
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/).optional(), favorite: z.boolean().optional(),
  definition: workspaceDatabaseDefinitionSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one database field.");

export const workspaceRowValuesSchema = z.record(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), z.unknown()).refine((value) => Object.keys(value).length <= 50, "A row can contain at most 50 values.");
export const workspaceRowRequestSchema = z.object({ values: workspaceRowValuesSchema }).strict();
export const workspaceBulkRowDeleteSchema = z.object({
  rowIds: z.array(z.number().int().positive()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Row IDs must be unique."),
}).strict();
export const workspaceTableRowImportSchema = z.object({
  rows: z.array(workspaceRowValuesSchema).min(1).max(500),
}).strict();

export const workspaceTableViewDefinitionSchema = z.object({
  version: z.literal(1),
  filterQuery: z.string().trim().max(120),
  sortColumnId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable(),
  sortDirection: z.enum(["asc", "desc"]),
  groupColumnId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable(),
}).strict();
export const workspaceDatabaseRevisionSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/),
  favorite: z.boolean(),
  definition: workspaceDatabaseDefinitionSchema,
}).strict();
export const workspaceRowRevisionSnapshotSchema = z.object({ values: workspaceRowValuesSchema }).strict();
export const createWorkspaceTableViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  definition: workspaceTableViewDefinitionSchema,
}).strict();
export const updateWorkspaceTableViewSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  definition: workspaceTableViewDefinitionSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one view field.");

const formFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable().optional(),
  fieldIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Form fields must be unique."),
  confirmationText: z.string().trim().min(1).max(300).default("Response saved."),
  active: z.boolean().default(true),
};
export const createWorkspaceFormSchema = z.object({ databaseId: z.number().int().positive(), ...formFields }).strict();
export const updateWorkspaceFormSchema = z.object({
  title: formFields.title.optional(), description: formFields.description, fieldIds: formFields.fieldIds.optional(),
  confirmationText: z.string().trim().min(1).max(300).optional(), active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one form field.");

export type WorkspaceDatabaseDefinition = z.infer<typeof workspaceDatabaseDefinitionSchema>;
export type WorkspaceColumn = z.infer<typeof workspaceColumnSchema>;
export type WorkspaceRowValues = z.infer<typeof workspaceRowValuesSchema>;
export type WorkspaceRowSortDirection = "asc" | "desc";
export type WorkspaceTableViewDefinition = z.infer<typeof workspaceTableViewDefinitionSchema>;
export type WorkspaceTableCsvPreview = {
  rows: WorkspaceRowValues[];
  sourceRowCount: number;
  importRowCount: number;
  skippedBlankRowCount: number;
  mappedColumns: Array<{ columnId: string; columnName: string; sourceHeader: string }>;
};

export function createWorkspaceColumn(type: WorkspaceColumn["type"] = "text", name = "Name"): WorkspaceColumn {
  return { id: `field_${Math.random().toString(36).slice(2, 12)}`, name, type, required: false, options: type === "select" ? ["Option 1"] : [] };
}

export function validateWorkspaceRow(definition: WorkspaceDatabaseDefinition, values: WorkspaceRowValues, allowedFieldIds?: string[]): WorkspaceRowValues {
  const parsedValues = workspaceRowValuesSchema.parse(values);
  const allowed = allowedFieldIds ? new Set(allowedFieldIds) : null;
  const columns = new Map(definition.columns.map((column) => [column.id, column]));
  for (const key of Object.keys(parsedValues)) {
    if (!columns.has(key)) throw new Error(`Unknown field: ${key}`);
    if (allowed && !allowed.has(key)) throw new Error(`Field is not part of this form: ${key}`);
  }
  for (const column of definition.columns) {
    if (allowed && !allowed.has(column.id)) continue;
    const value = parsedValues[column.id];
    const empty = value === undefined || value === null || value === "";
    if (column.required && empty) throw new Error(`${column.name} is required.`);
    if (empty) continue;
    if (column.type === "text" && (typeof value !== "string" || value.length > 5_000)) throw new Error(`${column.name} must be text under 5,000 characters.`);
    if (column.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${column.name} must be a finite number.`);
    if (column.type === "boolean" && typeof value !== "boolean") throw new Error(`${column.name} must be true or false.`);
    if (column.type === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()))) throw new Error(`${column.name} must be a valid date.`);
    if (column.type === "select" && (typeof value !== "string" || !column.options.includes(value))) throw new Error(`${column.name} must use an allowed option.`);
    if (column.type === "url") {
      if (typeof value !== "string" || value.length > 2_000) throw new Error(`${column.name} must be a valid URL.`);
      try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { throw new Error(`${column.name} must use a valid http or https URL.`); }
    }
  }
  return parsedValues;
}

const MAX_TABLE_CSV_CHARACTERS = 2_000_000;
const MAX_TABLE_CSV_CELL_CHARACTERS = 5_000;

function parseWorkspaceCsvCells(text: string): string[][] {
  if (!text.length) throw new Error("The CSV file is empty.");
  if (text.length > MAX_TABLE_CSV_CHARACTERS) throw new Error("Table CSV files can contain at most 2,000,000 characters.");
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
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
    if (field.length > MAX_TABLE_CSV_CELL_CHARACTERS) throw new Error("A CSV cell can contain at most 5,000 characters.");
  }
  if (quoted) throw new Error("The CSV file contains an unfinished quoted cell.");
  row.push(field); rows.push(row);
  if (rows.length > 1 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "" && /(?:\r\n|\r|\n)$/.test(text)) rows.pop();
  return rows;
}

function workspaceCsvValue(column: WorkspaceColumn, raw: string): unknown {
  if (raw === "") return undefined;
  if (column.type === "text") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (column.type === "number") {
    const number = Number(trimmed);
    if (!Number.isFinite(number)) throw new Error(`${column.name} must be a finite number.`);
    return number;
  }
  if (column.type === "boolean") {
    const normalized = trimmed.toLocaleLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
    throw new Error(`${column.name} must be true/false, yes/no, or 1/0.`);
  }
  return trimmed;
}

export function parseWorkspaceTableCsv(definition: WorkspaceDatabaseDefinition, text: string): WorkspaceTableCsvPreview {
  const parsedDefinition = workspaceDatabaseDefinitionSchema.parse(definition);
  const csvRows = parseWorkspaceCsvCells(text);
  if (!csvRows.length || csvRows[0].every((cell) => !cell.trim())) throw new Error("The CSV needs a header row.");
  if (csvRows.length - 1 > 500) throw new Error("A Table CSV can contain at most 500 source rows at once.");
  const sourceHeaders = csvRows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  if (sourceHeaders.length > 50) throw new Error("A Table CSV can contain at most 50 columns.");
  const columnsById = new Map(parsedDefinition.columns.map((column) => [column.id, column]));
  const columnsByName = new Map<string, WorkspaceColumn[]>();
  parsedDefinition.columns.forEach((column) => {
    const key = column.name.toLocaleLowerCase();
    columnsByName.set(key, [...(columnsByName.get(key) || []), column]);
  });
  const mappedColumns = sourceHeaders.map((sourceHeader) => {
    const decoratedId = sourceHeader.includes("::") ? sourceHeader.slice(0, sourceHeader.indexOf("::")) : sourceHeader;
    const idMatch = columnsById.get(decoratedId);
    const nameMatches = columnsByName.get(sourceHeader.toLocaleLowerCase()) || [];
    const column = idMatch || (nameMatches.length === 1 ? nameMatches[0] : undefined);
    if (!column) {
      if (nameMatches.length > 1) throw new Error(`CSV header “${sourceHeader}” is ambiguous. Use the stable column ID.`);
      throw new Error(`CSV header “${sourceHeader || "(blank)"}” does not match this Table.`);
    }
    return { column, sourceHeader };
  });
  if (new Set(mappedColumns.map(({ column }) => column.id)).size !== mappedColumns.length) throw new Error("Each Table column can appear only once in the CSV header.");
  const rows: WorkspaceRowValues[] = [];
  let skippedBlankRowCount = 0;
  for (let index = 1; index < csvRows.length; index += 1) {
    const sourceRow = csvRows[index];
    if (sourceRow.length > sourceHeaders.length) throw new Error(`CSV row ${index + 1} has more values than the header.`);
    if (sourceRow.every((value) => !value.trim())) { skippedBlankRowCount += 1; continue; }
    if (rows.length >= 500) throw new Error("A Table CSV can import at most 500 nonblank rows at once.");
    const values: WorkspaceRowValues = {};
    mappedColumns.forEach(({ column }, columnIndex) => {
      const value = workspaceCsvValue(column, sourceRow[columnIndex] || "");
      if (value !== undefined) values[column.id] = value;
    });
    try { rows.push(validateWorkspaceRow(parsedDefinition, values)); }
    catch (error) { throw new Error(`CSV row ${index + 1}: ${error instanceof Error ? error.message : "invalid values"}`); }
  }
  if (!rows.length) throw new Error("The CSV contains no nonblank data rows to import.");
  return {
    rows,
    sourceRowCount: Math.max(0, csvRows.length - 1),
    importRowCount: rows.length,
    skippedBlankRowCount,
    mappedColumns: mappedColumns.map(({ column, sourceHeader }) => ({ columnId: column.id, columnName: column.name, sourceHeader })),
  };
}

function encodeWorkspaceCsvCell(value: string): string {
  const protectedValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function serializeWorkspaceTableCsv(definition: WorkspaceDatabaseDefinition, rows: Array<{ values: WorkspaceRowValues }>): string {
  const parsedDefinition = workspaceDatabaseDefinitionSchema.parse(definition);
  const lines = [parsedDefinition.columns.map((column) => encodeWorkspaceCsvCell(`${column.id}::${column.name}`)).join(",")];
  rows.forEach((row) => {
    const values = validateWorkspaceRow(parsedDefinition, row.values);
    lines.push(parsedDefinition.columns.map((column) => encodeWorkspaceCsvCell(values[column.id] === undefined || values[column.id] === null ? "" : String(values[column.id]))).join(","));
  });
  return lines.join("\r\n");
}

export function validateWorkspaceFormFields(definition: WorkspaceDatabaseDefinition, fieldIds: string[]): void {
  const fields = new Set(fieldIds);
  const columns = new Set(definition.columns.map((column) => column.id));
  if (fieldIds.some((id) => !columns.has(id))) throw new Error("Every form field must exist in its database.");
  const missingRequired = definition.columns.find((column) => column.required && !fields.has(column.id));
  if (missingRequired) throw new Error(`Required field ${missingRequired.name} must be included in the form.`);
}

export function validateWorkspaceTableView(definition: WorkspaceDatabaseDefinition, view: WorkspaceTableViewDefinition): void {
  const columns = new Set(definition.columns.map((column) => column.id));
  if (view.sortColumnId && !columns.has(view.sortColumnId)) throw new Error("The view sort column must exist in its table.");
  if (view.groupColumnId && !columns.has(view.groupColumnId)) throw new Error("The view group column must exist in its table.");
}

export function filterAndSortWorkspaceRows<T extends { id: number; values: WorkspaceRowValues }>(
  rows: readonly T[],
  definition: WorkspaceDatabaseDefinition,
  query: string,
  sortColumnId: string | null,
  direction: WorkspaceRowSortDirection,
): T[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => definition.columns.some((column) => String(row.values[column.id] ?? "").toLowerCase().includes(needle)))
    : [...rows];
  if (!sortColumnId) return filtered;
  if (!definition.columns.some((column) => column.id === sortColumnId)) throw new Error("Choose a column from this table.");
  const multiplier = direction === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    const leftValue = left.values[sortColumnId];
    const rightValue = right.values[sortColumnId];
    if (leftValue === rightValue) return left.id - right.id;
    if (leftValue === undefined || leftValue === null || leftValue === "") return 1;
    if (rightValue === undefined || rightValue === null || rightValue === "") return -1;
    if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * multiplier;
    if (typeof leftValue === "boolean" && typeof rightValue === "boolean") return (Number(leftValue) - Number(rightValue)) * multiplier;
    const leftText = String(leftValue).toLowerCase();
    const rightText = String(rightValue).toLowerCase();
    return (leftText < rightText ? -1 : leftText > rightText ? 1 : left.id - right.id) * multiplier;
  });
}

export function groupWorkspaceRows<T extends { id: number; values: WorkspaceRowValues }>(rows: readonly T[], definition: WorkspaceDatabaseDefinition, groupColumnId: string | null): Array<{ key: string; label: string; rows: T[] }> {
  if (!groupColumnId) return [{ key: "all", label: "All rows", rows: [...rows] }];
  if (!definition.columns.some((column) => column.id === groupColumnId)) throw new Error("Choose a group column from this table.");
  const groups = new Map<string, { key: string; label: string; rows: T[] }>();
  for (const row of rows) {
    const value = row.values[groupColumnId];
    const label = value === undefined || value === null || value === "" ? "Empty" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    const key = `${typeof value}:${label}`;
    const group = groups.get(key) || { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}
