ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "reminder_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "name_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "amount_snapshot" real;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "unit_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "time_of_day_snapshot" text;

UPDATE "supplement_schedule_events" AS e
SET "name_snapshot" = s."name",
    "amount_snapshot" = s."amount",
    "unit_snapshot" = s."unit",
    "time_of_day_snapshot" = s."time_of_day"
FROM "supplement_schedules" AS s
WHERE e."schedule_id" = s."id" AND e."name_snapshot" IS NULL;

ALTER TABLE "supplement_schedule_events" ALTER COLUMN "name_snapshot" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "supplement_schedule_events_user_date_idx" ON "supplement_schedule_events" ("user_id", "date");
