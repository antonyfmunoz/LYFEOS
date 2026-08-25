import { z } from "zod";

export const workspaceColumnTypeSchema = z.enum(["text", "number", "boolean", "date", "select", "url", "relation", "formula", "rollup"]);
export const workspaceRelationConfigSchema = z.object({
  databaseId: z.number().int().positive(),
  displayColumnId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
}).strict();
export const workspaceFormulaResultTypeSchema = z.enum(["number", "text", "boolean", "date"]);
export const workspaceFormulaConfigSchema = z.object({ expression: z.string().trim().min(1).max(300), resultType: workspaceFormulaResultTypeSchema.default("number") }).strict();
export const workspaceRollupConfigSchema = z.object({
  relationColumnId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  targetColumnId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  aggregation: z.enum(["count", "sum", "average", "min", "max"]),
}).strict();
export const workspaceColumnSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
  type: workspaceColumnTypeSchema,
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(50),
  relation: workspaceRelationConfigSchema.optional(),
  formula: workspaceFormulaConfigSchema.optional(),
  rollup: workspaceRollupConfigSchema.optional(),
}).strict().superRefine((column, ctx) => {
  if (column.type === "select" && column.options.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Select columns need at least one option." });
  if (column.type !== "select" && column.options.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Only select columns can define options." });
  if (new Set(column.options.map((option) => option.toLowerCase())).size !== column.options.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Select options must be unique." });
  if (column.type === "relation" && !column.relation) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relation"], message: "Relation columns need a target Table and display column." });
  if (column.type === "formula" && !column.formula) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["formula"], message: "Formula columns need an expression." });
  if (column.type === "rollup" && !column.rollup) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rollup"], message: "Rollup columns need a relation, target column, and aggregation." });
  if (column.type !== "relation" && column.relation) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relation"], message: "Only relation columns can define relation settings." });
  if (column.type !== "formula" && column.formula) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["formula"], message: "Only formula columns can define formula settings." });
  if (column.type !== "rollup" && column.rollup) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rollup"], message: "Only rollup columns can define rollup settings." });
  if ((column.type === "formula" || column.type === "rollup") && column.required) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["required"], message: "Computed columns cannot be required inputs." });
  if (column.type === "formula" && column.formula) {
    try { workspaceFormulaReferences(column.formula.expression); }
    catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["formula", "expression"], message: error instanceof Error ? error.message : "Invalid formula." }); }
  }
});

export const workspaceDatabaseDefinitionSchema = z.object({
  version: z.literal(1),
  columns: z.array(workspaceColumnSchema).min(1).max(50),
}).strict().superRefine((definition, ctx) => {
  const ids = definition.columns.map((column) => column.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns"], message: "Column IDs must be unique." });
  if (definition.columns.every((column) => isWorkspaceComputedColumn(column))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns"], message: "A Table needs at least one stored input column." });
  const columns = new Map(definition.columns.map((column) => [column.id, column]));
  const references = (column: WorkspaceColumn): string[] => { try { return column.formula ? workspaceFormulaReferences(column.formula.expression) : []; } catch { return []; } };
  for (let index = 0; index < definition.columns.length; index += 1) {
    const column = definition.columns[index];
    if (column.type === "formula" && column.formula) {
      for (const reference of references(column)) {
        const dependency = columns.get(reference);
        if (!dependency) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns", index, "formula"], message: `Formula reference ${reference} does not exist.` });
        else if (!["text", "number", "boolean", "date", "select", "url", "formula"].includes(dependency.type)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns", index, "formula"], message: `Formula reference ${reference} must be a stored scalar or formula column.` });
      }
    }
    if (column.type === "rollup" && column.rollup && columns.get(column.rollup.relationColumnId)?.type !== "relation") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns", index, "rollup"], message: "A rollup must use a relation column from this Table." });
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (columnId: string): boolean => {
    if (visiting.has(columnId)) return true;
    if (visited.has(columnId)) return false;
    const column = columns.get(columnId); if (!column || column.type !== "formula" || !column.formula) return false;
    visiting.add(columnId);
    const cyclic = references(column).some((reference) => visit(reference));
    visiting.delete(columnId); visited.add(columnId); return cyclic;
  };
  for (const column of definition.columns) if (visit(column.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["columns"], message: "Formula columns cannot contain circular references." });
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
export const workspaceUnlinkReferencesSchema = z.object({
  referenceCount: z.number().int().min(1).max(500),
  confirmation: z.string().max(40),
}).strict().superRefine((value, ctx) => {
  if (value.confirmation !== `UNLINK ${value.referenceCount}`) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: `Type UNLINK ${value.referenceCount} to confirm.` });
});
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
export const workspaceFormConditionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  sourceFieldId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  targetFieldId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  operator: z.enum(["equals", "not_equals", "is_empty", "is_not_empty"]),
  value: z.union([z.string().max(5_000), z.number().finite(), z.boolean()]).optional(),
}).strict().superRefine((condition, ctx) => {
  if ((condition.operator === "equals" || condition.operator === "not_equals") && condition.value === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Comparison conditions need a value." });
  if ((condition.operator === "is_empty" || condition.operator === "is_not_empty") && condition.value !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Empty-state conditions cannot define a value." });
});
export const workspaceFormDefinitionSchema = z.object({
  version: z.literal(1),
  sections: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    fieldIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).min(1).max(50),
  }).strict()).min(1).max(12),
  conditions: z.array(workspaceFormConditionSchema).max(50),
}).strict().superRefine((definition, ctx) => {
  const sectionIds = definition.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "Section IDs must be unique." });
  const fields = definition.sections.flatMap((section) => section.fieldIds);
  if (new Set(fields).size !== fields.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "Each form field must appear in exactly one section." });
  const conditionIds = definition.conditions.map((condition) => condition.id);
  if (new Set(conditionIds).size !== conditionIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions"], message: "Condition IDs must be unique." });
  const targets = definition.conditions.map((condition) => condition.targetFieldId);
  if (new Set(targets).size !== targets.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions"], message: "A field can have only one visibility condition." });
});
export const createWorkspaceFormSchema = z.object({ databaseId: z.number().int().positive(), ...formFields, definition: workspaceFormDefinitionSchema.optional() }).strict();
export const updateWorkspaceFormSchema = z.object({
  title: formFields.title.optional(), description: formFields.description, fieldIds: formFields.fieldIds.optional(),
  confirmationText: z.string().trim().min(1).max(300).optional(), active: z.boolean().optional(), definition: workspaceFormDefinitionSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one form field.");
export const createWorkspaceFormAccessGrantSchema = z.object({
  label: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime({ offset: true }).refine((value) => new Date(value).getTime() > Date.now(), "Expiry must be in the future."),
  maxSubmissions: z.number().int().min(1).max(10_000),
}).strict();

export type WorkspaceDatabaseDefinition = z.infer<typeof workspaceDatabaseDefinitionSchema>;
export type WorkspaceColumn = z.infer<typeof workspaceColumnSchema>;
export type WorkspaceRowValues = z.infer<typeof workspaceRowValuesSchema>;
export type WorkspaceRowSortDirection = "asc" | "desc";
export type WorkspaceTableViewDefinition = z.infer<typeof workspaceTableViewDefinitionSchema>;
export type WorkspaceFormDefinition = z.infer<typeof workspaceFormDefinitionSchema>;
export type WorkspaceTableCsvPreview = {
  rows: WorkspaceRowValues[];
  sourceRowCount: number;
  importRowCount: number;
  skippedBlankRowCount: number;
  mappedColumns: Array<{ columnId: string; columnName: string; sourceHeader: string }>;
  ignoredComputedColumnCount: number;
};
export type WorkspaceRelationOption = { id: number; label: string };
export type WorkspaceRelationOptions = Record<string, WorkspaceRelationOption[]>;
export type WorkspaceRowBacklink = { sourceDatabaseId: number; sourceDatabaseTitle: string; sourceRowId: number; relationColumnId: string; relationColumnName: string };

export function defaultWorkspaceFormDefinition(fieldIds: string[], title = "Response details"): WorkspaceFormDefinition {
  return workspaceFormDefinitionSchema.parse({ version: 1, sections: [{ id: "main", title, description: null, fieldIds }], conditions: [] });
}

function workspaceFormValueIsEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function visibleWorkspaceFormFieldIds(definition: WorkspaceFormDefinition, values: WorkspaceRowValues): string[] {
  const conditions = new Map(definition.conditions.map((condition) => [condition.targetFieldId, condition]));
  return definition.sections.flatMap((section) => section.fieldIds).filter((fieldId) => {
    const condition = conditions.get(fieldId); if (!condition) return true;
    const source = values[condition.sourceFieldId];
    if (condition.operator === "is_empty") return workspaceFormValueIsEmpty(source);
    if (condition.operator === "is_not_empty") return !workspaceFormValueIsEmpty(source);
    const equal = source === condition.value;
    return condition.operator === "equals" ? equal : !equal;
  });
}

export function validateWorkspaceFormDefinition(database: WorkspaceDatabaseDefinition, fieldIds: string[], input: WorkspaceFormDefinition): WorkspaceFormDefinition {
  validateWorkspaceFormFields(database, fieldIds);
  const definition = workspaceFormDefinitionSchema.parse(input);
  const ordered = definition.sections.flatMap((section) => section.fieldIds);
  if (ordered.length !== fieldIds.length || ordered.some((fieldId) => !fieldIds.includes(fieldId))) throw new Error("Form sections must contain every selected field exactly once.");
  const positions = new Map(ordered.map((fieldId, index) => [fieldId, index]));
  const columns = new Map(database.columns.map((column) => [column.id, column]));
  const conditionalTargets = new Set(definition.conditions.map((condition) => condition.targetFieldId));
  for (const condition of definition.conditions) {
    const source = columns.get(condition.sourceFieldId); const target = columns.get(condition.targetFieldId);
    if (!source || !target || !positions.has(source.id) || !positions.has(target.id)) throw new Error("Form conditions must use selected fields.");
    if (source.id === target.id || positions.get(source.id)! >= positions.get(target.id)!) throw new Error("A visibility condition must use an earlier field.");
    if (conditionalTargets.has(source.id)) throw new Error("A condition source must always be visible.");
    if (target.required) throw new Error("Required fields cannot be conditionally hidden.");
    if (source.type === "relation" || isWorkspaceComputedColumn(source)) throw new Error("Visibility conditions need a stored scalar source field.");
    if (condition.value !== undefined) {
      if (source.type === "number" && typeof condition.value !== "number") throw new Error(`${source.name} conditions need a number value.`);
      if (source.type === "boolean" && typeof condition.value !== "boolean") throw new Error(`${source.name} conditions need a true or false value.`);
      if (["text", "date", "select", "url"].includes(source.type) && typeof condition.value !== "string") throw new Error(`${source.name} conditions need a text value.`);
      if (source.type === "select" && !source.options.includes(condition.value as string)) throw new Error(`${source.name} conditions must use an allowed option.`);
    }
  }
  return definition;
}

export function validateWorkspaceFormSubmission(database: WorkspaceDatabaseDefinition, definition: WorkspaceFormDefinition, values: WorkspaceRowValues): WorkspaceRowValues {
  return validateWorkspaceRow(database, values, visibleWorkspaceFormFieldIds(definition, values));
}

type WorkspaceFormulaValue = number | string | boolean | null;
type WorkspaceFormulaToken = { kind: "number"; value: number } | { kind: "string" | "reference" | "identifier" | "operator"; value: string };
type WorkspaceFormulaNode = { kind: "literal"; value: WorkspaceFormulaValue } | { kind: "reference"; value: string } | { kind: "unary"; operator: "+" | "-"; value: WorkspaceFormulaNode } | { kind: "binary"; operator: string; left: WorkspaceFormulaNode; right: WorkspaceFormulaNode } | { kind: "call"; name: string; arguments: WorkspaceFormulaNode[] };
const workspaceFormulaFunctions = new Set(["ABS", "ROUND", "MIN", "MAX", "CONCAT", "LOWER", "UPPER", "LENGTH", "IF", "DAYS_BETWEEN", "ADD_DAYS", "IS_EMPTY", "AND", "OR", "NOT", "COALESCE"]);

function isWorkspaceIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tokenizeWorkspaceFormula(expression: string): WorkspaceFormulaToken[] {
  const tokens: WorkspaceFormulaToken[] = []; let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index); const whitespace = rest.match(/^\s+/); if (whitespace) { index += whitespace[0].length; continue; }
    const reference = rest.match(/^\[([A-Za-z0-9_-]{1,64})\]/); if (reference) { tokens.push({ kind: "reference", value: reference[1] }); index += reference[0].length; continue; }
    if (rest[0] === '"') {
      let end = 1; let escaped = false;
      for (; end < rest.length; end += 1) { const character = rest[end]; if (!escaped && character === '"') break; if (!escaped && character === "\\") escaped = true; else escaped = false; }
      if (end >= rest.length) throw new Error("A formula text literal is not closed.");
      let value: string; try { value = JSON.parse(rest.slice(0, end + 1)); } catch { throw new Error("Formula text literals use JSON-style quotes and escapes."); }
      tokens.push({ kind: "string", value }); index += end + 1; continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/); if (number) { tokens.push({ kind: "number", value: Number(number[0]) }); index += number[0].length; continue; }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/); if (identifier) { tokens.push({ kind: "identifier", value: identifier[0].toUpperCase() }); index += identifier[0].length; continue; }
    const comparison = rest.match(/^(?:>=|<=|!=|=|>|<)/); if (comparison) { tokens.push({ kind: "operator", value: comparison[0] }); index += comparison[0].length; continue; }
    if (["+", "-", "*", "/", "(", ")", ","].includes(rest[0])) { tokens.push({ kind: "operator", value: rest[0] }); index += 1; continue; }
    throw new Error("Use literals, [column_id] references, supported functions, comparisons, parentheses, and + − × ÷ only.");
  }
  if (!tokens.length || tokens.length > 100) throw new Error("A formula must contain 1 to 100 tokens.");
  return tokens;
}

function parseWorkspaceFormula(expression: string): WorkspaceFormulaNode {
  const tokens = tokenizeWorkspaceFormula(expression); let position = 0;
  const match = (value: string) => tokens[position]?.kind === "operator" && tokens[position]?.value === value;
  const primary = (): WorkspaceFormulaNode => {
    const token = tokens[position]; if (!token) throw new Error("The formula ends before a value.");
    if (token.kind === "operator" && (token.value === "+" || token.value === "-")) { position += 1; return { kind: "unary", operator: token.value, value: primary() }; }
    if (match("(")) { position += 1; const value = comparison(); if (!match(")")) throw new Error("The formula has an unmatched parenthesis."); position += 1; return value; }
    if (token.kind === "number" || token.kind === "string") { position += 1; return { kind: "literal", value: token.value }; }
    if (token.kind === "reference") { position += 1; return { kind: "reference", value: token.value }; }
    if (token.kind === "identifier") {
      position += 1;
      if (token.value === "TRUE" || token.value === "FALSE") return { kind: "literal", value: token.value === "TRUE" };
      if (!workspaceFormulaFunctions.has(token.value)) throw new Error(`Unsupported formula function: ${token.value}.`);
      if (!match("(")) throw new Error(`${token.value} must be followed by parentheses.`); position += 1;
      const argumentsList: WorkspaceFormulaNode[] = [];
      if (!match(")")) { while (true) { argumentsList.push(comparison()); if (argumentsList.length > 20) throw new Error("A formula function can contain at most 20 arguments."); if (match(")")) break; if (!match(",")) throw new Error(`${token.value} arguments must be comma separated.`); position += 1; } }
      position += 1; return { kind: "call", name: token.value, arguments: argumentsList };
    }
    throw new Error("The formula expected a literal, function, column reference, or parenthesis.");
  };
  const multiplication = (): WorkspaceFormulaNode => { let value = primary(); while (match("*") || match("/")) { const operator = String(tokens[position].value); position += 1; value = { kind: "binary", operator, left: value, right: primary() }; } return value; };
  const addition = (): WorkspaceFormulaNode => { let value = multiplication(); while (match("+") || match("-")) { const operator = String(tokens[position].value); position += 1; value = { kind: "binary", operator, left: value, right: multiplication() }; } return value; };
  const comparison = (): WorkspaceFormulaNode => { let value = addition(); if (["=", "!=", ">", ">=", "<", "<="].some(match)) { const operator = String(tokens[position].value); position += 1; value = { kind: "binary", operator, left: value, right: addition() }; } return value; };
  const tree = comparison(); if (position !== tokens.length) throw new Error("The formula contains an unexpected token."); return tree;
}

export function workspaceFormulaReferences(expression: string): string[] {
  const references: string[] = []; const visit = (node: WorkspaceFormulaNode) => { if (node.kind === "reference") references.push(node.value); else if (node.kind === "unary") visit(node.value); else if (node.kind === "binary") { visit(node.left); visit(node.right); } else if (node.kind === "call") node.arguments.forEach(visit); };
  visit(parseWorkspaceFormula(expression)); return Array.from(new Set(references));
}

function calculateWorkspaceFormula(expression: string, resolve: (columnId: string) => WorkspaceFormulaValue): WorkspaceFormulaValue {
  const numberValue = (value: WorkspaceFormulaValue): number | null => { if (value === null) return null; if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("#TYPE!"); return value; };
  const textValue = (value: WorkspaceFormulaValue): string | null => { if (value === null) return null; if (typeof value !== "string") throw new Error("#TYPE!"); return value; };
  const booleanValue = (value: WorkspaceFormulaValue): boolean | null => { if (value === null) return null; if (typeof value !== "boolean") throw new Error("#TYPE!"); return value; };
  const dateValue = (value: WorkspaceFormulaValue): string | null => { const text = textValue(value); if (text === null) return null; if (!isWorkspaceIsoDate(text)) throw new Error("#DATE!"); return text; };
  const boundedText = (value: string) => { if (value.length > 5_000) throw new Error("#LIMIT!"); return value; };
  const evaluate = (node: WorkspaceFormulaNode): WorkspaceFormulaValue => {
    if (node.kind === "literal") return node.value; if (node.kind === "reference") return resolve(node.value);
    if (node.kind === "unary") { const value = numberValue(evaluate(node.value)); return value === null ? null : node.operator === "-" ? -value : value; }
    if (node.kind === "binary") {
      const left = evaluate(node.left); const right = evaluate(node.right);
      if (["+", "-", "*", "/"].includes(node.operator)) { const a = numberValue(left), b = numberValue(right); if (a === null || b === null) return null; if (node.operator === "/" && b === 0) throw new Error("#DIV/0!"); return node.operator === "+" ? a + b : node.operator === "-" ? a - b : node.operator === "*" ? a * b : a / b; }
      if (left === null || right === null) return false;
      if (node.operator === "=" || node.operator === "!=") { const equal = typeof left === typeof right && left === right; return node.operator === "=" ? equal : !equal; }
      if (typeof left !== typeof right || (typeof left !== "number" && typeof left !== "string")) throw new Error("#TYPE!");
      return node.operator === ">" ? left > right : node.operator === ">=" ? left >= right : node.operator === "<" ? left < right : left <= right;
    }
    const args = node.arguments;
    const exact = (count: number) => { if (args.length !== count) throw new Error("#ARGS!"); };
    const range = (min: number, max: number) => { if (args.length < min || args.length > max) throw new Error("#ARGS!"); };
    if (node.name === "IF") { exact(3); const condition = booleanValue(evaluate(args[0])); return condition === null ? null : evaluate(condition ? args[1] : args[2]); }
    if (node.name === "AND" || node.name === "OR") { range(1, 20); const values = args.map((argument) => booleanValue(evaluate(argument))); if (values.some((value) => value === null)) return null; return node.name === "AND" ? values.every(Boolean) : values.some(Boolean); }
    if (node.name === "NOT") { exact(1); const value = booleanValue(evaluate(args[0])); return value === null ? null : !value; }
    if (node.name === "IS_EMPTY") { exact(1); const value = evaluate(args[0]); return value === null || value === ""; }
    if (node.name === "COALESCE") { range(1, 20); for (const argument of args) { const value = evaluate(argument); if (value !== null && value !== "") return value; } return null; }
    if (node.name === "CONCAT") { range(1, 20); return boundedText(args.map((argument) => { const value = evaluate(argument); return value === null ? "" : String(value); }).join("")); }
    if (node.name === "LOWER" || node.name === "UPPER") { exact(1); const value = textValue(evaluate(args[0])); return value === null ? null : boundedText(node.name === "LOWER" ? value.toLowerCase() : value.toUpperCase()); }
    if (node.name === "LENGTH") { exact(1); const value = textValue(evaluate(args[0])); return value === null ? null : Array.from(value).length; }
    if (node.name === "ABS") { exact(1); const value = numberValue(evaluate(args[0])); return value === null ? null : Math.abs(value); }
    if (node.name === "ROUND") { range(1, 2); const value = numberValue(evaluate(args[0])); const digits = args.length === 2 ? numberValue(evaluate(args[1])) : 0; if (value === null || digits === null) return null; if (!Number.isInteger(digits) || digits < -10 || digits > 10) throw new Error("#NUM!"); const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
    if (node.name === "MIN" || node.name === "MAX") { range(1, 20); const values = args.map((argument) => numberValue(evaluate(argument))); if (values.some((value) => value === null)) return null; return node.name === "MIN" ? Math.min(...values as number[]) : Math.max(...values as number[]); }
    if (node.name === "DAYS_BETWEEN") { exact(2); const start = dateValue(evaluate(args[0])), end = dateValue(evaluate(args[1])); return start === null || end === null ? null : Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000); }
    if (node.name === "ADD_DAYS") { exact(2); const date = dateValue(evaluate(args[0])), days = numberValue(evaluate(args[1])); if (date === null || days === null) return null; if (!Number.isInteger(days) || Math.abs(days) > 3_650_000) throw new Error("#NUM!"); const result = new Date(`${date}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + days); const output = result.toISOString().slice(0, 10); if (!isWorkspaceIsoDate(output)) throw new Error("#DATE!"); return output; }
    throw new Error("#FUNCTION!");
  };
  const result = evaluate(parseWorkspaceFormula(expression)); if (typeof result === "number" && !Number.isFinite(result)) throw new Error("#NUM!"); return result;
}

export function evaluateWorkspaceFormulas(definition: WorkspaceDatabaseDefinition, values: WorkspaceRowValues): WorkspaceRowValues {
  const columns = new Map(definition.columns.map((column) => [column.id, column])); const results: WorkspaceRowValues = {}; const evaluating = new Set<string>(); const errors = new Set<string>();
  const resolve = (columnId: string): WorkspaceFormulaValue => {
    const column = columns.get(columnId); if (!column) return null;
    if (column.type !== "formula") { const value = values[columnId]; return typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? value : null; }
    if (!column.formula) return null; if (errors.has(columnId)) throw new Error(String(results[columnId])); if (Object.prototype.hasOwnProperty.call(results, columnId)) return results[columnId] as WorkspaceFormulaValue;
    if (evaluating.has(columnId)) { results[columnId] = "#CYCLE!"; errors.add(columnId); throw new Error("#CYCLE!"); }
    evaluating.add(columnId);
    try {
      const result = calculateWorkspaceFormula(column.formula.expression, resolve); const expected = column.formula.resultType;
      if (result !== null && ((expected === "number" && typeof result !== "number") || (expected === "text" && typeof result !== "string") || (expected === "boolean" && typeof result !== "boolean") || (expected === "date" && typeof result !== "string"))) throw new Error("#TYPE!");
      if (expected === "date" && typeof result === "string" && !isWorkspaceIsoDate(result)) throw new Error("#DATE!");
      results[columnId] = result;
    } catch (error) { results[columnId] = error instanceof Error && error.message.startsWith("#") ? error.message : "#ERROR!"; errors.add(columnId); }
    evaluating.delete(columnId); if (errors.has(columnId)) throw new Error(String(results[columnId])); return results[columnId] as WorkspaceFormulaValue;
  };
  definition.columns.filter((column) => column.type === "formula").forEach((column) => { try { resolve(column.id); } catch { /* the visible result already contains the bounded error */ } });
  return results;
}

export function isWorkspaceComputedColumn(column: WorkspaceColumn): boolean { return column.type === "formula" || column.type === "rollup"; }

export function createWorkspaceColumn(type: WorkspaceColumn["type"] = "text", name = "Name"): WorkspaceColumn {
  const column: WorkspaceColumn = { id: `field_${Math.random().toString(36).slice(2, 12)}`, name, type, required: false, options: type === "select" ? ["Option 1"] : [] };
  if (type === "formula") column.formula = { expression: "0", resultType: "number" };
  return column;
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
    const present = Object.prototype.hasOwnProperty.call(parsedValues, column.id);
    const empty = value === undefined || value === null || value === "" || (column.type === "relation" && Array.isArray(value) && value.length === 0);
    if ((column.type === "formula" || column.type === "rollup") && present) throw new Error(`${column.name} is computed and cannot be written directly.`);
    if (column.required && empty) throw new Error(`${column.name} is required.`);
    if (empty) continue;
    if (column.type === "text" && (typeof value !== "string" || value.length > 5_000)) throw new Error(`${column.name} must be text under 5,000 characters.`);
    if (column.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${column.name} must be a finite number.`);
    if (column.type === "boolean" && typeof value !== "boolean") throw new Error(`${column.name} must be true or false.`);
    if (column.type === "date" && (typeof value !== "string" || !isWorkspaceIsoDate(value))) throw new Error(`${column.name} must be a valid date.`);
    if (column.type === "select" && (typeof value !== "string" || !column.options.includes(value))) throw new Error(`${column.name} must use an allowed option.`);
    if (column.type === "relation" && (!Array.isArray(value) || value.length > 50 || value.some((item) => !Number.isInteger(item) || item <= 0) || new Set(value).size !== value.length)) throw new Error(`${column.name} must contain up to 50 unique related row IDs.`);
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
  if (isWorkspaceComputedColumn(column)) return undefined;
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
  if (column.type === "relation") {
    const ids = trimmed.split(";").map((item) => Number(item.trim()));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error(`${column.name} must use positive row IDs separated by semicolons.`);
    return ids;
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
    ignoredComputedColumnCount: mappedColumns.filter(({ column }) => isWorkspaceComputedColumn(column)).length,
  };
}

function encodeWorkspaceCsvCell(value: string): string {
  const protectedValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function serializeWorkspaceTableCsv(definition: WorkspaceDatabaseDefinition, rows: Array<{ values: WorkspaceRowValues; computedValues?: WorkspaceRowValues }>): string {
  const parsedDefinition = workspaceDatabaseDefinitionSchema.parse(definition);
  const lines = [parsedDefinition.columns.map((column) => encodeWorkspaceCsvCell(`${column.id}::${column.name}`)).join(",")];
  rows.forEach((row) => {
    const values = validateWorkspaceRow(parsedDefinition, row.values);
    lines.push(parsedDefinition.columns.map((column) => {
      const value = isWorkspaceComputedColumn(column) ? row.computedValues?.[column.id] : values[column.id];
      const serialized = column.type === "relation" && Array.isArray(value) ? value.join(";") : value === undefined || value === null ? "" : String(value);
      return encodeWorkspaceCsvCell(serialized);
    }).join(","));
  });
  return lines.join("\r\n");
}

export function validateWorkspaceFormFields(definition: WorkspaceDatabaseDefinition, fieldIds: string[]): void {
  const fields = new Set(fieldIds);
  const columns = new Set(definition.columns.map((column) => column.id));
  if (fieldIds.some((id) => !columns.has(id))) throw new Error("Every form field must exist in its database.");
  if (definition.columns.some((column) => fieldIds.includes(column.id) && isWorkspaceComputedColumn(column))) throw new Error("Forms cannot write formula or rollup columns.");
  const missingRequired = definition.columns.find((column) => column.required && !fields.has(column.id));
  if (missingRequired) throw new Error(`Required field ${missingRequired.name} must be included in the form.`);
}

export function validateWorkspaceTableView(definition: WorkspaceDatabaseDefinition, view: WorkspaceTableViewDefinition): void {
  const columns = new Set(definition.columns.map((column) => column.id));
  if (view.sortColumnId && !columns.has(view.sortColumnId)) throw new Error("The view sort column must exist in its table.");
  if (view.groupColumnId && !columns.has(view.groupColumnId)) throw new Error("The view group column must exist in its table.");
}

function workspaceProjectedRowValue(row: { values: WorkspaceRowValues; computedValues?: WorkspaceRowValues }, columnId: string): unknown {
  return Object.prototype.hasOwnProperty.call(row.computedValues || {}, columnId) ? row.computedValues?.[columnId] : row.values[columnId];
}

export function filterAndSortWorkspaceRows<T extends { id: number; values: WorkspaceRowValues; computedValues?: WorkspaceRowValues }>(
  rows: readonly T[],
  definition: WorkspaceDatabaseDefinition,
  query: string,
  sortColumnId: string | null,
  direction: WorkspaceRowSortDirection,
): T[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => definition.columns.some((column) => String(workspaceProjectedRowValue(row, column.id) ?? "").toLowerCase().includes(needle)))
    : [...rows];
  if (!sortColumnId) return filtered;
  if (!definition.columns.some((column) => column.id === sortColumnId)) throw new Error("Choose a column from this table.");
  const multiplier = direction === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    const leftValue = workspaceProjectedRowValue(left, sortColumnId);
    const rightValue = workspaceProjectedRowValue(right, sortColumnId);
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

export function groupWorkspaceRows<T extends { id: number; values: WorkspaceRowValues; computedValues?: WorkspaceRowValues }>(rows: readonly T[], definition: WorkspaceDatabaseDefinition, groupColumnId: string | null): Array<{ key: string; label: string; rows: T[] }> {
  if (!groupColumnId) return [{ key: "all", label: "All rows", rows: [...rows] }];
  if (!definition.columns.some((column) => column.id === groupColumnId)) throw new Error("Choose a group column from this table.");
  const groups = new Map<string, { key: string; label: string; rows: T[] }>();
  for (const row of rows) {
    const value = workspaceProjectedRowValue(row, groupColumnId);
    const label = value === undefined || value === null || value === "" ? "Empty" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    const key = `${typeof value}:${label}`;
    const group = groups.get(key) || { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}
