import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { contacts, missionContracts, personalRelationships, quests, relationshipAIRecommendations, relationshipAssessments, relationshipCommitments, relationshipGovernanceAudit, relationshipGovernanceConsents, relationshipInteractions } from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { buildRelationshipProjection, guidedRelationshipCheckInInput, relationshipAssessmentInput, relationshipConsentInput, RELATIONSHIP_DISCLOSURE_VERSION } from "@shared/relationships";

const anthropic = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
const RELATIONSHIP_MODEL = "claude-haiku-4-5";

const profileSchema = z.object({
  relationshipKind: z.string().trim().min(1).max(48),
  state: z.enum(["active", "paused", "ended"]),
  purpose: z.string().trim().max(1_000).nullable().optional(),
  boundaries: z.string().trim().max(2_000).nullable().optional(),
  desiredCadence: z.string().trim().max(48).nullable().optional(),
  privateContext: z.string().trim().max(4_000).nullable().optional(),
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

async function recordGovernanceAudit(userId: number, relationshipId: number, action: string, metadata: Record<string, unknown>, consentId?: string) {
  await db.insert(relationshipGovernanceAudit).values({ userId, relationshipId, action, metadata, consentId });
}

async function activeConsent(userId: number, relationshipId: number, purpose: "ai_recommendation" | "ecosystem_share") {
  const [consent] = await db.select().from(relationshipGovernanceConsents).where(and(
    eq(relationshipGovernanceConsents.userId, userId),
    eq(relationshipGovernanceConsents.relationshipId, relationshipId),
    eq(relationshipGovernanceConsents.purpose, purpose),
    isNull(relationshipGovernanceConsents.revokedAt),
    gt(relationshipGovernanceConsents.expiresAt, new Date()),
  )).orderBy(desc(relationshipGovernanceConsents.createdAt)).limit(1);
  return consent;
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
      const [interactions, commitments, assessments, consents, recommendations, governanceAudit] = await Promise.all([
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
        db.select().from(relationshipAssessments).where(and(eq(relationshipAssessments.userId, userId), eq(relationshipAssessments.relationshipId, relationship.id))).orderBy(desc(relationshipAssessments.occurredAt)).limit(12),
        db.select({ id: relationshipGovernanceConsents.id, purpose: relationshipGovernanceConsents.purpose, allowedScopes: relationshipGovernanceConsents.allowedScopes, allowedDestinations: relationshipGovernanceConsents.allowedDestinations, disclosureVersion: relationshipGovernanceConsents.disclosureVersion, expiresAt: relationshipGovernanceConsents.expiresAt, revokedAt: relationshipGovernanceConsents.revokedAt, createdAt: relationshipGovernanceConsents.createdAt }).from(relationshipGovernanceConsents).where(and(eq(relationshipGovernanceConsents.userId, userId), eq(relationshipGovernanceConsents.relationshipId, relationship.id))).orderBy(desc(relationshipGovernanceConsents.createdAt)).limit(12),
        db.select().from(relationshipAIRecommendations).where(and(eq(relationshipAIRecommendations.userId, userId), eq(relationshipAIRecommendations.relationshipId, relationship.id))).orderBy(desc(relationshipAIRecommendations.createdAt)).limit(5),
        db.select({ id: relationshipGovernanceAudit.id, action: relationshipGovernanceAudit.action, metadata: relationshipGovernanceAudit.metadata, createdAt: relationshipGovernanceAudit.createdAt }).from(relationshipGovernanceAudit).where(and(eq(relationshipGovernanceAudit.userId, userId), eq(relationshipGovernanceAudit.relationshipId, relationship.id))).orderBy(desc(relationshipGovernanceAudit.createdAt)).limit(20),
      ]);
      return res.json({
        contact,
        relationship,
        interactions,
        commitments: commitments.map(({ commitment, ...missionEvidence }) => ({ ...commitment, ...missionEvidence })),
        assessments,
        consents,
        recommendations,
        governanceAudit,
        disclosure: "Private relationship context remains in LyfeOS. AI use and ecosystem sharing require separate, expiring consent.",
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
    const parsed = guidedRelationshipCheckInInput.safeParse(req.body);
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
        structuredData: parsed.data.structuredData,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
        source: "self_report",
      }).returning();
      return res.status(201).json({ interaction });
    } catch {
      return res.status(500).json({ error: "Could not record private relationship interaction." });
    }
  });

  app.post("/api/contacts/:contactId/relationship/assessments", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const parsed = relationshipAssessmentInput.safeParse(req.body);
    if (!Number.isInteger(contactId) || !parsed.success) return res.status(400).json({ error: "Complete every assessment dimension from 1 to 5." });
    const userId = req.session.userId!;
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(409).json({ error: "Create the private relationship profile first." });
      const [assessment] = await db.insert(relationshipAssessments).values({
        userId,
        relationshipId: relationship.id,
        assessmentKind: parsed.data.assessmentKind,
        dimensions: parsed.data.dimensions,
        reflection: parsed.data.reflection || null,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
      }).returning();
      return res.status(201).json({ assessment, disclosure: "This is your structured self-assessment, not an objective score of another person or the relationship." });
    } catch {
      return res.status(500).json({ error: "Could not save relationship assessment." });
    }
  });

  app.post("/api/contacts/:contactId/relationship/consents", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const parsed = relationshipConsentInput.safeParse(req.body);
    if (!Number.isInteger(contactId) || !parsed.success) return res.status(400).json({ error: parsed.success ? "Invalid contact." : parsed.error.errors[0]?.message || "Invalid relationship consent." });
    const userId = req.session.userId!;
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(409).json({ error: "Create the private relationship profile first." });
      const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
      const [consent] = await db.transaction(async (tx) => {
        await tx.update(relationshipGovernanceConsents).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(
          eq(relationshipGovernanceConsents.userId, userId), eq(relationshipGovernanceConsents.relationshipId, relationship.id), eq(relationshipGovernanceConsents.purpose, parsed.data.purpose), isNull(relationshipGovernanceConsents.revokedAt),
        ));
        const rows = await tx.insert(relationshipGovernanceConsents).values({ userId, relationshipId: relationship.id, purpose: parsed.data.purpose, allowedScopes: parsed.data.allowedScopes, allowedDestinations: parsed.data.allowedDestinations, disclosureVersion: RELATIONSHIP_DISCLOSURE_VERSION, expiresAt }).returning();
        await tx.insert(relationshipGovernanceAudit).values({ userId, relationshipId: relationship.id, consentId: rows[0].id, action: "consent_granted", metadata: { purpose: parsed.data.purpose, scopes: parsed.data.allowedScopes, destinations: parsed.data.allowedDestinations, expiresAt: expiresAt.toISOString() } });
        return rows;
      });
      return res.status(201).json({ consent, disclosure: "Consent is purpose-bound, expires automatically, and can be revoked at any time." });
    } catch {
      return res.status(500).json({ error: "Could not save relationship consent." });
    }
  });

  app.delete("/api/contacts/:contactId/relationship/consents/:consentId", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const consentId = req.params.consentId;
    const userId = req.session.userId!;
    if (!Number.isInteger(contactId) || !z.string().uuid().safeParse(consentId).success) return res.status(400).json({ error: "Invalid relationship consent." });
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(404).json({ error: "Relationship profile not found." });
      const [consent] = await db.transaction(async (tx) => {
        const rows = await tx.update(relationshipGovernanceConsents).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(relationshipGovernanceConsents.id, consentId), eq(relationshipGovernanceConsents.userId, userId), eq(relationshipGovernanceConsents.relationshipId, relationship.id), isNull(relationshipGovernanceConsents.revokedAt))).returning();
        if (rows[0]) await tx.insert(relationshipGovernanceAudit).values({ userId, relationshipId: relationship.id, consentId, action: "consent_revoked", metadata: { purpose: rows[0].purpose } });
        return rows;
      });
      if (!consent) return res.status(409).json({ error: "Consent is unavailable or already revoked." });
      return res.json({ consent, disclosure: "No future AI context use or sharing is authorized by this receipt." });
    } catch {
      return res.status(500).json({ error: "Could not revoke relationship consent." });
    }
  });

  app.get("/api/contacts/:contactId/relationship/projection", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const destination = typeof req.query.destination === "string" ? req.query.destination : "";
    const userId = req.session.userId!;
    if (!Number.isInteger(contactId)) return res.status(400).json({ error: "Invalid contact." });
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(404).json({ error: "Relationship profile not found." });
      const consent = await activeConsent(userId, relationship.id, "ecosystem_share");
      const destinations = Array.isArray(consent?.allowedDestinations) ? consent.allowedDestinations as string[] : [];
      if (!consent || !destinations.includes(destination)) return res.status(403).json({ error: "Active sharing consent does not authorize this destination." });
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(relationshipCommitments).where(and(eq(relationshipCommitments.userId, userId), eq(relationshipCommitments.relationshipId, relationship.id), eq(relationshipCommitments.state, "open")));
      const projection = buildRelationshipProjection({ relationshipRef: relationship.ecosystemId, relationshipKind: relationship.relationshipKind, state: relationship.state, openCommitmentCount: count, destination, allowedScopes: consent.allowedScopes as string[], consentId: consent.id, consentExpiresAt: consent.expiresAt });
      await recordGovernanceAudit(userId, relationship.id, "projection_built", { destination, scopes: consent.allowedScopes, schema: projection.schema }, consent.id);
      return res.json(projection);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not build relationship projection." });
    }
  });

  app.post("/api/contacts/:contactId/relationship/recommendations", isAuthenticated, async (req: Request, res: Response) => {
    const contactId = Number(req.params.contactId);
    const userId = req.session.userId!;
    if (!Number.isInteger(contactId)) return res.status(400).json({ error: "Invalid contact." });
    try {
      const relationship = await ownedRelationship(userId, contactId);
      if (!relationship) return res.status(404).json({ error: "Relationship profile not found." });
      const consent = await activeConsent(userId, relationship.id, "ai_recommendation");
      if (!consent) return res.status(403).json({ error: "Grant active AI recommendation consent first." });
      const scopes = Array.isArray(consent.allowedScopes) ? consent.allowedScopes as string[] : [];
      const sourceManifest: Array<{ key: string; label: string; recordCount: number }> = [];
      const context: Record<string, unknown> = {};
      if (scopes.includes("profile")) { context.profile = { relationshipKind: relationship.relationshipKind, state: relationship.state, purpose: relationship.purpose, boundaries: relationship.boundaries, desiredCadence: relationship.desiredCadence }; sourceManifest.push({ key: "profile", label: "Authorized relationship profile", recordCount: 1 }); }
      if (scopes.includes("assessments")) { const rows = await db.select({ dimensions: relationshipAssessments.dimensions, reflection: relationshipAssessments.reflection, occurredAt: relationshipAssessments.occurredAt }).from(relationshipAssessments).where(and(eq(relationshipAssessments.userId, userId), eq(relationshipAssessments.relationshipId, relationship.id))).orderBy(desc(relationshipAssessments.occurredAt)).limit(5); context.assessments = rows; sourceManifest.push({ key: "assessments", label: "Authorized self-assessments", recordCount: rows.length }); }
      if (scopes.includes("check_ins")) { const rows = await db.select({ summary: relationshipInteractions.summary, structuredData: relationshipInteractions.structuredData, occurredAt: relationshipInteractions.occurredAt }).from(relationshipInteractions).where(and(eq(relationshipInteractions.userId, userId), eq(relationshipInteractions.relationshipId, relationship.id))).orderBy(desc(relationshipInteractions.occurredAt)).limit(10); context.checkIns = rows; sourceManifest.push({ key: "check_ins", label: "Authorized check-ins", recordCount: rows.length }); }
      if (scopes.includes("commitments")) { const rows = await db.select({ title: relationshipCommitments.title, detail: relationshipCommitments.detail, state: relationshipCommitments.state, dueDate: relationshipCommitments.dueDate }).from(relationshipCommitments).where(and(eq(relationshipCommitments.userId, userId), eq(relationshipCommitments.relationshipId, relationship.id))).orderBy(desc(relationshipCommitments.createdAt)).limit(10); context.commitments = rows; sourceManifest.push({ key: "commitments", label: "Authorized commitments", recordCount: rows.length }); }
      if (!sourceManifest.length) return res.status(409).json({ error: "The active consent contains no usable relationship context." });
      if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) return res.status(503).json({ error: "Relationship AI provider is not configured." });
      const response = await anthropic.messages.create({ model: RELATIONSHIP_MODEL, max_tokens: 900, system: "You produce reflective relationship guidance for the user's own behavior. Do not diagnose, score the other person, manipulate, draft outreach, or recommend surveillance. Use only supplied authorized context. Return JSON with recommendations: [{text,citations:[source_key]}], maximum 3. Separate observation from inference and suggest consent-respecting actions the user controls.", messages: [{ role: "user", content: JSON.stringify({ context, availableSources: sourceManifest }) }] });
      const text = response.content.find((block) => block.type === "text")?.text || "";
      const match = text.match(/\{[\s\S]*\}/);
      let responseBody: unknown = null;
      try {
        responseBody = match ? JSON.parse(match[0]) : null;
      } catch {
        return res.status(502).json({ error: "Relationship AI returned malformed JSON." });
      }
      const parsed = z.object({ recommendations: z.array(z.object({ text: z.string().trim().min(1).max(800), citations: z.array(z.string()).max(4) })).max(3) }).safeParse(responseBody);
      if (!parsed.success || parsed.data.recommendations.some((item) => item.citations.some((citation) => !sourceManifest.some((source) => source.key === citation)))) return res.status(502).json({ error: "Relationship AI returned an invalid or unattributed response." });
      const disclosure = "AI-generated reflection based only on the authorized sources listed here. It may be wrong and is not a judgment of the other person.";
      const [recommendation] = await db.transaction(async (tx) => {
        const rows = await tx.insert(relationshipAIRecommendations).values({ userId, relationshipId: relationship.id, consentId: consent.id, model: RELATIONSHIP_MODEL, sourceManifest, recommendations: parsed.data.recommendations, disclosure }).returning();
        await tx.insert(relationshipGovernanceAudit).values({ userId, relationshipId: relationship.id, consentId: consent.id, action: "ai_recommendation_generated", metadata: { scopes, sourceCounts: sourceManifest.map(({ key, recordCount }) => ({ key, recordCount })), model: RELATIONSHIP_MODEL } });
        return rows;
      });
      return res.status(201).json({ recommendation });
    } catch {
      return res.status(500).json({ error: "Could not generate governed relationship guidance." });
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
