import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../utils";
import { z } from "zod";
import { sendPushToUser } from "../notificationScheduler";
import { stripeService } from "../stripeService";
import { getStripePublishableKey } from "../stripeClient";
import { isAuthenticated, awardExperiencePoints, calculateLevelFromTotalXP } from "./middleware";
import { db } from "../db";
import { quests as questsTable } from "@shared/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import type { InsertVisionGoal, InsertSmartReminder } from "@shared/schema";

export function registerGoalRoutes(app: Express): void {
  // Push Notification routes (FCM)
  app.post("/api/push/subscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken || typeof fcmToken !== 'string') {
        return res.status(400).json({ error: "Invalid FCM token" });
      }
      
      const sub = await storage.savePushSubscription({
        userId: req.session.userId!,
        fcmToken,
      });
      
      return res.status(200).json({ success: true, id: sub.id });
    } catch (error) {
      logger.error("Error saving FCM token:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/push/subscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken) {
        return res.status(400).json({ error: "FCM token required" });
      }
      await storage.deletePushSubscription(fcmToken);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error removing FCM token:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await sendPushToUser(req.session.userId!, {
        title: "LYFEOS",
        body: "Push notifications are working! You'll receive mission reminders here.",
        tag: "test-notification",
        url: "/quests",
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error sending test push:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vision Goals CRUD
  app.get("/api/vision-goals/all", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const categories = ["legacy", "10year", "5year", "18month", "90day"];
      const allGoals = [];
      for (const cat of categories) {
        const goals = await storage.getVisionGoals(userId, cat);
        allGoals.push(...goals);
      }
      res.json(allGoals);
    } catch (error) {
      logger.error("Error fetching all vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/vision-goals/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ['legacy', '10year', '5year', '18month', '90day'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      res.json(goals);
    } catch (error) {
      logger.error("Error fetching vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/vision-goals", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category, title, description, rewardText, bonusXp } = req.body;
      const validCategories = ['legacy', '10year', '5year', '18month', '90day'];
      if (!validCategories.includes(category) || !title?.trim()) {
        return res.status(400).json({ error: "Category and title are required" });
      }
      const existing = await storage.getVisionGoals(userId, category);
      const maxOrder = existing.length > 0 ? Math.max(...existing.map(g => g.displayOrder)) : -1;
      const goal = await storage.createVisionGoal({
        userId,
        category,
        title: title.trim(),
        description: description?.trim() || null,
        rewardText: rewardText?.trim() || null,
        bonusXp: bonusXp ? parseInt(bonusXp) : 0,
        completed: false,
        displayOrder: maxOrder + 1,
      });
      res.json(goal);
    } catch (error) {
      logger.error("Error creating vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/vision-goals/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const existingGoal = await storage.getVisionGoalById(id, userId);
      if (!existingGoal) return res.status(404).json({ error: "Vision goal not found" });
      const wasCompleted = existingGoal.completed ?? false;

      const updateData: Partial<InsertVisionGoal> & { completedAt?: Date | null } = {};
      if (req.body.title !== undefined) updateData.title = req.body.title.trim();
      if (req.body.description !== undefined) updateData.description = req.body.description?.trim() || null;
      if (req.body.rewardText !== undefined) updateData.rewardText = req.body.rewardText?.trim() || null;
      if (req.body.bonusXp !== undefined) updateData.bonusXp = parseInt(req.body.bonusXp) || 0;
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.completed !== undefined) {
        updateData.completed = req.body.completed;
        updateData.completedAt = req.body.completed ? new Date() : null;
      }
      if (req.body.displayOrder !== undefined) updateData.displayOrder = req.body.displayOrder;
      const goal = await storage.updateVisionGoal(id, userId, updateData);
      if (!goal) return res.status(404).json({ error: "Vision goal not found" });
      storage.logActivityEvent(userId, 'goal_review', { goalId: id, title: goal.title }).catch(() => {});

      let xpAwarded = 0;
      let xpRemoved = 0;
      let disconnectedMissionIds: number[] = [];
      let reconnectedMissionIds: number[] = [];
      const isCompleting = req.body.completed === true && !wasCompleted;
      const isUncompleting = req.body.completed === false && wasCompleted;

      if (isCompleting) {
        const activeRitualMissions = await db.select({ id: questsTable.id })
          .from(questsTable)
          .where(and(
            eq(questsTable.visionGoalId, id),
            eq(questsTable.userId, userId),
            eq(questsTable.completed, false),
            eq(questsTable.isRitualized, true)
          ));
        disconnectedMissionIds = activeRitualMissions.map(m => m.id);
        logger.debug(`[Goal Complete] Disconnecting ${disconnectedMissionIds.length} ritual missions from goal ${id}:`, disconnectedMissionIds);
        if (disconnectedMissionIds.length > 0) {
          await db.update(questsTable)
            .set({ visionGoalId: null })
            .where(and(
              inArray(questsTable.id, disconnectedMissionIds),
              eq(questsTable.userId, userId)
            ));
          await storage.updateVisionGoal(id, userId, { disconnectedMissionIds });
        }

        let bonusXp = goal.bonusXp;
        if (bonusXp === 0) {
          try {
            const anthropic = new Anthropic({
              apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
              baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
            });
            const aiResponse = await anthropic.messages.create({
              model: "claude-haiku-4-5-20250514",
              max_tokens: 50,
              messages: [{
                role: "user",
                content: `Assign bonus XP for completing this mission objective in a gamified life system. Category: ${goal.category}. Title: "${goal.title}". Respond with ONLY a number from this list: 25, 50, 75, 100, 150, 200, 250, 500. Higher XP for more ambitious/difficult objectives.`
              }],
            });
            const parsed = parseInt((aiResponse.content[0] as any).text?.trim());
            if ([25, 50, 75, 100, 150, 200, 250, 500].includes(parsed)) {
              bonusXp = parsed;
            } else {
              bonusXp = 50;
            }
          } catch {
            bonusXp = 50;
          }
          await storage.updateVisionGoal(id, userId, { bonusXp });
          goal.bonusXp = bonusXp;
        }
        if (bonusXp > 0) {
          const xpResult = await awardExperiencePoints(userId, bonusXp);
          if (xpResult.success) {
            xpAwarded = bonusXp;
          }
        }
      }

      if (isUncompleting) {
        const storedIds = existingGoal.disconnectedMissionIds;
        if (storedIds && storedIds.length > 0) {
          const reconnectResult = await db.update(questsTable)
            .set({ visionGoalId: id })
            .where(and(
              inArray(questsTable.id, storedIds),
              eq(questsTable.userId, userId),
              eq(questsTable.completed, false),
              isNull(questsTable.visionGoalId)
            ))
            .returning();
          reconnectedMissionIds = reconnectResult.map(r => r.id);
          logger.debug(`[Goal Uncomplete] Reconnected ${reconnectedMissionIds.length} missions to goal ${id}:`, reconnectedMissionIds);
          await storage.updateVisionGoal(id, userId, { disconnectedMissionIds: null });
        }

        const bonusXp = existingGoal.bonusXp || 0;
        if (bonusXp > 0) {
          const profile = await storage.getUserProfile(userId);
          if (profile) {
            const oldTotalXP = profile.totalXP || 0;
            const newTotalXP = Math.max(0, oldTotalXP - bonusXp);
            await storage.updateUserProfile(userId, { totalXP: newTotalXP });
            const newLevelInfo = calculateLevelFromTotalXP(newTotalXP);
            await storage.updateUserStats(userId, {
              experienceCurrent: newLevelInfo.current,
              experienceMax: newLevelInfo.max,
              level: newLevelInfo.level,
            });
            xpRemoved = bonusXp;
          }
        }
      }

      if (isCompleting && xpAwarded > 0) {
        sendPushToUser(userId, {
          title: "Milestone Achieved!",
          body: `${goal.title} completed! +${xpAwarded} bonus XP${goal.rewardText ? ` — Reward: ${goal.rewardText}` : ""}`,
          tag: `goal-complete-${goal.id}`,
          url: "/goals-archive",
        }).catch(() => {});
      }

      const dbStats = await storage.getUserStats(userId);
      const userProfile = await storage.getUserProfile(userId);
      const profileTotalXP = userProfile?.totalXP || 0;
      const levelInfo = calculateLevelFromTotalXP(profileTotalXP);
      const updatedStats = dbStats ? {
        attentionTokens: {
          current: dbStats.attentionTokensCurrent,
          max: dbStats.attentionTokensMax,
        },
        timeTokens: {
          current: dbStats.timeTokensCurrent,
          max: dbStats.timeTokensMax,
        },
        energyPoints: {
          current: dbStats.energyPointsCurrent,
          max: dbStats.energyPointsMax,
        },
        healthPoints: {
          current: dbStats.healthPointsCurrent,
          max: dbStats.healthPointsMax,
        },
        experience: {
          current: levelInfo.current,
          max: levelInfo.max,
          level: levelInfo.level,
          totalXP: profileTotalXP,
          showLevelUp: false,
        },
        streakDays: dbStats.streakDays || 0,
        efficiencyScore: dbStats.efficiencyScore || 0,
        aiAssistantName: dbStats.aiAssistantName,
        notificationsEnabled: dbStats.notificationsEnabled,
        darkThemeEnabled: dbStats.darkThemeEnabled,
        autoSyncEnabled: dbStats.autoSyncEnabled,
        aiAssistantEnabled: dbStats.aiAssistantEnabled,
        primaryColor: dbStats.primaryColor,
      } : null;
      const allQuests = await storage.getQuests(userId);
      const remainingLinkedMissions = allQuests
        .filter(q => q.visionGoalId === id)
        .map(q => ({
          id: q.id,
          title: q.title,
          completed: q.completed,
          completedAt: q.completedAt,
          visionGoalId: q.visionGoalId,
          difficulty: q.difficulty || "D",
          experienceReward: q.experienceReward,
          energyCost: q.energyCost,
          timeCost: q.timeCost || 0,
          attentionCost: q.attentionCost || 0,
          category: q.category || "general",
          isRitualized: q.isRitualized || false,
          parentRitualId: q.parentRitualId || null,
        }));
      res.json({ ...goal, xpAwarded, xpRemoved, updatedStats, disconnectedMissionIds, remainingLinkedMissions });
    } catch (error) {
      logger.error("Error updating vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/vision-goals/reorder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== 'number')) {
        return res.status(400).json({ error: "ids must be an array of numbers" });
      }
      await storage.reorderVisionGoals(ids, userId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error reordering vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/vision-goals/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteVisionGoal(id, userId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/quests/completed-by-vision-goal/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ["legacy", "10year", "5year", "18month", "90day"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      const goalIds = goals.map(g => g.id);
      if (goalIds.length === 0) {
        return res.json([]);
      }
      const allQuests = await storage.getQuests(userId);
      const completedLinked = allQuests
        .filter(q => q.completed && q.visionGoalId && goalIds.includes(q.visionGoalId))
        .map(q => ({
          id: q.id,
          title: q.title,
          completedAt: q.completedAt,
          visionGoalId: q.visionGoalId,
          difficulty: q.difficulty || "D",
          experienceReward: q.experienceReward,
          energyCost: q.energyCost,
          timeCost: q.timeCost || 0,
          attentionCost: q.attentionCost || 0,
          category: q.category || "general",
        }));
      res.json(completedLinked);
    } catch (error) {
      logger.error("Error fetching completed missions by vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/quests/linked-by-vision-goal/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ["legacy", "10year", "5year", "18month", "90day"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      const goalIds = goals.map(g => g.id);
      if (goalIds.length === 0) {
        return res.json([]);
      }
      const allQuests = await storage.getQuests(userId);
      const linked = allQuests
        .filter(q => q.visionGoalId && goalIds.includes(q.visionGoalId))
        .map(q => ({
          id: q.id,
          title: q.title,
          completed: q.completed,
          completedAt: q.completedAt,
          visionGoalId: q.visionGoalId,
          difficulty: q.difficulty || "D",
          experienceReward: q.experienceReward,
          energyCost: q.energyCost,
          timeCost: q.timeCost || 0,
          attentionCost: q.attentionCost || 0,
          category: q.category || "general",
          isRitualized: q.isRitualized || false,
          parentRitualId: q.parentRitualId || null,
        }));
      res.json(linked);
    } catch (error) {
      logger.error("Error fetching linked missions by vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stripe payment routes
  app.get("/api/stripe/publishable-key", async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      logger.error("Error getting Stripe publishable key:", error);
      res.status(500).json({ error: "Failed to get Stripe configuration" });
    }
  });

  app.get("/api/stripe/products", async (_req: Request, res: Response) => {
    try {
      const rows = await stripeService.listProductsWithPrices();
      const productsMap = new Map<string, any>();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }
      res.json({ data: Array.from(productsMap.values()) });
    } catch (error) {
      logger.error("Error listing products:", error);
      res.status(500).json({ error: "Failed to list products" });
    }
  });

  app.get("/api/stripe/subscription", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) {
        return res.json({ subscription: null });
      }
      const subscription = await stripeService.getSubscription(user.stripeSubscriptionId);
      res.json({ subscription });
    } catch (error) {
      logger.error("Error getting subscription:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId is required" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        if (!user.email) return res.status(400).json({ error: "Email is required for checkout" });
        const customer = await stripeService.createCustomer(user.email, userId);
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/subscription?success=true`,
        `${baseUrl}/subscription?canceled=true`
      );

      res.json({ url: session.url });
    } catch (error) {
      logger.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No billing account found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/subscription`
      );

      res.json({ url: session.url });
    } catch (error) {
      logger.error("Error creating portal session:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // Smart Reminders API
  app.get("/api/smart-reminders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      let reminders = await storage.getSmartReminders(userId);
      if (reminders.length === 0) {
        reminders = await storage.initDefaultReminders(userId);
      }
      return res.json(reminders);
    } catch (error) {
      logger.error("Error fetching smart reminders:", error);
      return res.status(500).json({ error: "Failed to fetch smart reminders" });
    }
  });

  app.patch("/api/smart-reminders/:reminderType", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { reminderType } = req.params;
      const validTypes = ['missions', 'reflection', 'goal_review'];
      if (!validTypes.includes(reminderType)) {
        return res.status(400).json({ error: "Invalid reminder type" });
      }

      const updateData: Partial<InsertSmartReminder> = {};
      if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;
      if (req.body.preferredHour !== undefined) {
        const hour = parseInt(req.body.preferredHour);
        if (isNaN(hour) || hour < 0 || hour > 23) {
          return res.status(400).json({ error: "preferredHour must be 0-23" });
        }
        updateData.preferredHour = hour;
        updateData.source = 'manual';
      }
      if (req.body.preferredDays !== undefined) {
        const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const days = req.body.preferredDays;
        if (!Array.isArray(days) || !days.every((d: string) => validDays.includes(d))) {
          return res.status(400).json({ error: "Invalid preferredDays" });
        }
        updateData.preferredDays = days;
      }
      if (req.body.cooldownHours !== undefined) {
        const cd = parseInt(req.body.cooldownHours);
        if (isNaN(cd) || cd < 1 || cd > 168) {
          return res.status(400).json({ error: "cooldownHours must be 1-168" });
        }
        updateData.cooldownHours = cd;
      }
      if (req.body.source === 'learned') {
        updateData.source = 'learned';
      }

      const reminder = await storage.upsertSmartReminder(userId, reminderType, updateData);
      return res.json(reminder);
    } catch (error) {
      logger.error("Error updating smart reminder:", error);
      return res.status(500).json({ error: "Failed to update smart reminder" });
    }
  });

  app.get("/api/smart-reminders/activity-summary", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;

      const eventTypes = ['mission_complete', 'daily_log', 'goal_review', 'login'];
      const summary: Record<string, { count: number; peakHour: number | null }> = {};

      for (const eventType of eventTypes) {
        const events = await storage.getActivityEvents(userId, eventType, days);
        const hourCounts = new Array(24).fill(0);
        for (const event of events) {
          const hour = new Date(event.occurredAt).getHours();
          hourCounts[hour]++;
        }
        let peakHour: number | null = null;
        let peakCount = 0;
        for (let h = 0; h < 24; h++) {
          if (hourCounts[h] > peakCount) {
            peakCount = hourCounts[h];
            peakHour = h;
          }
        }
        summary[eventType] = { count: events.length, peakHour: events.length >= 3 ? peakHour : null };
      }

      return res.json(summary);
    } catch (error) {
      logger.error("Error fetching activity summary:", error);
      return res.status(500).json({ error: "Failed to fetch activity summary" });
    }
  });
}
