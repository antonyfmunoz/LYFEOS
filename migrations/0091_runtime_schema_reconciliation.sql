ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "wealth_tokens_current" integer NOT NULL DEFAULT 100;
ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "wealth_tokens_max" integer NOT NULL DEFAULT 100;
ALTER TABLE "user_stats" ALTER COLUMN "primary_color" SET DEFAULT '#ffffff';

ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "custom_reflection_prompts" jsonb DEFAULT '{"wentWell":"What went well today?","couldBeBetter":"What could have been better?","learned":"What did I learn?"}'::jsonb;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "blue_light_filter" boolean DEFAULT false;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "haptic_feedback" boolean DEFAULT true;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "sound_effects" boolean DEFAULT true;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "completed_tutorials" text[] DEFAULT ARRAY[]::text[];

ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "end_time" text;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "external_source" text;

ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'local';
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "external_url" text;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'local';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "external_url" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_type" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_data" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" integer;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "thumbnail_data" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE TABLE IF NOT EXISTS "ritual_groups" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "value" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "parent_group_value" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mission_views" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "view_type" text NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb,
  "columns" jsonb DEFAULT '[]'::jsonb,
  "sort_by" text,
  "sort_direction" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "ritual_group" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "linked_items" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "external_source" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "timezone" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "attendees" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "mission_status" text DEFAULT 'confirmed';
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "view_id" integer;
ALTER TABLE "quests" ADD COLUMN IF NOT EXISTS "view_column" text;

ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "fcm_token" text;

CREATE TABLE IF NOT EXISTS "waitlist_emails" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "referral_source" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
