CREATE TABLE "smart_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reminder_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'default' NOT NULL,
	"preferred_hour" integer DEFAULT 9 NOT NULL,
	"preferred_days" text[] DEFAULT '{"mon","tue","wed","thu","fri","sat","sun"}' NOT NULL,
	"cooldown_hours" integer DEFAULT 20 NOT NULL,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "vision_goals" ADD COLUMN "disconnected_mission_ids" integer[];--> statement-breakpoint
ALTER TABLE "smart_reminders" ADD CONSTRAINT "smart_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "smart_reminders_user_type_idx" ON "smart_reminders" USING btree ("user_id","reminder_type");