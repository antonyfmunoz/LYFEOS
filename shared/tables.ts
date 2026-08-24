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
