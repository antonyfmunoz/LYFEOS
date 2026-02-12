ALTER TABLE "contacts" ADD COLUMN "alias" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "secondary_phone" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "relationship_type" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "twitter" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "how_met" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "trust_level" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "strengths" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_frequency" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;