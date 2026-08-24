import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { missionContracts, missionDependencies, missionEvidence, missionReviewInvitations, missionReviews, quests } from "@shared/schema";
import { isAuthenticated } from "./middleware";
import { applyReviewedMissionProgression, revokeReviewedMissionProgression } from "../mission-lifecycle";
import { wouldCreateMissionDependencyCycle } from "../mission-dependencies";
import { validateEvidenceChecks } from "../mission-review-authorization";

const textList = z.array(z.string().trim().min(1).max(280)).max(8);
const contractSchema = z.object({
  purpose: z.string().trim().min(3).max(800),
  expectedOutput: z.string().trim().min(3).max(1200),
  capabilityTargets: textList.default([]),
  prerequisites: textList.default([]),
  requiredEvidence: textList.default([]),
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
      requirement: z.string().trim().min(1).max(280),
      met: z.boolean(),
    })).max(8).default([]),
  }).default({ evidenceChecks: [] }),
  summary: z.string().trim().min(3).max(2000),
});
const dependencySchema = z.object({
  prerequisiteQuestId: z.number().int().positive(),
});
const reviewModeSchema = z.object({ reviewMode: z.enum(["self", "human"]) });

async function ownedQuest(questId: number, userId: number) {
  const [quest] = await db.select({ id: quests.id, completed: quests.completed })
    .from(quests).where(and(eq(quests.id, questId), eq(quests.userId, userId))).limit(1);
  return quest;
}

async function contractBundle(questId: number, userId: number) {
  const [contract] = await db.select().from(missionContracts)
    .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, userId))).limit(1);
  if (!contract) return { contract: null, evidence: [], reviews: [] };
  const [evidence, reviews] = await Promise.all([
    db.select().from(missionEvidence).where(and(eq(missionEvidence.missionContractId, contract.id), eq(missionEvidence.userId, userId))).orderBy(desc(missionEvidence.submittedAt)),
    db.select().from(missionReviews).where(and(eq(missionReviews.missionContractId, contract.id), eq(missionReviews.userId, userId))).orderBy(desc(missionReviews.createdAt)),
  ]);
  return { contract, evidence, reviews };
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
    const [existing] = await db.select({ progressionAppliedAt: missionContracts.progressionAppliedAt })
      .from(missionContracts)
      .where(and(eq(missionContracts.questId, questId), eq(missionContracts.userId, req.session.userId!)))
      .limit(1);
    if (existing?.progressionAppliedAt) {
      return res.status(409).json({ error: "Reopen this reviewed mission before changing the contract that supports its recorded progression." });
    }
    const [contract] = await db.insert(missionContracts).values({
      userId: req.session.userId!, questId, ...input, escalationPath: input.escalationPath || null,
    }).onConflictDoUpdate({
      target: missionContracts.questId,
      set: { ...input, escalationPath: input.escalationPath || null, updatedAt: new Date() },
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
    const validation = validateEvidenceChecks(contract.requiredEvidence, parsed.data.rubric.evidenceChecks, parsed.data.decision);
    if (!validation.ok) return res.status(validation.status).json({ error: validation.error });
    const [review] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(missionReviews).values({ userId: req.session.userId!, missionContractId: contract.id, reviewerType: "self", ...parsed.data }).returning();
      await tx.update(missionContracts).set({ state: parsed.data.decision === "meets_evidence" ? "reviewed" : "revisions_needed", updatedAt: new Date() }).where(eq(missionContracts.id, contract.id));
      return [created];
    });
    const progression = parsed.data.decision === "meets_evidence"
      ? await applyReviewedMissionProgression({ questId, userId: req.session.userId!, reviewSummary: parsed.data.summary })
      : await revokeReviewedMissionProgression({ questId, userId: req.session.userId!, reason: `Evidence review requested revisions: ${parsed.data.summary}` });
    return res.status(201).json({ review, progression });
  });
}
