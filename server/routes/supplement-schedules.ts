import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { supplementEntries, supplementScheduleEvents, supplementSchedules } from "@shared/schema";
import { db } from "../db";
import { localDate } from "../health-fitness";
import { isAuthenticated } from "./middleware";

const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
const scheduleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100000).nullable(),
  unit: z.string().trim().min(1).max(24).nullable(),
  brand: z.string().trim().max(120).nullable(),
  manufacturer: z.string().trim().max(160).nullable(),
  form: z.string().trim().max(80).nullable(),
  barcode: z.string().trim().max(64).nullable(),
  lotNumber: z.string().trim().max(80).nullable(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cadence: z.enum(["daily", "specific_days", "as_needed"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).transform((days) => Array.from(new Set(days))),
  timeOfDay: clockTime,
  reminderEnabled: z.boolean().default(false),
  active: z.boolean(),
  note: z.string().trim().max(500).nullable(),
}).refine((input) => input.amount === null || !!input.unit, { message: "A unit is required when an amount is recorded." })
  .refine((input) => input.cadence !== "specific_days" || input.weekdays.length > 0, { message: "Choose at least one weekday." })
  .refine((input) => !input.expiresOn || Boolean(localDate(input.expiresOn)), { message: "Enter a valid label expiration date." });
const eventSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["taken", "skipped"]), note: z.string().trim().max(500).nullable() });

export function registerSupplementScheduleRoutes(app: Express): void {
  app.get("/api/supplement-schedules", isAuthenticated, async (req: Request, res: Response) => {
    const date = localDate(req.query.date) || new Date().toISOString().slice(0, 10);
    const schedules = await db.select().from(supplementSchedules).where(eq(supplementSchedules.userId, req.session.userId!)).orderBy(asc(supplementSchedules.name));
    const events = await db.select().from(supplementScheduleEvents).where(and(eq(supplementScheduleEvents.userId, req.session.userId!), eq(supplementScheduleEvents.date, date)));
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    return res.json({
      date,
      schedules: schedules.map((schedule) => ({
        ...schedule,
        due: schedule.active && (schedule.cadence === "daily" || (schedule.cadence === "specific_days" && Array.isArray(schedule.weekdays) && schedule.weekdays.includes(weekday))),
        event: events.find((event) => event.scheduleId === schedule.id) || null,
      })),
      disclosure: "Schedules and taken/skipped states are user-authored records. LyfeOS does not recommend products, doses, timing, treatment, or efficacy.",
    });
  });

  app.get("/api/supplement-schedules/history", isAuthenticated, async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 30);
    if (!Number.isInteger(requestedDays) || requestedDays < 7 || requestedDays > 3650) return res.status(400).json({ error: "History period must be between 7 days and 10 years." });
    const start = new Date(); start.setUTCDate(start.getUTCDate() - (requestedDays - 1));
    const events = await db.select().from(supplementScheduleEvents).where(and(
      eq(supplementScheduleEvents.userId, req.session.userId!), gte(supplementScheduleEvents.date, start.toISOString().slice(0, 10)),
    )).orderBy(desc(supplementScheduleEvents.date), desc(supplementScheduleEvents.updatedAt));
    return res.json({ events, days: requestedDays, disclosure: "History preserves the scheduled product name, amount, unit, time, optional label identity and lot details, factual state, and your note as first recorded for that date. It is not a statement of product validity, efficacy, safety, or medical adherence." });
  });

  app.post("/api/supplement-schedules", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid supplement schedule.", details: parsed.error.flatten() });
    const [schedule] = await db.insert(supplementSchedules).values({ userId: req.session.userId!, ...parsed.data, updatedAt: new Date() }).returning();
    return res.status(201).json({ schedule });
  });

  app.patch("/api/supplement-schedules/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid supplement schedule.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [schedule] = await db.update(supplementSchedules).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(supplementSchedules.id, id), eq(supplementSchedules.userId, req.session.userId!))).returning();
    return schedule ? res.json({ schedule }) : res.status(404).json({ error: "Supplement schedule not found." });
  });

  app.delete("/api/supplement-schedules/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid supplement schedule." });
    const [schedule] = await db.delete(supplementSchedules).where(and(eq(supplementSchedules.id, id), eq(supplementSchedules.userId, req.session.userId!))).returning({ id: supplementSchedules.id });
    return schedule ? res.status(204).send() : res.status(404).json({ error: "Supplement schedule not found." });
  });

  app.put("/api/supplement-schedules/:id/event", isAuthenticated, async (req: Request, res: Response) => {
    const scheduleId = Number(req.params.id);
    const parsed = eventSchema.safeParse(req.body);
    const userId = req.session.userId!;
    if (!Number.isInteger(scheduleId) || !parsed.success || !localDate(parsed.data?.date)) return res.status(400).json({ error: "Invalid supplement schedule event.", details: parsed.success ? undefined : parsed.error.flatten() });
    const result = await db.transaction(async (tx) => {
      const [schedule] = await tx.select().from(supplementSchedules).where(and(eq(supplementSchedules.id, scheduleId), eq(supplementSchedules.userId, userId))).limit(1);
      if (!schedule) return null;
      const [existing] = await tx.select().from(supplementScheduleEvents).where(and(eq(supplementScheduleEvents.scheduleId, scheduleId), eq(supplementScheduleEvents.date, parsed.data.date))).limit(1);
      const eventSnapshot = {
        nameSnapshot: existing?.nameSnapshot || schedule.name,
        amountSnapshot: existing ? existing.amountSnapshot : schedule.amount,
        unitSnapshot: existing ? existing.unitSnapshot : schedule.unit,
        timeOfDaySnapshot: existing ? existing.timeOfDaySnapshot : schedule.timeOfDay,
        brandSnapshot: existing ? existing.brandSnapshot : schedule.brand,
        manufacturerSnapshot: existing ? existing.manufacturerSnapshot : schedule.manufacturer,
        formSnapshot: existing ? existing.formSnapshot : schedule.form,
        barcodeSnapshot: existing ? existing.barcodeSnapshot : schedule.barcode,
        lotNumberSnapshot: existing ? existing.lotNumberSnapshot : schedule.lotNumber,
        expiresOnSnapshot: existing ? existing.expiresOnSnapshot : schedule.expiresOn,
      };
      let supplementEntryId = existing?.supplementEntryId || null;
      if (parsed.data.status === "taken") {
        const occurredAt = new Date(`${parsed.data.date}T${eventSnapshot.timeOfDaySnapshot || "12:00"}:00.000Z`);
        if (supplementEntryId) {
          await tx.update(supplementEntries).set({ name: eventSnapshot.nameSnapshot, amount: eventSnapshot.amountSnapshot, unit: eventSnapshot.unitSnapshot, brand: eventSnapshot.brandSnapshot, manufacturer: eventSnapshot.manufacturerSnapshot, form: eventSnapshot.formSnapshot, barcode: eventSnapshot.barcodeSnapshot, lotNumber: eventSnapshot.lotNumberSnapshot, expiresOn: eventSnapshot.expiresOnSnapshot, occurredAt, note: parsed.data.note })
            .where(and(eq(supplementEntries.id, supplementEntryId), eq(supplementEntries.userId, userId)));
        } else {
          const [entry] = await tx.insert(supplementEntries).values({ userId, name: eventSnapshot.nameSnapshot, amount: eventSnapshot.amountSnapshot, unit: eventSnapshot.unitSnapshot, brand: eventSnapshot.brandSnapshot, manufacturer: eventSnapshot.manufacturerSnapshot, form: eventSnapshot.formSnapshot, barcode: eventSnapshot.barcodeSnapshot, lotNumber: eventSnapshot.lotNumberSnapshot, expiresOn: eventSnapshot.expiresOnSnapshot, occurredAt, note: parsed.data.note, source: "manual" }).returning({ id: supplementEntries.id });
          supplementEntryId = entry.id;
        }
      } else if (supplementEntryId) {
        await tx.delete(supplementEntries).where(and(eq(supplementEntries.id, supplementEntryId), eq(supplementEntries.userId, userId)));
        supplementEntryId = null;
      }
      const [event] = await tx.insert(supplementScheduleEvents).values({ userId, scheduleId, ...parsed.data, ...eventSnapshot, supplementEntryId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: [supplementScheduleEvents.scheduleId, supplementScheduleEvents.date], set: { status: parsed.data.status, note: parsed.data.note, ...eventSnapshot, supplementEntryId, updatedAt: new Date() } }).returning();
      return { event };
    });
    return result ? res.json(result) : res.status(404).json({ error: "Supplement schedule not found." });
  });

  app.delete("/api/supplement-schedules/:id/event/:date", isAuthenticated, async (req: Request, res: Response) => {
    const scheduleId = Number(req.params.id);
    const date = localDate(req.params.date);
    const userId = req.session.userId!;
    if (!Number.isInteger(scheduleId) || !date) return res.status(400).json({ error: "Invalid supplement schedule event." });
    const removed = await db.transaction(async (tx) => {
      const [event] = await tx.delete(supplementScheduleEvents).where(and(eq(supplementScheduleEvents.scheduleId, scheduleId), eq(supplementScheduleEvents.date, date), eq(supplementScheduleEvents.userId, userId))).returning();
      if (event?.supplementEntryId) await tx.delete(supplementEntries).where(and(eq(supplementEntries.id, event.supplementEntryId), eq(supplementEntries.userId, userId)));
      return event;
    });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Supplement schedule event not found." });
  });
}
