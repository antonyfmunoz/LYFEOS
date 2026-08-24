import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, desc, and, gte, asc, sql, inArray, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { logger, formatLocalDate, classifyMission } from "../utils";
import { isAuthenticated, isOwner, calculateMissionCosts } from "./middleware";
import { insertQuestSchema, insertMissionViewSchema, missionContracts, missionDeferrals, personalCapabilities, Quest, questSkillContributions, skillNodes, transformationThreadEvidence, transformationThreads, userDailyLogs, quests as questsTable } from "@shared/schema";
import { allocateSkillExperience, buildSkillGraph } from "../skill-graph";
import { missionExperience } from "@shared/progression";
import { createMissionLifecycle, deferMissionLifecycle, MissionLifecycleError, toggleMissionLifecycle, updateMissionLifecycle } from "../mission-lifecycle";
import { convertTodoIdeasToMissions } from "../todo-idea-conversion";
import { localMidnight } from "../todo-idea-parsing";
import { refreshProgressionState } from "../progression";

declare module "express-session" {
  interface SessionData {
    userId: number;
    displayName: string;
  }
}

export function registerQuestRoutes(app: Express): void {
  const skillNodeIdsSchema = z.array(z.number().int().positive()).max(3);
  const deferMissionSchema = z.object({
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().trim().min(2).max(280).optional(),
  });

  const assignSkillContributions = async (input: {
    userId: number;
    quest: Pick<Quest, "id" | "experienceReward" | "difficulty" | "transformationThreadId" | "completed">;
    skillNodeIds: number[];
    validateOnly?: boolean;
  }): Promise<void> => {
    const skillNodeIds = Array.from(new Set(input.skillNodeIds));
    if (skillNodeIds.length === 0) return;
    if (!input.quest.transformationThreadId) {
      throw new Error("A mission must be linked to a Transformation Thread before it can count as skill practice.");
    }
    if (input.quest.completed) {
      throw new Error("Reopen this mission before changing its skill practice mapping.");
    }
    const [skills, completedSkillMissions, reviews] = await Promise.all([
      db.select({
        skill: skillNodes,
        recordedExperience: personalCapabilities.experience,
        recordedLevel: personalCapabilities.level,
      }).from(skillNodes)
        .leftJoin(personalCapabilities, and(
          eq(personalCapabilities.id, skillNodes.capabilityId),
          eq(personalCapabilities.userId, input.userId),
        ))
        .where(and(
          eq(skillNodes.userId, input.userId),
          eq(skillNodes.transformationThreadId, input.quest.transformationThreadId),
        )),
      db.select({ skillNodeId: questSkillContributions.skillNodeId })
        .from(questSkillContributions)
        .innerJoin(questsTable, eq(questSkillContributions.questId, questsTable.id))
        .innerJoin(missionContracts, and(eq(missionContracts.questId, questsTable.id), eq(missionContracts.userId, questsTable.userId)))
        .where(and(
          eq(questSkillContributions.userId, input.userId),
          eq(questsTable.transformationThreadId, input.quest.transformationThreadId),
          eq(questsTable.completed, true),
          isNotNull(missionContracts.progressionAppliedAt),
        )),
      db.select({ id: transformationThreadEvidence.id })
        .from(transformationThreadEvidence)
        .where(and(
          eq(transformationThreadEvidence.userId, input.userId),
          eq(transformationThreadEvidence.transformationThreadId, input.quest.transformationThreadId),
          eq(transformationThreadEvidence.sourceType, "weekly_review"),
        )),
    ]);
    const skillsWithHistory = skills.map(({ skill, recordedExperience, recordedLevel }) => ({
      ...skill,
      recordedExperience,
      recordedLevel,
    }));
    const ownedSkills = new Map(skillsWithHistory.map((skill) => [skill.id, skill]));
    if (skillNodeIds.some((id) => !ownedSkills.has(id))) {
      throw new Error("A selected skill does not belong to this Transformation Thread.");
    }
    const completedMissionCountBySkill = new Map<number, number>();
    for (const item of completedSkillMissions) {
      completedMissionCountBySkill.set(item.skillNodeId, (completedMissionCountBySkill.get(item.skillNodeId) || 0) + 1);
    }
    const graph = buildSkillGraph({ skills: skillsWithHistory, completedMissionCountBySkill, reviewCount: reviews.length });
    const unavailable = graph.find((skill) => skillNodeIds.includes(skill.id) && skill.status === "locked");
    if (unavailable) {
      throw new Error(`${unavailable.name} is still locked: ${unavailable.unmetRequirements.join("; ")}`);
    }
    const contributions = allocateSkillExperience(
      missionExperience(input.quest.experienceReward, input.quest.difficulty),
      skillNodeIds,
    );
    if (input.validateOnly) return;
    await db.transaction(async (tx) => {
      await tx.delete(questSkillContributions).where(and(
        eq(questSkillContributions.questId, input.quest.id),
        eq(questSkillContributions.userId, input.userId),
      ));
      await tx.insert(questSkillContributions).values(contributions.map(({ skillNodeId, experienceAmount }) => ({
        userId: input.userId,
        questId: input.quest.id,
        skillNodeId,
        experienceAmount,
      })));
    });
  };

  const ensurePracticeContract = async (quest: Pick<Quest, "id" | "userId" | "title" | "planningContextSnapshot">, skillNodeIds: number[]) => {
    const selectedSkills = await db.select({ name: skillNodes.name })
      .from(skillNodes)
      .where(and(eq(skillNodes.userId, quest.userId), inArray(skillNodes.id, skillNodeIds)));
    await db.insert(missionContracts).values({
      userId: quest.userId,
      questId: quest.id,
      purpose: `Practice ${selectedSkills.map((skill) => skill.name).join(", ")}.`,
      expectedOutput: `Record what happened while completing ${quest.title}.`,
      capabilityTargets: selectedSkills.map((skill) => skill.name),
      prerequisites: [],
      requiredEvidence: ["A short observation or artifact showing what happened."],
      rubricDefinition: [{ id: "criterion-1", requirement: "A short observation or artifact showing what happened.", guidance: "Compare the submitted observation or artifact with the mission's expected output.", weight: 1, required: true }],
      rubricVersion: 1,
      acceptanceContextSnapshot: quest.planningContextSnapshot,
      reviewMode: "self",
      riskLevel: "low",
      stopConditions: [],
      state: "accepted",
    }).onConflictDoNothing();
  };

  // QUEST ROUTES
  app.post("/api/quests/:questId/defer", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = deferMissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid future deferral date or short reason." });
    const userId = req.session.userId!;
    const today = new Date().toISOString().slice(0, 10);
    const defaultTarget = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const targetDate = parsed.data.targetDate || defaultTarget;
    if (targetDate <= today) return res.status(400).json({ error: "Choose a date after today for a deferral." });
    try {
      const updatedQuest = await deferMissionLifecycle({
        questId,
        userId,
        deferredToDate: targetDate,
        reason: parsed.data.reason || null,
      });
      return res.json({ quest: updatedQuest, deferredToDate: targetDate });
    } catch (error) {
      if (error instanceof MissionLifecycleError) return res.status(error.status).json({ error: error.message });
      logger.error("Could not defer mission:", error);
      return res.status(500).json({ error: "Could not defer this mission." });
    }
  });

  app.get("/api/quests/:questId/deferrals", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const userId = req.session.userId!;
    const [quest] = await db.select({ id: questsTable.id })
      .from(questsTable)
      .where(and(eq(questsTable.id, questId), eq(questsTable.userId, userId)))
      .limit(1);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    const deferrals = await db.select({
      id: missionDeferrals.id,
      previousDueDate: missionDeferrals.previousDueDate,
      deferredToDate: missionDeferrals.deferredToDate,
      reason: missionDeferrals.reason,
      createdAt: missionDeferrals.createdAt,
    }).from(missionDeferrals)
      .where(and(eq(missionDeferrals.questId, questId), eq(missionDeferrals.userId, userId)))
      .orderBy(desc(missionDeferrals.createdAt));
    return res.json({ deferrals });
  });

  app.get("/api/users/:userId/quests", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Purge terminated missions older than 24 hours on app load
      try {
        await storage.purgeExpiredArchivedQuests();
      } catch (purgeError) {
        logger.error("Error purging expired archived quests:", purgeError);
      }
      
      // Recover any idea capture not converted on the day after it was recorded.
      try {
        const clientTz = req.query.tz as string || 'UTC';
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: clientTz }));
        const todayStr = formatLocalDate(nowInTz);
        const result = await convertTodoIdeasToMissions({
          userId,
          includeLog: (date) => date < todayStr,
          createdAtForLog: (date) => {
            const createdAt = localMidnight(date);
            createdAt.setDate(createdAt.getDate() + 1);
            return createdAt;
          },
        });
        if (result.logsProcessed > 0) {
          logger.debug(`Auto-converted ${result.created} todoIdeas across ${result.logsProcessed} daily logs for user ${userId} (${result.duplicatesSkipped} duplicates skipped)`);
        }
      } catch (todoError) {
        logger.error("Error auto-converting todoIdeas:", todoError);
      }
      
      const quests = await storage.getQuests(userId);
      return res.status(200).json({ quests });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const ONBOARDING_TITLE_TO_ID: Record<string, number> = {
    "Onboarding: Access & Quickstart": 0,
    "Onboarding: Archetype Calibration": 1,
    "Onboarding: Identity & Direction": 2,
    "Onboarding: Craft & Mastery": 3,
    "Onboarding: Capacity & Constraints": 4,
    "Onboarding: Baselines & States": 5,
    "Onboarding: History & Roots": 6,
    "Onboarding: Systems & Rituals": 7,
  };

  async function syncOnboardingProfile(userId: number, questTitle: string) {
    try {
      const missionId = ONBOARDING_TITLE_TO_ID[questTitle];
      if (missionId === undefined) return;
      const profile = await storage.getUserProfile(userId);
      const existing: number[] = profile?.completedOnboardingMissions || [];
      if (!existing.includes(missionId)) {
        await storage.upsertUserProfile(userId, {
          completedOnboardingMissions: [...existing, missionId],
        });
        logger.debug(`Synced profile: added mission ${missionId} to completedOnboardingMissions for user ${userId}`);
      }
    } catch (err) {
      logger.error("Failed to sync onboarding profile:", err);
    }
  }

  app.post("/api/quests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Pre-process the request body to convert date strings to Date objects
      const processedBody = { ...req.body };
      if (processedBody.completedAt && typeof processedBody.completedAt === 'string') {
        processedBody.completedAt = new Date(processedBody.completedAt);
      }
      
      const questData = insertQuestSchema.parse(processedBody);
      const parsedSkillNodeIds = skillNodeIdsSchema.safeParse(processedBody.skillNodeIds ?? []);
      if (!parsedSkillNodeIds.success) {
        return res.status(400).json({ error: "Choose up to three skills for a mission." });
      }
      const skillNodeIds = Array.from(new Set(parsedSkillNodeIds.data));
      
      // Ensure user can only create quests for their own account
      if (questData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create quests for this user" });
      }
      if (questData.transformationThreadId) {
        const [thread] = await db
          .select({ id: transformationThreads.id })
          .from(transformationThreads)
          .where(and(
            eq(transformationThreads.id, questData.transformationThreadId),
            eq(transformationThreads.userId, questData.userId),
          ))
          .limit(1);
        if (!thread) {
          return res.status(403).json({ error: "Not authorized to link this transformation thread" });
        }
      }
      if (skillNodeIds.length > 0) {
        if (!questData.transformationThreadId) {
          return res.status(400).json({ error: "Link a mission to your active Thread before selecting skills." });
        }
        try {
          await assignSkillContributions({
            userId: questData.userId,
            quest: {
              id: 0,
              experienceReward: questData.experienceReward ?? 10,
              difficulty: questData.difficulty ?? "D",
              transformationThreadId: questData.transformationThreadId,
              completed: false,
            },
            skillNodeIds,
            validateOnly: true,
          });
        } catch (error) {
          return res.status(409).json({ error: error instanceof Error ? error.message : "Those skills cannot receive practice evidence yet." });
        }
      }
      
      // For onboarding quests, check if one already exists to prevent duplicates
      if (questData.category === "onboarding" && questData.title) {
        const existingQuests = await storage.getQuests(questData.userId);
        const existingOnboardingQuest = existingQuests.find(
          (q: Quest) => q.title === questData.title && q.category === "onboarding"
        );
        if (existingOnboardingQuest) {
          if (processedBody.completed && !existingOnboardingQuest.completed) {
            await updateMissionLifecycle({
              questId: existingOnboardingQuest.id,
              userId: questData.userId,
              source: "onboarding",
              updates: {
              completed: false,
              completedAt: null,
              experienceReward: processedBody.experienceReward ?? existingOnboardingQuest.experienceReward,
              difficulty: processedBody.difficulty ?? existingOnboardingQuest.difficulty,
              startDate: processedBody.startDate ?? existingOnboardingQuest.startDate,
              startTime: processedBody.startTime ?? existingOnboardingQuest.startTime,
              endDate: processedBody.endDate ?? existingOnboardingQuest.endDate,
              endTime: processedBody.endTime ?? existingOnboardingQuest.endTime,
              },
            });
            const updatedQuest = (await toggleMissionLifecycle({ questId: existingOnboardingQuest.id, userId: questData.userId, source: "onboarding" })).quest;
            logger.debug(`Updated existing onboarding quest to completed for user ${questData.userId}: ${questData.title}`);
            await syncOnboardingProfile(questData.userId, questData.title);
            return res.status(200).json({ quest: updatedQuest, duplicate: true });
          }
          logger.debug(`Onboarding quest already exists for user ${questData.userId}: ${questData.title}`);
          return res.status(200).json({ quest: existingOnboardingQuest, duplicate: true });
        }
      }
      
      const quest = await createMissionLifecycle({
        ...questData,
        source: "ui",
      });
      if (skillNodeIds.length > 0) {
        await assignSkillContributions({ userId: quest.userId, quest, skillNodeIds });
        await ensurePracticeContract(quest, skillNodeIds);
      }
      if (quest.category === "onboarding" && quest.completed && quest.title) {
        await syncOnboardingProfile(questData.userId, quest.title);
      }
      return res.status(201).json({ quest });
    } catch (error) {
      logger.error("Quest creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Recalculate costs for all quests for a user (useful for updating existing data)
  app.post("/api/quests/recalculate-costs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const quests = await storage.getQuests(userId);
      
      let updatedCount = 0;
      for (const quest of quests) {
        const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
          quest.startDate || null,
          quest.startTime || null,
          quest.endDate || null,
          quest.endTime || null
        );
        
        await storage.updateQuest(quest.id, {
          attentionCost,
          timeCost,
          energyCost,
        });
        updatedCount++;
      }
      
      return res.status(200).json({ message: `Recalculated costs for ${updatedCount} quests` });
    } catch (error) {
      logger.error("Error recalculating quest costs:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mapping is editable before a mission is completed. Once complete, the
  // append-only skill ledger is the explanation for its recorded progress.
  app.put("/api/quests/:questId/skill-contributions", isAuthenticated, async (req: Request, res: Response) => {
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId)) return res.status(400).json({ error: "Invalid mission." });
    const parsed = skillNodeIdsSchema.safeParse(req.body?.skillNodeIds);
    if (!parsed.success || parsed.data.length === 0) {
      return res.status(400).json({ error: "Choose one to three skills for this mission." });
    }
    const quest = await storage.getQuest(questId);
    if (!quest) return res.status(404).json({ error: "Mission not found." });
    if (quest.userId !== req.session.userId) return res.status(403).json({ error: "Not authorized to map this mission." });
    try {
      await assignSkillContributions({
        userId: quest.userId,
        quest,
        skillNodeIds: Array.from(new Set(parsed.data)),
      });
      await ensurePracticeContract(quest, Array.from(new Set(parsed.data)));
      return res.json({ success: true });
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : "Could not map this mission." });
    }
  });

  app.post("/api/quests/:questId/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      return res.status(200).json(await toggleMissionLifecycle({ questId, userId: req.session.userId!, source: "ui" }));
    } catch (error) {
      logger.error("Error toggling quest completion:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/quests/:questId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this quest" });
      }
      
      await storage.deleteQuest(questId);
      await refreshProgressionState(quest.userId, "mission_archived");
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Archived missions (soft-deleted within last 24 hours)
  app.get("/api/quests/archived", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      await storage.purgeExpiredArchivedQuests();
      const archived = await storage.getArchivedQuests(userId);
      return res.status(200).json(archived);
    } catch (error) {
      logger.error("Error fetching archived quests:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/quests/:questId/restore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const restored = await storage.restoreQuest(questId);
      await refreshProgressionState(quest.userId, "mission_restored");
      return res.status(200).json(restored);
    } catch (error) {
      logger.error("Error restoring quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update quest (PATCH)
  const updateQuestSchema = insertQuestSchema.pick({
    title: true,
    description: true,
    category: true,
    difficulty: true,
    energyCost: true,
    experienceReward: true,
    startDate: true,
    startTime: true,
    endDate: true,
    endTime: true,
    dueDate: true,
    notificationEnabled: true,
    notificationTime: true,
    notifications: true,
    isRitualized: true,
    ritualGroup: true,
    repeatFrequency: true,
    repeatInterval: true,
    repeatDays: true,
    repeatEndDate: true,
    visionGoalId: true,
    linkedItems: true,
  }).partial();

  app.patch("/api/quests/reorder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      const userId = req.session.userId!;
      for (let i = 0; i < orderedIds.length; i++) {
        const questId = orderedIds[i];
        const quest = await storage.getQuest(questId);
        if (quest && quest.userId === userId) {
          await storage.updateQuest(questId, { sortOrder: i });
        }
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error reordering quests:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/quests/:questId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this quest" });
      }
      
      const validatedData = updateQuestSchema.parse(req.body);
      
      const updatedQuest = await updateMissionLifecycle({ questId, userId: quest.userId, updates: validatedData, source: "ui" });
      return res.status(200).json({ quest: updatedQuest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid quest data", details: error.errors });
      }
      logger.error("Error updating quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/quests/:questId/view-column", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const { viewId, viewColumn } = req.body;
      const updatedQuest = await storage.updateQuest(questId, {
        viewId: viewId ?? null,
        viewColumn: viewColumn ?? null,
      });
      return res.status(200).json({ quest: updatedQuest });
    } catch (error) {
      logger.error("Error updating quest view-column:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/mission-views", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const views = await storage.getMissionViews(userId);
      return res.status(200).json(views);
    } catch (error) {
      logger.error("Error fetching mission views:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/mission-views", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const viewData = insertMissionViewSchema.parse({ ...req.body, userId });
      const view = await storage.createMissionView(viewData);
      return res.status(201).json(view);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Error creating mission view:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/mission-views/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid view ID" });
      }
      const view = await storage.getMissionView(id);
      if (!view) {
        return res.status(404).json({ error: "View not found" });
      }
      if (view.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const updated = await storage.updateMissionView(id, req.body);
      return res.status(200).json(updated);
    } catch (error) {
      logger.error("Error updating mission view:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/mission-views/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid view ID" });
      }
      const view = await storage.getMissionView(id);
      if (!view) {
        return res.status(404).json({ error: "View not found" });
      }
      if (view.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      await storage.deleteMissionView(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting mission view:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

}
