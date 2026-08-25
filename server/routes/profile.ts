import type { Express, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import Anthropic from "@anthropic-ai/sdk";
import { clerkClient } from "@clerk/express";
import { storage } from "../storage";
import { sanitizeIntegrationSettingsForExport } from "../google-calendar-sync";
import { db } from "../db";
import { logger, formatLocalDate } from "../utils";
import { assessObservedPatternQuality } from "../insight-quality";
import { isAuthenticated, isOwner, calculateLevelFromTotalXP, calculateTotalXPForLevel } from "./middleware";
import { InsertUser, InsertUserProfile, InsertUserStats, userDailyLogs, quests as questsTable, userStats, users } from "@shared/schema";
import { eq, desc, and, gte, asc, sql } from "drizzle-orm";
import { recordTransformationThreadEvidence } from "../transformation-thread-evidence";
import { queueCoordinationContext } from "../cross-product";
import { convertTodoIdeasToMissions } from "../todo-idea-conversion";
import { localMidnight } from "../todo-idea-parsing";
import { sleepDurationMinutes } from "../health-fitness";
import { missionExperience } from "@shared/progression";

const accountExportTables = [
  "user_stats", "user_profile", "user_daily_logs", "user_integrations", "quests", "ai_messages",
  "calendar_events", "mission_pages", "contacts", "personal_relationships", "relationship_interactions", "relationship_assessments", "relationship_commitments", "relationship_governance_consents", "relationship_ai_recommendations", "relationship_governance_audit", "spreadsheet_revisions", "spreadsheets", "canvas_revisions", "canvases", "graphs", "workspace_databases", "workspace_database_revisions", "workspace_database_rows", "workspace_database_row_revisions", "workspace_forms", "workspace_table_views", "workflow_automations", "workflow_automation_runs", "folders",
  "documents", "templates", "integrations", "progress_trackers", "kanban_boards", "project_events", "media_albums",
  "media_items", "conversations", "dismissed_knowledge", "vision_goals", "user_categories", "ritual_groups",
  "widget_states", "user_activity_events", "smart_reminders", "mission_views", "push_subscriptions", "ai_pending_actions", "ai_action_records", "ai_action_repairs", "ai_context_receipts", "ai_memory_policies", "ai_persona_profiles",
  "transformation_threads", "transformation_thread_evidence", "personal_capabilities", "skill_nodes", "skill_edges", "quest_skill_contributions", "skill_progression_events", "activity_progression_events", "progression_badge_awards", "progression_badge_events", "mission_contracts", "mission_evidence", "mission_reviews", "mission_review_appeals", "mission_deferrals", "mission_dependencies", "cross_product_sharing_preferences", "cross_product_work_links", "health_profiles", "health_targets", "health_target_revisions", "body_measurements", "health_observation_calculation_preferences", "health_observations", "health_metric_definitions", "health_metric_panels", "hydration_entries", "supplement_entries", "supplement_schedules", "supplement_schedule_events", "fasting_windows", "recovery_activities", "recovery_routines", "recovery_tag_policies", "sleep_naps", "sleep_sessions", "nutrition_foods", "nutrition_food_portions", "nutrition_diary_entries", "nutrition_recipes", "nutrition_recipe_revisions", "nutrition_meal_plans", "nutrition_meal_plan_entries", "health_deletion_receipts", "health_data_rights_audit", "health_planning_drafts", "health_planning_draft_events", "health_ai_requests", "health_ai_drafts", "health_practice_reviews", "health_progression_events", "health_badge_events", "ingredient_scans", "ingredient_scan_items", "ingredient_preference_rules", "exercise_definitions", "workout_programs", "workout_program_sessions", "workouts", "workout_revisions", "workout_templates", "workout_template_revisions", "heart_rate_zone_profiles", "workout_heart_rate_samples",
] as const;

const identifier = (name: string) => sql.identifier(name);

async function selectAccountRows(table: string, userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`SELECT * FROM ${identifier(table)} WHERE "user_id" = ${userId}`);
  return (result as { rows?: unknown[] }).rows || [];
}

async function selectNutritionNutrientRows(userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`
    SELECT "nutrition_food_nutrients".* FROM "nutrition_food_nutrients"
    INNER JOIN "nutrition_foods" ON "nutrition_foods"."id" = "nutrition_food_nutrients"."food_id"
    WHERE "nutrition_foods"."user_id" = ${userId}
  `);
  return (result as { rows?: unknown[] }).rows || [];
}

async function selectNutritionRecipeIngredientRows(userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`
    SELECT "nutrition_recipe_ingredients".* FROM "nutrition_recipe_ingredients"
    INNER JOIN "nutrition_recipes" ON "nutrition_recipes"."id" = "nutrition_recipe_ingredients"."recipe_id"
    WHERE "nutrition_recipes"."user_id" = ${userId}
  `);
  return (result as { rows?: unknown[] }).rows || [];
}

async function selectWorkoutExerciseRows(userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`
    SELECT "workout_exercises".* FROM "workout_exercises"
    INNER JOIN "workouts" ON "workouts"."id" = "workout_exercises"."workout_id"
    WHERE "workouts"."user_id" = ${userId}
  `);
  return (result as { rows?: unknown[] }).rows || [];
}

async function selectWorkoutSetRows(userId: number): Promise<unknown[]> {
  const result = await db.execute(sql`
    SELECT "workout_sets".* FROM "workout_sets"
    INNER JOIN "workout_exercises" ON "workout_exercises"."id" = "workout_sets"."workout_exercise_id"
    INNER JOIN "workouts" ON "workouts"."id" = "workout_exercises"."workout_id"
    WHERE "workouts"."user_id" = ${userId}
  `);
  return (result as { rows?: unknown[] }).rows || [];
}

async function selectMessageHubRows(userId: number): Promise<Record<string, unknown[]>> {
  const queryRows = async (query: ReturnType<typeof sql>): Promise<unknown[]> => {
    const result = await db.execute(query);
    return (result as { rows?: unknown[] }).rows || [];
  };
  const conversationScope = sql`SELECT "conversation_id" FROM "message_conversation_participants" WHERE "user_id" = ${userId}`;
  const rows = await Promise.all([
    queryRows(sql`SELECT * FROM "message_conversations" WHERE "id" IN (${conversationScope})`),
    queryRows(sql`SELECT * FROM "message_conversation_participants" WHERE "conversation_id" IN (${conversationScope})`),
    queryRows(sql`SELECT * FROM "message_channel_bindings" WHERE "conversation_id" IN (${conversationScope})`),
    queryRows(sql`SELECT * FROM "conversation_messages" WHERE "conversation_id" IN (${conversationScope})`),
    queryRows(sql`SELECT * FROM "message_attachments" WHERE "message_id" IN (SELECT "id" FROM "conversation_messages" WHERE "conversation_id" IN (${conversationScope}))`),
    queryRows(sql`SELECT * FROM "message_delivery_receipts" WHERE "message_id" IN (SELECT "id" FROM "conversation_messages" WHERE "conversation_id" IN (${conversationScope}))`),
    queryRows(sql`SELECT * FROM "message_internal_notes" WHERE "author_user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "message_audit_events" WHERE "conversation_id" IN (${conversationScope})`),
    queryRows(sql`SELECT * FROM "message_reactions" WHERE "message_id" IN (SELECT "id" FROM "conversation_messages" WHERE "conversation_id" IN (${conversationScope}))`),
    queryRows(sql`SELECT * FROM "message_edit_history" WHERE "message_id" IN (SELECT "id" FROM "conversation_messages" WHERE "conversation_id" IN (${conversationScope}))`),
  ]);
  return {
    message_conversations: rows[0],
    message_conversation_participants: rows[1],
    message_channel_bindings: rows[2],
    conversation_messages: rows[3],
    message_attachments: rows[4],
    message_delivery_receipts: rows[5],
    message_internal_notes: rows[6],
    message_audit_events: rows[7],
    message_reactions: rows[8],
    message_edit_history: rows[9],
  };
}

async function selectSafeHealthConnectionRows(userId: number): Promise<Record<string, unknown[]>> {
  const queryRows = async (query: ReturnType<typeof sql>): Promise<unknown[]> => {
    const result = await db.execute(query);
    return (result as { rows?: unknown[] }).rows || [];
  };
  const rows = await Promise.all([
    queryRows(sql`SELECT "id", "user_id", "provider", "provider_name", "status", "scopes", "consent_version", "consented_at", "last_sync_at", "last_error_code", "revoked_at", "created_at", "updated_at" FROM "health_connections" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT "id", "user_id", "connection_id", "resource_type", "status", "consecutive_failures", "last_attempt_at", "last_success_at", "next_retry_at", "updated_at" FROM "health_sync_cursors" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_source_records" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_source_suppressions" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_import_failures" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_import_runs" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_source_preferences" WHERE "user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "health_connection_audits" WHERE "user_id" = ${userId}`),
  ]);
  return { health_connections: rows[0], health_sync_cursors: rows[1], health_source_records: rows[2], health_source_suppressions: rows[3], health_import_failures: rows[4], health_import_runs: rows[5], health_source_preferences: rows[6], health_connection_audits: rows[7] };
}

async function selectSafeWorkspaceFormAccessRows(userId: number): Promise<Record<string, unknown[]>> {
  const [grants, receipts] = await Promise.all([
    db.execute(sql`SELECT "id", "public_id", "user_id", "form_id", "label", "active", "expires_at", "max_submissions", "submission_count", "last_used_at", "revoked_at", "created_at" FROM "workspace_form_access_grants" WHERE "user_id" = ${userId}`),
    db.execute(sql`SELECT * FROM "workspace_form_submission_receipts" WHERE "user_id" = ${userId}`),
  ]);
  return { workspace_form_access_grants: (grants as { rows?: unknown[] }).rows || [], workspace_form_submission_receipts: (receipts as { rows?: unknown[] }).rows || [] };
}

// Federation records use their own ownership columns and aggregate keys rather
// than the application's conventional user_id column. Keep this export scope
// deliberately identical to account deletion so a user can retain a portable
// audit trail of the LyfeOS-side federation activity that belongs to them.
async function selectFederationAuditRows(userId: number, clerkId?: string | null): Promise<Record<string, unknown[]>> {
  const queryRows = async (query: ReturnType<typeof sql>): Promise<unknown[]> => {
    const result = await db.execute(query);
    return (result as { rows?: unknown[] }).rows || [];
  };
  const workItemClause = clerkId
    ? sql` OR ("aggregate_type" = 'work_item' AND "payload"->>'actorId' = ${clerkId})`
    : sql``;
  const rows = await Promise.all([
    queryRows(sql`SELECT * FROM "umh_inbound_commands" WHERE "local_user_id" = ${userId}`),
    queryRows(sql`SELECT * FROM "umh_approval_requests" WHERE "command_id" IN (SELECT "command_id" FROM "umh_inbound_commands" WHERE "local_user_id" = ${userId})`),
    queryRows(sql`SELECT * FROM "umh_audit_records" WHERE "local_user_id" = ${userId}`),
    queryRows(sql`
      SELECT * FROM "umh_outbox_events"
      WHERE ("aggregate_type" = 'mission' AND "aggregate_id" IN (SELECT "id"::text FROM "quests" WHERE "user_id" = ${userId}))
         OR ("aggregate_type" = 'progression' AND "aggregate_id" = ${String(userId)})
         OR ("aggregate_type" = 'coordination_context' AND "aggregate_id" LIKE ${`${userId}:%`})
         ${workItemClause}
    `),
  ]);
  return {
    umh_inbound_commands: rows[0],
    umh_approval_requests: rows[1],
    umh_audit_records: rows[2],
    umh_outbox_events: rows[3],
  };
}

async function deleteLocalAccountData(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "message_reactions" WHERE "user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "conversation_messages" WHERE "sender_user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "message_internal_notes" WHERE "author_user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "message_conversation_participants" WHERE "user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "message_conversations" WHERE NOT EXISTS (SELECT 1 FROM "message_conversation_participants" WHERE "message_conversation_participants"."conversation_id" = "message_conversations"."id")`);
    await tx.execute(sql`DELETE FROM "messages" WHERE "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "user_id" = ${userId})`);
    await tx.execute(sql`DELETE FROM "kanban_boards" WHERE "user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "umh_outbox_events" WHERE "aggregate_type" = 'mission' AND "aggregate_id" IN (SELECT "id"::text FROM "quests" WHERE "user_id" = ${userId})`);
    await tx.execute(sql`DELETE FROM "umh_outbox_events" WHERE "aggregate_type" = 'progression' AND "aggregate_id" = ${String(userId)}`);
    await tx.execute(sql`DELETE FROM "umh_outbox_events" WHERE "aggregate_type" = 'coordination_context' AND "aggregate_id" LIKE ${`${userId}:%`}`);
    await tx.execute(sql`DELETE FROM "umh_outbox_events" WHERE "aggregate_type" = 'work_item' AND "payload"->>'actorId' = (SELECT "clerk_id" FROM "users" WHERE "id" = ${userId})`);
    await tx.execute(sql`DELETE FROM "umh_approval_requests" WHERE "command_id" IN (SELECT "command_id" FROM "umh_inbound_commands" WHERE "local_user_id" = ${userId})`);
    await tx.execute(sql`DELETE FROM "umh_audit_records" WHERE "local_user_id" = ${userId}`);
    await tx.execute(sql`DELETE FROM "umh_inbound_commands" WHERE "local_user_id" = ${userId}`);

    for (const table of ["health_source_records", "health_source_suppressions", "health_import_failures", "health_import_runs", "health_sync_cursors", "health_source_preferences", "health_connection_audits", "health_connections"]) {
      await tx.execute(sql`DELETE FROM ${identifier(table)} WHERE "user_id" = ${userId}`);
    }

    for (const table of [
      "workflow_automation_runs", "workflow_automations", "cross_product_work_links", "cross_product_sharing_preferences", "progression_badge_events", "progression_badge_awards", "activity_progression_events", "skill_progression_events", "quest_skill_contributions", "skill_edges", "skill_nodes", "personal_capabilities", "transformation_thread_evidence", "mission_deferrals", "mission_dependencies", "quests", "transformation_threads", "mission_pages", "calendar_events",
      "relationship_ai_recommendations", "relationship_governance_audit", "relationship_governance_consents", "relationship_assessments", "relationship_commitments", "relationship_interactions", "personal_relationships", "documents", "folders", "media_items", "media_albums", "conversations", "user_stats", "user_profile",
      "user_daily_logs", "user_integrations", "ai_pending_actions", "ai_action_records", "ai_messages", "contacts", "spreadsheet_revisions", "spreadsheets", "canvas_revisions", "canvases", "graphs", "workspace_form_submission_receipts", "workspace_form_access_grants", "workspace_forms", "workspace_table_views", "workspace_database_row_revisions", "workspace_database_revisions", "workspace_database_rows", "workspace_databases",
      "templates", "integrations", "progress_trackers", "dismissed_knowledge", "vision_goals", "user_categories",
      "ritual_groups", "widget_states", "user_activity_events", "smart_reminders", "mission_views", "push_subscriptions",
      "ingredient_scan_items", "ingredient_scans", "ingredient_preference_rules", "workout_heart_rate_samples", "heart_rate_zone_profiles", "workout_program_sessions", "workout_programs", "workout_template_revisions", "workout_templates", "workout_revisions", "workouts", "exercise_definitions", "nutrition_meal_plan_entries", "nutrition_meal_plans", "nutrition_diary_entries", "nutrition_recipe_revisions", "nutrition_recipes", "nutrition_food_portions", "nutrition_foods", "sleep_naps", "sleep_sessions", "health_observation_calculation_preferences", "health_observations", "health_metric_panels", "health_metric_definitions", "recovery_activities", "recovery_routines", "recovery_tag_policies", "fasting_windows", "supplement_schedule_events", "supplement_schedules", "supplement_entries", "hydration_entries", "body_measurements", "health_planning_draft_events", "health_planning_drafts", "health_ai_drafts", "health_ai_requests", "health_practice_reviews", "health_target_revisions", "health_targets", "health_profiles", "health_deletion_receipts", "health_data_rights_audit", "health_badge_events", "health_progression_events",
    ]) {
      await tx.execute(sql`DELETE FROM ${identifier(table)} WHERE "user_id" = ${userId}`);
    }
    await tx.execute(sql`DELETE FROM "users" WHERE "id" = ${userId}`);
  });
}

export function registerProfileRoutes(app: Express): void {
  // USER PROFILE ROUTES
  app.get("/api/users/:userId/profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Return user data without the password
      const { password, ...userData } = user;
      res.json(userData);
    } catch (error) {
      logger.error("Error getting user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/users/:userId/profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const {
        displayName,
        firstName,
        lastName,
        bio,
        avatarColor,
        title,
        profilePicture
      } = req.body;

      if (displayName !== undefined) {
        const trimmed = displayName.trim();
        if (trimmed.length < 3) {
          return res.status(400).json({ error: "Display name must be at least 3 characters." });
        }
        const existing = await storage.getUserByDisplayName(trimmed);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: "Display name is already taken." });
        }
      }

      const updateData: Partial<Omit<InsertUser, 'password'>> = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (bio !== undefined) updateData.bio = bio;
      if (avatarColor !== undefined) updateData.avatarColor = avatarColor;
      if (title !== undefined) updateData.title = title;
      if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
      
      // Log the update data for debugging
      logger.debug("User profile update data:", updateData);
      
      const updatedUser = await storage.updateUser(userId, updateData);
      
      // Return user data without the password
      const { password, ...userData } = updatedUser;
      res.json(userData);
    } catch (error) {
      logger.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Specific endpoint for UserProfile schema (not user)
  app.patch("/api/users/:userId/user-profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      // Parse the update data
      const { 
        onboardingCompleted,
        startStage,
        targetArchetype, 
        coreMotivation,
        flowStyle,
        setupMissionStatus,
        primaryThemeColor,
        futureSelfSummary,
        aiPersonalityProfile
      } = req.body;
      
      const updateData: Partial<InsertUserProfile> = {};
      if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
      if (startStage !== undefined) updateData.startStage = startStage;
      if (targetArchetype !== undefined) updateData.targetArchetype = targetArchetype;
      if (coreMotivation !== undefined) updateData.coreMotivation = coreMotivation;
      if (flowStyle !== undefined) updateData.flowStyle = flowStyle;
      if (setupMissionStatus !== undefined) updateData.setupMissionStatus = setupMissionStatus;
      if (primaryThemeColor !== undefined) updateData.primaryThemeColor = primaryThemeColor;
      if (futureSelfSummary !== undefined) updateData.futureSelfSummary = futureSelfSummary;
      if (aiPersonalityProfile !== undefined) updateData.aiPersonalityProfile = aiPersonalityProfile;
      
      // Log for debugging
      logger.debug("Updating user_profile with data:", updateData);
      
      // Check if profile exists and create or update accordingly
      const existingProfile = await storage.getUserProfile(userId);
      
      let updatedProfile;
      if (existingProfile) {
        updatedProfile = await storage.updateUserProfile(userId, updateData);
        logger.debug("Updated existing profile for user:", userId);
      } else {
        // Create a new profile if none exists
        updatedProfile = await storage.createUserProfile({ ...updateData, userId });
        logger.debug("Created new profile for user:", userId);
      }
      
      res.json(updatedProfile);
    } catch (error) {
      logger.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // SIMPLIFIED PROFILE ROUTES (uses session userId)
  app.get("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      logger.error("Error fetching profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const updateData = { ...req.body };
      if (updateData.aiContextPreferences !== undefined) {
        const parsed = z.object({
          planning: z.boolean(),
          identity: z.boolean(),
          dailyState: z.boolean(),
          conversationHistory: z.boolean(),
        }).strict().safeParse(updateData.aiContextPreferences);
        if (!parsed.success) return res.status(400).json({ error: "Choose valid AI context preferences." });
        updateData.aiContextPreferences = parsed.data;
      }
      updateData.updatedAt = new Date();
      
      if (updateData.primaryColor && !updateData.primaryThemeColor) {
        updateData.primaryThemeColor = updateData.primaryColor;
        delete updateData.primaryColor;
        
        try {
          await storage.updateUserStats(userId, { primaryColor: updateData.primaryThemeColor });
        } catch (err) {
          logger.error("Error syncing primaryColor to userStats:", err);
        }
      }
      
      const existingProfile = await storage.getUserProfile(userId);
      let updatedProfile;
      if (existingProfile) {
        updatedProfile = await storage.updateUserProfile(userId, updateData);
      } else {
        updatedProfile = await storage.upsertUserProfile(userId, updateData);
      }
      
      res.json(updatedProfile);
    } catch (error) {
      logger.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Validation schemas for account updates
  const updateAccountSchema = z.object({
    email: z.string().email("Invalid email format").optional().nullable().or(z.literal("")),
    phoneNumber: z.string().max(20, "Phone number too long").optional().nullable().or(z.literal("")),
  });
  
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });
  
  // Update account settings (email, phone)
  app.patch("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Validate input
      const parseResult = updateAccountSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }
      
      const { email, phoneNumber } = parseResult.data;
      
      const updateData: Record<string, any> = {};
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      
      const updatedUser = await storage.updateUser(userId, updateData);
      res.json({ 
        email: updatedUser.email, 
        phoneNumber: updatedUser.phoneNumber 
      });
    } catch (error) {
      logger.error("Error updating account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Change password
  app.post("/api/account/change-password", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Validate input
      const parseResult = changePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }
      
      const { currentPassword, newPassword } = parseResult.data;
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify current password
      if (!user.password) {
        return res.status(400).json({ error: "No password set for this account" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedPassword);
      
      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      logger.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get account info (email, phone)
  app.get("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        email: user.email, 
        phoneNumber: user.phoneNumber,
        authProvider: user.authProvider
      });
    } catch (error) {
      logger.error("Error fetching account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // A portable, self-service account export. Provider credentials and password
  // hashes are deliberately excluded even from a user's own browser download.
  app.get("/api/account/export", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const [rows, federationAudit, healthConnectionRows, workspaceFormAccessRows, nutritionNutrients, nutritionRecipeIngredients, workoutExerciseRows, workoutSetRows, messageHubRows] = await Promise.all([
        Promise.all(accountExportTables.map(async (table) => [table, await selectAccountRows(table, userId)] as const)),
        selectFederationAuditRows(userId, user.clerkId),
        selectSafeHealthConnectionRows(userId),
        selectSafeWorkspaceFormAccessRows(userId),
        selectNutritionNutrientRows(userId),
        selectNutritionRecipeIngredientRows(userId),
        selectWorkoutExerciseRows(userId),
        selectWorkoutSetRows(userId),
        selectMessageHubRows(userId),
      ]);
      const data = Object.fromEntries(rows) as Record<string, unknown[]>;
      Object.assign(data, federationAudit);
      Object.assign(data, healthConnectionRows);
      Object.assign(data, workspaceFormAccessRows);
      data.nutrition_food_nutrients = nutritionNutrients;
      data.nutrition_recipe_ingredients = nutritionRecipeIngredients;
      data.workout_exercises = workoutExerciseRows;
      data.workout_sets = workoutSetRows;
      Object.assign(data, messageHubRows);
      const safeUser = { ...user, password: undefined, passwordResetToken: undefined, passwordResetExpiry: undefined, emailVerificationToken: undefined, emailVerificationExpiry: undefined, twoFactorEmailCode: undefined, twoFactorEmailExpiry: undefined, twoFactorPhoneCode: undefined, twoFactorPhoneExpiry: undefined };
      data.integrations = data.integrations.map((entry: any) => {
        const { access_token, refresh_token, accessToken, refreshToken, ...safe } = entry;
        return { ...safe, settings: sanitizeIntegrationSettingsForExport(safe.settings) };
      });
      const exportPayload = { exportedAt: new Date().toISOString(), formatVersion: 1, user: safeUser, data };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lyfeos-data-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.status(200).send(JSON.stringify(exportPayload, null, 2));
    } catch (error) {
      logger.error("Error exporting account data:", error);
      return res.status(500).json({ error: "Could not export account data" });
    }
  });

  app.get("/api/account/ai-memory", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const [legacyMessages, chatConversations, profile, contextReceipts, actionReceipts, personaRows] = await Promise.all([
        selectAccountRows("ai_messages", userId),
        selectAccountRows("conversations", userId),
        storage.getUserProfile(userId),
        selectAccountRows("ai_context_receipts", userId),
        selectAccountRows("ai_action_records", userId),
        selectAccountRows("ai_persona_profiles", userId),
      ]);
      return res.json({
        legacyMessageCount: legacyMessages.length,
        conversationCount: chatConversations.length,
        affirmationStored: Boolean(profile?.characterAffirmation),
        profileContextStored: Boolean(profile?.aiPersonalityProfile && Object.keys(profile.aiPersonalityProfile as object).length),
        contextReceiptCount: contextReceipts.length,
        actionReceiptCount: actionReceipts.length,
        personaStored: personaRows.length > 0,
        boundaries: {
          nativeMessagesIncluded: false,
          externalSendingEnabled: false,
          crossProductMemoryDefault: "off",
          contextReceiptsContainRawValues: false,
        },
      });
    } catch (error) {
      logger.error("Error reading AI memory controls:", error);
      return res.status(500).json({ error: "Could not read AI memory controls" });
    }
  });

  app.delete("/api/account/ai-memory", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({ scope: z.enum(["chat-history", "assistant-profile", "context-sources", "action-history", "all-ai-memory"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose what the assistant should forget." });
    try {
      const userId = req.session.userId!;
      if (parsed.data.scope === "chat-history" || parsed.data.scope === "all-ai-memory") {
        await db.transaction(async (tx) => {
          await tx.execute(sql`DELETE FROM "messages" WHERE "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "user_id" = ${userId})`);
          await tx.execute(sql`DELETE FROM "conversations" WHERE "user_id" = ${userId}`);
          await tx.execute(sql`DELETE FROM "ai_messages" WHERE "user_id" = ${userId}`);
        });
      }
      if (parsed.data.scope === "assistant-profile" || parsed.data.scope === "all-ai-memory") {
        await storage.upsertUserProfile(userId, { characterAffirmation: null, aiPersonalityProfile: {} } as any);
      }
      if (parsed.data.scope === "context-sources" || parsed.data.scope === "all-ai-memory") {
        await db.execute(sql`DELETE FROM "ai_context_receipts" WHERE "user_id" = ${userId}`);
      }
      if (parsed.data.scope === "action-history" || parsed.data.scope === "all-ai-memory") {
        await db.transaction(async (tx) => {
          await tx.execute(sql`UPDATE "ai_pending_actions" SET "state" = 'rejected', "updated_at" = now() WHERE "user_id" = ${userId} AND "state" = 'pending'`);
          await tx.execute(sql`DELETE FROM "ai_action_records" WHERE "user_id" = ${userId} AND "state" NOT IN ('executing')`);
        });
      }
      return res.json({ success: true });
    } catch (error) {
      logger.error("Error clearing AI memory:", error);
      return res.status(500).json({ error: "Could not clear AI memory" });
    }
  });

  app.delete("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.object({ confirmation: z.literal("DELETE MY ACCOUNT") }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." });
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.clerkId) await clerkClient.users.deleteUser(user.clerkId);
      await deleteLocalAccountData(userId);
      req.session.destroy(() => undefined);
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting account:", error);
      return res.status(500).json({ error: "Could not complete account deletion. Please contact support before retrying." });
    }
  });
  
  // Generate Character Affirmation using AI
  app.post("/api/profile/generate-affirmation", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const {
        displayName, missionDepth = 0,
        archetypePrimary, archetypeSecondary, archetypeShadow,
        coreValues, desiredEmotion, lifeStage, strengths, coreBelief,
        vision90Day, vision5Year, vision10YearLegacy,
        primaryCraft, primaryCraftWhy, careerVocation,
        greatestContribution, collaborationStyle, roleOrientation,
        traitsToCultivate, emotionsToCultivate, dominantInstinctType, decisionMakingPrimary,
        upbringing, culturalContext,
        idealDay, boundaries, aesthetic, signatureExpression, lockedHabit,
      } = req.body;
      
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      const rawDepth = typeof missionDepth === "number" ? missionDepth : parseInt(missionDepth) || 0;
      const depth = Math.max(0, Math.min(7, rawDepth));
      let wordRange: string;
      let nameCount: string;
      let tone: string;
      let detailsBlock = "";
      let structureBlock = "";

      if (depth <= 0) {
        wordRange = "80-120";
        nameCount = "at least 3 times";
        tone = "Warm, welcoming, and empowering. Acknowledge their decision to begin this journey and affirm their potential.";
        structureBlock = `This is an introductory affirmation for someone just beginning their personal growth journey. Keep it warm, encouraging, and forward-looking.`;
      } else if (depth <= 1) {
        wordRange = "120-160";
        nameCount = "at least 3 times";
        tone = "Warm and identity-aware. Speak to who they are at their core based on their archetype, while remaining encouraging and forward-looking.";
        detailsBlock = `Key details about this person:
- Primary Archetype: ${archetypePrimary || "Explorer"} (their dominant energy and approach to life)
- Secondary Archetype: ${archetypeSecondary || "Creator"} (their supporting strength)
- Shadow Archetype: ${archetypeShadow || "unknown"} (their growth edge)`;
        structureBlock = `Structure the affirmation as:
1. Opening identity statement rooted in their archetype
2. Their natural strengths and how they show up in the world
3. Encouragement about their growth journey ahead`;
      } else if (depth <= 3) {
        wordRange = "160-220";
        nameCount = "at least 4 times";
        tone = "Powerful and values-driven. Speak with certainty about who they are, anchored in their values, vision, and chosen path.";
        detailsBlock = `Key details about this person:
- Primary Archetype: ${archetypePrimary || "Explorer"} (their dominant energy)
- Secondary Archetype: ${archetypeSecondary || "Creator"} (their supporting strength)
- Core Values: ${coreValues?.join(", ") || "growth, integrity, purpose"}
- Life Stage: ${lifeStage || "Building"}
- Desired Emotion: ${desiredEmotion || "flow"}
- Core Belief: ${coreBelief || "I am capable of creating the life I want"}
- Strengths: ${Array.isArray(strengths) ? strengths.join(", ") : strengths || "determination, creativity"}
- 90-Day Vision: ${vision90Day || "establishing strong foundations"}
- 5-Year Vision: ${vision5Year || "becoming the best version of themselves"}
- 10-Year Legacy: ${vision10YearLegacy || "leaving a meaningful impact"}` +
(depth >= 3 ? `
- Primary Craft: ${primaryCraft || "their chosen field"}${primaryCraftWhy ? ` (Why: ${primaryCraftWhy})` : ""}
- Career/Vocation: ${careerVocation || "their professional calling"}` : "");
        structureBlock = `Structure the affirmation as:
1. Opening identity statement using their name and archetype
2. Their values and how they embody them daily
3. Their vision — what they are creating and building toward
4. Their strengths and the unique way they move through the world
5. Their destiny and the legacy they are forging`;
      } else if (depth <= 5) {
        wordRange = "200-260";
        nameCount = "at least 5 times";
        tone = "Powerful, certain, and deeply personal. Write as if this is already who they are — declarative, not aspirational. Weave in their psychology, instincts, and inner world.";
        detailsBlock = `Key details about this person:
- Primary Archetype: ${archetypePrimary || "Explorer"} (their dominant energy)
- Secondary Archetype: ${archetypeSecondary || "Creator"} (their supporting strength)
- Core Values: ${coreValues?.join(", ") || "growth, integrity, purpose"}
- Life Stage: ${lifeStage || "Building"}
- Desired Emotion: ${desiredEmotion || "flow"}
- Core Belief: ${coreBelief || "I am capable of creating the life I want"}
- Strengths: ${Array.isArray(strengths) ? strengths.join(", ") : strengths || "determination, creativity"}
- 5-Year Vision: ${vision5Year || "becoming the best version of themselves"}
- 10-Year Legacy: ${vision10YearLegacy || "leaving a meaningful impact"}
- Primary Craft: ${primaryCraft || "their chosen field"}${primaryCraftWhy ? ` (Why: ${primaryCraftWhy})` : ""}
- Career/Vocation: ${careerVocation || "their professional calling"}
- Greatest Contribution: ${greatestContribution || "empowering others"}
- Collaboration Style: ${collaborationStyle || "adaptive"}
- Role Orientation: ${roleOrientation || "leader"}` +
(depth >= 5 ? `
- Traits They Are Cultivating: ${Array.isArray(traitsToCultivate) ? traitsToCultivate.join(", ") : traitsToCultivate || "discipline, presence"}
- Emotions They Are Cultivating: ${Array.isArray(emotionsToCultivate) ? emotionsToCultivate.join(", ") : emotionsToCultivate || "peace, confidence"}
- Dominant Instinct: ${dominantInstinctType || "intuitive"}
- Decision-Making Style: ${decisionMakingPrimary || "analytical"}` : "");
        structureBlock = `Structure the affirmation as:
1. Opening identity statement — who they are at their core
2. Their values, beliefs, and how they show up
3. Their vision, craft, and what they are building
4. Their psychological depth — instincts, traits, emotional intelligence
5. Their contribution, role in the world, and legacy`;
      } else {
        wordRange = "250-300";
        nameCount = "at least 5 times";
        tone = "Powerful, certain, and profoundly intimate. This is the complete picture of who they are — their identity, values, psychology, story, rituals, and aesthetic. Write as absolute truth about who they are.";
        detailsBlock = `Complete profile of this person:
- Primary Archetype: ${archetypePrimary || "Explorer"} (their dominant energy)
- Secondary Archetype: ${archetypeSecondary || "Creator"} (their supporting strength)
- Core Values: ${coreValues?.join(", ") || "growth, integrity, purpose"}
- Life Stage: ${lifeStage || "Building"}
- Desired Emotion: ${desiredEmotion || "flow"}
- Core Belief: ${coreBelief || "I am capable of creating the life I want"}
- Strengths: ${Array.isArray(strengths) ? strengths.join(", ") : strengths || "determination, creativity"}
- 5-Year Vision: ${vision5Year || "becoming the best version of themselves"}
- 10-Year Legacy: ${vision10YearLegacy || "leaving a meaningful impact"}
- Primary Craft: ${primaryCraft || "their chosen field"}
- Career/Vocation: ${careerVocation || "their professional calling"}
- Greatest Contribution: ${greatestContribution || "empowering others"}
- Role Orientation: ${roleOrientation || "leader"}
- Traits They Are Cultivating: ${Array.isArray(traitsToCultivate) ? traitsToCultivate.join(", ") : traitsToCultivate || "discipline, presence"}
- Emotions They Are Cultivating: ${Array.isArray(emotionsToCultivate) ? emotionsToCultivate.join(", ") : emotionsToCultivate || "peace, confidence"}
- Dominant Instinct: ${dominantInstinctType || "intuitive"}
- Decision-Making Style: ${decisionMakingPrimary || "analytical"}` +
(depth >= 6 ? `
- Upbringing: ${upbringing || "shaped by meaningful experiences"}
- Cultural Context: ${culturalContext || "diverse influences"}` : "") +
(depth >= 7 ? `
- Ideal Day: ${idealDay || "a day of intentional creation"}
- Personal Boundaries: ${Array.isArray(boundaries) ? boundaries.join(", ") : boundaries || "protecting their energy and time"}
- Locked-In Habit: ${lockedHabit || "daily practice"}
- Aesthetic/Style: ${aesthetic || "distinctive"}
- Signature Expression: ${signatureExpression || "unique self-expression"}` : "");
        structureBlock = `Structure the affirmation as:
1. Opening identity statement — a powerful declaration of who they are
2. Their values, beliefs, and the standards they live by
3. Their vision, craft, and the legacy they are building
4. Their psychological depth — instincts, traits, cultivated emotions
5. Their story — where they come from and how it forged them
6. Their rituals, boundaries, and aesthetic — how they live each day
7. Closing declaration — their destiny and sovereign purpose`;
      }

      const prompt = `Generate a powerful character affirmation (${wordRange} words) for a person named "${displayName}". Write in second person, speaking directly to them using "you" and "your".

IMPORTANT: Use their full name "${displayName}" repeatedly throughout the affirmation (${nameCount}). Address them by name to make it deeply personal.

${structureBlock}

${detailsBlock ? detailsBlock + "\n\n" : ""}Do NOT include any title, header, or greeting line — start directly with the affirmation content itself. Do NOT mention their location or where they live. Do NOT use any emojis.

Tone: ${tone}

Generate the complete affirmation now:`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          { role: "user", content: prompt }
        ],
      });
      
      const affirmation = message.content[0].type === "text" ? message.content[0].text : "";
      
      res.json({ affirmation });
    } catch (error) {
      logger.error("Error generating affirmation:", error);
      res.status(500).json({ error: "Failed to generate affirmation" });
    }
  });

  // USER STATS ROUTES
  app.get("/api/users/:userId/stats", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Process login streak and daily resets before returning stats
      // This ensures streak, HP, EP, time tokens, and attention tokens are always current
      await storage.processLoginStreak(userId);
      
      let [dbStats, userProfile] = await Promise.all([
        storage.getUserStats(userId),
        storage.getUserProfile(userId),
      ]);
      if (!dbStats) {
        return res.status(404).json({ error: "User stats not found" });
      }
      
      // Recalculate XP from completed missions to ensure consistency
      const xpData = await storage.recalculateXP(userId);
      dbStats = await storage.getUserStats(userId);
      if (!dbStats) return res.status(404).json({ error: "User stats not found" });
      
      // Transform database stats into the nested object structure expected by the frontend
      const transformedStats = {
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
        wealthTokens: {
          current: dbStats.wealthTokensCurrent ?? 100,
          max: dbStats.wealthTokensMax ?? 100,
        },
        experience: {
          current: xpData.experienceCurrent,
          max: xpData.experienceMax,
          level: xpData.level,
          totalXP: xpData.totalXP,
          showLevelUp: false
        },
        streakDays: dbStats.streakDays || 0,
        efficiencyScore: dbStats.efficiencyScore || 0,
        aiAssistantName: dbStats.aiAssistantName,
        // Include system settings in the transformed stats
        notificationsEnabled: dbStats.notificationsEnabled,
        darkThemeEnabled: dbStats.darkThemeEnabled, 
        autoSyncEnabled: dbStats.autoSyncEnabled,
        aiAssistantEnabled: dbStats.aiAssistantEnabled,
        primaryColor: (userProfile?.primaryThemeColor && userProfile.primaryThemeColor !== "#ffe03d" ? userProfile.primaryThemeColor : null)
          || (dbStats.primaryColor && dbStats.primaryColor !== "#ffffff" ? dbStats.primaryColor : null)
          || "#00e0ff",
      };
      
      return res.status(200).json({ stats: transformedStats });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/users/:userId/stats", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Transform nested frontend stat model to flat database model
      const frontendStats = req.body;
      const dbStatsUpdate: Partial<InsertUserStats> = {};
      
      if (frontendStats.attentionTokens) {
        if (frontendStats.attentionTokens.current !== undefined) {
          dbStatsUpdate.attentionTokensCurrent = frontendStats.attentionTokens.current;
        }
        if (frontendStats.attentionTokens.max !== undefined) {
          dbStatsUpdate.attentionTokensMax = frontendStats.attentionTokens.max;
        }
      }
      
      if (frontendStats.timeTokens) {
        if (frontendStats.timeTokens.current !== undefined) {
          dbStatsUpdate.timeTokensCurrent = frontendStats.timeTokens.current;
        }
        if (frontendStats.timeTokens.max !== undefined) {
          dbStatsUpdate.timeTokensMax = frontendStats.timeTokens.max;
        }
      }
      
      if (frontendStats.energyPoints) {
        if (frontendStats.energyPoints.current !== undefined) {
          dbStatsUpdate.energyPointsCurrent = frontendStats.energyPoints.current;
        }
        if (frontendStats.energyPoints.max !== undefined) {
          dbStatsUpdate.energyPointsMax = frontendStats.energyPoints.max;
        }
      }
      
      if (frontendStats.healthPoints) {
        if (frontendStats.healthPoints.current !== undefined) {
          dbStatsUpdate.healthPointsCurrent = frontendStats.healthPoints.current;
        }
        if (frontendStats.healthPoints.max !== undefined) {
          dbStatsUpdate.healthPointsMax = frontendStats.healthPoints.max;
        }
      }
      
      if (frontendStats.wealthTokens) {
        if (frontendStats.wealthTokens.current !== undefined) {
          dbStatsUpdate.wealthTokensCurrent = frontendStats.wealthTokens.current;
        }
        if (frontendStats.wealthTokens.max !== undefined) {
          dbStatsUpdate.wealthTokensMax = frontendStats.wealthTokens.max;
        }
      }
      
      // XP, level, rank, streak, badges, capability totals, and efficiency are
      // server-derived. Older clients may still echo them in this payload, but
      // they can never write progression state directly.
      
      // Handle system settings
      if (frontendStats.notificationsEnabled !== undefined) {
        dbStatsUpdate.notificationsEnabled = frontendStats.notificationsEnabled;
      }
      
      if (frontendStats.darkThemeEnabled !== undefined) {
        dbStatsUpdate.darkThemeEnabled = frontendStats.darkThemeEnabled;
      }
      
      if (frontendStats.autoSyncEnabled !== undefined) {
        dbStatsUpdate.autoSyncEnabled = frontendStats.autoSyncEnabled;
      }
      
      if (frontendStats.aiAssistantEnabled !== undefined) {
        dbStatsUpdate.aiAssistantEnabled = frontendStats.aiAssistantEnabled;
      }
      
      // Handle primary color
      if (frontendStats.primaryColor !== undefined) {
        dbStatsUpdate.primaryColor = frontendStats.primaryColor;
        logger.debug("Updating primary color to:", frontendStats.primaryColor);
        
        try {
          await storage.upsertUserProfile(userId, { primaryThemeColor: frontendStats.primaryColor });
        } catch (err) {
          logger.error("Error syncing primaryColor to userProfile:", err);
        }
      }
      
      
      const dbUpdatedStats = await storage.updateUserStats(userId, dbStatsUpdate);
      
      // Get updated user profile to access totalXP
      const userProfile = await storage.getUserProfile(userId);
      const totalXP = userProfile?.totalXP || 0;
      
      // Transform the response back to the frontend model
      const transformedStats = {
        attentionTokens: {
          current: dbUpdatedStats.attentionTokensCurrent,
          max: dbUpdatedStats.attentionTokensMax,
        },
        timeTokens: {
          current: dbUpdatedStats.timeTokensCurrent,
          max: dbUpdatedStats.timeTokensMax,
        },
        energyPoints: {
          current: dbUpdatedStats.energyPointsCurrent,
          max: dbUpdatedStats.energyPointsMax,
        },
        healthPoints: {
          current: dbUpdatedStats.healthPointsCurrent,
          max: dbUpdatedStats.healthPointsMax,
        },
        wealthTokens: {
          current: dbUpdatedStats.wealthTokensCurrent ?? 100,
          max: dbUpdatedStats.wealthTokensMax ?? 100,
        },
        experience: {
          current: dbUpdatedStats.experienceCurrent,
          max: dbUpdatedStats.experienceMax,
          level: dbUpdatedStats.level,
          totalXP: totalXP,
          showLevelUp: false
        },
        streakDays: dbUpdatedStats.streakDays || 0,
        efficiencyScore: dbUpdatedStats.efficiencyScore || 0,
        aiAssistantName: dbUpdatedStats.aiAssistantName,
        // Include system settings in the transformed stats
        notificationsEnabled: dbUpdatedStats.notificationsEnabled,
        darkThemeEnabled: dbUpdatedStats.darkThemeEnabled, 
        autoSyncEnabled: dbUpdatedStats.autoSyncEnabled,
        aiAssistantEnabled: dbUpdatedStats.aiAssistantEnabled,
        primaryColor: (userProfile?.primaryThemeColor && userProfile.primaryThemeColor !== "#ffe03d" ? userProfile.primaryThemeColor : null)
          || (dbUpdatedStats.primaryColor && dbUpdatedStats.primaryColor !== "#ffffff" ? dbUpdatedStats.primaryColor : null)
          || "#00e0ff",
      };
      
      return res.status(200).json({ stats: transformedStats });
    } catch (error) {
      logger.error("Error updating stats:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Specific endpoint for updating AI assistant name
  app.patch("/api/users/:userId/ai-assistant-name", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const parsed = z.object({ name: z.string().trim().min(1, "A name is required").max(32, "Keep the name to 32 characters or fewer") }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Valid name is required" });
      
      const updatedStats = await storage.updateUserStats(userId, { aiAssistantName: parsed.data.name });
      await db.execute(sql`
        INSERT INTO "ai_persona_profiles" ("user_id", "name") VALUES (${userId}, ${parsed.data.name})
        ON CONFLICT ("user_id") DO UPDATE SET "name" = EXCLUDED."name", "revision" = "ai_persona_profiles"."revision" + 1, "updated_at" = now()
      `);
      
      return res.status(200).json({ 
        success: true,
        aiAssistantName: updatedStats.aiAssistantName 
      });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // XP must be derived from real progress records, not client-provided amounts.
  app.post("/api/users/:userId/award-xp", isOwner, async (req: Request, res: Response) => {
    return res.status(410).json({ error: "XP is derived from completed missions and goals; direct awards are disabled." });
  });

  // Metadata-only execution receipts let a user inspect what their assistant
  // attempted without duplicating private prompt or tool payload content.
  app.get("/api/account/ai-actions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE "ai_action_repairs" SET "state" = 'expired', "updated_at" = now() WHERE "user_id" = ${req.session.userId!} AND "state" = 'available' AND "expires_at" <= now()`);
        await tx.execute(sql`UPDATE "ai_action_records" SET "repair_state" = 'expired' WHERE "user_id" = ${req.session.userId!} AND "repair_state" = 'available' AND "repair_expires_at" <= now()`);
      });
      const result = await db.execute(sql`
        SELECT "id", "tool_name", "risk", "state", "outcome_summary", "repair_state", "repair_expires_at", "repaired_at", "created_at"
        FROM "ai_action_records"
        WHERE "user_id" = ${req.session.userId!}
        ORDER BY "created_at" DESC
        LIMIT 20
      `);
      return res.json({ actions: (result as { rows?: unknown[] }).rows || [] });
    } catch (error) {
      logger.error("Error reading AI action receipts:", error);
      return res.status(500).json({ error: "Could not read AI action receipts" });
    }
  });
  
  // Daily Log APIs
  
  // Get user's daily logs
  app.get("/api/users/:userId/daily-logs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { date } = req.query;
      
      let logs;
      if (date) {
        logs = await db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), eq(userDailyLogs.date, date as string)))
          .orderBy(desc(userDailyLogs.id))
          .limit(1);
      } else {
        logs = await db.select().from(userDailyLogs)
          .where(eq(userDailyLogs.userId, userId))
          .orderBy(desc(userDailyLogs.date));
      }
      return res.status(200).json({ logs });
    } catch (error) {
      logger.error("Error fetching daily logs:", error);
      return res.status(500).json({ error: "Failed to fetch daily logs" });
    }
  });
  
  // Create a new daily log entry
  app.post("/api/users/:userId/daily-logs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { 
        date, yesterdayXp, todayPrimaryMission, optionalBoostsShown, boostsData,
        wakeTime, sleepTime, mentalState, physicalState, emotionalState,
        gratitude, tomorrowGoals, annualGoals, thoughts,
        contentConsumed, research, todoIdeas,
        sourceAuthor, sourceMaterial, researchNote, revisionNote, executionNote,
        researchEntries,
        wentWell, couldBeBetter, learned
      } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      const result = await db.insert(userDailyLogs).values({
        userId,
        date,
        yesterdayXp: yesterdayXp || 0,
        todayPrimaryMission: todayPrimaryMission || null,
        optionalBoostsShown: optionalBoostsShown || false,
        boostsData: boostsData || {},
        wakeTime: wakeTime || null,
        sleepTime: sleepTime || null,
        mentalState: mentalState ?? 5,
        physicalState: physicalState ?? 5,
        emotionalState: emotionalState ?? 5,
        gratitude: gratitude || null,
        tomorrowGoals: tomorrowGoals || null,
        annualGoals: annualGoals || null,
        thoughts: thoughts || null,
        contentConsumed: contentConsumed || null,
        research: research || null,
        todoIdeas: todoIdeas || null,
        sourceAuthor: sourceAuthor || null,
        sourceMaterial: sourceMaterial || null,
        researchNote: researchNote || null,
        revisionNote: revisionNote || null,
        executionNote: executionNote || null,
        researchEntries: researchEntries || [],
        wentWell: wentWell || null,
        couldBeBetter: couldBeBetter || null,
        learned: learned || null,
      }).onConflictDoUpdate({
        target: [userDailyLogs.userId, userDailyLogs.date],
        set: {
          ...(yesterdayXp !== undefined && { yesterdayXp }),
          ...(todayPrimaryMission !== undefined && { todayPrimaryMission }),
          ...(optionalBoostsShown !== undefined && { optionalBoostsShown }),
          ...(boostsData !== undefined && { boostsData }),
          ...(wakeTime !== undefined && { wakeTime }),
          ...(sleepTime !== undefined && { sleepTime }),
          ...(mentalState !== undefined && { mentalState }),
          ...(physicalState !== undefined && { physicalState }),
          ...(emotionalState !== undefined && { emotionalState }),
          ...(gratitude !== undefined && { gratitude }),
          ...(tomorrowGoals !== undefined && { tomorrowGoals }),
          ...(annualGoals !== undefined && { annualGoals }),
          ...(thoughts !== undefined && { thoughts }),
          ...(contentConsumed !== undefined && { contentConsumed }),
          ...(research !== undefined && { research }),
          ...(todoIdeas !== undefined && { todoIdeas }),
          ...(sourceAuthor !== undefined && { sourceAuthor }),
          ...(sourceMaterial !== undefined && { sourceMaterial }),
          ...(researchNote !== undefined && { researchNote }),
          ...(revisionNote !== undefined && { revisionNote }),
          ...(executionNote !== undefined && { executionNote }),
          ...(researchEntries !== undefined && { researchEntries }),
          ...(wentWell !== undefined && { wentWell }),
          ...(couldBeBetter !== undefined && { couldBeBetter }),
          ...(learned !== undefined && { learned }),
        },
      }).returning();
      
      const savedLog = result[0];

      const reflection = [wentWell, couldBeBetter, learned]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
        .join(" | ");
      if (reflection) {
        await recordTransformationThreadEvidence({
          userId,
          sourceType: "daily_reflection",
          sourceId: String(date),
          summary: reflection.slice(0, 2000),
        });
      }
      
      // Convert the immediately preceding day's captured ideas; mission-list
      // loading provides recovery for any older unconverted day.
      try {
        const [year, month, day] = date.split('-').map(Number);
        const previousDay = new Date(year, month - 1, day - 1);
        const previousDateStr = formatLocalDate(previousDay);
        const result = await convertTodoIdeasToMissions({
          userId,
          includeLog: (logDate) => logDate === previousDateStr,
          createdAtForLog: () => localMidnight(date),
        });
        if (result.logsProcessed > 0) {
          logger.debug(`Created ${result.created} missions from the previous day's todo ideas for user ${userId} (${result.duplicatesSkipped} duplicates skipped)`);
        }
      } catch (todoError) {
        logger.error("Error converting todoIdeas to quests:", todoError);
      }
      
      return res.status(200).json({ log: savedLog, message: "Daily log saved successfully" });
    } catch (error) {
      logger.error("Error creating daily log:", error);
      return res.status(500).json({ error: "Failed to create daily log" });
    }
  });
  
  // Update existing daily log
  app.patch("/api/users/:userId/daily-logs/update", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { 
        date, boostsData,
        // Energy log fields
        wakeTime, sleepTime, mentalState, physicalState, emotionalState,
        // Intention log fields
        gratitude, tomorrowGoals, annualGoals, thoughts,
        // Data log fields
        contentConsumed, research, todoIdeas,
        // Research log fields
        sourceAuthor, sourceMaterial, researchNote, revisionNote, executionNote,
        // Reflection log fields
        wentWell, couldBeBetter, learned
      } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Check if a log exists for this date
      const existingLog = await db.select()
        .from(userDailyLogs)
        .where(and(
          eq(userDailyLogs.userId, userId),
          eq(userDailyLogs.date, date)
        ));
      
      if (existingLog.length > 0) {
        // Update the existing log with all fields
        await db.update(userDailyLogs)
          .set({
            boostsData: boostsData !== undefined ? boostsData : existingLog[0].boostsData,
            // Energy log fields
            wakeTime: wakeTime !== undefined ? wakeTime : existingLog[0].wakeTime,
            sleepTime: sleepTime !== undefined ? sleepTime : existingLog[0].sleepTime,
            mentalState: mentalState !== undefined ? mentalState : existingLog[0].mentalState,
            physicalState: physicalState !== undefined ? physicalState : existingLog[0].physicalState,
            emotionalState: emotionalState !== undefined ? emotionalState : existingLog[0].emotionalState,
            // Intention log fields
            gratitude: gratitude !== undefined ? gratitude : existingLog[0].gratitude,
            tomorrowGoals: tomorrowGoals !== undefined ? tomorrowGoals : existingLog[0].tomorrowGoals,
            annualGoals: annualGoals !== undefined ? annualGoals : existingLog[0].annualGoals,
            thoughts: thoughts !== undefined ? thoughts : existingLog[0].thoughts,
            // Data log fields
            contentConsumed: contentConsumed !== undefined ? contentConsumed : existingLog[0].contentConsumed,
            research: research !== undefined ? research : existingLog[0].research,
            todoIdeas: todoIdeas !== undefined ? todoIdeas : existingLog[0].todoIdeas,
            todosConverted: todoIdeas !== undefined ? false : existingLog[0].todosConverted,
            // Research log fields
            sourceAuthor: sourceAuthor !== undefined ? sourceAuthor : existingLog[0].sourceAuthor,
            sourceMaterial: sourceMaterial !== undefined ? sourceMaterial : existingLog[0].sourceMaterial,
            researchNote: researchNote !== undefined ? researchNote : existingLog[0].researchNote,
            revisionNote: revisionNote !== undefined ? revisionNote : existingLog[0].revisionNote,
            executionNote: executionNote !== undefined ? executionNote : existingLog[0].executionNote,
            // Reflection log fields
            wentWell: wentWell !== undefined ? wentWell : existingLog[0].wentWell,
            couldBeBetter: couldBeBetter !== undefined ? couldBeBetter : existingLog[0].couldBeBetter,
            learned: learned !== undefined ? learned : existingLog[0].learned
          })
          .where(eq(userDailyLogs.id, existingLog[0].id));
          
        const updatedLog = await db.select().from(userDailyLogs).where(eq(userDailyLogs.id, existingLog[0].id));
        const reflection = [updatedLog[0]?.wentWell, updatedLog[0]?.couldBeBetter, updatedLog[0]?.learned]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
          .join(" | ");
        if (reflection) {
          await recordTransformationThreadEvidence({
            userId,
            sourceType: "daily_reflection",
            sourceId: String(date),
            summary: reflection.slice(0, 2000),
          });
        }
        storage.logActivityEvent(userId, 'daily_log', { date }).catch(() => {});
        const coordinationContextQueued = await queueCoordinationContext(userId, date).catch(() => false);
        return res.status(200).json({ log: updatedLog[0], message: "Daily log updated successfully", coordinationContextQueued });
      } else {
        // Create a new log if it doesn't exist
        const newLog = await db.insert(userDailyLogs).values({
          userId: userId,
          date,
          boostsData: boostsData || {},
          // Energy log fields
          wakeTime: wakeTime || null,
          sleepTime: sleepTime || null,
          mentalState: mentalState || 5,
          physicalState: physicalState || 5,
          emotionalState: emotionalState || 5,
          // Intention log fields
          gratitude: gratitude || null,
          tomorrowGoals: tomorrowGoals || null,
          annualGoals: annualGoals || null,
          thoughts: thoughts || null,
          // Data log fields
          contentConsumed: contentConsumed || null,
          research: research || null,
          todoIdeas: todoIdeas || null,
          // Research log fields
          sourceAuthor: sourceAuthor || null,
          sourceMaterial: sourceMaterial || null,
          researchNote: researchNote || null,
          revisionNote: revisionNote || null,
          executionNote: executionNote || null,
          // Reflection log fields
          wentWell: wentWell || null,
          couldBeBetter: couldBeBetter || null,
          learned: learned || null
        }).returning();
        const reflection = [newLog[0]?.wentWell, newLog[0]?.couldBeBetter, newLog[0]?.learned]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
          .join(" | ");
        if (reflection) {
          await recordTransformationThreadEvidence({
            userId,
            sourceType: "daily_reflection",
            sourceId: String(date),
            summary: reflection.slice(0, 2000),
          });
        }
        
        const coordinationContextQueued = await queueCoordinationContext(userId, date).catch(() => false);
        return res.status(201).json({ log: newLog[0], coordinationContextQueued });
      }
    } catch (error) {
      logger.error("Error updating daily log:", error);
      return res.status(500).json({ error: "Failed to update daily log" });
    }
  });

  app.patch("/api/users/:userId/daily-logs/rename-research-field", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

      const schema = z.object({
        field: z.enum(["sourceAuthor", "sourceMaterial"]),
        oldValue: z.string(),
        newValue: z.string().min(1),
        scopeAuthor: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error });

      const { field, oldValue, newValue, scopeAuthor } = parsed.data;

      const allLogs = await db.select().from(userDailyLogs).where(eq(userDailyLogs.userId, userId));

      let updatedCount = 0;
      for (const log of allLogs) {
        let needsUpdate = false;
        const updates: Record<string, any> = {};

        const logAuthor = (log as any).sourceAuthor;
        const matchesScope = !scopeAuthor || field === 'sourceAuthor' || logAuthor === scopeAuthor;

        if ((log as any)[field] === oldValue && matchesScope) {
          updates[field] = newValue;
          needsUpdate = true;
        }

        const entries = Array.isArray((log as any).researchEntries) ? [...(log as any).researchEntries] : [];
        let entriesChanged = false;
        for (let i = 0; i < entries.length; i++) {
          const entryMatchesScope = !scopeAuthor || field === 'sourceAuthor' || entries[i].sourceAuthor === scopeAuthor;
          if (entries[i][field] === oldValue && entryMatchesScope) {
            entries[i] = { ...entries[i], [field]: newValue };
            entriesChanged = true;
          }
        }
        if (entriesChanged) {
          updates.researchEntries = entries;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await db.update(userDailyLogs).set(updates).where(eq(userDailyLogs.id, log.id));
          updatedCount++;
        }
      }

      return res.json({ success: true, updatedCount });
    } catch (error) {
      logger.error("Error renaming research field:", error);
      return res.status(500).json({ error: "Failed to rename" });
    }
  });

  // Analytics / Insights API
  app.get("/api/analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      const [dailyLogs, allMissions, stats] = await Promise.all([
        db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, cutoffStr)))
          .orderBy(asc(userDailyLogs.date)),
        db.select().from(questsTable)
          .where(eq(questsTable.userId, userId)),
        storage.getUserStats(userId),
      ]);

      const moodTrends = dailyLogs.map(log => ({
        date: log.date,
        mental: log.mentalState ?? 5,
        physical: log.physicalState ?? 5,
        emotional: log.emotionalState ?? 5,
        average: Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10,
      }));

      const excludedCategories = ['onboarding', 'todo'];
      const activeMissions = allMissions.filter(m => !m.deletedAt && !excludedCategories.includes((m.category || '').toLowerCase()));
      const completedMissions = activeMissions.filter(m => m.completed);

      const completionsByDay: Record<string, number> = {};
      const xpByDay: Record<string, number> = {};
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dt = new Date(m.completedAt);
          const day = formatLocalDate(dt);
          if (day >= cutoffStr) {
            completionsByDay[day] = (completionsByDay[day] || 0) + 1;
            xpByDay[day] = (xpByDay[day] || 0) + missionExperience(m.experienceReward, m.difficulty);
          }
        }
      });

      const dateRange: string[] = [];
      const d = new Date(cutoffStr);
      const today = new Date();
      while (d <= today) {
        dateRange.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }

      const missionCompletionTrend = dateRange.map(date => ({
        date,
        completed: completionsByDay[date] || 0,
        xpEarned: xpByDay[date] || 0,
      }));

      const categoryStats: Record<string, { total: number; completed: number; totalXp: number; totalEnergy: number }> = {};
      activeMissions.forEach(m => {
        const cat = m.category || "general";
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0, totalXp: 0, totalEnergy: 0 };
        categoryStats[cat].total++;
        if (m.completed) {
          categoryStats[cat].completed++;
          categoryStats[cat].totalXp += missionExperience(m.experienceReward, m.difficulty);
        }
        categoryStats[cat].totalEnergy += m.energyCost || 0;
      });

      const difficultyStats: Record<string, { total: number; completed: number }> = {};
      activeMissions.forEach(m => {
        const diff = m.difficulty || "D";
        if (!difficultyStats[diff]) difficultyStats[diff] = { total: 0, completed: 0 };
        difficultyStats[diff].total++;
        if (m.completed) difficultyStats[diff].completed++;
      });

      const sleepData = dailyLogs
        .filter(log => log.wakeTime || log.sleepTime)
        .map(log => ({ date: log.date, wakeTime: log.wakeTime, sleepTime: log.sleepTime }));

      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const weeklyBuckets: { missions: number; xp: number }[] = Array.from({ length: 7 }, () => ({ missions: 0, xp: 0 }));
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dow = new Date(m.completedAt).getDay();
          weeklyBuckets[dow].missions++;
          weeklyBuckets[dow].xp += missionExperience(m.experienceReward, m.difficulty);
        }
      });
      const weeklyPatterns = weeklyBuckets.map((b, i) => ({ day: dayNames[i], missions: b.missions, xp: b.xp }));

      const streakHistory = dateRange.map(date => ({ date, count: completionsByDay[date] || 0 }));

      const completionEntries = Object.entries(completionsByDay);
      const xpEntries = Object.entries(xpByDay);
      const bestDayMissions = completionEntries.length > 0 ? Math.max(...completionEntries.map(e => e[1])) : 0;
      const bestDayXp = xpEntries.length > 0 ? Math.max(...xpEntries.map(e => e[1])) : 0;
      const bestDayDate = completionEntries.length > 0 ? completionEntries.reduce((a, b) => b[1] > a[1] ? b : a)[0] : null;
      const totalDaysActive = completionEntries.filter(e => e[1] > 0).length;

      const difficultyRanks = ["S","A","B","C","D"];
      let highestDifficulty: string | null = null;
      for (const rank of difficultyRanks) {
        if (completedMissions.some(m => (m.difficulty || "D") === rank)) {
          highestDifficulty = rank;
          break;
        }
      }

      let longestStreak = 0;
      let currentRun = 0;
      for (const date of dateRange) {
        if ((completionsByDay[date] || 0) > 0) {
          currentRun++;
          if (currentRun > longestStreak) longestStreak = currentRun;
        } else {
          currentRun = 0;
        }
      }

      const personalRecords = { bestDayMissions, bestDayXp, bestDayDate, totalDaysActive, highestDifficulty, longestStreak };

      const totalEnergyCost = activeMissions.reduce((sum, m) => sum + (m.energyCost || 0), 0);
      const completedEnergyCost = completedMissions.reduce((sum, m) => sum + (m.energyCost || 0), 0);
      const tokenEfficiency = {
        totalEnergyCost,
        completedEnergyCost,
        efficiency: totalEnergyCost > 0 ? Math.round(completedEnergyCost / totalEnergyCost * 100) : 0,
      };

      const sleepWellnessCorrelation = dailyLogs
        .filter(log => log.wakeTime && log.sleepTime && log.mentalState != null && log.physicalState != null && log.emotionalState != null)
        .map(log => {
          const durationMinutes = sleepDurationMinutes(log.sleepTime, log.wakeTime);
          if (durationMinutes === null) return null;
          const sleepHours = Math.round(durationMinutes / 60 * 10) / 10;
          const mood = Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10;
          return { date: log.date, sleepHours, mood };
        }).filter((entry): entry is { date: string; sleepHours: number; mood: number } => entry !== null);
      const sleepWellnessDataQuality = assessObservedPatternQuality(sleepWellnessCorrelation.length, dateRange.length);

      res.json({
        moodTrends,
        missionCompletionTrend,
        categoryStats,
        difficultyStats,
        sleepData,
        weeklyPatterns,
        streakHistory,
        personalRecords,
        tokenEfficiency,
        sleepWellnessCorrelation,
        sleepWellnessDataQuality,
        summary: {
          totalMissions: activeMissions.length,
          completedMissions: completedMissions.length,
          completionRate: activeMissions.length > 0 ? Math.round((completedMissions.length / activeMissions.length) * 100) : 0,
          totalXpEarned: completedMissions.reduce((sum, m) => sum + missionExperience(m.experienceReward, m.difficulty), 0),
          currentLevel: stats?.level ?? 1,
          currentXp: stats?.experienceCurrent ?? 0,
          currentStreak: stats?.streakDays ?? 0,
          avgMoodScore: moodTrends.length > 0 ? Math.round(moodTrends.reduce((s, m) => s + m.average, 0) / moodTrends.length * 10) / 10 : 0,
          daysTracked: dailyLogs.length,
        },
      });
    } catch (error) {
      logger.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/stat-analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      const [dailyLogs, allMissions, stats] = await Promise.all([
        db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, cutoffStr)))
          .orderBy(asc(userDailyLogs.date)),
        db.select().from(questsTable)
          .where(eq(questsTable.userId, userId)),
        storage.getUserStats(userId),
      ]);

      const EXCLUDED_CATEGORIES = ["onboarding", "todo"];
      const activeMissions = allMissions.filter(m => !m.deletedAt && !EXCLUDED_CATEGORIES.includes((m.category || "").toLowerCase()));
      const completedMissions = activeMissions.filter(m => m.completed);

      const dateRange: string[] = [];
      const d = new Date(cutoffStr);
      const today = new Date();
      while (d <= today) {
        dateRange.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }

      const xpByDay: Record<string, number> = {};
      const completionsByDay: Record<string, number> = {};
      const energyByDay: Record<string, number> = {};
      const missionsByDay: Record<string, { title: string; xp: number; energy: number; category: string; difficulty: string }[]> = {};

      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dt = new Date(m.completedAt);
          const day = formatLocalDate(dt);
          if (day >= cutoffStr) {
            xpByDay[day] = (xpByDay[day] || 0) + missionExperience(m.experienceReward, m.difficulty);
            completionsByDay[day] = (completionsByDay[day] || 0) + 1;
            energyByDay[day] = (energyByDay[day] || 0) + (m.energyCost || 0);
            if (!missionsByDay[day]) missionsByDay[day] = [];
            missionsByDay[day].push({
              title: m.title,
              xp: missionExperience(m.experienceReward, m.difficulty),
              energy: m.energyCost || 0,
              category: m.category || "general",
              difficulty: m.difficulty || "D",
            });
          }
        }
      });

      const xpTrend = dateRange.map(date => ({
        date,
        xp: xpByDay[date] || 0,
        missions: completionsByDay[date] || 0,
      }));

      const energyTrend = dateRange.map(date => ({
        date,
        energyUsed: energyByDay[date] || 0,
        missions: completionsByDay[date] || 0,
      }));

      const categoryStats: Record<string, { total: number; completed: number; totalXp: number; totalEnergy: number }> = {};
      activeMissions.forEach(m => {
        const cat = m.category || "general";
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0, totalXp: 0, totalEnergy: 0 };
        categoryStats[cat].total++;
        if (m.completed) {
          categoryStats[cat].completed++;
          categoryStats[cat].totalXp += missionExperience(m.experienceReward, m.difficulty);
          categoryStats[cat].totalEnergy += m.energyCost || 0;
        }
      });

      const difficultyBreakdown: Record<string, { total: number; completed: number; totalXp: number }> = {};
      activeMissions.forEach(m => {
        const diff = m.difficulty || "D";
        if (!difficultyBreakdown[diff]) difficultyBreakdown[diff] = { total: 0, completed: 0, totalXp: 0 };
        difficultyBreakdown[diff].total++;
        if (m.completed) {
          difficultyBreakdown[diff].completed++;
          difficultyBreakdown[diff].totalXp += missionExperience(m.experienceReward, m.difficulty);
        }
      });

      const moodTrend = dailyLogs.map(log => ({
        date: log.date,
        mental: log.mentalState ?? 5,
        physical: log.physicalState ?? 5,
        emotional: log.emotionalState ?? 5,
        average: Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10,
      }));

      const completionTrend = dateRange.map(date => ({
        date,
        completed: completionsByDay[date] || 0,
        total: activeMissions.filter(m => {
          if (!m.createdAt) return false;
          const created = new Date(m.createdAt).toISOString().split("T")[0];
          return created <= date;
        }).length,
      }));

      const maxTokens = stats?.energyPointsMax ?? 100;
      const tokenUtilization = dateRange.map(date => {
        const used = energyByDay[date] || 0;
        return {
          date,
          used,
          remaining: Math.max(maxTokens - used, 0),
          utilization: maxTokens > 0 ? Math.round((used / maxTokens) * 100) : 0,
        };
      });

      const topMissions = completedMissions
        .filter(m => m.completedAt)
        .sort((a, b) => missionExperience(b.experienceReward, b.difficulty) - missionExperience(a.experienceReward, a.difficulty))
        .slice(0, 10)
        .map(m => ({
          title: m.title,
          xp: missionExperience(m.experienceReward, m.difficulty),
          energy: m.energyCost || 0,
          difficulty: m.difficulty || "D",
          category: m.category || "general",
          completedAt: m.completedAt,
        }));

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayBuckets = Array.from({ length: 7 }, () => ({ missions: 0, xp: 0, energy: 0 }));
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dow = new Date(m.completedAt).getDay();
          weekdayBuckets[dow].missions++;
          weekdayBuckets[dow].xp += missionExperience(m.experienceReward, m.difficulty);
          weekdayBuckets[dow].energy += m.energyCost || 0;
        }
      });
      const weekdayPatterns = weekdayBuckets.map((b, i) => ({ day: dayNames[i], ...b }));

      const totalXpEarned = completedMissions.reduce((s, m) => s + missionExperience(m.experienceReward, m.difficulty), 0);
      const totalEnergySpent = completedMissions.reduce((s, m) => s + (m.energyCost || 0), 0);
      const avgXpPerMission = completedMissions.length > 0 ? Math.round(totalXpEarned / completedMissions.length) : 0;
      const avgEnergyPerMission = completedMissions.length > 0 ? Math.round(totalEnergySpent / completedMissions.length) : 0;

      const sleepWellnessCorrelation = dailyLogs
        .filter(log => log.wakeTime && log.sleepTime && log.mentalState != null && log.physicalState != null && log.emotionalState != null)
        .map(log => {
          const durationMinutes = sleepDurationMinutes(log.sleepTime, log.wakeTime);
          if (durationMinutes === null) return null;
          const sleepHours = Math.round(durationMinutes / 60 * 10) / 10;
          const mood = Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10;
          return { date: log.date, sleepHours, mood };
        }).filter((entry): entry is { date: string; sleepHours: number; mood: number } => entry !== null);
      const sleepWellnessDataQuality = assessObservedPatternQuality(sleepWellnessCorrelation.length, dateRange.length);

      res.json({
        xpTrend,
        energyTrend,
        completionTrend,
        tokenUtilization,
        categoryStats,
        difficultyBreakdown,
        moodTrend,
        topMissions,
        weekdayPatterns,
        sleepWellnessCorrelation,
        sleepWellnessDataQuality,
        summary: {
          totalMissions: activeMissions.length,
          completedMissions: completedMissions.length,
          completionRate: activeMissions.length > 0 ? Math.round((completedMissions.length / activeMissions.length) * 100) : 0,
          totalXpEarned,
          totalEnergySpent,
          avgXpPerMission,
          avgEnergyPerMission,
          currentLevel: stats?.level ?? 1,
          currentXp: stats?.experienceCurrent ?? 0,
          xpToNextLevel: (stats?.experienceMax ?? 1000) - (stats?.experienceCurrent ?? 0),
          maxXp: stats?.experienceMax ?? 1000,
          currentStreak: stats?.streakDays ?? 0,
          energyMax: stats?.energyPointsMax ?? 100,
          healthMax: stats?.healthPointsMax ?? 100,
          wealthMax: stats?.wealthTokensMax ?? 100,
          timeMax: stats?.timeTokensMax ?? 100,
          attentionMax: stats?.attentionTokensMax ?? 100,
          daysTracked: dailyLogs.length,
          avgMoodScore: moodTrend.length > 0 ? Math.round(moodTrend.reduce((s, m) => s + m.average, 0) / moodTrend.length * 10) / 10 : 0,
        },
      });
    } catch (error) {
      logger.error("Error fetching stat analytics:", error);
      res.status(500).json({ error: "Failed to fetch stat analytics" });
    }
  });

  app.get("/api/streaks", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.recalculateXP(userId);
      const stats = await storage.getUserStats(userId);
      const currentStreak = stats?.streakDays ?? 0;

      const allQuestsRaw = await storage.getQuests(userId);
      const EXCLUDED_CATS = ["onboarding", "todo"];
      const allQuests = allQuestsRaw.filter(q => !EXCLUDED_CATS.includes((q.category || "").toLowerCase()));

      const today = new Date();
      const heatmapStart = new Date(today);
      heatmapStart.setDate(heatmapStart.getDate() - 364);
      const heatmapDays: string[] = [];
      for (let d = new Date(heatmapStart); d <= today; d.setDate(d.getDate() + 1)) {
        heatmapDays.push(d.toISOString().slice(0, 10));
      }
      const completionsByDay: Record<string, number> = {};
      allQuests.forEach(q => {
        if (q.completed && q.completedAt) {
          const day = new Date(q.completedAt).toISOString().slice(0, 10);
          completionsByDay[day] = (completionsByDay[day] || 0) + 1;
        }
      });
      const heatmap = heatmapDays.map(date => ({ date, count: completionsByDay[date] || 0 }));

      let longestStreak = 0;
      let currentRun = 0;
      let longestStart = "";
      let longestEnd = "";
      let runStart = "";
      for (const date of heatmapDays) {
        if ((completionsByDay[date] || 0) > 0) {
          if (currentRun === 0) runStart = date;
          currentRun++;
          if (currentRun > longestStreak) {
            longestStreak = currentRun;
            longestStart = runStart;
            longestEnd = date;
          }
        } else {
          currentRun = 0;
        }
      }

      const activeDays = heatmapDays.filter(d => (completionsByDay[d] || 0) > 0).length;
      const totalCompleted = allQuests.filter(q => q.completed).length;

      const ritualQuests = allQuests.filter(q => q.isRitualized && q.parentRitualId);
      const ritualGroups: Record<number, typeof ritualQuests> = {};
      ritualQuests.forEach(q => {
        const pid = q.parentRitualId!;
        if (!ritualGroups[pid]) ritualGroups[pid] = [];
        ritualGroups[pid].push(q);
      });
      const parentRituals = allQuests.filter(q => q.isRitualized && !q.parentRitualId);
      parentRituals.forEach(p => {
        if (!ritualGroups[p.id]) ritualGroups[p.id] = [];
      });

      const habitStreaks = Object.entries(ritualGroups).map(([parentIdStr, instances]) => {
        const parentId = parseInt(parentIdStr);
        const parent = allQuests.find(q => q.id === parentId);
        const title = parent?.title || instances[0]?.title || "Unknown Habit";
        const category = parent?.category || instances[0]?.category || "general";
        const frequency = parent?.repeatFrequency || instances[0]?.repeatFrequency || "daily";

        const completedInstances = instances
          .filter(q => q.completed && q.completedAt)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

        const completedDates = Array.from(new Set(completedInstances.map(q => new Date(q.completedAt!).toISOString().slice(0, 10)))).sort().reverse();

        let streak = 0;
        if (completedDates.length > 0) {
          const todayStr = today.toISOString().slice(0, 10);
          const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          if (completedDates[0] === todayStr || completedDates[0] === yesterdayStr) {
            streak = 1;
            for (let i = 1; i < completedDates.length; i++) {
              const prev = new Date(completedDates[i - 1] + "T00:00:00");
              const curr = new Date(completedDates[i] + "T00:00:00");
              const diff = (prev.getTime() - curr.getTime()) / 86400000;
              if (diff === 1) streak++;
              else break;
            }
          }
        }

        return {
          id: parentId,
          title,
          category,
          frequency,
          currentStreak: streak,
          totalCompleted: completedInstances.length,
          totalInstances: instances.length,
          lastCompleted: completedDates[0] || null,
        };
      }).filter(h => h.totalInstances > 0).sort((a, b) => b.currentStreak - a.currentStreak);

      const last30 = heatmapDays.slice(-30);
      const weeklyActivity: { week: string; missions: number }[] = [];
      for (let i = 0; i < last30.length; i += 7) {
        const chunk = last30.slice(i, i + 7);
        const missions = chunk.reduce((s, d) => s + (completionsByDay[d] || 0), 0);
        const label = new Date(chunk[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        weeklyActivity.push({ week: label, missions });
      }

      res.json({
        currentStreak,
        longestStreak,
        longestStreakStart: longestStart,
        longestStreakEnd: longestEnd,
        activeDays,
        totalCompleted,
        heatmap,
        habitStreaks,
        weeklyActivity,
      });
    } catch (error) {
      logger.error("Error fetching streaks:", error);
      res.status(500).json({ error: "Failed to fetch streaks" });
    }
  });
}
