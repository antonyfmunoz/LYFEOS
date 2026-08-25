import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { workspaceDatabaseRows, workspaceDatabases, workspaceForms } from "@shared/schema";
import {
  createWorkspaceDatabaseSchema, createWorkspaceFormSchema, updateWorkspaceDatabaseSchema, updateWorkspaceFormSchema,
  validateWorkspaceFormFields, validateWorkspaceRow, workspaceBulkRowDeleteSchema, workspaceDatabaseDefinitionSchema, workspaceRowRequestSchema,
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
      const [database] = await db.insert(workspaceDatabases).values({ ...input, userId: req.session.userId! }).returning();
      res.status(201).json({ database });
    } catch (error) { return badRequest(res, error); }
  });
  app.get("/api/databases/:id", isAuthenticated, async (req, res) => {
    const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
    const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
    const [rows, forms] = await Promise.all([
      db.select().from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, id), eq(workspaceDatabaseRows.userId, req.session.userId!))).orderBy(desc(workspaceDatabaseRows.updatedAt)),
      db.select().from(workspaceForms).where(and(eq(workspaceForms.databaseId, id), eq(workspaceForms.userId, req.session.userId!))).orderBy(desc(workspaceForms.updatedAt)),
    ]);
    res.json({ database, rows, forms });
  });
  app.patch("/api/databases/:id", isAuthenticated, async (req, res) => {
    try {
      const id = idParam(req.params.id); if (!id) return res.status(400).json({ error: "Invalid database ID" });
      const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      const input = updateWorkspaceDatabaseSchema.parse(req.body);
      if (input.definition) {
        const rows = await db.select({ values: workspaceDatabaseRows.values }).from(workspaceDatabaseRows).where(and(eq(workspaceDatabaseRows.databaseId, id), eq(workspaceDatabaseRows.userId, req.session.userId!)));
        rows.forEach((row) => validateWorkspaceRow(input.definition!, row.values as WorkspaceRowValues));
        const forms = await db.select({ fieldIds: workspaceForms.fieldIds }).from(workspaceForms).where(and(eq(workspaceForms.databaseId, id), eq(workspaceForms.userId, req.session.userId!)));
        forms.forEach((form) => validateWorkspaceFormFields(input.definition!, form.fieldIds as string[]));
      }
      const [updated] = await db.update(workspaceDatabases).set({ ...input, updatedAt: new Date() }).where(and(eq(workspaceDatabases.id, id), eq(workspaceDatabases.userId, req.session.userId!))).returning();
      res.json({ database: updated });
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
      const database = await ownedDatabase(id, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values);
      const [row] = await db.insert(workspaceDatabaseRows).values({ userId: req.session.userId!, databaseId: id, values }).returning();
      res.status(201).json({ row });
    } catch (error) { return badRequest(res, error); }
  });
  app.patch("/api/databases/:databaseId/rows/:rowId", isAuthenticated, async (req, res) => {
    try {
      const databaseId = idParam(req.params.databaseId), rowId = idParam(req.params.rowId);
      if (!databaseId || !rowId) return res.status(400).json({ error: "Invalid row ID" });
      const database = await ownedDatabase(databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values);
      const [row] = await db.update(workspaceDatabaseRows).set({ values, updatedAt: new Date() }).where(and(eq(workspaceDatabaseRows.id, rowId), eq(workspaceDatabaseRows.databaseId, databaseId), eq(workspaceDatabaseRows.userId, req.session.userId!))).returning();
      if (!row) return res.status(404).json({ error: "Row not found" });
      res.json({ row });
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

  app.post("/api/forms", isAuthenticated, async (req, res) => {
    try {
      const input = createWorkspaceFormSchema.parse(req.body);
      const database = await ownedDatabase(input.databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      validateWorkspaceFormFields(workspaceDatabaseDefinitionSchema.parse(database.definition), input.fieldIds);
      const [form] = await db.insert(workspaceForms).values({ ...input, userId: req.session.userId! }).returning();
      res.status(201).json({ form });
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
      const database = await ownedDatabase(existing.databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      validateWorkspaceFormFields(workspaceDatabaseDefinitionSchema.parse(database.definition), input.fieldIds || existing.fieldIds as string[]);
      const [form] = await db.update(workspaceForms).set({ ...input, updatedAt: new Date() }).where(and(eq(workspaceForms.id, id), eq(workspaceForms.userId, req.session.userId!))).returning();
      res.json({ form });
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
      if (!form.active) return res.status(409).json({ error: "This form is closed." });
      const database = await ownedDatabase(form.databaseId, req.session.userId!); if (!database) return res.status(404).json({ error: "Database not found" });
      const input = workspaceRowRequestSchema.parse(req.body);
      const values = validateWorkspaceRow(workspaceDatabaseDefinitionSchema.parse(database.definition), input.values, form.fieldIds as string[]);
      const [row] = await db.insert(workspaceDatabaseRows).values({ userId: req.session.userId!, databaseId: database.id, values }).returning();
      res.status(201).json({ row, confirmationText: form.confirmationText });
    } catch (error) {
      logger.warn("Workspace form submission rejected", { userId: req.session.userId, formId: req.params.id, error: error instanceof Error ? error.message : "invalid" });
      return badRequest(res, error);
    }
  });
}
