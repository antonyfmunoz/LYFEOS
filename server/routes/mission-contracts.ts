import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { missionContracts, missionDependencies, missionEvidence, missionReviewAppeals, missionReviewInvitations, missionReviews, quests, users } from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { applyReviewedMissionProgression, revokeReviewedMissionProgression } from "../mission-lifecycle";
import { wouldCreateMissionDependencyCycle } from "../mission-dependencies";
import { normalizeRubricDefinition, validateEvidenceChecks } from "../mission-review-authorization";
import { storage } from "../storage";
import { buildPlanningContextSnapshot } from "../context-snapshot";

const textList = z.array(z.string().trim().min(1).max(280)).max(8);
const rubricCriterionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  requirement: z.string().trim().min(1).max(280),
  guidance: z.string().trim().min(1).max(500),
  weight: z.number().int().min(1).max(3),
  required: z.boolean().default(true),
});
const contractSchema = z.object({
  purpose: z.string().trim().min(3).max(800),
  expectedOutput: z.string().trim().min(3).max(1200),
  capabilityTargets: textList.default([]),
  prerequisites: textList.default([]),
  requiredEvidence: textList.default([]),
  rubricDefinition: z.array(rubricCriterionSchema).max(8).optional(),
  reviewMode: z.enum(["self", "human"]).default("self"),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  stopConditions: textList.default([]),
  escalationPath: z.string().trim().max(800).nullable().optional(),
  state: z.enum(["draft", "accepted"]).default("draft"),
});
const evidenceSchema = z.object({
  sourceType: z.enum(["self_report", "artifact", "observation", "provider"]),
  sourceReference: z.string().trim().max(2000).nullable().optional(),
  summary: z.string().trim().min(3).max(2000),
  confidence: z.enum(["self_reported", "low", "medium", "high"]).default("self_reported"),
});
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
const dependencySchema = z.object({
  prerequisiteQuestId: z.number().int().positive(),
});
const reviewModeSchema = z.object({ reviewMode: z.enum(["self", "human"]) });
const appealSchema = z.object({ reason: z.string().trim().min(10).max(2000) });
const appealResolutionSchema = z.object({
  decision: z.enum(["upheld", "reconsidered"]),
  summary: z.string().trim().min(3).max(2000),
  rubric: z.object({
    evidenceChecks: z.array(z.object({
      criterionId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
      requirement: z.string().trim().min(1).max(280),
      met: z.boolean(),
      note: z.string().trim().max(500).optional(),
    })).max(8).default([]),
  }).default({ evidenceChecks: [] }),
});

async function ownedQuest(questId: number, userId: number) {
  const [quest] = await db.select({ id: quests.id, completed: quests.completed })
    .from(quests).where(and(eq(quests.id, questId), eq(quests.userId, userId))).limit(1);
  return quest;
}

async function contractBundle(questId: number, userId: number) {
  const [contract] = await db.select().from(missionContracts)
    .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, userId))).limit(1);
  const [quest] = await db.select({
    planningContextSnapshot: quests.planningContextSnapshot,
    difficultyCalibration: quests.difficultyCalibration,
    planningDecisionSource: quests.planningDecisionSource,
  }).from(quests).where(and(eq(quests.id, questId), eq(quests.userId, userId))).limit(1);
  const planningDecision = quest ? {
    context: quest.planningContextSnapshot,
    calibration: quest.difficultyCalibration,
    source: quest.planningDecisionSource,
  } : null;
  if (!contract) return { contract: null, evidence: [], reviews: [], appeals: [], planningDecision };
  const [evidence, reviews, appeals] = await Promise.all([
    db.select().from(missionEvidence).where(and(eq(missionEvidence.missionContractId, contract.id), eq(missionEvidence.userId, userId))).orderBy(desc(missionEvidence.submittedAt)),
    db.select().from(missionReviews).where(and(eq(missionReviews.missionContractId, contract.id), eq(missionReviews.userId, userId))).orderBy(desc(missionReviews.createdAt)),
    db.select().from(missionReviewAppeals).where(and(eq(missionReviewAppeals.missionContractId, contract.id), eq(missionReviewAppeals.userId, userId))).orderBy(desc(missionReviewAppeals.createdAt)),
  ]);
  return { contract, evidence, reviews, appeals, planningDecision };
}

async function dependencyBundle(questId: number, userId: number) {
  const dependencies = await db.select().from(missionDependencies)
    .where(and(eq(missionDependencies.dependentQuestId, questId), eq(missionDependencies.userId, userId)))
    .orderBy(desc(missionDependencies.createdAt));
  if (!dependencies.length) return [];
  const prerequisiteIds = dependencies.map((dependency) => dependency.prerequisiteQuestId);
  const prerequisiteMissions = await db.select({ id: quests.id, title: quests.title, completed: quests.completed })
    .from(quests)
    .where(and(eq(quests.userId, userId), inArray(quests.id, prerequisiteIds)));
  const byId = new Map(prerequisiteMissions.map((mission) => [mission.id, mission]));
  return dependencies.flatMap((dependency) => {
    const mission = byId.get(dependency.prerequisiteQuestId);
    return mission ? [{ id: dependency.id, prerequisiteQuestId: mission.id, title: mission.title, completed: mission.completed, createdAt: dependency.createdAt }] : [];
  });
}

export function registerMissionContractRoutes(app: Express): void {
  app.get("/api/mission-review-appeals/assigned", isAuthenticated, async (req: Request, res: Response) => {
    const rows = await db.select({
      appeal: missionReviewAppeals,
      missionTitle: quests.title,
      ownerDisplayName: users.displayName,
      reviewSummary: missionReviews.summary,
      reviewRubric: missionReviews.rubric,
      reviewRubricVersion: missionReviews.rubricVersion,
      expectedOutput: missionContracts.expectedOutput,
      requiredEvidence: missionContracts.requiredEvidence,
      rubricDefinition: missionContracts.rubricDefinition,
      rubricVersion: missionContracts.rubricVersion,
    }).from(missionReviewAppeals)
      .innerJoin(missionReviews, eq(missionReviews.id, missionReviewAppeals.missionReviewId))
      .innerJoin(missionContracts, eq(missionContracts.id, missionReviewAppeals.missionContractId))
      .innerJoin(quests, eq(quests.id, missionContracts.questId))
      .innerJoin(users, eq(users.id, missionReviewAppeals.userId))
      .where(and(eq(missionReviewAppeals.reviewerUserId, req.session.userId!), eq(missionReviewAppeals.status, "open")))
      .orderBy(desc(missionReviewAppeals.createdAt));
    const contractIds = rows.map((row) => row.appeal.missionContractId);
    const evidence = contractIds.length ? await db.select({
      missionContractId: missionEvidence.missionContractId,
      id: missionEvidence.id,
      sourceType: missionEvidence.sourceType,
      sourceReference: missionEvidence.sourceReference,
      summary: missionEvidence.summary,
      confidence: missionEvidence.confidence,
      submittedAt: missionEvidence.submittedAt,
    }).from(missionEvidence).where(inArray(missionEvidence.missionContractId, contractIds)).orderBy(desc(missionEvidence.submittedAt)) : [];
    return res.json({
      appeals: rows.map((row) => ({
        ...row.appeal,
        missionTitle: row.missionTitle,
        ownerDisplayName: row.ownerDisplayName || "LyfeOS user",
        reviewSummary: row.reviewSummary,
        expectedOutput: row.expectedOutput,
        requiredEvidence: row.requiredEvidence,
        rubricDefinition: row.reviewRubric && typeof row.reviewRubric === "object" && !Array.isArray(row.reviewRubric) && Array.isArray((row.reviewRubric as Record<string, unknown>).definition)
          ? (row.reviewRubric as Record<string, unknown>).definition
          : row.rubricDefinition,
        rubricVersion: row.reviewRubricVersion,
        evidence: evidence.filter((item) => item.missionContractId === row.appeal.missionContractId),
      })),
    });
  });

  app.post("/api/mission-review-appeals/:appealId/resolve", isAuthenticated, async (req: Request, res: Response) => {
    const appealId = Number(req.params.appealId);
    if (!Number.isInteger(appealId)) return res.status(400).json({ error: "Invalid review appeal." });
    const parsed = appealResolutionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid appeal resolution.", details: parsed.error.flatten() });
    const [row] = await db.select({
      appeal: missionReviewAppeals,
      contract: missionContracts,
      questId: quests.id,
      challengedReviewRubric: missionReviews.rubric,
      challengedReviewRubricVersion: missionReviews.rubricVersion,
    }).from(missionReviewAppeals)
      .innerJoin(missionContracts, eq(missionContracts.id, missionReviewAppeals.missionContractId))
      .innerJoin(missionReviews, eq(missionReviews.id, missionReviewAppeals.missionReviewId))
      .innerJoin(quests, eq(quests.id, missionContracts.questId))
      .where(and(
        eq(missionReviewAppeals.id, appealId),
        eq(missionReviewAppeals.reviewerUserId, req.session.userId!),
        eq(missionReviewAppeals.status, "open"),
      )).limit(1);
    if (!row) return res.status(404).json({ error: "Open review appeal not found." });
    const challengedRubricDefinition = row.challengedReviewRubric && typeof row.challengedReviewRubric === "object" && !Array.isArray(row.challengedReviewRubric)
      && Array.isArray((row.challengedReviewRubric as Record<string, unknown>).definition)
      ? (row.challengedReviewRubric as Record<string, unknown>).definition
      : row.contract.rubricDefinition;
    if (parsed.data.decision === "reconsidered") {
      const validation = validateEvidenceChecks(
        row.contract.requiredEvidence,
        parsed.data.rubric.evidenceChecks,
        "meets_evidence",
        challengedRubricDefinition,
      );
      if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
    }
    const resolved = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(missionReviewAppeals).set({
        status: parsed.data.decision,
        resolutionSummary: parsed.data.summary,
        resolvedAt: new Date(),
      }).where(and(eq(missionReviewAppeals.id, appealId), eq(missionReviewAppeals.status, "open"))).returning();
      if (!claimed) return null;
      let resolutionReviewId: number | null = null;
      if (parsed.data.decision === "reconsidered") {
        const [resolutionReview] = await tx.insert(missionReviews).values({
          userId: row.appeal.userId,
          missionContractId: row.contract.id,
          reviewerType: "human",
          reviewerUserId: req.session.userId!,
          decision: "meets_evidence",
          rubric: { ...parsed.data.rubric, definition: challengedRubricDefinition },
          rubricVersion: row.challengedReviewRubricVersion,
          summary: `Appeal reconsidered: ${parsed.data.summary}`,
        }).returning({ id: missionReviews.id });
        resolutionReviewId = resolutionReview.id;
        await tx.update(missionContracts).set({ state: "reviewed", updatedAt: new Date() }).where(eq(missionContracts.id, row.contract.id));
      }
      return { appeal: claimed, resolutionReviewId };
    });
    if (!resolved) return res.status(409).json({ error: "This appeal was already resolved or withdrawn." });
    try {
      const progression = parsed.data.decision === "reconsidered"
        ? await applyReviewedMissionProgression({ questId: row.questId, userId: row.appeal.userId, reviewSummary: parsed.data.summary })
        : { applied: false, skillExperienceAwarded: 0 };
      return res.json({ appeal: resolved.appeal, progression });
    } catch (error) {
      // A reconsideration is not final unless its competence progression is
      // durable too. Restore the appeal and contract so the reviewer can retry
      // instead of leaving an accepted review with missing progression.
      if (parsed.data.decision === "reconsidered" && resolved.resolutionReviewId) {
        await db.transaction(async (tx) => {
          await tx.delete(missionReviews).where(eq(missionReviews.id, resolved.resolutionReviewId!));
          await tx.update(missionContracts).set({ state: "revisions_needed", updatedAt: new Date() })
            .where(eq(missionContracts.id, row.contract.id));
          await tx.update(missionReviewAppeals).set({
            status: "open",
            resolutionSummary: null,
            resolvedAt: null,
          }).where(and(eq(missionReviewAppeals.id, appealId), eq(missionReviewAppeals.status, "reconsidered")));
        });
      }
      throw error;
    }
  });

  app.get("/api/quests/:questId/contract", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    if (!await ownedQuest(questId, req.session.userId!)) return res.status(404).json({ error: "Mission not found." });
    return res.json(await contractBundle(questId, req.session.userId!));
  });

  app.get("/api/quests/:questId/dependencies", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    if (!await ownedQuest(questId, req.session.userId!)) return res.status(404).json({ error: "Mission not found." });
    return res.json({ dependencies: await dependencyBundle(questId, req.session.userId!) });
  });

  app.post("/api/quests/:questId/dependencies", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = dependencySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a valid prerequisite mission." });
    if (questId === parsed.data.prerequisiteQuestId) return res.status(400).json({ error: "A mission cannot depend on itself." });
    const userId = req.session.userId!;
    const [dependent, prerequisite] = await Promise.all([
      ownedQuest(questId, userId),
      ownedQuest(parsed.data.prerequisiteQuestId, userId),
    ]);
    if (!dependent || !prerequisite) return res.status(404).json({ error: "Mission not found." });
    if (dependent.completed) return res.status(409).json({ error: "Reopen this mission before changing its completion dependencies." });
    const existing = await db.select({ dependentQuestId: missionDependencies.dependentQuestId, prerequisiteQuestId: missionDependencies.prerequisiteQuestId })
      .from(missionDependencies)
      .where(eq(missionDependencies.userId, userId));
    if (wouldCreateMissionDependencyCycle(existing, questId, parsed.data.prerequisiteQuestId)) {
      return res.status(409).json({ error: "That prerequisite would create a mission dependency cycle." });
    }
    await db.insert(missionDependencies).values({
      userId,
      dependentQuestId: questId,
      prerequisiteQuestId: parsed.data.prerequisiteQuestId,
    }).onConflictDoNothing();
    return res.status(201).json({ dependencies: await dependencyBundle(questId, userId) });
  });

  app.delete("/api/quests/:questId/dependencies/:dependencyId", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    const dependencyId = Number(req.params.dependencyId);
    if (!Number.isInteger(questId) || !Number.isInteger(dependencyId)) return res.status(400).json({ error: "Invalid mission dependency." });
    const [removed] = await db.delete(missionDependencies).where(and(
      eq(missionDependencies.id, dependencyId),
      eq(missionDependencies.userId, req.session.userId!),
      eq(missionDependencies.dependentQuestId, questId),
    )).returning({ id: missionDependencies.id });
    if (!removed) return res.status(404).json({ error: "Mission dependency not found." });
    return res.status(204).send();
  });

  app.put("/api/quests/:questId/contract", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    if (!await ownedQuest(questId, req.session.userId!)) return res.status(404).json({ error: "Mission not found." });
    const parsed = contractSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid mission contract.", details: parsed.error.flatten() });
    const input = parsed.data;
    const [existing] = await db.select({
      progressionAppliedAt: missionContracts.progressionAppliedAt,
      rubricDefinition: missionContracts.rubricDefinition,
      rubricVersion: missionContracts.rubricVersion,
    })
      .from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!)))
      .limit(1);
    if (existing?.progressionAppliedAt) {
      return res.status(409).json({ error: "Reopen this reviewed mission before changing the contract that supports its recorded progression." });
    }
    const rubricDefinition = normalizeRubricDefinition(input.requiredEvidence, input.rubricDefinition);
    const rubricChanged = existing && JSON.stringify(existing.rubricDefinition) !== JSON.stringify(rubricDefinition);
    const rubricVersion = existing ? existing.rubricVersion + (rubricChanged ? 1 : 0) : 1;
    const [profile, stats, dailyLog] = await Promise.all([
      storage.getUserProfile(req.session.userId!),
      storage.getUserStats(req.session.userId!),
      storage.getUserDailyLogByDate(req.session.userId!, new Date()),
    ]);
    const acceptanceContextSnapshot = buildPlanningContextSnapshot({ profile, stats, dailyLog });
    const [contract] = await db.insert(missionContracts).values({
      userId: req.session.userId!, questId, ...input, rubricDefinition, rubricVersion, acceptanceContextSnapshot, escalationPath: input.escalationPath || null,
    }).onConflictDoUpdate({
      target: missionContracts.questId,
      set: { ...input, rubricDefinition, rubricVersion, acceptanceContextSnapshot, escalationPath: input.escalationPath || null, updatedAt: new Date() },
    }).returning();
    return res.json({ contract });
  });

  app.patch("/api/quests/:questId/contract/review-mode", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = reviewModeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose self review or authorized human review." });
    const quest = await ownedQuest(questId, req.session.userId!);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    if (quest.completed) return res.status(409).json({ error: "Reopen this mission before changing who must review its evidence." });
    const [contract] = await db.select().from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(404).json({ error: "Mission proof plan not found." });
    if (contract.progressionAppliedAt || contract.state === "reviewed") {
      return res.status(409).json({ error: "Reopen this reviewed mission before changing who must review its evidence." });
    }
    const [updated] = await db.transaction(async (tx) => {
      const [changed] = await tx.update(missionContracts).set({ reviewMode: parsed.data.reviewMode, updatedAt: new Date() })
        .where(eq(missionContracts.id, contract.id)).returning();
      if (parsed.data.reviewMode === "self") {
        await tx.update(missionReviewInvitations).set({ status: "revoked" }).where(and(
          eq(missionReviewInvitations.ownerUserId, req.session.userId!),
          eq(missionReviewInvitations.missionContractId, contract.id),
          inArray(missionReviewInvitations.status, ["pending", "accepted"]),
        ));
      }
      return [changed];
    });
    return res.json({ contract: updated });
  });

  app.post("/api/quests/:questId/evidence", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    if (!await ownedQuest(questId, req.session.userId!)) return res.status(404).json({ error: "Mission not found." });
    const parsed = evidenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid evidence.", details: parsed.error.flatten() });
    const [contract] = await db.select().from(missionContracts).where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(409).json({ error: "Create the mission contract before adding evidence." });
    const [evidence] = await db.insert(missionEvidence).values({ userId: req.session.userId!, missionContractId: contract.id, ...parsed.data, sourceReference: parsed.data.sourceReference || null }).returning();
    return res.status(201).json({ evidence });
  });

  app.post("/api/quests/:questId/reviews", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const quest = await ownedQuest(questId, req.session.userId!);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    if (!quest.completed) return res.status(409).json({ error: "Complete the mission before reviewing its evidence." });
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid review.", details: parsed.error.flatten() });
    const [contract] = await db.select().from(missionContracts).where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!))).limit(1);
    if (!contract) return res.status(409).json({ error: "Create the mission contract before reviewing it." });
    if (contract.reviewMode === "human") return res.status(409).json({ error: "This mission requires an authorized human reviewer; self-review is not sufficient." });
    const evidence = await db.select({ id: missionEvidence.id }).from(missionEvidence).where(and(eq(missionEvidence.missionContractId, contract.id), eq(missionEvidence.userId, req.session.userId!))).limit(1);
    if (!evidence.length) return res.status(409).json({ error: "Add evidence before reviewing this mission." });
    const validation = validateEvidenceChecks(contract.requiredEvidence, parsed.data.rubric.evidenceChecks, parsed.data.decision, contract.rubricDefinition);
    if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
    const [review] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(missionReviews).values({
        userId: req.session.userId!,
        missionContractId: contract.id,
        reviewerType: "self",
        ...parsed.data,
        rubric: { ...parsed.data.rubric, definition: contract.rubricDefinition },
        rubricVersion: contract.rubricVersion,
      }).returning();
      await tx.update(missionContracts).set({ state: parsed.data.decision === "meets_evidence" ? "reviewed" : "revisions_needed", updatedAt: new Date() }).where(eq(missionContracts.id, contract.id));
      return [created];
    });
    const progression = parsed.data.decision === "meets_evidence"
      ? await applyReviewedMissionProgression({ questId, userId: req.session.userId!, reviewSummary: parsed.data.summary })
      : await revokeReviewedMissionProgression({ questId, userId: req.session.userId!, reason: `Evidence review requested revisions: ${parsed.data.summary}` });
    return res.status(201).json({ review, progression });
  });

  app.post("/api/quests/:questId/review-appeals", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = appealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Explain what evidence or criterion should be reconsidered." });
    const userId = req.session.userId!;
    const [latest] = await db.select({
      review: missionReviews,
      contractId: missionContracts.id,
    }).from(missionReviews)
      .innerJoin(missionContracts, eq(missionContracts.id, missionReviews.missionContractId))
      .innerJoin(quests, eq(quests.id, missionContracts.questId))
      .where(and(
        eq(quests.id, questId),
        eq(quests.userId, userId),
        eq(missionReviews.userId, userId),
        eq(missionReviews.reviewerType, "human"),
        eq(missionReviews.decision, "revisions_needed"),
        eq(missionContracts.state, "revisions_needed"),
      )).orderBy(desc(missionReviews.createdAt)).limit(1);
    if (!latest?.review.reviewerUserId) return res.status(409).json({ error: "Only a revision decision from an authorized human reviewer can be appealed." });
    try {
      const [appeal] = await db.insert(missionReviewAppeals).values({
        userId,
        missionContractId: latest.contractId,
        missionReviewId: latest.review.id,
        reviewerUserId: latest.review.reviewerUserId,
        reason: parsed.data.reason,
      }).returning();
      return res.status(201).json({ appeal });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return res.status(409).json({ error: "An open appeal already exists for this review." });
      throw error;
    }
  });

  app.delete("/api/quests/:questId/review-appeals/:appealId", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    const appealId = Number(req.params.appealId);
    if (!Number.isInteger(questId) || !Number.isInteger(appealId)) return res.status(400).json({ error: "Invalid review appeal." });
    const [withdrawn] = await db.update(missionReviewAppeals).set({ status: "withdrawn", resolvedAt: new Date() })
      .where(and(
        eq(missionReviewAppeals.id, appealId),
        eq(missionReviewAppeals.userId, req.session.userId!),
        eq(missionReviewAppeals.status, "open"),
        inArray(missionReviewAppeals.missionContractId, db.select({ id: missionContracts.id }).from(missionContracts).where(and(
          eq(missionContracts.questId, questId),
          eq(missionContracts.userId, req.session.userId!),
        ))),
      )).returning({ id: missionReviewAppeals.id });
    if (!withdrawn) return res.status(404).json({ error: "Open review appeal not found." });
    return res.status(204).send();
  });
}
