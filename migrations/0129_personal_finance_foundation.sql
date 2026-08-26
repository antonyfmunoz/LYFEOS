CREATE TABLE IF NOT EXISTS "finance_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "account_type" text NOT NULL,
  "currency" varchar(3) NOT NULL,
  "balance_minor" bigint NOT NULL DEFAULT 0,
  "include_in_net_worth" boolean NOT NULL DEFAULT true,
  "source" text NOT NULL DEFAULT 'manual',
  "provider_account_ref" text,
  "status" text NOT NULL DEFAULT 'active',
  "version" integer NOT NULL DEFAULT 1,
  "balance_updated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "finance_accounts_type_valid" CHECK ("account_type" IN ('cash','checking','savings','investment','property','credit','loan','other_asset','other_liability')),
  CONSTRAINT "finance_accounts_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "finance_accounts_source_valid" CHECK ("source" IN ('manual','plaid','import')),
  CONSTRAINT "finance_accounts_status_valid" CHECK ("status" IN ('active','closed')),
  CONSTRAINT "finance_accounts_version_valid" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "finance_accounts_user_status_idx" ON "finance_accounts" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "finance_accounts_user_provider_ref_unique_idx" ON "finance_accounts" ("user_id", "source", "provider_account_ref") WHERE "provider_account_ref" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "finance_balance_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" integer NOT NULL REFERENCES "finance_accounts"("id") ON DELETE CASCADE,
  "balance_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "observed_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "finance_balance_snapshots_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "finance_balance_snapshots_source_valid" CHECK ("source" IN ('manual','plaid','import'))
);
CREATE INDEX IF NOT EXISTS "finance_balance_snapshots_user_currency_observed_idx" ON "finance_balance_snapshots" ("user_id", "currency", "observed_at");

CREATE TABLE IF NOT EXISTS "finance_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" integer NOT NULL REFERENCES "finance_accounts"("id") ON DELETE CASCADE,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "transaction_date" date NOT NULL,
  "description" varchar(240) NOT NULL,
  "category" varchar(80) NOT NULL,
  "status" text NOT NULL DEFAULT 'posted',
  "source" text NOT NULL DEFAULT 'manual',
  "provider_transaction_ref" text,
  "client_mutation_id" text,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "finance_transactions_amount_valid" CHECK ("amount_minor" <> 0),
  CONSTRAINT "finance_transactions_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "finance_transactions_status_valid" CHECK ("status" IN ('pending','posted')),
  CONSTRAINT "finance_transactions_source_valid" CHECK ("source" IN ('manual','plaid','import')),
  CONSTRAINT "finance_transactions_version_valid" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "finance_transactions_user_date_idx" ON "finance_transactions" ("user_id", "transaction_date" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "finance_transactions_user_account_date_idx" ON "finance_transactions" ("user_id", "account_id", "transaction_date" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_user_mutation_unique_idx" ON "finance_transactions" ("user_id", "client_mutation_id") WHERE "client_mutation_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "finance_transactions_user_provider_ref_unique_idx" ON "finance_transactions" ("user_id", "source", "provider_transaction_ref") WHERE "provider_transaction_ref" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "finance_budgets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "category" varchar(80) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "limit_minor" bigint NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "finance_budgets_month_valid" CHECK (date_trunc('month', "month"::timestamp)::date = "month"),
  CONSTRAINT "finance_budgets_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "finance_budgets_limit_valid" CHECK ("limit_minor" > 0),
  CONSTRAINT "finance_budgets_version_valid" CHECK ("version" > 0),
  CONSTRAINT "finance_budgets_user_month_category_currency_unique" UNIQUE ("user_id", "month", "category", "currency")
);

CREATE TABLE IF NOT EXISTS "finance_goals" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "goal_type" text NOT NULL,
  "currency" varchar(3) NOT NULL,
  "target_minor" bigint NOT NULL,
  "current_minor" bigint NOT NULL DEFAULT 0,
  "target_date" date,
  "status" text NOT NULL DEFAULT 'active',
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "finance_goals_type_valid" CHECK ("goal_type" IN ('savings','emergency_fund','debt_paydown','net_worth','other')),
  CONSTRAINT "finance_goals_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "finance_goals_target_valid" CHECK ("target_minor" > 0),
  CONSTRAINT "finance_goals_current_valid" CHECK ("current_minor" >= 0),
  CONSTRAINT "finance_goals_status_valid" CHECK ("status" IN ('active','completed','archived')),
  CONSTRAINT "finance_goals_version_valid" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "finance_goals_user_status_idx" ON "finance_goals" ("user_id", "status");
