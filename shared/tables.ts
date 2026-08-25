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
