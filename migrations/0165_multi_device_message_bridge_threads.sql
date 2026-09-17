-- The release runner creates the device-bridge tables immediately before this
-- migration. Keep raw-history application safe for older snapshots where those
-- tables are not yet present; the release entry applies the same change after
-- creating the bridge tables.
DO $$
BEGIN
  IF to_regclass('public.message_bridge_threads') IS NOT NULL THEN
    ALTER TABLE "message_bridge_threads" DROP CONSTRAINT IF EXISTS "message_bridge_threads_conversation_unique";
    DROP INDEX IF EXISTS "message_bridge_threads_conversation_unique";
    CREATE UNIQUE INDEX IF NOT EXISTS "message_bridge_threads_device_conversation_unique" ON "message_bridge_threads" ("device_id", "conversation_id");
  END IF;
END $$;
