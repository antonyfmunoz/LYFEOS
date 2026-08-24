INSERT INTO "mission_contracts" (
  "user_id", "quest_id", "purpose", "expected_output", "capability_targets",
  "prerequisites", "required_evidence", "review_mode", "risk_level", "stop_conditions", "state"
)
SELECT DISTINCT
  q."user_id",
  q."id",
  'Practice the skills linked to this mission.',
  'Record what happened while completing ' || q."title" || '.',
  '[]'::jsonb,
  '[]'::jsonb,
  '["A short observation or artifact showing what happened."]'::jsonb,
  'self',
  'low',
  '[]'::jsonb,
  'accepted'
FROM "quests" q
INNER JOIN "quest_skill_contributions" c ON c."quest_id" = q."id" AND c."user_id" = q."user_id"
LEFT JOIN "mission_contracts" contract ON contract."quest_id" = q."id"
WHERE contract."id" IS NULL;
