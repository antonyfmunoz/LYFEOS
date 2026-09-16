import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { spiritEntries } from "@shared/schema";
import { db } from "../db";
import { isAuthenticated } from "./middleware";

const entryIdSchema = z.coerce.number().int().positive();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid entry date.");
const kindSchema = z.enum(["bible_study", "prayer", "reflection", "sermon", "other"]);
const entryFields = {
  entryDate: localDateSchema,
  kind: kindSchema,
  title: z.string().trim().min(1).max(180),
  scripture: z.string().trim().max(300).nullable().optional(),
  content: z.string().trim().min(1).max(20_000),
};
const createEntrySchema = z.object(entryFields);
const updateEntrySchema = z.object({
  entryDate: entryFields.entryDate.optional(),
  kind: entryFields.kind.optional(),
  title: entryFields.title.optional(),
  scripture: entryFields.scripture,
  content: entryFields.content.optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide an entry change.");

function privateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

export function registerSpiritLogRoutes(app: Express): void {
  app.get("/api/spirit-entries", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const entries = await db.select().from(spiritEntries)
      .where(eq(spiritEntries.userId, req.session.userId!))
      .orderBy(desc(spiritEntries.entryDate), desc(spiritEntries.updatedAt), desc(spiritEntries.id));
    return res.json({ entries, disclosure: "Spirit Log is a private, user-authored record. LyfeOS does not connect these entries to an outside provider or interpret their meaning." });
  });

  app.post("/api/spirit-entries", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const parsed = createEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid Spirit Log entry.", details: parsed.error.flatten() });
    const [entry] = await db.insert(spiritEntries).values({
      userId: req.session.userId!,
      ...parsed.data,
      scripture: parsed.data.scripture || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return res.status(201).json(entry);
  });

  app.patch("/api/spirit-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = entryIdSchema.safeParse(req.params.id);
    const parsed = updateEntrySchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "Invalid Spirit Log entry update.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [entry] = await db.update(spiritEntries).set({
      ...parsed.data,
      ...(parsed.data.scripture === undefined ? {} : { scripture: parsed.data.scripture || null }),
      updatedAt: new Date(),
    }).where(and(eq(spiritEntries.id, id.data), eq(spiritEntries.userId, req.session.userId!))).returning();
    return entry ? res.json(entry) : res.status(404).json({ error: "Spirit Log entry not found." });
  });

  app.delete("/api/spirit-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = entryIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid Spirit Log entry." });
    const [deleted] = await db.delete(spiritEntries)
      .where(and(eq(spiritEntries.id, id.data), eq(spiritEntries.userId, req.session.userId!)))
      .returning({ id: spiritEntries.id });
    return deleted ? res.json({ deleted: true, id: deleted.id }) : res.status(404).json({ error: "Spirit Log entry not found." });
  });
}
