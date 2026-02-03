CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"start_time" text NOT NULL,
	"duration" text NOT NULL,
	"category" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"job_title" text,
	"category" text DEFAULT 'personal' NOT NULL,
	"notes" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"last_contacted" timestamp,
	"birthday" date,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"folder_id" integer,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"format" text DEFAULT 'markdown' NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" integer,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_name" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"scope" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "kanban_boards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"start_date" text,
	"due_date" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_image_id" integer,
	"is_smart_album" boolean DEFAULT false NOT NULL,
	"smart_album_rules" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"album_id" integer,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_url" text,
	"file_data" text,
	"file_path" text,
	"thumbnail_url" text,
	"title" text,
	"description" text,
	"tags" text[],
	"is_favorite" boolean DEFAULT false NOT NULL,
	"date_taken" timestamp,
	"location" jsonb,
	"metadata" jsonb,
	"size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"xp_value" integer DEFAULT 5 NOT NULL,
	"tags" text[],
	"event_id" integer,
	"date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mission_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "progress_trackers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"target_value" integer NOT NULL,
	"unit" text DEFAULT '',
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"color" text DEFAULT '#00e0ff',
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general',
	"completed" boolean DEFAULT false NOT NULL,
	"energy_cost" integer DEFAULT 1 NOT NULL,
	"experience_reward" integer DEFAULT 10 NOT NULL,
	"auto_unlock_conditions" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spreadsheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" jsonb NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"format" text DEFAULT 'markdown' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"tags" text[],
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"yesterday_xp" integer DEFAULT 0,
	"today_primary_mission" text,
	"optional_boosts_shown" boolean DEFAULT false,
	"boosts_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"apple_health_connected" boolean DEFAULT false,
	"google_calendar_connected" boolean DEFAULT false,
	"notion_connected" boolean DEFAULT false,
	"other_integrations" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"age_range" text,
	"location" text,
	"timezone" text,
	"archetype_primary" text,
	"archetype_secondary" text,
	"archetype_shadow" text,
	"archetype_scores" jsonb DEFAULT '{}'::jsonb,
	"primary_instincts" jsonb DEFAULT '[]'::jsonb,
	"key_drivers" jsonb DEFAULT '[]'::jsonb,
	"shadow_distortions" jsonb DEFAULT '[]'::jsonb,
	"core_belief" text,
	"limiting_belief" text,
	"empowering_belief" text,
	"primary_values" jsonb DEFAULT '[]'::jsonb,
	"supporting_values" jsonb DEFAULT '[]'::jsonb,
	"self_standards" text,
	"others_standards" text,
	"typical_patterns" text,
	"habits" jsonb DEFAULT '[]'::jsonb,
	"urges" text,
	"trait_to_reprogram" text,
	"desired_trait" text,
	"strengths" jsonb DEFAULT '[]'::jsonb,
	"weaknesses" jsonb DEFAULT '[]'::jsonb,
	"life_stage" text,
	"desired_emotion" text,
	"vision_90_day" text,
	"vision_18_month" text,
	"vision_5_year" text,
	"vision_10_year_legacy" text,
	"current_goals" jsonb DEFAULT '[]'::jsonb,
	"learning_style" jsonb DEFAULT '{}'::jsonb,
	"integration_method" text,
	"past_deep_dives" jsonb DEFAULT '[]'::jsonb,
	"domains_of_competence" jsonb DEFAULT '[]'::jsonb,
	"current_deep_dive" jsonb DEFAULT '{}'::jsonb,
	"skill_stacking_pyramid" jsonb DEFAULT '{}'::jsonb,
	"knowledge_areas" jsonb DEFAULT '[]'::jsonb,
	"skills_to_acquire" jsonb DEFAULT '[]'::jsonb,
	"practice_cadence" jsonb DEFAULT '{}'::jsonb,
	"current_projects" jsonb DEFAULT '[]'::jsonb,
	"project_definition" text,
	"active_phase" text,
	"primary_craft" text,
	"primary_craft_why" text,
	"physical_metrics" jsonb DEFAULT '{}'::jsonb,
	"fitness_movement" jsonb DEFAULT '{}'::jsonb,
	"nutrition_recovery" jsonb DEFAULT '{}'::jsonb,
	"health_vitality" jsonb DEFAULT '{}'::jsonb,
	"health_baseline" jsonb DEFAULT '{}'::jsonb,
	"injuries" text,
	"career_vocation" text,
	"active_ventures" jsonb DEFAULT '[]'::jsonb,
	"financial_position" jsonb DEFAULT '{}'::jsonb,
	"weekly_capacity" jsonb DEFAULT '{}'::jsonb,
	"energy_drains" jsonb DEFAULT '[]'::jsonb,
	"resources" jsonb DEFAULT '{}'::jsonb,
	"physical_environment" text,
	"digital_environment" jsonb DEFAULT '[]'::jsonb,
	"collaboration_style" text,
	"role_orientation" text,
	"decision_orientation" text,
	"stress_response" text,
	"optimal_environment" text,
	"greatest_contribution" text,
	"aesthetic" text,
	"signature_expression" text,
	"creative_outlets" jsonb DEFAULT '[]'::jsonb,
	"shadow_patterns" jsonb DEFAULT '{}'::jsonb,
	"historical_context" jsonb DEFAULT '[]'::jsonb,
	"upbringing" text,
	"cultural_context" text,
	"key_experiences" jsonb DEFAULT '{}'::jsonb,
	"ideal_day" text,
	"locked_habit" text,
	"ideal_week" jsonb DEFAULT '{}'::jsonb,
	"yearly_cycles" jsonb DEFAULT '[]'::jsonb,
	"morning_rituals" jsonb DEFAULT '[]'::jsonb,
	"evening_rituals" jsonb DEFAULT '[]'::jsonb,
	"grounding_ritual" text,
	"boundaries" jsonb DEFAULT '{}'::jsonb,
	"emotions_to_cultivate" jsonb DEFAULT '[]'::jsonb,
	"coping_practices" text,
	"traits_to_cultivate" jsonb DEFAULT '[]'::jsonb,
	"belief_system" jsonb DEFAULT '{}'::jsonb,
	"character_affirmation" text,
	"onboarding_mission" integer DEFAULT 0,
	"onboarding_step" integer DEFAULT 0,
	"start_stage" text,
	"target_archetype" text,
	"flow_style" jsonb DEFAULT '{}'::jsonb,
	"core_motivation" text,
	"setup_mission_status" jsonb DEFAULT '{"archetype":"incomplete","integrations":"incomplete","future_self":"incomplete","rituals":"incomplete","pillars":"incomplete"}'::jsonb,
	"primary_theme_color" text DEFAULT '#00e0ff',
	"future_self_summary" text,
	"ai_personality_profile" jsonb DEFAULT '{}'::jsonb,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"time_tokens_current" integer DEFAULT 10 NOT NULL,
	"time_tokens_max" integer DEFAULT 100 NOT NULL,
	"energy_points_current" integer DEFAULT 10 NOT NULL,
	"energy_points_max" integer DEFAULT 100 NOT NULL,
	"health_points_current" integer DEFAULT 10 NOT NULL,
	"health_points_max" integer DEFAULT 100 NOT NULL,
	"attention_tokens_current" integer DEFAULT 10 NOT NULL,
	"attention_tokens_max" integer DEFAULT 100 NOT NULL,
	"experience_current" integer DEFAULT 0 NOT NULL,
	"experience_max" integer DEFAULT 1000 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"efficiency_score" integer DEFAULT 0 NOT NULL,
	"ai_assistant_name" text DEFAULT 'NOVA' NOT NULL,
	"notifications_enabled" boolean DEFAULT false NOT NULL,
	"dark_theme_enabled" boolean DEFAULT true NOT NULL,
	"auto_sync_enabled" boolean DEFAULT true NOT NULL,
	"ai_assistant_enabled" boolean DEFAULT true NOT NULL,
	"primary_color" text DEFAULT '#00e0ff' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_color" text DEFAULT '#00e0ff',
	"title" text DEFAULT 'COMMANDER',
	"profile_picture" text,
	"email" text,
	"phone_number" text,
	"auth_provider" text DEFAULT 'email',
	"firebase_uid" text,
	"terms_accepted" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphs" ADD CONSTRAINT "graphs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_boards" ADD CONSTRAINT "kanban_boards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_board_id_kanban_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."kanban_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD CONSTRAINT "kanban_tasks_board_id_kanban_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."kanban_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_albums" ADD CONSTRAINT "media_albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_album_id_media_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."media_albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_pages" ADD CONSTRAINT "mission_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_pages" ADD CONSTRAINT "mission_pages_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_trackers" ADD CONSTRAINT "progress_trackers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD CONSTRAINT "user_daily_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;