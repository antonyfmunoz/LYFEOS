-- Food-review standards govern presentation and confirmation workflow only.
-- They never convert a catalog record or OCR observation into certification.
CREATE TABLE IF NOT EXISTS "food_review_preferences" (
  "user_id" integer PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kosher_package_confirmation" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
