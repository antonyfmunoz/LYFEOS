import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiVoiceSessionSegments, aiVoiceSessions, conversations } from "@shared/schema";
import { db } from "../db";
import { buildExtractiveVoiceSummary } from "../voice-session-summary";
import { isAuthenticated } from "./middleware";

const idSchema = z.string().uuid();
const createSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(160).default("Voice session"),
  purpose: z.enum(["command", "planning", "reflection", "problem_solving", "meeting"]).default("command"),
});
const segmentSchema = z.object({
  speaker: z.enum(["user", "assistant"]),
  transcript: z.string().trim().min(1).max(12000),
  source: z.enum(["browser_speech", "typed", "assistant"]),
  idempotencyKey: z.string().uuid(),
  occurredAt: z.string().datetime().optional(),
});
const completeSchema = z.object({ expectedVersion: z.number().int().positive() });

function privateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

export function registerVoiceSessionRoutes(app: Express): void {
  app.post("/api/ai/voice-sessions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid voice session.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    if (parsed.data.conversationId) {
      const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, parsed.data.conversationId), eq(conversations.userId, userId))).limit(1);
      if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    }
    const [session] = await db.insert(aiVoiceSessions).values({ userId, ...parsed.data }).returning();
    return res.status(201).json({ session });
  });

  app.get("/api/ai/voice-sessions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const sessions = await db.select().from(aiVoiceSessions).where(eq(aiVoiceSessions.userId, req.session.userId!)).orderBy(desc(aiVoiceSessions.createdAt)).limit(50);
    return res.json({ sessions });
  });

  app.get("/api/ai/voice-sessions/:id", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid voice session id." });
    const userId = req.session.userId!;
    const [session] = await db.select().from(aiVoiceSessions).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, userId))).limit(1);
    if (!session) return res.status(404).json({ error: "Voice session not found." });
    const segments = await db.select().from(aiVoiceSessionSegments).where(and(eq(aiVoiceSessionSegments.sessionId, id.data), eq(aiVoiceSessionSegments.userId, userId))).orderBy(aiVoiceSessionSegments.occurredAt, aiVoiceSessionSegments.id);
    return res.json({ session, segments });
  });

  app.post("/api/ai/voice-sessions/:id/segments", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = segmentSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "Invalid voice transcript segment." });
    const userId = req.session.userId!;
    const [session] = await db.select().from(aiVoiceSessions).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, userId))).limit(1);
    if (!session) return res.status(404).json({ error: "Voice session not found." });
    if (session.status !== "active") return res.status(409).json({ error: "Only active voice sessions accept transcript segments.", session });
    const values = { sessionId: id.data, userId, ...parsed.data, occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date() };
    const [created] = await db.insert(aiVoiceSessionSegments).values(values).onConflictDoNothing().returning();
    if (created) return res.status(201).json({ segment: created });
    const [existing] = await db.select().from(aiVoiceSessionSegments).where(and(eq(aiVoiceSessionSegments.sessionId, id.data), eq(aiVoiceSessionSegments.idempotencyKey, parsed.data.idempotencyKey))).limit(1);
    if (!existing) return res.status(409).json({ error: "Transcript retry could not be reconciled." });
    const requestedOccurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt).getTime() : null;
    const same = existing.speaker === parsed.data.speaker && existing.transcript === parsed.data.transcript && existing.source === parsed.data.source && (requestedOccurredAt === null || existing.occurredAt.getTime() === requestedOccurredAt);
    return same ? res.status(200).json({ segment: existing, replayed: true }) : res.status(409).json({ error: "That idempotency key was already used for different transcript data." });
  });

  app.post("/api/ai/voice-sessions/:id/complete", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = completeSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const userId = req.session.userId!;
    const [current] = await db.select().from(aiVoiceSessions).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, userId))).limit(1);
    if (!current) return res.status(404).json({ error: "Voice session not found." });
    if (current.version !== parsed.data.expectedVersion || current.status !== "active") return res.status(409).json({ error: "The voice session changed before completion.", current });
    const segments = await db.select().from(aiVoiceSessionSegments).where(and(eq(aiVoiceSessionSegments.sessionId, id.data), eq(aiVoiceSessionSegments.userId, userId))).orderBy(aiVoiceSessionSegments.occurredAt, aiVoiceSessionSegments.id);
    const extracted = buildExtractiveVoiceSummary(segments.map((segment) => ({ id: segment.id, speaker: segment.speaker as "user" | "assistant", transcript: segment.transcript })));
    const firstUser = segments.find((segment) => segment.speaker === "user")?.transcript.trim();
    const title = current.title === "Voice session" && firstUser ? firstUser.slice(0, 157) + (firstUser.length > 157 ? "..." : "") : current.title;
    const [session] = await db.update(aiVoiceSessions).set({ ...extracted, title, summaryMethod: "extractive_v1", status: "completed", endedAt: new Date(), version: current.version + 1, updatedAt: new Date() }).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, userId), eq(aiVoiceSessions.version, current.version), eq(aiVoiceSessions.status, "active"))).returning();
    return session ? res.json({ session, segments }) : res.status(409).json({ error: "The voice session changed before completion." });
  });

  app.post("/api/ai/voice-sessions/:id/cancel", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = idSchema.safeParse(req.params.id);
    const parsed = completeSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const [session] = await db.update(aiVoiceSessions).set({ status: "cancelled", endedAt: new Date(), version: parsed.data.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, req.session.userId!), eq(aiVoiceSessions.version, parsed.data.expectedVersion), eq(aiVoiceSessions.status, "active"))).returning();
    if (session) return res.json({ session });
    const [current] = await db.select().from(aiVoiceSessions).where(and(eq(aiVoiceSessions.id, id.data), eq(aiVoiceSessions.userId, req.session.userId!))).limit(1);
    return current ? res.status(409).json({ error: "The voice session changed before cancellation.", current }) : res.status(404).json({ error: "Voice session not found." });
  });
}
