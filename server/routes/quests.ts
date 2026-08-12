import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, desc, and, gte, asc, sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { logger, formatLocalDate, classifyMission } from "../utils";
import { isAuthenticated, isOwner, calculateMissionCosts, awardExperiencePoints, calculateLevelFromTotalXP } from "./middleware";
import { insertQuestSchema, insertMissionViewSchema, Quest, userDailyLogs, quests as questsTable } from "@shared/schema";
import { sendPushToUser } from "../notificationScheduler";

declare module "express-session" {
  interface SessionData {
    userId: number;
    displayName: string;
  }
}

export function registerQuestRoutes(app: Express): void {
  // QUEST ROUTES
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
      
      // Auto-convert any unconverted todoIdeas from past days into quests
      try {
        const clientTz = req.query.tz as string || 'UTC';
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: clientTz }));
        const todayStr = formatLocalDate(nowInTz);
        
        const unconvertedLogs = await db.select()
          .from(userDailyLogs)
          .where(and(
            eq(userDailyLogs.userId, userId),
            eq(userDailyLogs.todosConverted, false)
          ));
        
        const existingQuests = await db.select({ title: questsTable.title })
          .from(questsTable)
          .where(eq(questsTable.userId, userId));
        const existingTitles = new Set(existingQuests.map(q => q.title.toLowerCase().trim()));
        
        for (const log of unconvertedLogs) {
          if (log.todoIdeas && log.date < todayStr) {
            const todoLines = log.todoIdeas
              .split('\n')
              .map((line: string) => line.trim())
              .filter((line: string) => line.length > 0);
            
            const [year, month, day] = log.date.split('-').map(Number);
            const nextDayMidnight = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
            
            let created = 0;
            for (const todoLine of todoLines) {
              if (!existingTitles.has(todoLine.toLowerCase().trim())) {
                await storage.createQuest({
                  userId,
                  title: todoLine,
                  description: `Auto-created from To-Do Ideas on ${log.date}`,
                  category: 'todo',
                  completed: false,
                  experienceReward: 50,
                  createdAt: nextDayMidnight
                });
                existingTitles.add(todoLine.toLowerCase().trim());
                created++;
              }
            }
            
            await db.update(userDailyLogs)
              .set({ todosConverted: true })
              .where(eq(userDailyLogs.id, log.id));
            
            logger.debug(`Auto-converted ${created}/${todoLines.length} todoIdeas from ${log.date} for user ${userId} (${todoLines.length - created} duplicates skipped)`);
          }
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
      
      // Ensure user can only create quests for their own account
      if (questData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create quests for this user" });
      }
      
      // For onboarding quests, check if one already exists to prevent duplicates
      if (questData.category === "onboarding" && questData.title) {
        const existingQuests = await storage.getQuests(questData.userId);
        const existingOnboardingQuest = existingQuests.find(
          (q: Quest) => q.title === questData.title && q.category === "onboarding"
        );
        if (existingOnboardingQuest) {
          if (processedBody.completed && !existingOnboardingQuest.completed) {
            const { attentionCost: oaCost, timeCost: otCost, energyCost: oeCost } = calculateMissionCosts(
              processedBody.startDate || existingOnboardingQuest.startDate || null,
              processedBody.startTime || existingOnboardingQuest.startTime || null,
              processedBody.endDate || existingOnboardingQuest.endDate || null,
              processedBody.endTime || existingOnboardingQuest.endTime || null
            );
            const updatedQuest = await storage.updateQuest(existingOnboardingQuest.id, {
              completed: true,
              completedAt: processedBody.completedAt || new Date(),
              experienceReward: processedBody.experienceReward ?? existingOnboardingQuest.experienceReward,
              difficulty: processedBody.difficulty ?? existingOnboardingQuest.difficulty,
              startDate: processedBody.startDate ?? existingOnboardingQuest.startDate,
              startTime: processedBody.startTime ?? existingOnboardingQuest.startTime,
              endDate: processedBody.endDate ?? existingOnboardingQuest.endDate,
              endTime: processedBody.endTime ?? existingOnboardingQuest.endTime,
              attentionCost: oaCost,
              timeCost: otCost,
              energyCost: oeCost,
            });
            logger.debug(`Updated existing onboarding quest to completed for user ${questData.userId}: ${questData.title} (costs: AT=${oaCost}, TT=${otCost}, EP=${oeCost})`);
            await syncOnboardingProfile(questData.userId, questData.title);
            return res.status(200).json({ quest: updatedQuest, duplicate: true });
          }
          logger.debug(`Onboarding quest already exists for user ${questData.userId}: ${questData.title}`);
          return res.status(200).json({ quest: existingOnboardingQuest, duplicate: true });
        }
      }
      
      // Auto-calculate attention, time, and energy costs based on duration
      const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
        questData.startDate || null,
        questData.startTime || null,
        questData.endDate || null,
        questData.endTime || null
      );
      
      const classification = await classifyMission(
        questData.title || "",
        questData.description,
        { category: questData.category || "general", difficulty: questData.difficulty || "D" }
      );
      
      const quest = await storage.createQuest({
        ...questData,
        category: classification.category,
        difficulty: classification.difficulty,
        attentionCost,
        timeCost,
        energyCost,
      });
      if (classification.category === "onboarding" && quest.completed && quest.title) {
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

  app.post("/api/quests/:questId/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      // Get the quest to check ownership
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      // Verify ownership
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to toggle this quest" });
      }
      
      // Toggle completion - this now handles all stat updates (XP, time, energy, attention)
      // Capture level before toggle for accurate level-up detection
      const preToggleStats = await storage.getUserStats(quest.userId);
      const previousLevel = preToggleStats?.level || 1;

      const { quest: updatedQuest, statsUpdated } = await storage.toggleQuestCompletion(questId);
      
      // Get updated user stats and recalculate XP to ensure consistency
      const userStats = await storage.getUserStats(quest.userId);
      const xpData = await storage.recalculateXP(quest.userId);
      const levelUp = updatedQuest.completed && xpData.level > previousLevel;
      
      if (updatedQuest.completed) {
        const xpGained = Math.floor(quest.experienceReward * ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[quest.difficulty || 'D'] || 1));
        sendPushToUser(quest.userId, {
          title: levelUp ? "Level Up!" : "Mission Complete!",
          body: levelUp
            ? `${quest.title} completed! +${xpGained} XP — You leveled up!`
            : `${quest.title} completed! +${xpGained} XP`,
          tag: `quest-complete-${quest.id}`,
          url: "/quests",
        }).catch(() => {});
        storage.logActivityEvent(quest.userId, 'mission_complete', { questId: quest.id, title: quest.title }).catch(() => {});
      }

      return res.status(200).json({ 
        quest: updatedQuest,
        xpAwarded: updatedQuest.completed ? Math.floor(quest.experienceReward * ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[quest.difficulty || 'D'] || 1)) : 0,
        levelUp: levelUp,
        statsUpdated: statsUpdated,
        stats: userStats ? {
          timeTokens: {
            current: userStats.timeTokensCurrent,
            max: userStats.timeTokensMax
          },
          attentionTokens: {
            current: userStats.attentionTokensCurrent,
            max: userStats.attentionTokensMax
          },
          energyPoints: {
            current: userStats.energyPointsCurrent,
            max: userStats.energyPointsMax
          },
          experience: {
            current: xpData.experienceCurrent,
            max: xpData.experienceMax,
            level: xpData.level,
            totalXP: xpData.totalXP,
            showLevelUp: levelUp
          }
        } : undefined
      });
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
      
      // Normalize empty strings to null for date/time fields
      const dateFields = ['startDate', 'startTime', 'endDate', 'endTime'] as const;
      for (const field of dateFields) {
        if (field in validatedData && validatedData[field] === '') {
          (validatedData as any)[field] = null;
        }
      }
      
      // Auto-calculate attention and time costs if dates/times are being updated
      const startDate = validatedData.startDate ?? quest.startDate;
      const startTime = validatedData.startTime ?? quest.startTime;
      const endDate = validatedData.endDate ?? quest.endDate;
      const endTime = validatedData.endTime ?? quest.endTime;
      
      const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
        startDate || null,
        startTime || null,
        endDate || null,
        endTime || null
      );
      
      const titleChanged = 'title' in validatedData && validatedData.title !== quest.title;
      const descChanged = 'description' in validatedData && validatedData.description !== quest.description;
      let reclassifiedCategory = validatedData.category;
      let reclassifiedDifficulty = validatedData.difficulty;

      if (titleChanged || descChanged) {
        const reclassification = await classifyMission(
          validatedData.title || quest.title || "",
          validatedData.description || quest.description,
          { category: validatedData.category || quest.category || "general", difficulty: validatedData.difficulty || quest.difficulty || "D" }
        );
        reclassifiedCategory = reclassification.category;
        reclassifiedDifficulty = reclassification.difficulty;
      }
      
      const updatedQuest = await storage.updateQuest(questId, {
        ...validatedData,
        ...(reclassifiedCategory ? { category: reclassifiedCategory } : {}),
        ...(reclassifiedDifficulty ? { difficulty: reclassifiedDifficulty } : {}),
        attentionCost,
        timeCost,
        energyCost,
      });
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
