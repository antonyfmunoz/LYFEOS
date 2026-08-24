import type { Express, Request, Response } from "express";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  missionContracts,
  missionEvidence,
  missionReviewInvitations,
  missionReviews,
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

const invitationSchema = z.object({ expiresInDays: z.number().int().min(1).max(30).default(7) });
const reviewSchema = z.object({
  decision: z.enum(["meets_evidence", "revisions_needed"]),
  rubric: z.object({
    evidenceChecks: z.array(z.object({
      requirement: z.string().trim().min(1).max(280),
      met: z.boolean(),
    })).max(8).default([]),
  }).default({ evidenceChecks: [] }),
  summary: z.string().trim().min(3).max(2000),
});
const reviewTokenSchema = z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/);

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
    await db.update(missionReviewInvitations).set({ status: "revoked" }).where(and(
      eq(missionReviewInvitations.ownerUserId, req.session.userId!),
      eq(missionReviewInvitations.missionContractId, contract.id),
      inArray(missionReviewInvitations.status, ["pending", "accepted"]),
    ));
    const { token, tokenHash } = createMissionReviewToken();
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
    const [invitation] = await db.insert(missionReviewInvitations).values({
      ownerUserId: req.session.userId!, missionContractId: contract.id, tokenHash, expiresAt,
    }).returning({ id: missionReviewInvitations.id, status: missionReviewInvitations.status, expiresAt: missionReviewInvitations.expiresAt });
    return res.status(201).json({ invitation, reviewPath: `/review-mission#token=${token}` });
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
    if (!token) return res.status(400).json({ error: "A valid review invitation token is required." });
    const row = await invitationForToken(token);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (["revoked", "expired", "completed"].includes(row.invitation.status)) {
      return res.status(410).json({ error: invitationStatusError(row.invitation.status), status: row.invitation.status });
    }
    if (row.invitation.ownerUserId === req.session.userId) return res.status(409).json({ error: "A mission owner cannot act as the authorized human reviewer for their own mission." });
    if (row.invitation.reviewerUserId && row.invitation.reviewerUserId !== req.session.userId) {
      return res.status(403).json({ error: "This review invitation is bound to another reviewer." });
    }
    const accepted = row.invitation.status === "accepted" && row.invitation.reviewerUserId === req.session.userId;
    const evidence = accepted ? await db.select({
      id: missionEvidence.id,
      sourceType: missionEvidence.sourceType,
      sourceReference: missionEvidence.sourceReference,
      summary: missionEvidence.summary,
      confidence: missionEvidence.confidence,
      submittedAt: missionEvidence.submittedAt,
    }).from(missionEvidence).where(eq(missionEvidence.missionContractId, row.contract.id)).orderBy(desc(missionEvidence.submittedAt)) : [];
    return res.json({
      invitation: { id: row.invitation.id, status: row.invitation.status, expiresAt: row.invitation.expiresAt, accepted },
      owner: { displayName: row.ownerName || "LyfeOS user" },
      mission: { id: row.quest.id, title: row.quest.title, completed: row.quest.completed },
      contract: {
        purpose: row.contract.purpose,
        expectedOutput: row.contract.expectedOutput,
        requiredEvidence: row.contract.requiredEvidence,
        riskLevel: row.contract.riskLevel,
        stopConditions: row.contract.stopConditions,
        escalationPath: row.contract.escalationPath,
      },
      evidence,
    });
  });

  app.post("/api/mission-review-invitations/accept", isAuthenticated, async (req: Request, res: Response) => {
    const token = reviewToken(req);
    if (!token) return res.status(400).json({ error: "A valid review invitation token is required." });
    const row = await invitationForToken(token);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (row.invitation.ownerUserId === req.session.userId) return res.status(409).json({ error: "A mission owner cannot review their own human-review mission." });
    if (row.invitation.status === "accepted" && row.invitation.reviewerUserId === req.session.userId) return res.json({ accepted: true });
    if (row.invitation.status !== "pending") return res.status(410).json({ error: invitationStatusError(row.invitation.status) });
    const [accepted] = await db.update(missionReviewInvitations).set({
      status: "accepted", reviewerUserId: req.session.userId!, acceptedAt: new Date(),
    }).where(and(
      eq(missionReviewInvitations.id, row.invitation.id),
      eq(missionReviewInvitations.status, "pending"),
      isNull(missionReviewInvitations.reviewerUserId),
      gt(missionReviewInvitations.expiresAt, new Date()),
    )).returning({ id: missionReviewInvitations.id });
    if (!accepted) return res.status(409).json({ error: "This invitation was accepted or changed before your request completed." });
    return res.json({ accepted: true });
  });

  app.post("/api/mission-review-invitations/review", isAuthenticated, async (req: Request, res: Response) => {
    const token = reviewToken(req);
    if (!token) return res.status(400).json({ error: "A valid review invitation token is required." });
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid review.", details: parsed.error.flatten() });
    const row = await invitationForToken(token);
    if (!row) return res.status(404).json({ error: "Review invitation not found." });
    if (row.invitation.status !== "accepted" || row.invitation.reviewerUserId !== req.session.userId) {
      return res.status(403).json({ error: "Accept this active invitation before submitting a review." });
    }
    if (!row.quest.completed) return res.status(409).json({ error: "The mission owner must complete the mission before evidence can be reviewed." });
    const evidence = await db.select({ id: missionEvidence.id }).from(missionEvidence)
      .where(and(eq(missionEvidence.missionContractId, row.contract.id), eq(missionEvidence.userId, row.invitation.ownerUserId))).limit(1);
    if (!evidence.length) return res.status(409).json({ error: "The mission owner must add evidence before it can be reviewed." });
    const validation = validateEvidenceChecks(row.contract.requiredEvidence, parsed.data.rubric.evidenceChecks, parsed.data.decision);
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
