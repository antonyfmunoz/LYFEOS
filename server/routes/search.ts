import type { Express, Request, Response } from "express";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { canvases, contacts, documents, quests, spreadsheets, workspaceDatabases } from "@shared/schema";
import {
  escapePostgresLike,
  plainTextExcerpt,
  workspaceSearchQuerySchema,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
} from "@shared/search";
import { db } from "../db";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

function timestamp(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function rankResult(result: WorkspaceSearchResult, query: string): number {
  const title = result.title.toLowerCase();
  const needle = query.toLowerCase();
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  if (result.summary.toLowerCase().includes(needle)) return 30;
  return 10;
}

export function registerSearchRoutes(app: Express): void {
  app.get("/api/search", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Cookie");
    try {
      const input = workspaceSearchQuerySchema.parse({ q: req.query.q, limit: req.query.limit });
      const userId = req.session.userId!;
      const pattern = `%${escapePostgresLike(input.q)}%`;

      const [missionRows, documentRows, spreadsheetRows, canvasRows, databaseRows, relationshipRows] = await Promise.all([
        db.select({ id: quests.id, title: quests.title, description: quests.description, category: quests.category, updatedAt: quests.updatedAt })
          .from(quests)
          .where(and(eq(quests.userId, userId), isNull(quests.deletedAt), or(ilike(quests.title, pattern), ilike(quests.description, pattern))))
          .orderBy(desc(quests.updatedAt)).limit(input.limit),
        db.select({ id: documents.id, title: documents.title, description: documents.description, content: documents.content, updatedAt: documents.updatedAt })
          .from(documents)
          .where(and(eq(documents.userId, userId), isNull(documents.deletedAt), or(ilike(documents.title, pattern), ilike(documents.description, pattern), ilike(documents.content, pattern))))
          .orderBy(desc(documents.updatedAt)).limit(input.limit),
        db.select({ id: spreadsheets.id, title: spreadsheets.title, description: spreadsheets.description, category: spreadsheets.category, updatedAt: spreadsheets.updatedAt })
          .from(spreadsheets)
          .where(and(eq(spreadsheets.userId, userId), or(ilike(spreadsheets.title, pattern), ilike(spreadsheets.description, pattern))))
          .orderBy(desc(spreadsheets.updatedAt)).limit(input.limit),
        db.select({ id: canvases.id, title: canvases.title, description: canvases.description, category: canvases.category, updatedAt: canvases.updatedAt })
          .from(canvases)
          .where(and(eq(canvases.userId, userId), or(ilike(canvases.title, pattern), ilike(canvases.description, pattern))))
          .orderBy(desc(canvases.updatedAt)).limit(input.limit),
        db.select({ id: workspaceDatabases.id, title: workspaceDatabases.title, description: workspaceDatabases.description, category: workspaceDatabases.category, updatedAt: workspaceDatabases.updatedAt })
          .from(workspaceDatabases)
          .where(and(eq(workspaceDatabases.userId, userId), or(ilike(workspaceDatabases.title, pattern), ilike(workspaceDatabases.description, pattern))))
          .orderBy(desc(workspaceDatabases.updatedAt)).limit(input.limit),
        db.select({ id: contacts.id, name: contacts.name, alias: contacts.alias, company: contacts.company, jobTitle: contacts.jobTitle, category: contacts.category, updatedAt: contacts.updatedAt })
          .from(contacts)
          .where(and(eq(contacts.userId, userId), or(ilike(contacts.name, pattern), ilike(contacts.alias, pattern), ilike(contacts.company, pattern), ilike(contacts.jobTitle, pattern))))
          .orderBy(desc(contacts.updatedAt)).limit(input.limit),
      ]);

      const results: WorkspaceSearchResult[] = [
        ...missionRows.map((row) => ({ kind: "mission" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/mission/${row.id}` })),
        ...documentRows.map((row) => ({ kind: "document" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description || row.content, input.q), category: null, updatedAt: timestamp(row.updatedAt), href: `/document-vault?openDoc=${row.id}` })),
        ...spreadsheetRows.map((row) => ({ kind: "spreadsheet" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/spreadsheets/${row.id}` })),
        ...canvasRows.map((row) => ({ kind: "canvas" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/canvases/${row.id}` })),
        ...databaseRows.map((row) => ({ kind: "database" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/databases/${row.id}` })),
        ...relationshipRows.map((row) => ({
          kind: "relationship" as const,
          id: row.id,
          title: row.alias ? `${row.name} (${row.alias})` : row.name,
          summary: [row.jobTitle, row.company].filter(Boolean).join(" at "),
          category: row.category,
          updatedAt: timestamp(row.updatedAt),
          href: `/rolodex?contact=${row.id}`,
        })),
      ].sort((a, b) => rankResult(b, input.q) - rankResult(a, input.q) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));

      const kinds: WorkspaceSearchResultKind[] = ["mission", "document", "spreadsheet", "canvas", "database", "relationship"];
      const counts = Object.fromEntries(kinds.map((kind) => [kind, results.filter((result) => result.kind === kind).length])) as Record<WorkspaceSearchResultKind, number>;
      return res.json({ query: input.q, results, counts });
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) return res.status(400).json({ error: "Enter between 2 and 120 characters." });
      logger.error("Workspace search failed", error);
      return res.status(500).json({ error: "Workspace search unavailable" });
    }
  });
}
