import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import { workspaceDatabaseRowRevisions, workspaceDatabaseRevisions, workspaceDatabaseRows, workspaceDatabases, workspaceFormAccessGrants, workspaceForms, workspaceFormSubmissionReceipts, workspaceTableViews } from "@shared/schema";
import {
  createWorkspaceDatabaseSchema, createWorkspaceFormAccessGrantSchema, createWorkspaceFormSchema, createWorkspaceTableViewSchema, defaultWorkspaceFormDefinition, updateWorkspaceDatabaseSchema, updateWorkspaceFormSchema, updateWorkspaceTableViewSchema,
  evaluateWorkspaceFormulas, validateWorkspaceFormDefinition, validateWorkspaceFormFields, validateWorkspaceFormSubmission, validateWorkspaceRow, validateWorkspaceTableView, workspaceBulkRowDeleteSchema, workspaceDatabaseDefinitionSchema, workspaceDatabaseRevisionSnapshotSchema, workspaceFormDefinitionSchema, workspaceRowRequestSchema, workspaceRowRevisionSnapshotSchema, workspaceTableRowImportSchema, workspaceTableViewDefinitionSchema, workspaceUnlinkReferencesSchema,
  type WorkspaceColumn, type WorkspaceDatabaseDefinition, type WorkspaceRelationOptions, type WorkspaceRowBacklink, type WorkspaceRowValues,
} from "@shared/tables";
import { db } from "../db";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

function idParam(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ownedDatabase(id: number, userId: number) {
  const [record] = await db.select().from(workspaceDatabases).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, userId))).limit(1);
  return record;
}

function badRequest(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid request";
  return res.status(400).json({ error: message });
}

function expectedRevision(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

function publicIdParam(value: string): string | null { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
function formBearerToken(req: Request): string | null {
  const match = req.header("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] || null;
}
function formTokenHash(token: string): string { return crypto.createHash("sha256").update(token).digest("hex"); }

type TableTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockWorkspaceTableDomain(tx: TableTransaction, userId: number) { await tx.execute(sql`SELECT pg_advisory_xact_lock(128092, ${userId})`); }
async function lockedOwnedDatabase(tx: TableTransaction, databaseId: number, userId: number) {
  await lockWorkspaceTableDomain(tx, userId);
  const locked = await tx.execute(sql`SELECT id FROM workspace_databases WHERE id = ${databaseId} AND user_id = ${userId} FOR UPDATE`);
  if (!locked.rows.length) return undefined;
  const [database] = await tx.select().from(workspaceDatabases).where(and(eq(workspaceDatabases.id, databaseId), eq(workspaceDatabases.userId, userId))).limit(1);
  return database;
}
const scalarDisplayTypes = new Set<WorkspaceColumn["type"]>(["text", "number", "boolean", "date", "select", "url"]);
async function validateOwnedTableDefinitions(tx: TableTransaction, userId: number, candidate?: { id: number; definition: WorkspaceDatabaseDefinition }) {
  const records = await tx.select({ id: workspaceDatabases.id, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(eq(workspaceDatabases.userId, userId));
  const definitions = new Map(records.map((record) => [record.id, candidate?.id === record.id ? candidate.definition : workspaceDatabaseDefinitionSchema.parse(record.definition)]));
  if (candidate && !definitions.has(candidate.id)) definitions.set(candidate.id, candidate.definition);
  for (const [databaseId, definition] of Array.from(definitions.entries())) {
    for (const column of definition.columns) {
      if (column.type === "relation" && column.relation) {
        const target = definitions.get(column.relation.databaseId);
        if (!target) throw new Error(`${column.name} must target one of your Tables.`);
        const display = target.columns.find((candidateColumn) => candidateColumn.id === column.relation!.displayColumnId);
        if (!display || !scalarDisplayTypes.has(display.type)) throw new Error(`${column.name} must use a stored scalar display column from its target Table.`);
      }
      if (column.type === "rollup" && column.rollup) {
        const relation = definition.columns.find((candidateColumn) => candidateColumn.id === column.rollup!.relationColumnId);
        const target = relation?.relation ? definitions.get(relation.relation.databaseId) : undefined;
        const targetColumn = target?.columns.find((candidateColumn) => candidateColumn.id === column.rollup!.targetColumnId);
        if (!relation || relation.type !== "relation" || !target || !targetColumn) throw new Error(`${column.name} must use a valid relation and target column.`);
        if (column.rollup.aggregation === "count" && !scalarDisplayTypes.has(targetColumn.type)) throw new Error(`${column.name} must count a stored scalar target column.`);
        if (column.rollup.aggregation !== "count" && targetColumn.type !== "number") throw new Error(`${column.name} can only ${column.rollup.aggregation} a stored number column.`);
      }
    }
    if (!definitions.has(databaseId)) throw new Error("Table definition validation failed.");
  }
}

async function validateWorkspaceRelationValues(tx: TableTransaction, definition: WorkspaceDatabaseDefinition, rows: WorkspaceRowValues[], userId: number) {
  for (const column of definition.columns.filter((candidate) => candidate.type === "relation" && candidate.relation)) {
    const ids = Array.from(new Set(rows.flatMap((values) => Array.isArray(values[column.id]) ? values[column.id] as number[] : [])));
    if (!ids.length) continue;
    const found = await tx.select({ id: workspaceDatabaseRows.id }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.userId, userId), eq(workspaceDatabaseRows.databaseId, column.relation!.databaseId), inArray(workspaceDatabaseRows.id, ids)));
    if (found.length !== ids.length) throw new Error(`${column.name} contains a related row that no longer exists.`);
  }
}

type WorkspaceRowReference = WorkspaceRowBacklink & { targetRowId: number };
async function workspaceRowReferences(tx: TableTransaction, targetDatabaseId: number, targetRowIds: number[], userId: number): Promise<{ entries: WorkspaceRowReference[]; truncated: boolean }> {
  if (!targetRowIds.length) return { entries: [], truncated: false };
  const records = await tx.select({ id: workspaceDatabases.id, title: workspaceDatabases.title, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(eq(workspaceDatabases.userId, userId));
  const sources = records.flatMap((record) => workspaceDatabaseDefinitionSchema.parse(record.definition).columns.filter((column) => column.type === "relation" && column.relation?.databaseId === targetDatabaseId).map((column) => ({ databaseId: record.id, databaseTitle: record.title, column })));
  const entries: WorkspaceRowReference[] = []; const seen = new Set<string>();
  for (const source of sources) {
    for (let offset = 0; offset < targetRowIds.length; offset += 100) {
      const chunk = targetRowIds.slice(offset, offset + 100); const predicate = `$."${source.column.id}"[*] ? (${chunk.map((rowId) => `@ == ${rowId}`).join(" || ")})`;
      const matches = await tx.select({ id: workspaceDatabaseRows.id, values: workspaceDatabaseRows.values }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.userId, userId), eq(workspaceDatabaseRows.databaseId, source.databaseId), sql<boolean>`jsonb_path_exists(${workspaceDatabaseRows.values}, ${predicate}::jsonpath)`)).limit(501);
      for (const row of matches) {
        const selected = Array.isArray((row.values as WorkspaceRowValues)[source.column.id]) ? (row.values as WorkspaceRowValues)[source.column.id] as number[] : [];
        for (const targetRowId of selected.filter((rowId) => chunk.includes(rowId))) {
          if (source.databaseId === targetDatabaseId && row.id === targetRowId) continue;
          const key = `${source.databaseId}:${row.id}:${source.column.id}:${targetRowId}`; if (seen.has(key)) continue; seen.add(key);
          entries.push({ targetRowId, sourceDatabaseId: source.databaseId, sourceDatabaseTitle: source.databaseTitle, sourceRowId: row.id, relationColumnId: source.column.id, relationColumnName: source.column.name });
          if (entries.length > 500) return { entries: entries.slice(0, 500), truncated: true };
        }
      }
      if (matches.length > 500) return { entries: entries.slice(0, 500), truncated: true };
    }
  }
  return { entries, truncated: false };
}

async function workspaceTableProjection(databaseId: number, userId: number, definition: WorkspaceDatabaseDefinition, rows: Array<{ id: number; values: unknown }>) {
  const relationColumns = definition.columns.filter((column) => column.type === "relation" && column.relation);
  const targetIds = Array.from(new Set(relationColumns.map((column) => column.relation!.databaseId)));
  const [targetDatabases, targetRows] = await Promise.all([
    targetIds.length ? db.select({ id: workspaceDatabases.id, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(and(eq(workspaceDatabases.userId, userId), inArray(workspaceDatabases.id, targetIds))) : [],
    targetIds.length ? db.select({ id: workspaceDatabaseRows.id, databaseId: workspaceDatabaseRows.databaseId, values: workspaceDatabaseRows.values }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.userId, userId), inArray(workspaceDatabaseRows.databaseId, targetIds))) : [],
  ]);
  const targetDefinitions = new Map(targetDatabases.map((record) => [record.id, workspaceDatabaseDefinitionSchema.parse(record.definition)]));
  const rowsByTarget = new Map<number, typeof targetRows>();
  targetRows.forEach((row) => rowsByTarget.set(row.databaseId, [...(rowsByTarget.get(row.databaseId) || []), row]));
  const relationOptions: WorkspaceRelationOptions = {};
  for (const column of relationColumns) {
    const config = column.relation!; const displayColumn = targetDefinitions.get(config.databaseId)?.columns.find((candidate) => candidate.id === config.displayColumnId);
    relationOptions[column.id] = (rowsByTarget.get(config.databaseId) || []).map((row) => {
      const value = (row.values as WorkspaceRowValues)[config.displayColumnId];
      const label = value === undefined || value === null || value === "" ? `Row #${row.id}` : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
      return { id: row.id, label: displayColumn ? label : `Row #${row.id}` };
    }).sort((left, right) => left.label.localeCompare(right.label) || left.id - right.id);
  }
  const references = rows.length ? await db.transaction((tx) => workspaceRowReferences(tx, databaseId, rows.map((row) => row.id), userId)) : { entries: [], truncated: false };
  const backlinksByRow = new Map<number, WorkspaceRowBacklink[]>();
  references.entries.forEach(({ targetRowId, ...entry }) => backlinksByRow.set(targetRowId, [...(backlinksByRow.get(targetRowId) || []), entry]));
  const projectedRows = rows.map((row) => {
    const values = row.values as WorkspaceRowValues; const computedValues = evaluateWorkspaceFormulas(definition, values);
    for (const column of relationColumns) {
      const selected = Array.isArray(values[column.id]) ? values[column.id] as number[] : []; const options = new Map((relationOptions[column.id] || []).map((option) => [option.id, option.label]));
      computedValues[column.id] = selected.map((rowId) => options.get(rowId) || `Missing row #${rowId}`).join(", ");
    }
    for (const column of definition.columns.filter((candidate) => candidate.type === "rollup" && candidate.rollup)) {
      const config = column.rollup!; const relation = definition.columns.find((candidate) => candidate.id === config.relationColumnId)!;
      const selected = Array.isArray(values[relation.id]) ? values[relation.id] as number[] : []; const selectedSet = new Set(selected);
      const related = (rowsByTarget.get(relation.relation!.databaseId) || []).filter((targetRow) => selectedSet.has(targetRow.id));
      if (config.aggregation === "count") computedValues[column.id] = related.length;
      else {
        const numbers = related.map((targetRow) => (targetRow.values as WorkspaceRowValues)[config.targetColumnId]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        computedValues[column.id] = !numbers.length ? null : config.aggregation === "sum" ? numbers.reduce((sum, value) => sum + value, 0) : config.aggregation === "average" ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : config.aggregation === "min" ? Math.min(...numbers) : Math.max(...numbers);
      }
    }
    return { ...row, computedValues, backlinks: backlinksByRow.get(row.id) || [], backlinksTruncated: references.truncated };
  });
  return { rows: projectedRows, relationOptions, databaseId };
}

async function tableDefinitionReferrers(tx: TableTransaction, targetDatabaseId: number, userId: number) {
  const records = await tx.select({ id: workspaceDatabases.id, title: workspaceDatabases.title, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(eq(workspaceDatabases.userId, userId));
  return records.filter((record) => record.id !== targetDatabaseId && workspaceDatabaseDefinitionSchema.parse(record.definition).columns.some((column) => column.type === "relation" && column.relation?.databaseId === targetDatabaseId));
}

async function relatedRowReferenceExists(tx: TableTransaction, targetDatabaseId: number, targetRowIds: number[], userId: number): Promise<boolean> {
  const records = await tx.select({ id: workspaceDatabases.id, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(eq(workspaceDatabases.userId, userId));
  for (const record of records) {
    const relationColumns = workspaceDatabaseDefinitionSchema.parse(record.definition).columns.filter((column) => column.type === "relation" && column.relation?.databaseId === targetDatabaseId);
    for (const column of relationColumns) {
      const predicate = `$."${column.id}"[*] ? (${targetRowIds.map((rowId) => `@ == ${rowId}`).join(" || ")})`;
      const conditions = [eq(workspaceDatabaseRows.userId, userId), eq(workspaceDatabaseRows.databaseId, record.id), sql<boolean>`jsonb_path_exists(${workspaceDatabaseRows.values}, ${predicate}::jsonpath)`];
      if (record.id === targetDatabaseId) conditions.push(not(inArray(workspaceDatabaseRows.id, targetRowIds)));
      const [match] = await tx.select({ id: workspaceDatabaseRows.id }).from(workspaceDatabaseRows).where(and(...conditions)).limit(1);
      if (match) return true;
    }
  }
  return false;
}
async function validateDefinitionDependents(tx: TableTransaction, databaseId: number, userId: number, definition: ReturnType<typeof workspaceDatabaseDefinitionSchema.parse>) {
  const rows = await tx.select({ values: workspaceDatabaseRows.values }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, userId)));
  rows.forEach((row) => validateWorkspaceRow(definition, row.values as WorkspaceRowValues));
  await validateWorkspaceRelationValues(tx, definition, rows.map((row) => row.values as WorkspaceRowValues), userId);
  const forms = await tx.select({ fieldIds: workspaceForms.fieldIds, definition: workspaceForms.definition }).from(workspaceForms).where(and(eq(workspaceForms.databaseId, databaseId), eq(workspaceForms.userId, userId)));
  forms.forEach((form) => validateWorkspaceFormDefinition(definition, form.fieldIds as string[], workspaceFormDefinitionSchema.parse(form.definition)));
  const views = await tx.select({ definition: workspaceTableViews.definition }).from(workspaceTableViews).where(and(eq(workspaceTableViews.databaseId, databaseId), eq(workspaceTableViews.userId, userId)));
  views.forEach((view) => validateWorkspaceTableView(definition, workspaceTableViewDefinitionSchema.parse(view.definition)));
}

export function registerTableRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/databases") || req.path.startsWith("/api/forms") || req.path.startsWith("/api/public/forms")) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie, Authorization");
    }
    next();
  });

  app.get("/api/databases", isAuthenticated, async (req, res) => {
    const records = await db.select().from(workspaceDatabases).where(eq(workspaceDatabases.userId, req.session.userId!)).orderBy(desc(workspaceDatabases.updatedAt));
    res.json({ databases: records });
  });
  app.post("/api/databases", isAuthenticated, async (req, res) => {
    try {
      const input = createWorkspaceDatabaseSchema.parse(req.body);
      const database = await db.transaction(async (tx) => {
        await lockWorkspaceTableDomain(tx, req.session.userId!);
        const [created] = await tx.insert(workspaceDatabases).values({ ...input, userId: req.session.userId! }).returning();
        await validateOwnedTableDefinitions(tx, req.session.userId!);
        await tx.insert(workspaceDatabaseRevisions).values({ userId: req.session.userId!, databaseId: created.id, revisionNumber: 1, action: "created", snapshot: { title: created.title, description: created.description, category: created.category, favorite: created.favorite, definition: created.definition } });
        return created;
      });
      res.status(201).json({ database });
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/databases/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
    const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const [rows, forms, views] = await Promise.all([
      db.select().from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, id), eq(workspaceDatabaseRows.userId, req.session.userId!))).orderBy(desc(workspaceDatabaseRows.updatedAt)),
      db.select().from(workspaceForms).where(and(eq(workspaceForms.databaseId, id), eq(workspaceForms.userId, req.session.userId!))).orderBy(desc(workspaceForms.updatedAt)),
      db.select().from(workspaceTableViews).where(and(eq(workspaceTableViews.databaseId, id), eq(workspaceTableViews.userId, req.session.userId!))).orderBy(workspaceTableViews.name),
    ]);
    const projection = await workspaceTableProjection(id, req.session.userId!, workspaceDatabaseDefinitionSchema.parse(database.definition), rows);
    res.json({ database, rows: projection.rows, relationOptions: projection.relationOptions, forms, views });
  });
  app.patch("/api/databases/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const input = updateWorkspaceDatabaseSchema.parse(req.body);
      const expected = expectedRevision(req.header("x-lyfeos-expected-revision"));
      if (!expected) return res.status(req.header("x-lyfeos-expected-revision") ? 400 : 428).json({ error: "Reload this table before saving changes." });
      const outcome = await db.transaction(async (tx) => {
        const current = await lockedOwnedDatabase(tx, id, req.session.userId!);
        if (!current) return { kind: "missing" } as const;
        if (current.revision !== expected) return { kind: "conflict", currentRevision: current.revision } as const;
        if (input.definition) { await validateOwnedTableDefinitions(tx, req.session.userId!, { id, definition: input.definition }); await validateDefinitionDependents(tx, id, req.session.userId!, input.definition); }
        const nextRevision = current.revision + 1;
        const [updated] = await tx.update(workspaceDatabases).set({ ...input, revision: nextRevision, updatedAt: new Date() }).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, req.session.userId!))).returning();
        await tx.insert(workspaceDatabaseRevisions).values({ userId: req.session.userId!, databaseId: id, revisionNumber: nextRevision, action: "updated", snapshot: { title: updated.title, description: updated.description, category: updated.category, favorite: updated.favorite, definition: updated.definition } });
        return { kind: "updated", database: updated } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "conflict") return res.status(409).json({ error: "This table changed after you opened it. Reload before saving.", currentRevision: outcome.currentRevision });
      res.json({ database: outcome.database });
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/databases/:id/revisions", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
    const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const revisions = await db.select({ revisionNumber: workspaceDatabaseRevisions.revisionNumber, action: workspaceDatabaseRevisions.action, sourceRevision: workspaceDatabaseRevisions.sourceRevision, createdAt: workspaceDatabaseRevisions.createdAt })
      .from(workspaceDatabaseRevisions)
      .where(and(eq(workspaceDatabaseRevisions.databaseId, id), eq(workspaceDatabaseRevisions.userId, req.session.userId!)))
      .orderBy(desc(workspaceDatabaseRevisions.revisionNumber)).limit(100);
    res.json({ revisions, currentRevision: database.revision, disclosure: "History is immutable. Restoring creates a new revision." });
  });
  app.post("/api/databases/:id/revisions/:revisionNumber/restore", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id), sourceRevision = idParam(req.params.revisionNumber);
      if (!id || !sourceRevision) return res.status(400).json({ error: "Invalid revision" });
      const expected = expectedRevision(req.header("x-lyfeos-expected-revision"));
      if (!expected) return res.status(req.header("x-lyfeos-expected-revision") ? 400 : 428).json({ error: "Reload this table before restoring." });
      const outcome = await db.transaction(async (tx) => {
        const current = await lockedOwnedDatabase(tx, id, req.session.userId!);
        if (!current) return { kind: "missing" } as const;
        if (current.revision !== expected) return { kind: "conflict", currentRevision: current.revision } as const;
        const [source] = await tx.select().from(workspaceDatabaseRevisions).where(and(eq(workspaceDatabaseRevisions.databaseId, id), eq(workspaceDatabaseRevisions.userId, req.session.userId!), eq(workspaceDatabaseRevisions.revisionNumber, sourceRevision))).limit(1);
        if (!source) return { kind: "revision-missing" } as const;
        const snapshot = workspaceDatabaseRevisionSnapshotSchema.parse(source.snapshot);
        await validateOwnedTableDefinitions(tx, req.session.userId!, { id, definition: snapshot.definition });
        await validateDefinitionDependents(tx, id, req.session.userId!, snapshot.definition);
        const nextRevision = current.revision + 1;
        const [database] = await tx.update(workspaceDatabases).set({ ...snapshot, revision: nextRevision, updatedAt: new Date() }).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, req.session.userId!))).returning();
        await tx.insert(workspaceDatabaseRevisions).values({ userId: req.session.userId!, databaseId: id, revisionNumber: nextRevision, action: "restored", sourceRevision, snapshot });
        return { kind: "restored", database } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "revision-missing") return res.status(404).json({ error: "Revision not found" });
      if (outcome.kind === "conflict") return res.status(409).json({ error: "This table changed after you opened it. Reload before restoring.", currentRevision: outcome.currentRevision });
      res.json({ database: outcome.database });
    } catch (error) { return badRequest(res, error); }
  });
  app.delete("/api/databases/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        const referrers = await tableDefinitionReferrers(tx, id, req.session.userId!);
        if (referrers.length) return { kind: "referenced", titles: referrers.slice(0, 3).map((record) => record.title) } as const;
        await tx.delete(workspaceDatabases).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, req.session.userId!)));
        return { kind: "deleted" } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "referenced") return res.status(409).json({ error: `Remove relations from ${outcome.titles.join(", ")} before deleting this Table.` });
      res.status(204).end();
    } catch (error) { return badRequest(res, error); }
  });
  app.post("/api/databases/:id/rows", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition); const values = validateWorkspaceRow(definition, input.values);
        await validateWorkspaceRelationValues(tx, definition, [values], req.session.userId!);
        const [row] = await tx.insert(workspaceDatabaseRows).values({ userId: req.session.userId!, databaseId: id, values }).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId: id, rowId: row.id, revisionNumber: 1, action: "created", snapshot: { values } });
        return { kind: "created", row } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      res.status(201).json({ row: outcome.row });
    } catch (error) { return badRequest(res, error); }
  });
  app.post("/api/databases/:id/rows/import", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const input = workspaceTableRowImportSchema.parse(req.body);
      const expected = expectedRevision(req.header("x-lyfeos-expected-revision"));
      if (!expected) return res.status(req.header("x-lyfeos-expected-revision") ? 400 : 428).json({ error: "Reload this table before importing rows." });
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        if (database.revision !== expected) return { kind: "conflict", currentRevision: database.revision } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition);
        const validatedRows = input.rows.map((values) => validateWorkspaceRow(definition, values));
        await validateWorkspaceRelationValues(tx, definition, validatedRows, req.session.userId!);
        const rows = await tx.insert(workspaceDatabaseRows).values(validatedRows.map((values) => ({ userId: req.session.userId!, databaseId: id, values }))).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values(rows.map((row) => ({ userId: req.session.userId!, databaseId: id, rowId: row.id, revisionNumber: 1, action: "created", snapshot: { values: row.values as WorkspaceRowValues } })));
        return { kind: "imported", rows } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "conflict") return res.status(409).json({ error: "This table definition changed after you reviewed the import. Reload and review the file again.", currentRevision: outcome.currentRevision });
      res.status(201).json({ importedCount: outcome.rows.length, rowIds: outcome.rows.map((row) => row.id), disclosure: "Rows were added atomically to this Table; existing rows were not changed." });
    } catch (error) { return badRequest(res, error); }
  });
  app.patch("/api/databases/:databaseId/rows/:rowId", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId);
      if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const expected = expectedRevision(req.header("x-lyfeos-expected-revision")); if (!expected) return res.status(req.header("x-lyfeos-expected-revision") ? 400 : 428).json({ error: "Reload this row before saving changes." });
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition); const values = validateWorkspaceRow(definition, input.values);
        await validateWorkspaceRelationValues(tx, definition, [values], req.session.userId!);
        const locked = await tx.execute(sql`SELECT id FROM workspace_database_rows WHERE id = ${rowId} AND database_id = ${databaseId} AND user_id = ${req.session.userId!} FOR UPDATE`);
        if (!locked.rows.length) return { kind: "missing" } as const;
        const [current] = await tx.select().from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
        if (current.revision !== expected) return { kind: "conflict", currentRevision: current.revision } as const;
        const nextRevision = current.revision + 1;
        const [row] = await tx.update(workspaceDatabaseRows).set({ values, revision: nextRevision, updatedAt: new Date() }).where(eq(workspaceDatabaseRows.id, rowId)).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId, rowId, revisionNumber: nextRevision, action: "updated", snapshot: { values } });
        return { kind: "updated", row } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Row not found" });
      if (outcome.kind === "conflict") return res.status(409).json({ error: "This row changed after you opened it. Reload before saving.", currentRevision: outcome.currentRevision });
      res.json({ row: outcome.row });
    } catch (error) { return badRequest(res, error); }
  });
  app.delete("/api/databases/:databaseId/rows/:rowId", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId);
      if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const [existing] = await tx.select({ id: workspaceDatabaseRows.id }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
        if (!existing) return { kind: "missing" } as const;
        if (await relatedRowReferenceExists(tx, databaseId, [rowId], req.session.userId!)) return { kind: "referenced" } as const;
        await tx.delete(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!)));
        return { kind: "deleted" } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Row not found" });
      if (outcome.kind === "referenced") return res.status(409).json({ error: "Remove this row from related records before deleting it." });
      res.status(204).end();
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/databases/:databaseId/rows/:rowId/references", isAuthenticated, async (req, res) => {
    const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId); if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
    const database = await ownedDatabase(databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const [row] = await db.select({ id: workspaceDatabaseRows.id }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
    if (!row) return res.status(404).json({ error: "Row not found" });
    const references = await db.transaction((tx) => workspaceRowReferences(tx, databaseId, [rowId], req.session.userId!));
    res.json({ references: references.entries.map(({ targetRowId: _targetRowId, ...entry }) => entry), referenceCount: references.entries.length, truncated: references.truncated, disclosure: "Unlinking removes only these relation IDs from source rows and appends immutable row revisions. It does not delete either record." });
  });
  app.post("/api/databases/:databaseId/rows/:rowId/unlink-references", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId); if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
      const input = workspaceUnlinkReferencesSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const [target] = await tx.select({ id: workspaceDatabaseRows.id }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
        if (!target) return { kind: "missing" } as const;
        let entries: WorkspaceRowReference[];
        if (input.reviewedReferences) entries = input.reviewedReferences.map((reference) => ({ ...reference, targetRowId: rowId, sourceDatabaseTitle: "", relationColumnName: "" }));
        else {
          const references = await workspaceRowReferences(tx, databaseId, [rowId], req.session.userId!);
          if (references.truncated) return { kind: "too-many" } as const;
          if (references.entries.length !== input.referenceCount) return { kind: "changed", referenceCount: references.entries.length } as const;
          entries = references.entries;
        }
        const rowIds = Array.from(new Set(entries.map((entry) => entry.sourceRowId))); const databaseIds = Array.from(new Set(entries.map((entry) => entry.sourceDatabaseId)));
        const [sourceRows, sourceDatabases] = await Promise.all([
          rowIds.length ? tx.select().from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.userId, req.session.userId!), inArray(workspaceDatabaseRows.id, rowIds))) : [],
          databaseIds.length ? tx.select({ id: workspaceDatabases.id, definition: workspaceDatabases.definition }).from(workspaceDatabases).where(and(eq(workspaceDatabases.userId, req.session.userId!), inArray(workspaceDatabases.id, databaseIds))) : [],
        ]);
        const definitions = new Map(sourceDatabases.map((record) => [record.id, workspaceDatabaseDefinitionSchema.parse(record.definition)]));
        if (input.reviewedReferences) {
          const rows = new Map(sourceRows.map((row) => [`${row.databaseId}:${row.id}`, row]));
          const current = entries.every((entry) => {
            const sourceRow = rows.get(`${entry.sourceDatabaseId}:${entry.sourceRowId}`); const definition = definitions.get(entry.sourceDatabaseId);
            const column = definition?.columns.find((candidate) => candidate.id === entry.relationColumnId);
            const selected = sourceRow && Array.isArray((sourceRow.values as WorkspaceRowValues)[entry.relationColumnId]) ? (sourceRow.values as WorkspaceRowValues)[entry.relationColumnId] as number[] : [];
            return column?.type === "relation" && column.relation?.databaseId === databaseId && selected.includes(rowId);
          });
          if (!current) return { kind: "reviewed-changed" } as const;
        }
        for (const sourceRow of sourceRows) {
          const definition = definitions.get(sourceRow.databaseId); if (!definition) throw new Error("A referring Table no longer exists.");
          const values = { ...(sourceRow.values as WorkspaceRowValues) };
          for (const reference of entries.filter((entry) => entry.sourceRowId === sourceRow.id && entry.sourceDatabaseId === sourceRow.databaseId)) {
            const selected = Array.isArray(values[reference.relationColumnId]) ? values[reference.relationColumnId] as number[] : [];
            values[reference.relationColumnId] = selected.filter((selectedId) => selectedId !== rowId);
          }
          const validated = validateWorkspaceRow(definition, values); await validateWorkspaceRelationValues(tx, definition, [validated], req.session.userId!);
          const nextRevision = sourceRow.revision + 1;
          await tx.update(workspaceDatabaseRows).set({ values: validated, revision: nextRevision, updatedAt: new Date() }).where(and(eq(workspaceDatabaseRows.id, sourceRow.id), eq(workspaceDatabaseRows.databaseId, sourceRow.databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!)));
          await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId: sourceRow.databaseId, rowId: sourceRow.id, revisionNumber: nextRevision, action: "updated", snapshot: { values: validated } });
        }
        return { kind: "unlinked", referenceCount: entries.length, affectedRowCount: sourceRows.length } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Row not found" });
      if (outcome.kind === "too-many") return res.status(409).json({ error: "This row has more than 500 references. Unlink source records in smaller groups." });
      if (outcome.kind === "changed") return res.status(409).json({ error: "References changed after review. Review them again.", referenceCount: outcome.referenceCount });
      if (outcome.kind === "reviewed-changed") return res.status(409).json({ error: "One or more reviewed references changed. Review this batch again." });
      res.json({ unlinkedReferenceCount: outcome.referenceCount, affectedRowCount: outcome.affectedRowCount });
    } catch (error) { return badRequest(res, error); }
  });
  app.post("/api/databases/:id/rows/bulk-delete", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const { rowIds } = workspaceBulkRowDeleteSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        if (await relatedRowReferenceExists(tx, id, rowIds, req.session.userId!)) return { kind: "referenced" } as const;
        const deleted = await tx.delete(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, id), eq(workspaceDatabaseRows.userId, req.session.userId!), inArray(workspaceDatabaseRows.id, rowIds))).returning({ id: workspaceDatabaseRows.id });
        return { kind: "deleted", deleted } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "referenced") return res.status(409).json({ error: "Remove the selected rows from related records before deleting them." });
      res.json({ deletedRowIds: outcome.deleted.map((row) => row.id), deletedCount: outcome.deleted.length });
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/databases/:databaseId/rows/:rowId/revisions", isAuthenticated, async (req, res) => {
    const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId);
    if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
    const database = await ownedDatabase(databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const [row] = await db.select({ revision: workspaceDatabaseRows.revision }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
    if (!row) return res.status(404).json({ error: "Row not found" });
    const revisions = await db.select({ revisionNumber: workspaceDatabaseRowRevisions.revisionNumber, action: workspaceDatabaseRowRevisions.action, sourceRevision: workspaceDatabaseRowRevisions.sourceRevision, createdAt: workspaceDatabaseRowRevisions.createdAt })
      .from(workspaceDatabaseRowRevisions)
      .where(and(eq(workspaceDatabaseRowRevisions.databaseId, databaseId), eq(workspaceDatabaseRowRevisions.rowId, rowId), eq(workspaceDatabaseRowRevisions.userId, req.session.userId!)))
      .orderBy(desc(workspaceDatabaseRowRevisions.revisionNumber)).limit(100);
    res.json({ revisions, currentRevision: row.revision, disclosure: "History is immutable. Restoring creates a new revision." });
  });
  app.post("/api/databases/:databaseId/rows/:rowId/revisions/:revisionNumber/restore", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId), sourceRevision = idParam(req.params.revisionNumber);
      if (!databaseId || !rowId || !sourceRevision) return res.status(400).json({ error: "Invalid revision" });
      const expected = expectedRevision(req.header("x-lyfeos-expected-revision"));
      if (!expected) return res.status(req.header("x-lyfeos-expected-revision") ? 400 : 428).json({ error: "Reload this row before restoring." });
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition);
        const locked = await tx.execute(sql`SELECT id FROM workspace_database_rows WHERE id = ${rowId} AND database_id = ${databaseId} AND user_id = ${req.session.userId!} FOR UPDATE`);
        if (!locked.rows.length) return { kind: "missing" } as const;
        const [current] = await tx.select().from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).limit(1);
        if (current.revision !== expected) return { kind: "conflict", currentRevision: current.revision } as const;
        const [source] = await tx.select().from(workspaceDatabaseRowRevisions).where(and(eq(workspaceDatabaseRowRevisions.databaseId, databaseId), eq(workspaceDatabaseRowRevisions.rowId, rowId), eq(workspaceDatabaseRowRevisions.userId, req.session.userId!), eq(workspaceDatabaseRowRevisions.revisionNumber, sourceRevision))).limit(1);
        if (!source) return { kind: "revision-missing" } as const;
        const snapshot = workspaceRowRevisionSnapshotSchema.parse(source.snapshot);
        const values = validateWorkspaceRow(definition, snapshot.values);
        await validateWorkspaceRelationValues(tx, definition, [values], req.session.userId!);
        const nextRevision = current.revision + 1;
        const [row] = await tx.update(workspaceDatabaseRows).set({ values, revision: nextRevision, updatedAt: new Date() }).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId, rowId, revisionNumber: nextRevision, action: "restored", sourceRevision, snapshot: { values } });
        return { kind: "restored", row } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Row not found" });
      if (outcome.kind === "revision-missing") return res.status(404).json({ error: "Revision not found" });
      if (outcome.kind === "conflict") return res.status(409).json({ error: "This row changed after you opened it. Reload before restoring.", currentRevision: outcome.currentRevision });
      res.json({ row: outcome.row });
    } catch (error) { return badRequest(res, error); }
  });

  app.post("/api/databases/:id/views", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const input = createWorkspaceTableViewSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        validateWorkspaceTableView(workspaceDatabaseDefinitionSchema.parse(database.definition), input.definition);
        const [view] = await tx.insert(workspaceTableViews).values({ ...input, userId: req.session.userId!, databaseId: id }).returning();
        return { kind: "created", view } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      res.status(201).json({ view: outcome.view });
    } catch (error) { return badRequest(res, error); }
  });
  app.patch("/api/databases/:databaseId/views/:viewId", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), viewId = idParam(req.params.viewId);
      if (!databaseId || !viewId) return res.status(400).json({ error: "Invalid view ID" });
      const input = updateWorkspaceTableViewSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const [existing] = await tx.select().from(workspaceTableViews).where(and(eq(workspaceTableViews.id, viewId), eq(workspaceTableViews.databaseId, databaseId), eq(workspaceTableViews.userId, req.session.userId!))).limit(1);
        if (!existing) return { kind: "missing" } as const;
        validateWorkspaceTableView(workspaceDatabaseDefinitionSchema.parse(database.definition), input.definition || workspaceTableViewDefinitionSchema.parse(existing.definition));
        const [view] = await tx.update(workspaceTableViews).set({ ...input, updatedAt: new Date() }).where(and(eq(workspaceTableViews.id, viewId), eq(workspaceTableViews.databaseId, databaseId), eq(workspaceTableViews.userId, req.session.userId!))).returning();
        return { kind: "updated", view } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "View not found" });
      res.json({ view: outcome.view });
    } catch (error) { return badRequest(res, error); }
  });
  app.delete("/api/databases/:databaseId/views/:viewId", isAuthenticated, async (req, res) => {
    const databaseId = idParam(req.params.databaseId), viewId = idParam(req.params.viewId);
    if (!databaseId || !viewId) return res.status(400).json({ error: "Invalid view ID" });
    const [view] = await db.delete(workspaceTableViews).where(and(eq(workspaceTableViews.id, viewId), eq(workspaceTableViews.databaseId, databaseId), eq(workspaceTableViews.userId, req.session.userId!))).returning({ id: workspaceTableViews.id });
    if (!view) return res.status(404).json({ error: "View not found" });
    res.status(204).end();
  });

  app.post("/api/forms", isAuthenticated, async (req, res) => {
    try {
      const input = createWorkspaceFormSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, input.databaseId, req.session.userId!); if (!database) return { kind: "missing" } as const;
        const tableDefinition = workspaceDatabaseDefinitionSchema.parse(database.definition);
        const definition = validateWorkspaceFormDefinition(tableDefinition, input.fieldIds, input.definition || defaultWorkspaceFormDefinition(input.fieldIds));
        const [form] = await tx.insert(workspaceForms).values({ ...input, definition, userId: req.session.userId! }).returning();
        return { kind: "created", form } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      res.status(201).json({ form: outcome.form });
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/forms/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
    const [form] = await db.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).limit(1);
    if (!form) return res.status(404).json({ error: "Form not found" });
    const database = await ownedDatabase(form.databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const projection = await workspaceTableProjection(database.id, req.session.userId!, workspaceDatabaseDefinitionSchema.parse(database.definition), []);
    res.json({ form, database, relationOptions: projection.relationOptions });
  });
  app.patch("/api/forms/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
      const [existing] = await db.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).limit(1);
      if (!existing) return res.status(404).json({ error: "Form not found" });
      const input = updateWorkspaceFormSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, existing.databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const [current] = await tx.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.databaseId, existing.databaseId), eq(workspaceForms.userId, req.session.userId!))).limit(1);
        if (!current) return { kind: "missing" } as const;
        const fieldIds = input.fieldIds || current.fieldIds as string[];
        const definition = input.definition || (input.fieldIds ? defaultWorkspaceFormDefinition(fieldIds) : workspaceFormDefinitionSchema.parse(current.definition));
        validateWorkspaceFormDefinition(workspaceDatabaseDefinitionSchema.parse(database.definition), fieldIds, definition);
        const [form] = await tx.update(workspaceForms).set({ ...input, definition, updatedAt: new Date() }).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).returning();
        return { kind: "updated", form } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Form not found" });
      res.json({ form: outcome.form });
    } catch (error) { return badRequest(res, error); }
  });
  app.delete("/api/forms/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
    const [form] = await db.delete(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).returning({ id: workspaceForms.id });
    if (!form) return res.status(404).json({ error: "Form not found" });
    res.status(204).end();
  });
  app.post("/api/forms/:id/submissions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
      const [form] = await db.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).limit(1);
      if (!form) return res.status(404).json({ error: "Form not found" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, form.databaseId, req.session.userId!); if (!database) return { kind: "database-missing" } as const;
        const locked = await tx.execute(sql`SELECT id FROM workspace_forms WHERE id = ${id} AND database_id = ${form.databaseId} AND user_id = ${req.session.userId!} FOR UPDATE`);
        if (!locked.rows.length) return { kind: "missing" } as const;
        const [currentForm] = await tx.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.databaseId, form.databaseId), eq(workspaceForms.userId, req.session.userId!))).limit(1);
        if (!currentForm.active) return { kind: "closed" } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition);
        const formDefinition = validateWorkspaceFormDefinition(definition, currentForm.fieldIds as string[], workspaceFormDefinitionSchema.parse(currentForm.definition));
        const values = validateWorkspaceFormSubmission(definition, formDefinition, input.values);
        await validateWorkspaceRelationValues(tx, definition, [values], req.session.userId!);
        const [created] = await tx.insert(workspaceDatabaseRows).values({ userId: req.session.userId!, databaseId: database.id, values }).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId: database.id, rowId: created.id, revisionNumber: 1, action: "created", snapshot: { values } });
        return { kind: "created", row: created, confirmationText: currentForm.confirmationText } as const;
      });
      if (outcome.kind === "database-missing") return res.status(404).json({ error: "Database not found" });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Form not found" });
      if (outcome.kind === "closed") return res.status(409).json({ error: "This form is closed." });
      res.status(201).json({ row: outcome.row, confirmationText: outcome.confirmationText });
    } catch (error) {
      logger.warn("Workspace form submission rejected", { userId: req.session.userId, formId: req.params.id, error: error instanceof Error ? error.message : "invalid" });
      return badRequest(res, error);
    }
  });

  app.get("/api/forms/:id/access-grants", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
    const [form] = await db.select({ id: workspaceForms.id }).from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).limit(1);
    if (!form) return res.status(404).json({ error: "Form not found" });
    const grants = await db.select({ id: workspaceFormAccessGrants.id, publicId: workspaceFormAccessGrants.publicId, label: workspaceFormAccessGrants.label, active: workspaceFormAccessGrants.active, expiresAt: workspaceFormAccessGrants.expiresAt, maxSubmissions: workspaceFormAccessGrants.maxSubmissions, submissionCount: workspaceFormAccessGrants.submissionCount, lastUsedAt: workspaceFormAccessGrants.lastUsedAt, revokedAt: workspaceFormAccessGrants.revokedAt, createdAt: workspaceFormAccessGrants.createdAt })
      .from(workspaceFormAccessGrants).where(and(eq(workspaceFormAccessGrants.formId, id), eq(workspaceFormAccessGrants.userId, req.session.userId!))).orderBy(desc(workspaceFormAccessGrants.createdAt));
    res.json({ grants });
  });

  app.post("/api/forms/:id/access-grants", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid form ID" });
      const input = createWorkspaceFormAccessGrantSchema.parse(req.body); const token = crypto.randomBytes(32).toString("base64url");
      const outcome = await db.transaction(async (tx) => {
        const [form] = await tx.select().from(workspaceForms).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).limit(1);
        if (!form) return undefined;
        const [database] = await tx.select().from(workspaceDatabases).where(and(eq(workspaceDatabases.id, form.databaseId), eq(workspaceDatabases.userId, req.session.userId!))).limit(1);
        if (!database) return undefined;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition);
        const selected = new Set(form.fieldIds as string[]);
        if (definition.columns.some((column) => selected.has(column.id) && column.type === "relation")) throw new Error("External links cannot expose relation fields. Remove them from this form first.");
        validateWorkspaceFormDefinition(definition, form.fieldIds as string[], workspaceFormDefinitionSchema.parse(form.definition));
        const [grant] = await tx.insert(workspaceFormAccessGrants).values({ userId: req.session.userId!, formId: id, label: input.label, tokenHash: formTokenHash(token), expiresAt: new Date(input.expiresAt), maxSubmissions: input.maxSubmissions }).returning();
        return grant;
      });
      if (!outcome) return res.status(404).json({ error: "Form not found" });
      const shareUrl = `/forms/respond/${outcome.publicId}#token=${token}`;
      res.status(201).json({ shareUrl, disclosure: "This link secret is shown once. Anyone with it can submit until it expires, reaches its limit, or is revoked." });
    } catch (error) { return badRequest(res, error); }
  });

  app.post("/api/forms/:formId/access-grants/:grantId/revoke", isAuthenticated, async (req, res) => {
    const formId = idParam(req.params.formId), grantId = idParam(req.params.grantId); if (!formId || !grantId) return res.status(400).json({ error: "Invalid access link" });
    const [grant] = await db.update(workspaceFormAccessGrants).set({ active: false, revokedAt: new Date() }).where(and(eq(workspaceFormAccessGrants.id, grantId), eq(workspaceFormAccessGrants.formId, formId), eq(workspaceFormAccessGrants.userId, req.session.userId!))).returning({ id: workspaceFormAccessGrants.id });
    if (!grant) return res.status(404).json({ error: "Access link not found" });
    res.status(204).end();
  });

  app.get("/api/public/forms/:publicId", async (req, res) => {
    const publicId = publicIdParam(req.params.publicId), token = formBearerToken(req); if (!publicId || !token) return res.status(404).json({ error: "Form unavailable" });
    const [grant] = await db.select().from(workspaceFormAccessGrants).where(and(eq(workspaceFormAccessGrants.publicId, publicId), eq(workspaceFormAccessGrants.tokenHash, formTokenHash(token)))).limit(1);
    if (!grant || !grant.active || grant.revokedAt || grant.expiresAt.getTime() <= Date.now() || grant.submissionCount >= grant.maxSubmissions) return res.status(404).json({ error: "Form unavailable" });
    const [form] = await db.select().from(workspaceForms).where(and(eq(workspaceForms.id, grant.formId), eq(workspaceForms.userId, grant.userId))).limit(1);
    if (!form || !form.active) return res.status(404).json({ error: "Form unavailable" });
    const [database] = await db.select().from(workspaceDatabases).where(and(eq(workspaceDatabases.id, form.databaseId), eq(workspaceDatabases.userId, grant.userId))).limit(1);
    if (!database) return res.status(404).json({ error: "Form unavailable" });
    const definition = workspaceDatabaseDefinitionSchema.parse(database.definition); const selected = new Set(form.fieldIds as string[]);
    if (definition.columns.some((column) => selected.has(column.id) && column.type === "relation")) return res.status(404).json({ error: "Form unavailable" });
    const formDefinition = validateWorkspaceFormDefinition(definition, form.fieldIds as string[], workspaceFormDefinitionSchema.parse(form.definition));
    res.json({ form: { title: form.title, description: form.description, definition: formDefinition }, columns: definition.columns.filter((column) => selected.has(column.id)), expiresAt: grant.expiresAt, remainingSubmissions: grant.maxSubmissions - grant.submissionCount });
  });

  app.post("/api/public/forms/:publicId/submissions", async (req, res) => {
    try {
      const publicId = publicIdParam(req.params.publicId), token = formBearerToken(req); if (!publicId || !token) return res.status(404).json({ error: "Form unavailable" });
      const input = workspaceRowRequestSchema.parse(req.body); const hash = formTokenHash(token);
      const outcome = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT id FROM workspace_form_access_grants WHERE public_id = ${publicId} AND token_hash = ${hash} FOR UPDATE`);
        if (!locked.rows.length) return { kind: "missing" } as const;
        const [grant] = await tx.select().from(workspaceFormAccessGrants).where(and(eq(workspaceFormAccessGrants.publicId, publicId), eq(workspaceFormAccessGrants.tokenHash, hash))).limit(1);
        if (!grant.active || grant.revokedAt || grant.expiresAt.getTime() <= Date.now() || grant.submissionCount >= grant.maxSubmissions) return { kind: "missing" } as const;
        const [form] = await tx.select().from(workspaceForms).where(and(eq(workspaceForms.id, grant.formId), eq(workspaceForms.userId, grant.userId))).limit(1);
        if (!form || !form.active) return { kind: "missing" } as const;
        const database = await lockedOwnedDatabase(tx, form.databaseId, grant.userId); if (!database) return { kind: "missing" } as const;
        const definition = workspaceDatabaseDefinitionSchema.parse(database.definition); const selected = new Set(form.fieldIds as string[]);
        if (definition.columns.some((column) => selected.has(column.id) && column.type === "relation")) return { kind: "missing" } as const;
        const formDefinition = validateWorkspaceFormDefinition(definition, form.fieldIds as string[], workspaceFormDefinitionSchema.parse(form.definition));
        const values = validateWorkspaceFormSubmission(definition, formDefinition, input.values);
        const [row] = await tx.insert(workspaceDatabaseRows).values({ userId: grant.userId, databaseId: database.id, values }).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: grant.userId, databaseId: database.id, rowId: row.id, revisionNumber: 1, action: "created", snapshot: { values } });
        await tx.insert(workspaceFormSubmissionReceipts).values({ userId: grant.userId, formId: form.id, grantId: grant.id, rowId: row.id });
        await tx.update(workspaceFormAccessGrants).set({ submissionCount: grant.submissionCount + 1, lastUsedAt: new Date() }).where(eq(workspaceFormAccessGrants.id, grant.id));
        return { kind: "created", confirmationText: form.confirmationText } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Form unavailable" });
      res.status(201).json({ confirmationText: outcome.confirmationText });
    } catch (error) {
      logger.warn("Public workspace form submission rejected", { publicId: req.params.publicId, error: error instanceof Error ? error.message : "invalid" });
      return badRequest(res, error);
    }
  });
}
