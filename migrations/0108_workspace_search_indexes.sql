CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "quests_workspace_search_fts_idx" ON "quests" USING gin
  (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "quests_workspace_search_title_trgm_idx" ON "quests" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "documents_workspace_search_fts_idx" ON "documents" USING gin
  (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '') || ' ' || COALESCE("content", '')));
CREATE INDEX IF NOT EXISTS "documents_workspace_search_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "spreadsheets_workspace_search_fts_idx" ON "spreadsheets" USING gin
  (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "spreadsheets_workspace_search_title_trgm_idx" ON "spreadsheets" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "canvases_workspace_search_fts_idx" ON "canvases" USING gin
  (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "canvases_workspace_search_title_trgm_idx" ON "canvases" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "workspace_databases_workspace_search_fts_idx" ON "workspace_databases" USING gin
  (to_tsvector('simple', COALESCE("title", '') || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "workspace_databases_workspace_search_title_trgm_idx" ON "workspace_databases" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "contacts_workspace_search_fts_idx" ON "contacts" USING gin
  (to_tsvector('simple', COALESCE("name", '') || ' ' || COALESCE("alias", '') || ' ' || COALESCE("company", '') || ' ' || COALESCE("job_title", '')));
CREATE INDEX IF NOT EXISTS "contacts_workspace_search_name_trgm_idx" ON "contacts" USING gin ("name" gin_trgm_ops);
