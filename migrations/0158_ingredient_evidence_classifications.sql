-- The scanner's reviewed evidence catalog deliberately uses factual label
-- identities. The original foundation constraint predated those identities,
-- which made a valid reviewed label crash the request instead of returning a
-- bounded error. Keep the database vocabulary in lockstep with the catalog.
ALTER TABLE "ingredient_scan_items"
  DROP CONSTRAINT IF EXISTS "ingredient_scan_items_classification_valid";

ALTER TABLE "ingredient_scan_items"
  ADD CONSTRAINT "ingredient_scan_items_classification_valid"
  CHECK ("classification" IN (
    'unknown',
    'label_fact',
    'preference_match',
    'regulatory_notice',
    'declared_major_allergen_label_term',
    'declared_color_additive',
    'declared_sulfiting_agent',
    'declared_non_nutritive_sweetener',
    'declared_caffeine_source',
    'declared_partially_hydrogenated_oil'
  ));

ALTER TABLE "ingredient_scan_items"
  DROP CONSTRAINT IF EXISTS "ingredient_scan_items_evidence_strength_valid";

ALTER TABLE "ingredient_scan_items"
  ADD CONSTRAINT "ingredient_scan_items_evidence_strength_valid"
  CHECK ("evidence_strength" IN ('unverified', 'source_supplied', 'curated', 'regulatory_identity'));
