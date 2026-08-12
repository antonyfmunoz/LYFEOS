CREATE TABLE "umh_federation_installations" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "key_id" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_federation_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "umh_inbound_commands" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text NOT NULL,
  "nonce" text NOT NULL,
  "installation_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "local_user_id" integer NOT NULL,
  "capability" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "outcome" jsonb,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "umh_inbound_commands_command_id_unique" UNIQUE("command_id"),
  CONSTRAINT "umh_inbound_commands_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE "umh_approval_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text NOT NULL,
  "risk" text NOT NULL,
  "state" text DEFAULT 'not_required' NOT NULL,
  "rationale" text,
  "requested_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "umh_audit_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "command_id" text,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "local_user_id" integer,
  "correlation_id" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "umh_outbox_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "delivered_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_outbox_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "umh_inbound_commands" ADD CONSTRAINT "umh_inbound_commands_local_user_id_users_id_fk" FOREIGN KEY ("local_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_approval_requests" ADD CONSTRAINT "umh_approval_requests_command_id_umh_inbound_commands_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."umh_inbound_commands"("command_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD CONSTRAINT "umh_audit_records_command_id_umh_inbound_commands_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."umh_inbound_commands"("command_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD CONSTRAINT "umh_audit_records_local_user_id_users_id_fk" FOREIGN KEY ("local_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "umh_command_idempotency_idx" ON "umh_inbound_commands" USING btree ("installation_id","local_user_id","capability","idempotency_key");
