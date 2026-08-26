import type { Express, Request, Response } from "express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
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

export function registerSearchRoutes(app: Express): void {
  app.get("/api/search", isAuthenticated, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Cookie");
    try {
      const input = workspaceSearchQuerySchema.parse({ q: req.query.q, limit: req.query.limit });
      const userId = req.session.userId!;
      const pattern = `%${escapePostgresLike(input.q)}%`;
      const textQuery = sql`websearch_to_tsquery('simple', ${input.q})`;
      const missionVector = sql`to_tsvector('simple', COALESCE(${quests.title}, '') || ' ' || COALESCE(${quests.description}, ''))`;
      const documentVector = sql`to_tsvector('simple', COALESCE(${documents.title}, '') || ' ' || COALESCE(${documents.description}, '') || ' ' || COALESCE(${documents.content}, ''))`;
      const spreadsheetVector = sql`to_tsvector('simple', COALESCE(${spreadsheets.title}, '') || ' ' || COALESCE(${spreadsheets.description}, ''))`;
      const canvasVector = sql`to_tsvector('simple', COALESCE(${canvases.title}, '') || ' ' || COALESCE(${canvases.description}, ''))`;
      const databaseVector = sql`to_tsvector('simple', COALESCE(${workspaceDatabases.title}, '') || ' ' || COALESCE(${workspaceDatabases.description}, ''))`;
      const relationshipVector = sql`to_tsvector('simple', COALESCE(${contacts.name}, '') || ' ' || COALESCE(${contacts.alias}, '') || ' ' || COALESCE(${contacts.company}, '') || ' ' || COALESCE(${contacts.jobTitle}, ''))`;
      const relevance = (title: unknown, vector: unknown) => sql<number>`
        CASE
          WHEN lower(COALESCE(${title}, '')) = lower(${input.q}) THEN 100
          WHEN lower(COALESCE(${title}, '')) LIKE lower(${`${escapePostgresLike(input.q)}%`}) ESCAPE '\\' THEN 80
          WHEN lower(COALESCE(${title}, '')) LIKE lower(${pattern}) ESCAPE '\\' THEN 60
          ELSE 0
        END + ts_rank_cd(${vector}, ${textQuery}) * 40 + word_similarity(${input.q}, COALESCE(${title}, '')) * 20
      `;

      const missionRelevance = relevance(quests.title, missionVector);
      const documentRelevance = relevance(documents.title, documentVector);
      const spreadsheetRelevance = relevance(spreadsheets.title, spreadsheetVector);
      const canvasRelevance = relevance(canvases.title, canvasVector);
      const databaseRelevance = relevance(workspaceDatabases.title, databaseVector);
      const relationshipRelevance = relevance(contacts.name, relationshipVector);

      const [missionRows, documentRows, spreadsheetRows, canvasRows, databaseRows, relationshipRows] = await Promise.all([
        db.select({ id: quests.id, title: quests.title, description: quests.description, category: quests.category, updatedAt: quests.updatedAt, relevance: missionRelevance })
          .from(quests)
          .where(and(eq(quests.userId, userId), isNull(quests.deletedAt), or(ilike(quests.title, pattern), sql`${missionVector} @@ ${textQuery}`, sql`${quests.title} % ${input.q}`)))
          .orderBy(desc(missionRelevance), desc(quests.updatedAt)).limit(input.limit),
        db.select({ id: documents.id, title: documents.title, description: documents.description, content: documents.content, updatedAt: documents.updatedAt, relevance: documentRelevance })
          .from(documents)
          .where(and(eq(documents.userId, userId), isNull(documents.deletedAt), or(ilike(documents.title, pattern), sql`${documentVector} @@ ${textQuery}`, sql`${documents.title} % ${input.q}`)))
          .orderBy(desc(documentRelevance), desc(documents.updatedAt)).limit(input.limit),
        db.select({ id: spreadsheets.id, title: spreadsheets.title, description: spreadsheets.description, category: spreadsheets.category, updatedAt: spreadsheets.updatedAt, relevance: spreadsheetRelevance })
          .from(spreadsheets)
          .where(and(eq(spreadsheets.userId, userId), or(ilike(spreadsheets.title, pattern), sql`${spreadsheetVector} @@ ${textQuery}`, sql`${spreadsheets.title} % ${input.q}`)))
          .orderBy(desc(spreadsheetRelevance), desc(spreadsheets.updatedAt)).limit(input.limit),
        db.select({ id: canvases.id, title: canvases.title, description: canvases.description, category: canvases.category, updatedAt: canvases.updatedAt, relevance: canvasRelevance })
          .from(canvases)
          .where(and(eq(canvases.userId, userId), or(ilike(canvases.title, pattern), sql`${canvasVector} @@ ${textQuery}`, sql`${canvases.title} % ${input.q}`)))
          .orderBy(desc(canvasRelevance), desc(canvases.updatedAt)).limit(input.limit),
        db.select({ id: workspaceDatabases.id, title: workspaceDatabases.title, description: workspaceDatabases.description, category: workspaceDatabases.category, updatedAt: workspaceDatabases.updatedAt, relevance: databaseRelevance })
          .from(workspaceDatabases)
          .where(and(eq(workspaceDatabases.userId, userId), or(ilike(workspaceDatabases.title, pattern), sql`${databaseVector} @@ ${textQuery}`, sql`${workspaceDatabases.title} % ${input.q}`)))
          .orderBy(desc(databaseRelevance), desc(workspaceDatabases.updatedAt)).limit(input.limit),
        db.select({ id: contacts.id, name: contacts.name, alias: contacts.alias, company: contacts.company, jobTitle: contacts.jobTitle, category: contacts.category, updatedAt: contacts.updatedAt, relevance: relationshipRelevance })
          .from(contacts)
          .where(and(eq(contacts.userId, userId), or(ilike(contacts.name, pattern), sql`${relationshipVector} @@ ${textQuery}`, sql`${contacts.name} % ${input.q}`)))
          .orderBy(desc(relationshipRelevance), desc(contacts.updatedAt)).limit(input.limit),
      ]);

      const rankedResults: Array<WorkspaceSearchResult & { relevance: number }> = [
        ...missionRows.map((row) => ({ kind: "mission" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/mission/${row.id}`, relevance: Number(row.relevance) })),
        ...documentRows.map((row) => ({ kind: "document" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description || row.content, input.q), category: null, updatedAt: timestamp(row.updatedAt), href: `/document-vault?openDoc=${row.id}`, relevance: Number(row.relevance) })),
        ...spreadsheetRows.map((row) => ({ kind: "spreadsheet" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/spreadsheets/${row.id}`, relevance: Number(row.relevance) })),
        ...canvasRows.map((row) => ({ kind: "canvas" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/canvases/${row.id}`, relevance: Number(row.relevance) })),
        ...databaseRows.map((row) => ({ kind: "database" as const, id: row.id, title: row.title, summary: plainTextExcerpt(row.description, input.q), category: row.category, updatedAt: timestamp(row.updatedAt), href: `/databases/${row.id}`, relevance: Number(row.relevance) })),
        ...relationshipRows.map((row) => ({
          kind: "relationship" as const,
          id: row.id,
          title: row.alias ? `${row.name} (${row.alias})` : row.name,
          summary: [row.jobTitle, row.company].filter(Boolean).join(" at "),
          category: row.category,
          updatedAt: timestamp(row.updatedAt),
          href: `/rolodex?contact=${row.id}`,
          relevance: Number(row.relevance),
        })),
      ];
      const results: WorkspaceSearchResult[] = rankedResults
        .sort((a, b) => b.relevance - a.relevance || (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .slice(0, input.limit)
        .map(({ relevance: _relevance, ...result }) => result);

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
