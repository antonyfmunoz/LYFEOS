import type { Express, Request, Response } from "express";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  missionContracts,
  missionEvidence,
  missionReviewInvitations,
  missionReviews,
  conversationMessages,
  messageAuditEvents,
  messageChannelBindings,
  messageConversationParticipants,
  messageConversations,
  messageDeliveryReceipts,
  quests,
  users,
} from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { applyReviewedMissionProgression, revokeReviewedMissionProgression } from "../mission-lifecycle";
import {
  createMissionReviewToken,
  hashMissionReviewToken,
  missionReviewTokenMatches,
  validateEvidenceChecks,
} from "../mission-review-authorization";
import { missionEvidenceForContracts } from "../mission-evidence-provenance";

const invitationSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  reviewerUserId: z.number().int().positive().optional(),
}).strict();
const reviewSchema = z.object({
  decision: z.enum(["meets_evidence", "revisions_needed"]),
  rubric: z.object({
    evidenceChecks: z.array(z.object({
      criterionId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
      requirement: z.string().trim().min(1).max(280),
      met: z.boolean(),
      note: z.string().trim().max(500).optional(),
    })).max(8).default([]),
  }).default({ evidenceChecks: [] }),
  summary: z.string().trim().min(3).max(2000),
});
const reviewTokenSchema = z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/);
const assignedInvitationIdSchema = z.coerce.number().int().positive();

function reviewToken(req: Request): string | null {
  const parsed = reviewTokenSchema.safeParse(req.get("x-lyfeos-review-token"));
  return parsed.success ? parsed.data : null;
}

async function invitationForToken(token: string) {
  const tokenHash = hashMissionReviewToken(token);
  const [row] = await db.select({
    invitation: missionReviewInvitations,
    contract: missionContracts,
    quest: { id: quests.id, title: quests.title, completed: quests.completed },
    ownerName: users.displayName,
  }).from(missionReviewInvitations)
    .innerJoin(missionContracts, eq(missionContracts.id, missionReviewInvitations.missionContractId))
    .innerJoin(quests, eq(quests.id, missionContracts.questId))
    .innerJoin(users, eq(users.id, missionReviewInvitations.ownerUserId))
    .where(eq(missionReviewInvitations.tokenHash, tokenHash))
    .limit(1);
  if (!row || !missionReviewTokenMatches(token, row.invitation.tokenHash)) return null;
  if (row.invitation.expiresAt.getTime() <= Date.now() && ["pending", "accepted"].includes(row.invitation.status)) {
    const [expired] = await db.update(missionReviewInvitations)
      .set({ status: "expired" })
      .where(and(
        eq(missionReviewInvitations.id, row.invitation.id),
        inArray(missionReviewInvitations.status, ["pending", "accepted"]),
      ))
      .returning();
    if (expired) row.invitation = expired;
  }
  return row;
}

async function invitationForAssignedReviewer(invitationId: number, reviewerUserId: number) {
  const [row] = await db.select({
    invitation: missionReviewInvitations,
    contract: missionContracts,
    quest: { id: quests.id, title: quests.title, completed: quests.completed },
    ownerName: users.displayName,
  }).from(missionReviewInvitations)
    .innerJoin(missionContracts, eq(missionContracts.id, missionReviewInvitations.missionContractId))
    .innerJoin(quests, eq(quests.id, missionContracts.questId))
    .innerJoin(users, eq(users.id, missionReviewInvitations.ownerUserId))
    .where(and(
      eq(missionReviewInvitations.id, invitationId),
      eq(missionReviewInvitations.reviewerUserId, reviewerUserId),
    ))
    .limit(1);
  if (!row) return null;
  if (row.invitation.expiresAt.getTime() <= Date.now() && ["pending", "accepted"].includes(row.invitation.status)) {
    const [expired] = await db.update(missionReviewInvitations)
      .set({ status: "expired" })
      .where(and(
        eq(missionReviewInvitations.id, row.invitation.id),
        inArray(missionReviewInvitations.status, ["pending", "accepted"]),
      ))
      .returning();
    if (expired) row.invitation = expired;
  }
  return row;
}

async function invitationForRequest(req: Request) {
  const token = reviewToken(req);
  if (token) return invitationForToken(token);
  const assignedId = assignedInvitationIdSchema.safeParse(req.get("x-lyfeos-review-invitation-id"));
  if (assignedId.success && req.session.userId) return invitationForAssignedReviewer(assignedId.data, req.session.userId);
  return null;
}

type ReviewTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function deliverNativeReviewInvitation(tx: ReviewTransaction, input: {
  invitationId: number;
  ownerUserId: number;
  ownerDisplayName: string;
  reviewerUserId: number;
  reviewerDisplayName: string;
  missionTitle: string;
}) {
  const participantIds = [input.ownerUserId, input.reviewerUserId].sort((a, b) => a - b);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lyfeos-native-message:${participantIds.join(":")}`}, 0))`);
  const existingResult = await tx.execute(sql`
    SELECT c."id" FROM "message_conversations" c
    JOIN "message_conversation_participants" p ON p."conversation_id" = c."id" AND p."status" IN ('active', 'blocked')
    WHERE c."kind" = 'direct'
    GROUP BY c."id"
    HAVING count(*) = 2 AND array_agg(p."user_id" ORDER BY p."user_id") = ARRAY[${participantIds[0]}, ${participantIds[1]}]::integer[]
    LIMIT 1
  `);
  let conversationId = (existingResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id;
  if (conversationId) {
    const [participants, bindings] = await Promise.all([
      tx.select().from(messageConversationParticipants).where(eq(messageConversationParticipants.conversationId, conversationId)),
      tx.select({ id: messageChannelBindings.id }).from(messageChannelBindings).where(and(
        eq(messageChannelBindings.conversationId, conversationId),
        eq(messageChannelBindings.provider, "native"),
        eq(messageChannelBindings.status, "active"),
      )).limit(1),
    ]);
    if (participants.some((participant) => participant.status !== "active" || !["open", "pending"].includes(participant.inboxStatus))) {
      throw new Error("NATIVE_REVIEW_DELIVERY_UNAVAILABLE");
    }
    if (!bindings.length) throw new Error("NATIVE_REVIEW_DELIVERY_UNAVAILABLE");
  } else {
    const [conversation] = await tx.insert(messageConversations).values({
      createdByUserId: input.ownerUserId,
      title: input.reviewerDisplayName,
      kind: "direct",
      status: "open",
      aiMode: "observe",
    }).returning({ id: messageConversations.id });
    conversationId = conversation.id;
    await tx.insert(messageConversationParticipants).values([
      { conversationId, userId: input.ownerUserId, role: "admin" },
      { conversationId, userId: input.reviewerUserId, role: "member" },
    ]);
    await tx.insert(messageChannelBindings).values({ conversationId, provider: "native", channelKind: "native", status: "active" });
    await tx.insert(messageAuditEvents).values({
      conversationId,
      actorUserId: input.ownerUserId,
      eventType: "ConversationCreated.v1",
      aggregateVersion: 1,
      metadata: { participantCount: 2, channel: "native", purpose: "mission_review_invitation" },
    });
  }
  const [ownerParticipant] = await tx.select({ id: messageConversationParticipants.id })
    .from(messageConversationParticipants)
    .where(and(
      eq(messageConversationParticipants.conversationId, conversationId),
      eq(messageConversationParticipants.userId, input.ownerUserId),
      eq(messageConversationParticipants.status, "active"),
    )).limit(1);
  if (!ownerParticipant) throw new Error("NATIVE_REVIEW_DELIVERY_UNAVAILABLE");
  const now = new Date();
  const [conversation] = await tx.update(messageConversations).set({
    lastMessageAt: now,
    updatedAt: now,
    version: sql`${messageConversations.version} + 1`,
  }).where(eq(messageConversations.id, conversationId)).returning({ version: messageConversations.version });
  const reviewPath = `/review-mission#invitation=${input.invitationId}`;
  const [message] = await tx.insert(conversationMessages).values({
    conversationId,
    senderUserId: input.ownerUserId,
    senderParticipantRef: ownerParticipant.id,
    body: `${input.ownerDisplayName} invited you to review “${input.missionTitle}” in LyfeOS.`,
    idempotencyKey: `mission-review-invitation:${input.invitationId}`,
    status: "delivered",
    provider: "native",
    direction: "outbound",
    sentAt: now,
    receivedAt: now,
    extension: { kind: "mission_review_invitation", invitationId: input.invitationId, reviewPath },
  }).returning({ id: conversationMessages.id });
  await tx.insert(messageDeliveryReceipts).values([
    { messageId: message.id, recipientUserId: input.reviewerUserId, provider: "native", state: "accepted", occurredAt: now, evidence: { assertion: "local_transaction_commit" } },
    { messageId: message.id, recipientUserId: input.reviewerUserId, provider: "native", state: "sent", occurredAt: now, evidence: { assertion: "local_transaction_commit" } },
    { messageId: message.id, recipientUserId: input.reviewerUserId, provider: "native", state: "delivered", occurredAt: now, evidence: { assertion: "recipient_inbox_committed" } },
  ]);
  await tx.insert(messageAuditEvents).values([
    { conversationId, messageId: message.id, actorUserId: input.ownerUserId, eventType: "MessageQueued.v1", aggregateVersion: conversation.version, metadata: { provider: "native", purpose: "mission_review_invitation" } },
    { conversationId, messageId: message.id, actorUserId: input.ownerUserId, eventType: "MessageSent.v1", aggregateVersion: conversation.version, metadata: { provider: "native", purpose: "mission_review_invitation" } },
    { conversationId, messageId: message.id, actorUserId: input.ownerUserId, eventType: "MessageDelivered.v1", aggregateVersion: conversation.version, metadata: { provider: "native", recipientCount: 1, purpose: "mission_review_invitation" } },
  ]);
  return { messageId: message.id, deliveredAt: now, reviewPath };
}

function invitationStatusError(status: string): string {
  if (status === "revoked") return "The mission owner revoked this review invitation.";
  if (status === "expired") return "This review invitation expired. Ask the mission owner for a new link.";
  if (status === "completed") return "This review invitation has already been completed.";
  return "This review invitation is no longer available.";
}

export function registerMissionReviewRoutes(app: Express): void {
  app.use("/api/mission-review-invitations", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  app.get("/api/quests/:questId/review-invitations", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const [contract] = await db.select().from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(404).json({ error: "Mission proof plan not found." });
    const invitations = await db.select({
      id: missionReviewInvitations.id,
      status: missionReviewInvitations.status,
      reviewerUserId: missionReviewInvitations.reviewerUserId,
      deliveryChannel: missionReviewInvitations.deliveryChannel,
      deliveryStatus: missionReviewInvitations.deliveryStatus,
      deliveredAt: missionReviewInvitations.deliveredAt,
      expiresAt: missionReviewInvitations.expiresAt,
      acceptedAt: missionReviewInvitations.acceptedAt,
      completedAt: missionReviewInvitations.completedAt,
      createdAt: missionReviewInvitations.createdAt,
    }).from(missionReviewInvitations)
      .where(and(
        eq(missionReviewInvitations.ownerUserId, req.session.userId!),
        eq(missionReviewInvitations.missionContractId, contract.id),
      )).orderBy(desc(missionReviewInvitations.createdAt));
    const reviewerIds = invitations.flatMap((item) => item.reviewerUserId ? [item.reviewerUserId] : []);
    const reviewers = reviewerIds.length
      ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, reviewerIds))
      : [];
    const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.displayName]));
    return res.json({ invitations: invitations.map((item) => ({
      ...item,
      reviewerDisplayName: item.reviewerUserId ? reviewerNames.get(item.reviewerUserId) ?? "Authorized reviewer" : null,
    })) });
  });

  app.post("/api/quests/:questId/review-invitations", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = invitationSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Choose an expiration between 1 and 30 days." });
    const [contract] = await db.select().from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(404).json({ error: "Mission proof plan not found." });
    if (contract.reviewMode !== "human") return res.status(409).json({ error: "Set this proof plan to human review before inviting a reviewer." });
    if (contract.progressionAppliedAt) return res.status(409).json({ error: "Reopen this reviewed mission before creating another review invitation." });
    const [owner] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, req.session.userId!)).limit(1);
    const [reviewer] = parsed.data.reviewerUserId
      ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, parsed.data.reviewerUserId)).limit(1)
      : [];
    if (parsed.data.reviewerUserId === req.session.userId) return res.status(409).json({ error: "Choose another LyfeOS user as the reviewer." });
    if (parsed.data.reviewerUserId && !reviewer) return res.status(404).json({ error: "That LyfeOS reviewer is unavailable." });
    const { token, tokenHash } = createMissionReviewToken();
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(129104, ${contract.id})`);
        await tx.update(missionReviewInvitations).set({ status: "revoked" }).where(and(
          eq(missionReviewInvitations.ownerUserId, req.session.userId!),
          eq(missionReviewInvitations.missionContractId, contract.id),
          inArray(missionReviewInvitations.status, ["pending", "accepted"]),
        ));
        const [invitation] = await tx.insert(missionReviewInvitations).values({
          ownerUserId: req.session.userId!,
          missionContractId: contract.id,
          reviewerUserId: reviewer?.id,
          tokenHash,
          expiresAt,
        }).returning({ id: missionReviewInvitations.id, status: missionReviewInvitations.status, expiresAt: missionReviewInvitations.expiresAt });
        if (!reviewer) return { invitation, reviewPath: `/review-mission#token=${token}`, delivery: null };
        const delivery = await deliverNativeReviewInvitation(tx, {
          invitationId: invitation.id,
          ownerUserId: req.session.userId!,
          ownerDisplayName: owner?.displayName || "A LyfeOS user",
          reviewerUserId: reviewer.id,
          reviewerDisplayName: reviewer.displayName || "LyfeOS reviewer",
          missionTitle: (await tx.select({ title: quests.title }).from(quests).where(eq(quests.id, questId)).limit(1))[0]?.title || "Mission",
        });
        await tx.update(missionReviewInvitations).set({
          deliveryChannel: "native_inbox",
          deliveryStatus: "delivered",
          deliveryMessageId: delivery.messageId,
          deliveredAt: delivery.deliveredAt,
        }).where(eq(missionReviewInvitations.id, invitation.id));
        return { invitation, reviewPath: delivery.reviewPath, delivery: { channel: "native_inbox", status: "delivered", deliveredAt: delivery.deliveredAt } };
      });
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "NATIVE_REVIEW_DELIVERY_UNAVAILABLE") {
        return res.status(409).json({ error: "Native delivery is unavailable for this reviewer. Respect their inbox state or create a private review link instead." });
      }
      throw error;
    }
  });

  app.delete("/api/quests/:questId/review-invitations/:invitationId", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    const invitationId = Number(req.params.invitationId);
    if (!Number.isInteger(questId) || !Number.isInteger(invitationId)) return res.status(400).json({ error: "Invalid review invitation." });
    const [contract] = await db.select({ id: missionContracts.id }).from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(404).json({ error: "Mission proof plan not found." });
    const [revoked] = await db.update(missionReviewInvitations).set({ status: "revoked" }).where(and(
      eq(missionReviewInvitations.id, invitationId),
      eq(missionReviewInvitations.ownerUserId, req.session.userId!),
      eq(missionReviewInvitations.missionContractId, contract.id),
      inArray(missionReviewInvitations.status, ["pending", "accepted"]),
    )).returning({ id: missionReviewInvitations.id });
    if (!revoked) return res.status(404).json({ error: "Active review invitation not found." });
    return res.status(204).send();
  });

  app.get("/api/mission-review-invitations/resolve", isAuthenticated, async (req: Request, res: Response) => {
    const token = reviewToken(req);
    const assignedId = assignedInvitationIdSchema.safeParse(req.get("x-lyfeos-review-invitation-id"));
    if (!token && !assignedId.success) return res.status(400).json({ error: "A valid review invitation is required." });
    const row = await invitationForRequest(req);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (["revoked", "expired", "completed"].includes(row.invitation.status)) {
      return res.status(410).json({ error: invitationStatusError(row.invitation.status), status: row.invitation.status });
    }
    if (row.invitation.ownerUserId === req.session.userId) return res.status(409).json({ error: "A mission owner cannot act as the authorized human reviewer for their own mission." });
    if (row.invitation.reviewerUserId && row.invitation.reviewerUserId !== req.session.userId) {
      return res.status(403).json({ error: "This review invitation is bound to another reviewer." });
    }
    const accepted = row.invitation.status === "accepted" && row.invitation.reviewerUserId === req.session.userId;
    const evidence = accepted ? await missionEvidenceForContracts([row.contract.id], row.invitation.ownerUserId) : [];
    return res.json({
      invitation: { id: row.invitation.id, status: row.invitation.status, expiresAt: row.invitation.expiresAt, accepted },
      owner: { displayName: row.ownerName || "LyfeOS user" },
      mission: { id: row.quest.id, title: row.quest.title, completed: row.quest.completed },
      contract: {
        purpose: row.contract.purpose,
        expectedOutput: row.contract.expectedOutput,
        requiredEvidence: row.contract.requiredEvidence,
        rubricDefinition: row.contract.rubricDefinition,
        rubricVersion: row.contract.rubricVersion,
        riskLevel: row.contract.riskLevel,
        stopConditions: row.contract.stopConditions,
        escalationPath: row.contract.escalationPath,
      },
      evidence,
    });
  });

  app.post("/api/mission-review-invitations/accept", isAuthenticated, async (req: Request, res: Response) => {
    const token = reviewToken(req);
    const assignedId = assignedInvitationIdSchema.safeParse(req.get("x-lyfeos-review-invitation-id"));
    if (!token && !assignedId.success) return res.status(400).json({ error: "A valid review invitation is required." });
    const row = await invitationForRequest(req);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (row.invitation.ownerUserId === req.session.userId) return res.status(409).json({ error: "A mission owner cannot review their own human-review mission." });
    if (row.invitation.reviewerUserId && row.invitation.reviewerUserId !== req.session.userId) return res.status(403).json({ error: "This review invitation is bound to another reviewer." });
    if (row.invitation.status === "accepted" && row.invitation.reviewerUserId === req.session.userId) return res.json({ accepted: true });
    if (row.invitation.status !== "pending") return res.status(410).json({ error: invitationStatusError(row.invitation.status) });
    const [accepted] = await db.update(missionReviewInvitations).set({
      status: "accepted", reviewerUserId: req.session.userId!, acceptedAt: new Date(),
    }).where(and(
      eq(missionReviewInvitations.id, row.invitation.id),
      eq(missionReviewInvitations.status, "pending"),
      or(isNull(missionReviewInvitations.reviewerUserId), eq(missionReviewInvitations.reviewerUserId, req.session.userId!)),
      gt(missionReviewInvitations.expiresAt, new Date()),
    )).returning({ id: missionReviewInvitations.id });
    if (!accepted) return res.status(409).json({ error: "This invitation was accepted or changed before your request completed." });
    return res.json({ accepted: true });
  });

  app.post("/api/mission-review-invitations/review", isAuthenticated, async (req: Request, res: Response) => {
    const token = reviewToken(req);
    const assignedId = assignedInvitationIdSchema.safeParse(req.get("x-lyfeos-review-invitation-id"));
    if (!token && !assignedId.success) return res.status(400).json({ error: "A valid review invitation is required." });
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid review.", details: parsed.error.flatten() });
    const row = await invitationForRequest(req);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (row.invitation.status !== "accepted" || row.invitation.reviewerUserId !== req.session.userId) {
      return res.status(403).json({ error: "Accept this active invitation before submitting a review." });
    }
    if (!row.quest.completed) return res.status(409).json({ error: "The mission owner must complete the mission before evidence can be reviewed." });
    const evidence = await db.select({ id: missionEvidence.id }).from(missionEvidence)
      .where(and(eq(missionEvidence.missionContractId, row.contract.id), eq(missionEvidence.userId, row.invitation.ownerUserId))).limit(1);
    if (!evidence.length) return res.status(409).json({ error: "The mission owner must add evidence before it can be reviewed." });
    const validation = validateEvidenceChecks(row.contract.requiredEvidence, parsed.data.rubric.evidenceChecks, parsed.data.decision, row.contract.rubricDefinition);
    if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
    const review = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(missionReviewInvitations).set({ status: "completed", completedAt: new Date() })
        .where(and(
          eq(missionReviewInvitations.id, row.invitation.id),
          eq(missionReviewInvitations.status, "accepted"),
          eq(missionReviewInvitations.reviewerUserId, req.session.userId!),
        )).returning({ id: missionReviewInvitations.id });
      if (!claimed) return null;
      const [created] = await tx.insert(missionReviews).values({
        userId: row.invitation.ownerUserId,
        missionContractId: row.contract.id,
        reviewerType: "human",
        reviewerUserId: req.session.userId!,
        reviewInvitationId: row.invitation.id,
        ...parsed.data,
        rubric: { ...parsed.data.rubric, definition: row.contract.rubricDefinition },
        rubricVersion: row.contract.rubricVersion,
      }).returning();
      await tx.update(missionContracts).set({
        state: parsed.data.decision === "meets_evidence" ? "reviewed" : "revisions_needed",
        updatedAt: new Date(),
      }).where(eq(missionContracts.id, row.contract.id));
      return created;
    });
    if (!review) return res.status(409).json({ error: "This review invitation was already completed or changed." });
    const progression = parsed.data.decision === "meets_evidence"
      ? await applyReviewedMissionProgression({ questId: row.quest.id, userId: row.invitation.ownerUserId, reviewSummary: parsed.data.summary })
      : await revokeReviewedMissionProgression({ questId: row.quest.id, userId: row.invitation.ownerUserId, reason: `Authorized human review requested revisions: ${parsed.data.summary}` });
    return res.status(201).json({ review, progression });
  });
}
