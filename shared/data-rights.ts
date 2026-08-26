export const LYFEOS_DATA_RIGHTS_VERSION = "lyfeos.data-rights.v3" as const;

export type DataAccessModel = "owner_private" | "purpose_bound_participants" | "restricted_operations" | "provider_managed";
export type DataRetentionPolicy = "until_owner_deletes" | "owner_configurable" | "short_lived" | "shared_record_lifecycle" | "provider_policy";

export type LyfeOSDataClass = {
  id: string;
  label: string;
  sensitivity: "standard" | "sensitive" | "highly_sensitive";
  purpose: string;
  examples: string[];
  access: DataAccessModel;
  retention: DataRetentionPolicy;
  retentionDetail: string;
  rights: {
    export: boolean;
    erase: boolean;
    revoke: boolean;
  };
  rightsDetail: string;
};

// This is a factual product contract, not a substitute for approved legal
// terms. Entries describe current LyfeOS behavior and deliberately distinguish
// local records from shared conversations, operational evidence, and provider
// systems that LyfeOS cannot erase unilaterally.
export const LYFEOS_DATA_CLASSES: readonly LyfeOSDataClass[] = [
  {
    id: "account_identity",
    label: "Account and identity",
    sensitivity: "sensitive",
    purpose: "Authenticate the owner, secure the account, and present the owner's chosen profile.",
    examples: ["email", "username", "profile fields", "authentication-provider reference"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Local account records remain until account deletion. Authentication-provider records follow the provider account lifecycle.",
    rights: { export: true, erase: true, revoke: false },
    rightsDetail: "The self-service export excludes passwords, reset codes, verification codes, and provider credentials. Account deletion removes the linked authentication-provider user before local erasure.",
  },
  {
    id: "personal_context",
    label: "Personal context and reflection",
    sensitivity: "highly_sensitive",
    purpose: "Let the owner describe current capacity, goals, identity, reflections, habits, and desired direction.",
    examples: ["onboarding answers", "daily logs", "goals", "journal context", "planning snapshots"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Retained as owner-authored history until the owner removes the relevant record or account.",
    rights: { export: true, erase: true, revoke: false },
    rightsDetail: "Included in account export and erased with its owning record or the account.",
  },
  {
    id: "missions_progression",
    label: "Missions, evidence, and progression",
    sensitivity: "sensitive",
    purpose: "Coordinate real-world action and preserve an inspectable explanation of activity, reviewed competence, rank, XP, and badges.",
    examples: ["missions", "mission contracts", "evidence", "reviews", "skill events", "badge events", "Projects"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Canonical and reversal history remains append-only while the account exists so current progression stays explainable.",
    rights: { export: true, erase: true, revoke: false },
    rightsDetail: "History is portable and is removed on account deletion; corrections use linked reversals instead of rewriting prior evidence.",
  },
  {
    id: "ai_memory_actions",
    label: "AI memory and governed actions",
    sensitivity: "highly_sensitive",
    purpose: "Personalize owner-requested assistance and retain source, approval, outcome, and repair receipts for governed AI actions.",
    examples: ["AI conversations", "assistant profile", "context-source receipts", "action approvals", "repair receipts"],
    access: "owner_private",
    retention: "owner_configurable",
    retentionDetail: "Chat, context-receipt, and action-receipt retention is owner-configurable within the supported bounds.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "The owner can erase separate memory scopes, reject pending actions, disable cross-product memory, and delete the account.",
  },
  {
    id: "relationships_messages",
    label: "Relationships and native Messages",
    sensitivity: "highly_sensitive",
    purpose: "Support private relationship reflection and consent-bound conversations without turning personal context into outreach automation.",
    examples: ["relationship notes", "assessments", "check-ins", "conversation messages", "delivery receipts", "attachments"],
    access: "purpose_bound_participants",
    retention: "shared_record_lifecycle",
    retentionDetail: "Private relationship records follow the owner account. Conversation history is also scoped to its current participants and shared conversation lifecycle.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Owners can revoke relationship-sharing consent and remove their account participation. Account deletion cannot erase another participant's independent account or lawful copy of a shared message.",
  },
  {
    id: "consent_bound_collaboration",
    label: "Team and coach collaboration",
    sensitivity: "sensitive",
    purpose: "Coordinate with invited LyfeOS members through owner-selected, purpose-bound Mission or Thread projections.",
    examples: ["workspace membership", "invitation purpose", "Mission summary grant", "Thread status grant", "revocation audit"],
    access: "purpose_bound_participants",
    retention: "shared_record_lifecycle",
    retentionDetail: "Membership metadata follows the workspace lifecycle. Visibility grants expire within one year or end immediately when revoked, a recipient leaves, or membership is revoked.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Membership alone grants no personal-record access. The owner can revoke each projection or membership; export includes collaboration metadata, while source Health, finance, relationship, journal, message, AI-memory, and evidence records are never copied into collaboration storage.",
  },
  {
    id: "workspace_content",
    label: "Workspace content",
    sensitivity: "sensitive",
    purpose: "Store the owner's documents, Sheets, Canvases, Tables, Forms, media, views, Projects, and automation receipts.",
    examples: ["documents", "spreadsheets", "Canvases", "Tables", "Form responses", "media", "automation history"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Retained until the owner deletes the record or account; immutable revisions remain only while their owning account exists.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Account export includes owned records and safe access-grant metadata. External Form grants can be revoked independently; their secrets are never exported.",
  },
  {
    id: "health_fitness",
    label: "Health and fitness",
    sensitivity: "highly_sensitive",
    purpose: "Track owner-entered nutrition, training, body, recovery, sleep, activity, labs, targets, and source provenance without claiming medical diagnosis.",
    examples: ["nutrition diary", "workout sets", "body measurements", "sleep", "recovery activities", "observations", "source records"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Health records remain local until selective Health deletion or account deletion. Short-lived deletion receipts expire under the Health cleanup policy.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Health has a separate export/delete surface. Connections and planning handoffs are revocable, and credential references are excluded from export.",
  },
  {
    id: "personal_finance",
    label: "Personal finance",
    sensitivity: "highly_sensitive",
    purpose: "Let the owner track accounts, balances, cash flow, budgets, and financial goals without treating Wealth Tokens as money or giving financial advice.",
    examples: ["manual account balances", "transactions", "budgets", "financial goals", "balance history"],
    access: "owner_private",
    retention: "until_owner_deletes",
    retentionDetail: "Local financial records remain private until the owner removes the applicable record or account. Future provider-held copies follow the provider policy.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Personal finance records are included in account export and erased with account deletion. A future bank connection must be independently revocable, and provider credentials must never enter export.",
  },
  {
    id: "integrations_federation",
    label: "Integrations and ecosystem sharing",
    sensitivity: "sensitive",
    purpose: "Reconcile explicitly connected providers and send only purpose-bound, consented LyfeOS projections to configured ecosystem receivers.",
    examples: ["connection status", "consent scopes", "sync state", "UMH commands", "outbox receipts", "work links"],
    access: "restricted_operations",
    retention: "until_owner_deletes",
    retentionDetail: "Local consent, reconciliation, and audit records remain until revocation, disconnect, or account deletion. Provider-side records follow provider policy.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "The owner can revoke or disconnect supported connections. Exports omit tokens, opaque cursors, and signing credentials; remote copies remain governed by the receiving provider.",
  },
  {
    id: "security_operations",
    label: "Security and operational evidence",
    sensitivity: "sensitive",
    purpose: "Protect sessions, diagnose failures, enforce abuse controls, and prove release and recovery behavior.",
    examples: ["session state", "request identifiers", "structured error events", "security audit receipts"],
    access: "restricted_operations",
    retention: "short_lived",
    retentionDetail: "Sessions expire on their configured lifecycle. Monitoring and infrastructure evidence follows the configured service retention and incident policy.",
    rights: { export: false, erase: false, revoke: false },
    rightsDetail: "Operational systems are intentionally separated from the portable product record. Sentry is configured without default PII; approved retention and deletion operations remain provider/operations responsibilities.",
  },
  {
    id: "product_analytics",
    label: "Optional product analytics",
    sensitivity: "sensitive",
    purpose: "Measure coarse LyfeOS adoption, navigation, and completion funnels only after the owner explicitly opts in.",
    examples: ["coarse area viewed", "mission lifecycle milestone", "onboarding completion", "random analytics subject"],
    access: "restricted_operations",
    retention: "owner_configurable",
    retentionDetail: "Capture is off by default. Withdrawal stops capture, retires the random subject, and queues provider-side person and event deletion.",
    rights: { export: true, erase: true, revoke: true },
    rightsDetail: "Consent receipts are included in account export. No message, mission, Health, profile, or journal content is collected. Re-enabling creates a new random subject rather than reusing one queued for deletion.",
  },
  {
    id: "external_providers",
    label: "External provider records",
    sensitivity: "sensitive",
    purpose: "Provide authentication or an explicitly enabled third-party capability under that provider's own account and service contract.",
    examples: ["Clerk account", "Google account permissions", "future licensed catalog records"],
    access: "provider_managed",
    retention: "provider_policy",
    retentionDetail: "The external provider controls its own retention. LyfeOS stores only the bounded local references and state needed for an enabled connection.",
    rights: { export: false, erase: false, revoke: true },
    rightsDetail: "LyfeOS can request supported disconnect, revocation, or linked-account deletion, but provider-held data rights must also be exercised with that provider.",
  },
] as const;

export const LYFEOS_DATA_RIGHTS = {
  version: LYFEOS_DATA_RIGHTS_VERSION,
  scope: "current_product_behavior",
  legalStatus: "product_contract_not_approved_legal_policy",
  accountDeletion: {
    local: "transactional_erasure",
    authenticationProvider: "delete_requested_before_local_erasure",
    sharedRecords: "other_participants_and_external_copies_are_not_unilaterally_erased",
    productAnalytics: "capture_stops_and_provider_deletion_is_queued_before_local_erasure",
  },
  classes: LYFEOS_DATA_CLASSES,
} as const;
