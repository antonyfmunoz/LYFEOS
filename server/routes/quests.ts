import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, desc, and, gte, lte, asc, sql, inArray, isNotNull, isNull } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { logger, formatLocalDate, classifyMission } from "../utils";
import { isAuthenticated, isOwner, calculateMissionCosts } from "./middleware";
import { insertQuestSchema, insertMissionViewSchema, missionContracts, missionDeferrals, missionMutationReceipts, personalCapabilities, Quest, questSkillContributions, skillNodes, transformationThreadEvidence, transformationThreads, userDailyLogs, quests as questsTable } from "@shared/schema";
import { allocateSkillExperience, buildSkillGraph } from "../skill-graph";
import { missionExperience } from "@shared/progression";
import { createMissionLifecycleResult, deferMissionLifecycle, MissionLifecycleError, toggleMissionLifecycle, updateMissionLifecycle } from "../mission-lifecycle";
import { convertTodoIdeasToMissions } from "../todo-idea-conversion";
import { localMidnight } from "../todo-idea-parsing";
import { refreshProgressionState } from "../progression";
import { calendarDateDistance, isCalendarDate } from "@shared/calendar";
import { parseExpectedResourceRevision } from "../revision-concurrency";
import { missionMutationId, missionMutationPayloadHash } from "../mission-mutation-integrity";

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
  const calendarMissionPageSchema = z.object({
    from: z.string().refine(isCalendarDate),
    to: z.string().refine(isCalendarDate),
    limit: z.coerce.number().int().min(1).max(250).default(100),
    cursor: z.string().max(160).optional(),
    tz: z.string().trim().min(1).max(100).default("UTC"),
  }).refine((value) => {
    const days = calendarDateDistance(value.from, value.to);
    return days !== null && days <= 370;
  }, { message: "Calendar range must be ordered and no longer than 370 days." });

  const decodeCalendarCursor = (value: string | undefined): { startDate: string; id: number } | null => {
    if (!value) return null;
    try {
      const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (!decoded || !isCalendarDate(decoded.startDate) || !Number.isInteger(decoded.id) || decoded.id <= 0) return null;
      return { startDate: decoded.startDate, id: decoded.id };
    } catch {
      return null;
    }
  };

  const encodeCalendarCursor = (value: { startDate: string; id: number }): string =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  const mutationIdentity = (req: Request): { raw: string | undefined; id: string | null } => {
    const raw = req.header("x-lyfeos-mutation-id");
    return { raw, id: missionMutationId(raw) };
  };

  const findMutationReceipt = async (userId: number, mutationId: string) => {
    const [receipt] = await db.select().from(missionMutationReceipts)
      .where(and(eq(missionMutationReceipts.userId, userId), eq(missionMutationReceipts.mutationId, mutationId)))
      .limit(1);
    return receipt;
  };

  const recordMutationReceipt = async (input: { userId: number; mutationId: string; payloadHash: string; operation: string; questId: number; resultingRevision: number }) => {
    await db.insert(missionMutationReceipts).values(input).onConflictDoNothing();
  };

  const publicMission = (quest: Quest) => {
    const { lifecycleKey: _lifecycleKey, lifecyclePayloadHash: _lifecyclePayloadHash, ...publicFields } = quest;
    return publicFields;
  };

  const conflictMission = (quest: Quest | undefined) => quest ? {
    id: quest.id,
    title: quest.title,
    revision: quest.revision,
    startDate: quest.startDate,
    startTime: quest.startTime,
    endDate: quest.endDate,
    endTime: quest.endTime,
  } : undefined;

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
  app.get("/api/users/:userId/calendar-missions", isOwner, async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user ID." });
    const parsed = calendarMissionPageSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Choose a valid Calendar range." });
    const cursor = decodeCalendarCursor(parsed.data.cursor);
    if (parsed.data.cursor && !cursor) return res.status(400).json({ error: "Invalid Calendar cursor." });
    if (cursor && (cursor.startDate < parsed.data.from || cursor.startDate > parsed.data.to)) {
      return res.status(400).json({ error: "Calendar cursor is outside the requested range." });
    }
    try {
      if (!cursor) {
        try {
          const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: parsed.data.tz }));
          const todayStr = formatLocalDate(nowInTz);
          await convertTodoIdeasToMissions({
            userId,
            includeLog: (date) => date < todayStr,
            createdAtForLog: (date) => {
              const createdAt = localMidnight(date);
              createdAt.setDate(createdAt.getDate() + 1);
              return createdAt;
            },
          });
        } catch (todoError) {
          logger.error("Error auto-converting todoIdeas before Calendar read", { userId, error: todoError instanceof Error ? todoError.message : "unknown" });
        }
      }
      const conditions = [
        eq(questsTable.userId, userId),
        isNull(questsTable.deletedAt),
        isNotNull(questsTable.startDate),
        gte(questsTable.startDate, parsed.data.from),
        lte(questsTable.startDate, parsed.data.to),
      ];
      if (cursor) {
        conditions.push(sql`(${questsTable.startDate}, ${questsTable.id}) > (${cursor.startDate}, ${cursor.id})`);
      }
      const rows = await db.select().from(questsTable)
        .where(and(...conditions))
        .orderBy(asc(questsTable.startDate), asc(questsTable.id))
        .limit(parsed.data.limit + 1);
      const hasMore = rows.length > parsed.data.limit;
      const page = rows.slice(0, parsed.data.limit);
      const last = page.at(-1);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        quests: page.map(publicMission),
        range: { from: parsed.data.from, to: parsed.data.to },
        nextCursor: hasMore && last?.startDate ? encodeCalendarCursor({ startDate: last.startDate, id: last.id }) : null,
      });
    } catch (error) {
      logger.error("Could not load Calendar mission window", { userId, error: error instanceof Error ? error.message : "unknown" });
      return res.status(500).json({ error: "Could not load this Calendar range." });
    }
  });

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
      return res.json({ quest: publicMission(updatedQuest), deferredToDate: targetDate });
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
      return res.status(200).json({ quests: quests.map(publicMission) });
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
      const mutation = mutationIdentity(req);
      if (mutation.raw && !mutation.id) return res.status(400).json({ error: "Invalid mutation identity." });
      
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

      const mutationPayloadHash = mutation.id
        ? missionMutationPayloadHash({ operation: "create", quest: questData, skillNodeIds })
        : null;
      if (mutation.id && mutationPayloadHash) {
        const receipt = await findMutationReceipt(questData.userId, mutation.id);
        if (receipt) {
          if (receipt.payloadHash !== mutationPayloadHash || receipt.operation !== "create") {
            return res.status(409).json({ error: "This mutation identity was already used for a different mission change." });
          }
          const [existing] = receipt.questId === null ? [] : await db.select().from(questsTable)
            .where(and(eq(questsTable.id, receipt.questId), eq(questsTable.userId, questData.userId)))
            .limit(1);
          return existing
            ? res.status(200).json({ quest: publicMission(existing), replayed: true })
            : res.status(409).json({ error: "That queued mission was already processed but is no longer available." });
        }
        const lifecycleKey = `calendar:${mutation.id}`;
        const [existing] = await db.select().from(questsTable)
          .where(and(eq(questsTable.userId, questData.userId), eq(questsTable.lifecycleKey, lifecycleKey)))
          .limit(1);
        if (existing) {
          if (existing.lifecyclePayloadHash !== mutationPayloadHash) {
            return res.status(409).json({ error: "This mutation identity was already used for a different mission change." });
          }
          await recordMutationReceipt({ userId: questData.userId, mutationId: mutation.id, payloadHash: mutationPayloadHash, operation: "create", questId: existing.id, resultingRevision: existing.revision });
          return res.status(200).json({ quest: publicMission(existing), replayed: true });
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
            return res.status(200).json({ quest: publicMission(updatedQuest), duplicate: true });
          }
          logger.debug(`Onboarding quest already exists for user ${questData.userId}: ${questData.title}`);
          return res.status(200).json({ quest: publicMission(existingOnboardingQuest), duplicate: true });
        }
      }
      
      const creation = await createMissionLifecycleResult({
        ...questData,
        ...(mutation.id && mutationPayloadHash ? { lifecycleKey: `calendar:${mutation.id}`, lifecyclePayloadHash: mutationPayloadHash } : {}),
        source: questData.category === "onboarding" ? "onboarding" : "ui",
      });
      const quest = creation.quest;
      if (skillNodeIds.length > 0) {
        await assignSkillContributions({ userId: quest.userId, quest, skillNodeIds });
        await ensurePracticeContract(quest, skillNodeIds);
      }
      if (quest.category === "onboarding" && quest.completed && quest.title) {
        await syncOnboardingProfile(questData.userId, quest.title);
      }
      if (mutation.id && mutationPayloadHash) {
        await recordMutationReceipt({ userId: questData.userId, mutationId: mutation.id, payloadHash: mutationPayloadHash, operation: "create", questId: quest.id, resultingRevision: quest.revision });
      }
      return res.status(creation.replayed ? 200 : 201).json({ quest: publicMission(quest), replayed: creation.replayed });
    } catch (error) {
      logger.error("Quest creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof MissionLifecycleError) return res.status(error.status).json({ error: error.message });
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
      const result = await toggleMissionLifecycle({ questId, userId: req.session.userId!, source: "ui" });
      return res.status(200).json({ ...result, quest: publicMission(result.quest) });
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
      return res.status(200).json(archived.map(publicMission));
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
      return res.status(200).json(publicMission(restored));
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
    location: true,
    allDay: true,
    timezone: true,
    url: true,
    attendees: true,
    missionStatus: true,
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
      
      const mutation = mutationIdentity(req);
      if (mutation.raw && !mutation.id) return res.status(400).json({ error: "Invalid mutation identity." });
      const expectedRevision = parseExpectedResourceRevision(req.header("x-lyfeos-expected-revision"));
      if (!expectedRevision.ok && expectedRevision.reason === "invalid") {
        return res.status(400).json({ error: "Invalid mission revision." });
      }
      if (mutation.id && !expectedRevision.ok) {
        return res.status(428).json({ error: "Reload this mission before saving an offline-capable change." });
      }

      const validatedData = updateQuestSchema.parse(req.body);
      const mutationPayloadHash = mutation.id
        ? missionMutationPayloadHash({ operation: "update", questId, expectedRevision: expectedRevision.ok ? expectedRevision.revision : null, updates: validatedData })
        : null;
      if (mutation.id && mutationPayloadHash) {
        const receipt = await findMutationReceipt(req.session.userId!, mutation.id);
        if (receipt) {
          if (receipt.payloadHash !== mutationPayloadHash || receipt.operation !== "update") {
            return res.status(409).json({ error: "This mutation identity was already used for a different mission change." });
          }
          const [replayedQuest] = receipt.questId === null ? [] : await db.select().from(questsTable)
            .where(and(eq(questsTable.id, receipt.questId), eq(questsTable.userId, req.session.userId!)))
            .limit(1);
          if (replayedQuest && receipt.resultingRevision !== null && replayedQuest.revision !== receipt.resultingRevision) {
            res.setHeader("Cache-Control", "private, no-store");
            return res.status(409).json({
              error: "This queued edit was accepted earlier, but the mission changed again before confirmation reached this device. Review the current version.",
              currentQuest: conflictMission(replayedQuest),
            });
          }
          return replayedQuest
            ? res.status(200).json({ quest: publicMission(replayedQuest), replayed: true })
            : res.status(409).json({ error: "That queued mission change was already processed but is no longer available." });
        }
      }

      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this quest" });
      }
      
      const updatedQuest = await updateMissionLifecycle({
        questId,
        userId: quest.userId,
        updates: validatedData,
        source: "ui",
        ...(expectedRevision.ok ? { expectedRevision: expectedRevision.revision } : {}),
      });
      if (mutation.id && mutationPayloadHash) {
        await recordMutationReceipt({ userId: quest.userId, mutationId: mutation.id, payloadHash: mutationPayloadHash, operation: "update", questId: updatedQuest.id, resultingRevision: updatedQuest.revision });
      }
      return res.status(200).json({ quest: publicMission(updatedQuest), replayed: false });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid quest data", details: error.errors });
      }
      if (error instanceof MissionLifecycleError) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(error.status).json({ error: error.message, currentQuest: conflictMission(error.currentQuest) });
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
      return res.status(200).json({ quest: publicMission(updatedQuest) });
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
