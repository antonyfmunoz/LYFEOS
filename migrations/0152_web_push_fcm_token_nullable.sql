-- Legacy Firebase device rows used a required token. Standards-based Web Push
-- uses endpoint/p256dh/auth instead, so a browser subscription has no FCM token.
-- Keeping this nullable preserves legacy rows while allowing either device shape.
ALTER TABLE "push_subscriptions" ALTER COLUMN "fcm_token" DROP NOT NULL;
