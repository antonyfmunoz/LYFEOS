-- Food Compass stores owner-curated local sources separately from private
-- pantry data. Source and verification dates are mandatory for new records so
-- map/list discovery cannot imply current inventory, price, or fulfillment.
CREATE TABLE "food_compass_places" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "place_type" text NOT NULL,
  "address" text,
  "city" text,
  "region" text,
  "postal_code" text,
  "latitude" real,
  "longitude" real,
  "website_url" text,
  "source_name" text NOT NULL,
  "source_url" text,
  "source_updated_on" date,
  "verified_on" date,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "food_compass_places_type_valid" CHECK ("place_type" IN ('farm', 'market', 'grocery', 'restaurant', 'producer', 'other')),
  CONSTRAINT "food_compass_places_status_valid" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "food_compass_places_latitude_valid" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "food_compass_places_longitude_valid" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
);
CREATE INDEX "food_compass_places_user_status_updated_idx" ON "food_compass_places" ("user_id", "status", "updated_at");
CREATE INDEX "food_compass_places_user_type_idx" ON "food_compass_places" ("user_id", "place_type");

CREATE TABLE "food_compass_offers" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "place_id" integer NOT NULL REFERENCES "food_compass_places"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text,
  "price" real,
  "currency" text NOT NULL DEFAULT 'USD',
  "availability_status" text NOT NULL DEFAULT 'unknown',
  "fulfillment_mode" text NOT NULL DEFAULT 'unknown',
  "external_action_url" text,
  "source_name" text NOT NULL,
  "source_url" text,
  "source_updated_on" date,
  "verified_on" date,
  "notes" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "food_compass_offers_availability_valid" CHECK ("availability_status" IN ('available', 'limited', 'unavailable', 'unknown')),
  CONSTRAINT "food_compass_offers_fulfillment_valid" CHECK ("fulfillment_mode" IN ('pickup', 'delivery', 'shipping', 'in_store', 'unknown')),
  CONSTRAINT "food_compass_offers_status_valid" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "food_compass_offers_price_valid" CHECK ("price" IS NULL OR "price" >= 0)
);
CREATE INDEX "food_compass_offers_user_status_updated_idx" ON "food_compass_offers" ("user_id", "status", "updated_at");
CREATE INDEX "food_compass_offers_place_status_idx" ON "food_compass_offers" ("place_id", "status");
CREATE INDEX "food_compass_offers_user_fulfillment_idx" ON "food_compass_offers" ("user_id", "fulfillment_mode");

CREATE TABLE "food_compass_correction_reports" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "place_id" integer REFERENCES "food_compass_places"("id") ON DELETE SET NULL,
  "offer_id" integer REFERENCES "food_compass_offers"("id") ON DELETE SET NULL,
  "report_type" text NOT NULL,
  "note" text,
  "evidence_url" text,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "food_compass_correction_reports_type_valid" CHECK ("report_type" IN ('stale', 'correction', 'closed', 'missing')),
  CONSTRAINT "food_compass_correction_reports_status_valid" CHECK ("status" IN ('open', 'withdrawn'))
);
CREATE INDEX "food_compass_correction_reports_user_created_idx" ON "food_compass_correction_reports" ("user_id", "created_at");
