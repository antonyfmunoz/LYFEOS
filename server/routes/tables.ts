import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { workspaceDatabaseRowRevisions, workspaceDatabaseRevisions, workspaceDatabaseRows, workspaceDatabases, workspaceForms, workspaceTableViews } from "@shared/schema";
import {
  createWorkspaceDatabaseSchema, createWorkspaceFormSchema, createWorkspaceTableViewSchema, updateWorkspaceDatabaseSchema, updateWorkspaceFormSchema, updateWorkspaceTableViewSchema,
  validateWorkspaceFormFields, validateWorkspaceRow, validateWorkspaceTableView, workspaceBulkRowDeleteSchema, workspaceDatabaseDefinitionSchema, workspaceDatabaseRevisionSnapshotSchema, workspaceRowRequestSchema, workspaceRowRevisionSnapshotSchema, workspaceTableViewDefinitionSchema,
  type WorkspaceRowValues,
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

type TableTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockedOwnedDatabase(tx: TableTransaction, databaseId: number, userId: number) {
  const locked = await tx.execute(sql`SELECT id FROM workspace_databases WHERE id = ${databaseId} AND user_id = ${userId} FOR UPDATE`);
  if (!locked.rows.length) return undefined;
  const [database] = await tx.select().from(workspaceDatabases).where(and(eq(workspaceDatabases.id, databaseId), eq(workspaceDatabases.userId, userId))).limit(1);
  return database;
}
async function validateDefinitionDependents(tx: TableTransaction, databaseId: number, userId: number, definition: ReturnType<typeof workspaceDatabaseDefinitionSchema.parse>) {
  const rows = await tx.select({ values: workspaceDatabaseRows.values }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, userId)));
  rows.forEach((row) => validateWorkspaceRow(definition, row.values as WorkspaceRowValues));
  const forms = await tx.select({ fieldIds: workspaceForms.fieldIds }).from(workspaceForms).where(and(eq(workspaceForms.databaseId, databaseId), eq(workspaceForms.userId, userId)));
  forms.forEach((form) => validateWorkspaceFormFields(definition, form.fieldIds as string[]));
  const views = await tx.select({ definition: workspaceTableViews.definition }).from(workspaceTableViews).where(and(eq(workspaceTableViews.databaseId, databaseId), eq(workspaceTableViews.userId, userId)));
  views.forEach((view) => validateWorkspaceTableView(definition, workspaceTableViewDefinitionSchema.parse(view.definition)));
}

export function registerTableRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/databases") || req.path.startsWith("/api/forms")) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie");
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
        const [created] = await tx.insert(workspaceDatabases).values({ ...input, userId: req.session.userId! }).returning();
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
    res.json({ database, rows, forms, views });
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
        if (input.definition) await validateDefinitionDependents(tx, id, req.session.userId!, input.definition);
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
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
    const [deleted] = await db.delete(workspaceDatabases).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, req.session.userId!))).returning({ id: workspaceDatabases.id });
    if (!deleted) return res.status(404).json({ error: "Database not found" });
    res.status(204).end();
  });
  app.post("/api/databases/:id/rows", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const outcome = await db.transaction(async (tx) => {
        const database = await lockedOwnedDatabase(tx, id, req.session.userId!); if (!database) return { kind: "missing" } as const;
        const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values);
        const [row] = await tx.insert(workspaceDatabaseRows).values({ userId: req.session.userId!, databaseId: id, values }).returning();
        await tx.insert(workspaceDatabaseRowRevisions).values({ userId: req.session.userId!, databaseId: id, rowId: row.id, revisionNumber: 1, action: "created", snapshot: { values } });
        return { kind: "created", row } as const;
      });
      if (outcome.kind === "missing") return res.status(404).json({ error: "Database not found" });
      res.status(201).json({ row: outcome.row });
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
        const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values);
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
    const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId);
    if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
    const [row] = await db.delete(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).returning({ id: workspaceDatabaseRows.id });
    if (!row) return res.status(404).json({ error: "Row not found" });
    res.status(204).end();
  });
  app.post("/api/databases/:id/rows/bulk-delete", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      const { rowIds } = workspaceBulkRowDeleteSchema.parse(req.body);
      const deleted = await db.delete(workspaceDatabaseRows).where(and(
        eq(workspaceDatabaseRows.databaseId, id),
        eq(workspaceDatabaseRows.userId, req.session.userId!),
        inArray(workspaceDatabaseRows.id, rowIds),
      )).returning({ id: workspaceDatabaseRows.id });
      res.json({ deletedRowIds: deleted.map((row) => row.id), deletedCount: deleted.length });
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
        validateWorkspaceFormFields(workspaceDatabaseDefinitionSchema.parse(database.definition), input.fieldIds);
        const [form] = await tx.insert(workspaceForms).values({ ...input, userId: req.session.userId! }).returning();
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
    res.json({ form, database });
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
        validateWorkspaceFormFields(workspaceDatabaseDefinitionSchema.parse(database.definition), input.fieldIds || current.fieldIds as string[]);
        const [form] = await tx.update(workspaceForms).set({ ...input, updatedAt: new Date() }).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).returning();
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
        const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values, currentForm.fieldIds as string[]);
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
}
