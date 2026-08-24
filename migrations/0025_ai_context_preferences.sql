ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "ai_context_preferences" jsonb NOT NULL DEFAULT '{"planning":true,"identity":false,"dailyState":false,"conversationHistory":false}'::jsonb;
