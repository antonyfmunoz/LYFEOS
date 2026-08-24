ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "brand" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "form" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "lot_number" text;
ALTER TABLE "supplement_entries" ADD COLUMN IF NOT EXISTS "expires_on" date;

ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "brand" text;
ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "form" text;
ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "lot_number" text;
ALTER TABLE "supplement_schedules" ADD COLUMN IF NOT EXISTS "expires_on" date;

ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "brand_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "manufacturer_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "form_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "barcode_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "lot_number_snapshot" text;
ALTER TABLE "supplement_schedule_events" ADD COLUMN IF NOT EXISTS "expires_on_snapshot" date;

UPDATE "supplement_schedule_events" AS e
SET "brand_snapshot" = s."brand",
    "manufacturer_snapshot" = s."manufacturer",
    "form_snapshot" = s."form",
    "barcode_snapshot" = s."barcode",
    "lot_number_snapshot" = s."lot_number",
    "expires_on_snapshot" = s."expires_on"
FROM "supplement_schedules" AS s
WHERE e."schedule_id" = s."id";

CREATE INDEX IF NOT EXISTS "supplement_entries_user_barcode_idx" ON "supplement_entries" ("user_id", "barcode");
CREATE INDEX IF NOT EXISTS "supplement_schedules_user_barcode_idx" ON "supplement_schedules" ("user_id", "barcode");
