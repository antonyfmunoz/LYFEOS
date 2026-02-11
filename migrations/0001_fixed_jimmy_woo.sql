CREATE TABLE "dismissed_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"author" text NOT NULL,
	"source_material" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vision_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"completed" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "widget_states_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "time_tokens_current" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "energy_points_current" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "health_points_current" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "attention_tokens_current" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "attention_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "time_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "start_time" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "end_date" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "due_date" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "notification_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "notification_time" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "notifications" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "difficulty" text DEFAULT 'D';--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "is_ritualized" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "repeat_frequency" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "repeat_interval" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "repeat_days" text[];--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "repeat_end_date" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "parent_ritual_id" integer;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "wake_time" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "sleep_time" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "mental_state" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "physical_state" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "emotional_state" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "gratitude" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "tomorrow_goals" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "annual_goals" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "thoughts" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "content_consumed" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "research" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "todo_ideas" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "source_author" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "source_material" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "research_note" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "revision_note" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "execution_note" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "research_entries" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "todos_converted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "went_well" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "could_be_better" text;--> statement-breakpoint
ALTER TABLE "user_daily_logs" ADD COLUMN "learned" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "birthday" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "vision_90_day_metric" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "vision_18_month_metric" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "vision_5_year_chip" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "vision_10_year" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "legacy_metric" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "mortality_insights" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "life_domains" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "financial_constraints" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "money_confidence" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "money_relationship" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "physical_environment_impact" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "coping_essential" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "dominant_instinct" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "decision_making_styles" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "decision_making_primary" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "life_roles" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "defining_role" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "relationship_drains" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "conflict_style" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "money_memory" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "financial_security" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "financial_habits" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "completed_onboarding_missions" integer[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "last_active_date" date;--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "previous_day_energy_used" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_email_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_email_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_phone_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_phone_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "dismissed_knowledge" ADD CONSTRAINT "dismissed_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_goals" ADD CONSTRAINT "vision_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_states" ADD CONSTRAINT "widget_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_daily_logs_user_date_idx" ON "user_daily_logs" USING btree ("user_id","date");--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id");