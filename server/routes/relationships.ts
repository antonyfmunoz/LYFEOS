import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { contacts, missionContracts, personalRelationships, quests, relationshipCommitments, relationshipInteractions } from "@shared/schema";
import { isAuthenticated } from "./middleware";

const profileSchema = z.object({
  relationshipKind: z.string().trim().min(1).max(48),
  state: z.enum(["active", "paused", "ended"]),
  purpose: z.string().trim().max(1_000).nullable().optional(),
  boundaries: z.string().trim().max(2_000).nullable().optional(),
  desiredCadence: z.string().trim().max(48).nullable().optional(),
  privateContext: z.string().trim().max(4_000).nullable().optional(),
});

const interactionSchema = z.object({
  kind: z.enum(["check_in", "conversation", "shared_activity", "support", "reflection", "other"]),
  summary: z.string().trim().min(2).max(2_000),
  occurredAt: z.string().datetime().optional(),
});

const commitmentSchema = z.object({
  title: z.string().trim().min(2).max(240),
  detail: z.string().trim().max(2_000).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  questId: z.number().int().positive().nullable().optional(),
});

async function ownedContact(userId: number, contactId: number) {
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.userId, userId))).limit(1);
  return contact;
}

async function ownedRelationship(userId: number, contactId: number) {
  const [relationship] = await db.select().from(personalRelationships).where(and(
    eq(personalRelationships.userId, userId),
    eq(personalRelationships.contactId, contactId),
  )).limit(1);
  return relationship;
}

/** Private personal-life relationship runtime. No external messaging or sync. */
export function registerRelationshipRoutes(app: Express): void {
  app.get("/api/relationship-commitments", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    try {
      const commitments = await db.select({
        id: relationshipCommitments.id,
        title: relationshipCommitments.title,
        detail: relationshipCommitments.detail,
        dueDate: relationshipCommitments.dueDate,
        questId: relationshipCommitments.questId,
        contactId: contacts.id,
        contactName: contacts.name,
      }).from(relationshipCommitments)
        .innerJoin(personalRelationships, eq(personalRelationships.id, relationshipCommitments.relationshipId))
        .innerJoin(contacts, eq(contacts.id, personalRelationships.contactId))
        .where(and(
          eq(relationshipCommitments.userId, userId),
          eq(relationshipCommitments.state, "open"),
          isNotNull(relationshipCommitments.dueDate),
        ))
        .orderBy(asc(relationshipCommitments.dueDate))
        .limit(10);
      return res.json({ commitments });
    } catch {
      return res.status(500).json({ error: "Could not load relationship commitments." });
    }
  });

  app.get("/api/contacts/:contactId/relationship", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    if (!Number.isInteger(contactId)) return res.status(400).json({ error: "Invalid contact." });
    const userId = req.session.userId!;
    try {
      const contact = await ownedContact(userId, contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found." });
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.json({ contact, relationship: null, interactions: [], commitments: [] });
      const [interactions, commitments] = await Promise.all([
        db.select().from(relationshipInteractions).where(and(
          eq(relationshipInteractions.userId, userId),
          eq(relationshipInteractions.relationshipId, relationship.id),
        )).orderBy(desc(relationshipInteractions.occurredAt)).limit(30),
        db.select({
          commitment: relationshipCommitments,
          linkedMissionTitle: quests.title,
          linkedMissionCompleted: quests.completed,
          linkedMissionReviewState: missionContracts.state,
          linkedMissionProgressionAppliedAt: missionContracts.progressionAppliedAt,
        }).from(relationshipCommitments)
          .leftJoin(quests, and(eq(quests.id, relationshipCommitments.questId), eq(quests.userId, userId)))
          .leftJoin(missionContracts, and(eq(missionContracts.questId, quests.id), eq(missionContracts.userId, userId)))
          .where(and(
            eq(relationshipCommitments.userId, userId),
            eq(relationshipCommitments.relationshipId, relationship.id),
          )).orderBy(desc(relationshipCommitments.createdAt)).limit(30),
      ]);
      return res.json({
        contact,
        relationship,
        interactions,
        commitments: commitments.map(({ commitment, ...missionEvidence }) => ({ ...commitment, ...missionEvidence })),
      });
    } catch {
      return res.status(500).json({ error: "Could not load private relationship record." });
    }
  });

  app.put("/api/contacts/:contactId/relationship", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const parsed = profileSchema.safeParse(req.body);
    if (!Number.isInteger(contactId) || !parsed.success) return res.status(400).json({ error: "Provide a valid relationship profile." });
    const userId = req.session.userId!;
    try {
      const contact = await ownedContact(userId, contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found." });
      const [relationship] = await db.insert(personalRelationships).values({
        userId,
        contactId,
        ...parsed.data,
        // Sharing is intentionally unavailable until a separate consent and
        // federation contract exist; no UI or API can enable it here.
        sharingEnabled: false,
      }).onConflictDoUpdate({
        target: personalRelationships.contactId,
        set: { ...parsed.data, sharingEnabled: false, updatedAt: new Date() },
      }).returning();
      return res.json({ relationship });
    } catch {
      return res.status(500).json({ error: "Could not save private relationship profile." });
    }
  });

  app.post("/api/contacts/:contactId/relationship/interactions", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const parsed = interactionSchema.safeParse(req.body);
    if (!Number.isInteger(contactId) || !parsed.success) return res.status(400).json({ error: "Provide a valid relationship interaction." });
    const userId = req.session.userId!;
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(409).json({ error: "Create the private relationship profile first." });
      const [interaction] = await db.insert(relationshipInteractions).values({
        userId,
        relationshipId: relationship.id,
        kind: parsed.data.kind,
        summary: parsed.data.summary,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
        source: "self_report",
      }).returning();
      return res.status(201).json({ interaction });
    } catch {
      return res.status(500).json({ error: "Could not record private relationship interaction." });
    }
  });

  app.post("/api/contacts/:contactId/relationship/commitments", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const parsed = commitmentSchema.safeParse(req.body);
    if (!Number.isInteger(contactId) || !parsed.success) return res.status(400).json({ error: "Provide a valid relationship commitment." });
    const userId = req.session.userId!;
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(409).json({ error: "Create the private relationship profile first." });
      if (parsed.data.questId) {
        const [quest] = await db.select({ id: quests.id }).from(quests).where(and(eq(quests.id, parsed.data.questId), eq(quests.userId, userId))).limit(1);
        if (!quest) return res.status(400).json({ error: "Linked mission is not available to this account." });
      }
      const [commitment] = await db.insert(relationshipCommitments).values({
        userId,
        relationshipId: relationship.id,
        ...parsed.data,
      }).returning();
      return res.status(201).json({ commitment });
    } catch {
      return res.status(500).json({ error: "Could not create relationship commitment." });
    }
  });

  app.patch("/api/contacts/:contactId/relationship/commitments/:commitmentId", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const commitmentId = Number(req.params.commitmentId);
    const parsed = z.object({ state: z.enum(["open", "completed", "cancelled"]) }).safeParse(req.body);
    if (!Number.isInteger(contactId) || !Number.isInteger(commitmentId) || !parsed.success) return res.status(400).json({ error: "Provide a valid commitment state." });
    const userId = req.session.userId!;
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(404).json({ error: "Relationship profile not found." });
      const [existing] = await db.select({ questId: relationshipCommitments.questId }).from(relationshipCommitments).where(and(
        eq(relationshipCommitments.id, commitmentId),
        eq(relationshipCommitments.relationshipId, relationship.id),
        eq(relationshipCommitments.userId, userId),
      )).limit(1);
      if (!existing) return res.status(404).json({ error: "Commitment not found." });
      if (parsed.data.state === "completed" && existing.questId) {
        const [linkedMission] = await db.select({ completed: quests.completed }).from(quests).where(and(
          eq(quests.id, existing.questId),
          eq(quests.userId, userId),
        )).limit(1);
        if (!linkedMission?.completed) {
          return res.status(409).json({ error: "Complete the linked mission first; it holds the relationship evidence for this commitment." });
        }
      }
      const [commitment] = await db.update(relationshipCommitments).set({
        state: parsed.data.state,
        completedAt: parsed.data.state === "completed" ? new Date() : null,
      }).where(and(
        eq(relationshipCommitments.id, commitmentId),
        eq(relationshipCommitments.relationshipId, relationship.id),
        eq(relationshipCommitments.userId, userId),
      )).returning();
      if (!commitment) return res.status(404).json({ error: "Commitment not found." });
      return res.json({ commitment });
    } catch {
      return res.status(500).json({ error: "Could not update relationship commitment." });
    }
  });
}
