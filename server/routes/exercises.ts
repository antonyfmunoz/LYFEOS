import type { Express, Request, Response } from "express";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { exerciseDefinitions } from "@shared/schema";
import { db } from "../db";
import { isAuthenticated } from "./middleware";

const exerciseDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).nullable(),
  equipment: z.string().trim().max(80).nullable(),
  primaryMuscles: z.array(z.string().trim().min(1).max(60)).max(20).transform((items) => Array.from(new Set(items))),
  secondaryMuscles: z.array(z.string().trim().min(1).max(60)).max(20).transform((items) => Array.from(new Set(items))),
  instructions: z.string().trim().max(2000).nullable(),
});

export function registerExerciseRoutes(app: Express): void {
  app.get("/api/exercises", isAuthenticated, async (req: Request, res: Response) => {
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    const ownership = or(eq(exerciseDefinitions.userId, req.session.userId!), isNull(exerciseDefinitions.userId))!;
    const visibility = req.query.includeArchived === "true" ? ownership : and(ownership, isNull(exerciseDefinitions.archivedAt))!;
    const searchFilter = search ? or(
      ilike(exerciseDefinitions.name, `%${search}%`),
      ilike(exerciseDefinitions.category, `%${search}%`),
      ilike(exerciseDefinitions.equipment, `%${search}%`),
    ) : undefined;
    const exercises = await db.select().from(exerciseDefinitions)
      .where(searchFilter ? and(visibility, searchFilter) : visibility)
      .orderBy(asc(exerciseDefinitions.name)).limit(250);
    return res.json({
      exercises,
      disclosure: "Custom exercises are private user-authored records. Shared entries, when available, retain their reviewed source and version; neither kind is a prescription or proof of competence.",
    });
  });

  app.post("/api/exercises", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = exerciseDefinitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid exercise definition.", details: parsed.error.flatten() });
    const [duplicate] = await db.select({ id: exerciseDefinitions.id }).from(exerciseDefinitions)
      .where(and(eq(exerciseDefinitions.userId, req.session.userId!), ilike(exerciseDefinitions.name, parsed.data.name))).limit(1);
    if (duplicate) return res.status(409).json({ error: "You already have an exercise with that name." });
    const [exercise] = await db.insert(exerciseDefinitions).values({
      userId: req.session.userId!, ...parsed.data, source: "user_custom", sourceVersion: null, updatedAt: new Date(),
    }).returning();
    return res.status(201).json({ exercise });
  });

  app.patch("/api/exercises/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = exerciseDefinitionSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid exercise definition.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [duplicate] = await db.select({ id: exerciseDefinitions.id }).from(exerciseDefinitions)
      .where(and(eq(exerciseDefinitions.userId, req.session.userId!), ilike(exerciseDefinitions.name, parsed.data.name))).limit(1);
    if (duplicate && duplicate.id !== id) return res.status(409).json({ error: "You already have an exercise with that name." });
    const [exercise] = await db.update(exerciseDefinitions).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(exerciseDefinitions.id, id), eq(exerciseDefinitions.userId, req.session.userId!))).returning();
    return exercise ? res.json({ exercise }) : res.status(404).json({ error: "Custom exercise not found." });
  });

  app.patch("/api/exercises/:id/archive", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = z.object({ archived: z.boolean() }).safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid archive request." });
    const [exercise] = await db.update(exerciseDefinitions).set({ archivedAt: parsed.data.archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(exerciseDefinitions.id, id), eq(exerciseDefinitions.userId, req.session.userId!))).returning();
    return exercise ? res.json({ exercise }) : res.status(404).json({ error: "Custom exercise not found." });
  });

  app.delete("/api/exercises/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid exercise definition." });
    const [exercise] = await db.delete(exerciseDefinitions)
      .where(and(eq(exerciseDefinitions.id, id), eq(exerciseDefinitions.userId, req.session.userId!))).returning({ id: exerciseDefinitions.id });
    return exercise ? res.status(204).send() : res.status(404).json({ error: "Custom exercise not found." });
  });
}
