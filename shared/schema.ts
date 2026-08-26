import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date, varchar, uuid, index, uniqueIndex, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Users table (Core Account Information)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // Original fields
  password: text("password"),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  bio: varchar("bio", { length: 500 }),
  avatarColor: text("avatar_color").default("#00e0ff"),
  title: text("title").default("COMMANDER"),
  profilePicture: text("profile_picture"),
  avatarUrl: text("avatar_url"),

  // New V2 fields
  email: text("email"), // Email (or blank if using OAuth)
  phoneNumber: text("phone_number"), // Phone number for contact
  authProvider: text("auth_provider").default("email"), // ("email", "google", "apple", "facebook")
  firebaseUid: text("firebase_uid"), // Firebase UID for Firebase-authenticated users
  clerkId: text("clerk_id").unique(), // Clerk user ID for Clerk-authenticated users
  termsAccepted: boolean("terms_accepted").default(false),
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  twoFactorEmailCode: text("two_factor_email_code"),
  twoFactorEmailExpiry: timestamp("two_factor_email_expiry"),
  twoFactorPhoneCode: text("two_factor_phone_code"),
  twoFactorPhoneExpiry: timestamp("two_factor_phone_expiry"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// User Stats table
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  timeTokensCurrent: integer("time_tokens_current").notNull().default(100),
  timeTokensMax: integer("time_tokens_max").notNull().default(100),
  energyPointsCurrent: integer("energy_points_current").notNull().default(100),
  energyPointsMax: integer("energy_points_max").notNull().default(100),
  healthPointsCurrent: integer("health_points_current").notNull().default(100),
  healthPointsMax: integer("health_points_max").notNull().default(100),
  wealthTokensCurrent: integer("wealth_tokens_current").notNull().default(100),
  wealthTokensMax: integer("wealth_tokens_max").notNull().default(100),
  attentionTokensCurrent: integer("attention_tokens_current").notNull().default(100),
  attentionTokensMax: integer("attention_tokens_max").notNull().default(100),
  experienceCurrent: integer("experience_current").notNull().default(0),
  experienceMax: integer("experience_max").notNull().default(1000), // Level 1 threshold is 1000 XP
  level: integer("level").notNull().default(1),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  previousDayEnergyUsed: integer("previous_day_energy_used").default(0),
  efficiencyScore: integer("efficiency_score").notNull().default(0),
  aiAssistantName: text("ai_assistant_name").default("NOVA").notNull(),
  // System settings
  notificationsEnabled: boolean("notifications_enabled").default(false).notNull(),
  darkThemeEnabled: boolean("dark_theme_enabled").default(true).notNull(),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  aiAssistantEnabled: boolean("ai_assistant_enabled").default(true).notNull(),
  primaryColor: text("primary_color").default("#ffffff").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Profile Table (All Onboarding Answers + Player Record)
export const userProfile = pgTable("user_profile", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  
  // === MISSION 0: ACCESS & QUICKSTART ===
  ageRange: text("age_range"), // ("18-24", "25-34", "35-44", "45-54", "55-64", "65+")
  birthday: text("birthday"), // ISO date string "YYYY-MM-DD"
  location: text("location"), // Optional location text
  timezone: text("timezone"), // IANA timezone string
  
  // === MISSION 1: ARCHETYPE CALIBRATION ===
  archetypePrimary: text("archetype_primary"), // ("Warrior", "Architect", "Creator", "Monarch", "Oracle", "Alchemist")
  archetypeSecondary: text("archetype_secondary"),
  archetypeShadow: text("archetype_shadow"),
  archetypeScores: jsonb("archetype_scores").default({}), // { warrior: X, architect: X, creator: X, monarch: X, oracle: X, alchemist: X }
  
  // === SECTION 1: IDENTITY ===
  primaryInstincts: jsonb("primary_instincts").default([]), // Array of instincts
  keyDrivers: jsonb("key_drivers").default([]), // Array of drivers
  shadowDistortions: jsonb("shadow_distortions").default([]), // Array of shadow patterns
  
  // === SECTION 2: PERSONALITY ===
  coreBelief: text("core_belief"),
  limitingBelief: text("limiting_belief"),
  empoweringBelief: text("empowering_belief"),
  primaryValues: jsonb("primary_values").default([]), // Array of top 3 values
  supportingValues: jsonb("supporting_values").default([]), // Additional values
  selfStandards: text("self_standards"), // Standards held for self
  othersStandards: text("others_standards"), // Standards expected of others
  typicalPatterns: text("typical_patterns"), // Behavioral patterns
  habits: jsonb("habits").default([]), // Array of habits
  urges: text("urges"), // Urges/impulses
  traitToReprogram: text("trait_to_reprogram"),
  desiredTrait: text("desired_trait"),
  strengths: jsonb("strengths").default([]), // Array of strengths
  weaknesses: jsonb("weaknesses").default([]), // Array of weaknesses
  
  // === SECTION 3: VISION & GOALS ===
  lifeStage: text("life_stage"), // ("Awakening", "Building", "Mastering", "Leading")
  desiredEmotion: text("desired_emotion"), // ("Flow", "Peace", "Joy", "Power", "Love", "Purpose")
  vision90Day: text("vision_90_day"),
  vision90DayMetric: text("vision_90_day_metric"),
  vision18Month: text("vision_18_month"),
  vision18MonthMetric: text("vision_18_month_metric"),
  vision5Year: text("vision_5_year"),
  vision5YearChip: text("vision_5_year_chip"),
  vision10Year: text("vision_10_year"),
  vision10YearLegacy: text("vision_10_year_legacy"),
  legacyMetric: text("legacy_metric"),
  mortalityInsights: jsonb("mortality_insights").default({}), // { reflection: "", takeaway: "" }
  lifeDomains: jsonb("life_domains").default([]), // Ordered array of domain strings
  currentGoals: jsonb("current_goals").default([]), // Array of current goals
  
  // === SECTION 4: LEARNING & SKILLS ===
  learningStyle: jsonb("learning_style").default({}), // { visual: X, auditory: X, reading: X, kinesthetic: X }
  integrationMethod: text("integration_method"),
  pastDeepDives: jsonb("past_deep_dives").default([]), // Array of past research topics
  domainsOfCompetence: jsonb("domains_of_competence").default([]),
  currentDeepDive: jsonb("current_deep_dive").default({}), // { question: "", purpose: "", successCriteria: "" }
  skillStackingPyramid: jsonb("skill_stacking_pyramid").default({}), // { vocational: "", evolutionary: [], resonant: [], staticFoundational: [], seasonalFoundational: [] }
  knowledgeAreas: jsonb("knowledge_areas").default([]),
  skillsToAcquire: jsonb("skills_to_acquire").default([]),
  practiceCadence: jsonb("practice_cadence").default({}), // { hoursPerWeek: X, note: "" }
  
  // === SECTION 5: PROJECTS & CREATIONS ===
  currentProjects: jsonb("current_projects").default([]), // Array of { name, doneWhen }
  projectDefinition: text("project_definition"),
  activePhase: text("active_phase"),
  primaryCraft: text("primary_craft"),
  primaryCraftWhy: text("primary_craft_why"),
  
  // === SECTION 6: BODY & HEALTH ===
  physicalMetrics: jsonb("physical_metrics").default({}), // { height: "", weight: "", bodyType: "", distinctiveFeatures: "" }
  fitnessMovement: jsonb("fitness_movement").default({}), // { trainingStyle: "", movementPractices: [] }
  nutritionRecovery: jsonb("nutrition_recovery").default({}), // { nutritionalApproach: "", recoveryPractices: [], stressRecoveryStyle: "" }
  healthVitality: jsonb("health_vitality").default({}), // { conditions: [], energyPatterns: "", somaticAwareness: "", longevityFocus: [] }
  healthBaseline: jsonb("health_baseline").default({}), // { sleep: X, exercise: X, nutrition: X, priority: "" }
  injuries: text("injuries"),
  
  // === SECTION 7: WEALTH & WORK ===
  careerVocation: text("career_vocation"),
  activeVentures: jsonb("active_ventures").default([]),
  financialPosition: jsonb("financial_position").default({}), // { income: "", expenses: "", savings: "", debt: "" }
  financialConstraints: jsonb("financial_constraints").default([]),
  moneyConfidence: jsonb("money_confidence").default({}), // { score: 1-10, habitShift: "" }
  moneyRelationship: text("money_relationship"),
  weeklyCapacity: jsonb("weekly_capacity").default({}), // { hours: X, cap: "" }
  energyDrains: jsonb("energy_drains").default([]),
  resources: jsonb("resources").default({}), // { skills: bool, tools: bool, network: bool, financial: bool, time: bool }
  physicalEnvironment: text("physical_environment"),
  physicalEnvironmentImpact: text("physical_environment_impact"),
  digitalEnvironment: jsonb("digital_environment").default([]),
  
  // === SECTION 8: PERFORMANCE & CONTRIBUTION ===
  collaborationStyle: text("collaboration_style"),
  roleOrientation: text("role_orientation"),
  decisionOrientation: text("decision_orientation"),
  stressResponse: text("stress_response"),
  optimalEnvironment: text("optimal_environment"),
  greatestContribution: text("greatest_contribution"),
  
  // === SECTION 9: STYLE & EXPRESSION ===
  aesthetic: text("aesthetic"),
  signatureExpression: text("signature_expression"),
  creativeOutlets: jsonb("creative_outlets").default([]),
  
  // === HISTORY & ROOTS ===
  shadowPatterns: jsonb("shadow_patterns").default({}), // { pattern: "", lesson: "" }
  historicalContext: jsonb("historical_context").default([]), // Timeline with age markers
  upbringing: text("upbringing"),
  culturalContext: text("cultural_context"),
  keyExperiences: jsonb("key_experiences").default({}), // { experience: "", outcomes: "" }
  
  // === SYSTEMS & RITUALS ===
  idealDay: text("ideal_day"),
  lockedHabit: text("locked_habit"),
  idealWeek: jsonb("ideal_week").default({}),
  yearlyCycles: jsonb("yearly_cycles").default([]),
  morningRituals: jsonb("morning_rituals").default([]),
  eveningRituals: jsonb("evening_rituals").default([]),
  groundingRitual: text("grounding_ritual"),
  boundaries: jsonb("boundaries").default({}), // { techOffTime: "", workHours: "", recoveryTime: "" }
  
  // === EMOTIONS & COPING ===
  emotionsToCultivate: jsonb("emotions_to_cultivate").default([]),
  copingPractices: text("coping_practices"),
  copingEssential: text("coping_essential"),
  traitsToCultivate: jsonb("traits_to_cultivate").default([]),
  beliefSystem: jsonb("belief_system").default({}), // { empowering: [], limiting: [], core: "", strongest: "" }
  dominantInstinct: jsonb("dominant_instinct").default({}), // { type: "", description: "", influence: "" }
  decisionMakingStyles: jsonb("decision_making_styles").default([]),
  decisionMakingPrimary: text("decision_making_primary"),
  lifeRoles: jsonb("life_roles").default([]),
  definingRole: text("defining_role"),
  relationshipDrains: text("relationship_drains"),
  conflictStyle: text("conflict_style"),
  moneyMemory: jsonb("money_memory").default({}), // { memory: "", impact: "" }
  financialSecurity: jsonb("financial_security").default({}), // { reflection: "", eliminate: "" }
  financialHabits: jsonb("financial_habits").default({}), // { current: [], toReprogram: [] }
  
  // === CHARACTER AFFIRMATION ===
  characterAffirmation: text("character_affirmation"), // AI-generated third-person narrative
  
  // === CUSTOM REFLECTION PROMPTS ===
  customReflectionPrompts: jsonb("custom_reflection_prompts").default({
    wentWell: "What went well today?",
    couldBeBetter: "What could have been better?",
    learned: "What did I learn?"
  }),

  // === DISPLAY SETTINGS ===
  blueLightFilter: boolean("blue_light_filter").default(false),
  hapticFeedback: boolean("haptic_feedback").default(true),
  soundEffects: boolean("sound_effects").default(true),

  // === ONBOARDING TRACKING ===
  onboardingMission: integer("onboarding_mission").default(0), // Current mission (0-7)
  onboardingStep: integer("onboarding_step").default(0), // Current step within mission
  
  // === LEGACY FIELDS ===
  startStage: text("start_stage"), // ("Awakening", "Building", "Mastering", "Leading")
  targetArchetype: text("target_archetype"), // Legacy field
  flowStyle: jsonb("flow_style").default({}),
  coreMotivation: text("core_motivation"),
  setupMissionStatus: jsonb("setup_mission_status").default({
    archetype: "incomplete", 
    integrations: "incomplete", 
    future_self: "incomplete", 
    rituals: "incomplete", 
    pillars: "incomplete"
  }),
  primaryThemeColor: text("primary_theme_color").default("#00e0ff"),
  futureSelfSummary: text("future_self_summary"),
  aiPersonalityProfile: jsonb("ai_personality_profile").default({}),
  // Explicitly controls which personal domains may be included in an AI prompt.
  aiContextPreferences: jsonb("ai_context_preferences").notNull().default({ planning: true, identity: false, dailyState: false, conversationHistory: false }),
  totalXP: integer("total_xp").notNull().default(0),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  completedOnboardingMissions: integer("completed_onboarding_missions").array().default([]),
  completedTutorials: text("completed_tutorials").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Daily Logs Table (Daily Initialization)
export const userDailyLogs = pgTable("user_daily_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  yesterdayXp: integer("yesterday_xp").default(0),
  todayPrimaryMission: text("today_primary_mission"),
  optionalBoostsShown: boolean("optional_boosts_shown").default(false),
  boostsData: jsonb("boosts_data").default({}), // Store daily boosts data
  // Energy log fields
  wakeTime: text("wake_time"), // Time user woke up (HH:MM format)
  sleepTime: text("sleep_time"), // Time user went to sleep (HH:MM format)
  sleepQuality: integer("sleep_quality"), // Optional subjective reflection, 1-5
  sleepNote: text("sleep_note"), // Optional user-authored context, not a measured signal
  mentalState: integer("mental_state").default(5), // 1-10 scale
  physicalState: integer("physical_state").default(5), // 1-10 scale
  emotionalState: integer("emotional_state").default(5), // 1-10 scale
  // Intention log fields
  gratitude: text("gratitude"), // What I'm grateful for today
  tomorrowGoals: text("tomorrow_goals"), // Goals for tomorrow
  annualGoals: text("annual_goals"), // Annual goals reminder
  thoughts: text("thoughts"), // Free-form thoughts/intentions
  // Data log fields
  contentConsumed: text("content_consumed"), // Information consumed today
  research: text("research"), // Research notes (legacy)
  todoIdeas: text("todo_ideas"), // Ideas for future todos
  // Research log fields
  sourceAuthor: text("source_author"), // Source author name
  sourceMaterial: text("source_material"), // Source material reference
  researchNote: text("research_note"), // Research note
  revisionNote: text("revision_note"), // Revision & summary note
  executionNote: text("execution_note"), // Execution note
  researchEntries: jsonb("research_entries").default([]), // Array of archived research entries for multiple entries per day
  todosConverted: boolean("todos_converted").default(false), // Whether todoIdeas have been converted to quests
  // Reflection log fields
  wentWell: text("went_well"), // What went well today
  couldBeBetter: text("could_be_better"), // What could be better
  learned: text("learned"), // What I learned today
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("user_daily_logs_user_date_idx").on(table.userId, table.date),
]);

// User Integrations Table (Connected Apps)
export const userIntegrations = pgTable("user_integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  appleHealthConnected: boolean("apple_health_connected").default(false),
  googleCalendarConnected: boolean("google_calendar_connected").default(false),
  notionConnected: boolean("notion_connected").default(false),
  otherIntegrations: jsonb("other_integrations").default({}), // Future-proof for more apps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Transformation Threads turn the onboarding record into one deliberate, user-owned focus.
// Starter missions remain a reviewable draft until the user explicitly activates the thread.
export const transformationThreads = pgTable("transformation_threads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  primaryCapabilityId: integer("primary_capability_id").references(() => personalCapabilities.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  focus: text("focus").notNull(),
  rationale: text("rationale").notNull(),
  sourceSnapshot: jsonb("source_snapshot").notNull().default({}),
  starterMissions: jsonb("starter_missions").notNull().default([]),
  status: text("status").notNull().default("draft"), // draft | active | paused | completed
  activatedAt: timestamp("activated_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("transformation_threads_user_primary_capability_idx").on(table.userId, table.primaryCapabilityId, table.createdAt),
]);

// Durable, user-owned proof attached to a transformation thread. Sources stay
// immutable enough to make progress reviewable without treating an AI summary
// as ground truth.
export const transformationThreadEvidence = pgTable("transformation_thread_evidence", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  transformationThreadId: integer("transformation_thread_id").notNull().references(() => transformationThreads.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // mission_activity | mission_evidence_review | daily_reflection | weekly_review | thread_completion
  sourceId: text("source_id").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("transformation_thread_evidence_source_idx").on(table.transformationThreadId, table.sourceType, table.sourceId),
  index("transformation_thread_evidence_user_created_idx").on(table.userId, table.createdAt),
]);

// A private, user-owned capability is the durable real-world development theme
// behind one or more Thread-local skill nodes. It lets repeated practice in
// different contexts accumulate without claiming external certification.
export const personalCapabilities = pgTable("personal_capabilities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  experience: integer("experience").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("personal_capabilities_user_key_idx").on(table.userId, table.key),
  index("personal_capabilities_user_experience_idx").on(table.userId, table.experience),
]);

export const sleepNaps = pgTable("sleep_naps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  sleepQuality: integer("sleep_quality"),
  note: text("note"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("sleep_naps_user_date_idx").on(table.userId, table.date)]);

// Timestamped sessions keep measured/transcribed source context separate from
// the subjective daily reflection above. Stage values remain raw durations;
// LyfeOS does not turn them into a sleep score or readiness claim.
export const sleepSessions = pgTable("sleep_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").notNull(),
  source: text("source").notNull().default("manual"),
  deviceName: text("device_name"),
  method: text("method"),
  awakeMinutes: integer("awake_minutes"),
  lightMinutes: integer("light_minutes"),
  deepMinutes: integer("deep_minutes"),
  remMinutes: integer("rem_minutes"),
  subjectiveQuality: integer("subjective_quality"),
  note: text("note"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("sleep_sessions_user_started_idx").on(table.userId, table.startedAt),
  uniqueIndex("sleep_sessions_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`),
]);

// These nodes preserve a Thread's local sequence, prerequisites, and graph
// relationships. Their capability link allows equivalent practice to accrue to
// the user's durable private map across multiple Threads.
export const skillNodes = pgTable("skill_nodes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  transformationThreadId: integer("transformation_thread_id").notNull().references(() => transformationThreads.id, { onDelete: "cascade" }),
  capabilityId: integer("capability_id").references(() => personalCapabilities.id, { onDelete: "set null" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  kind: text("kind").notNull().default("supporting"), // primary | supporting | capacity
  // Unlocks and mastery are declared, user-visible rules. They describe the
  // record needed inside LyfeOS, never a verdict on real-world worth.
  unlockRequirements: jsonb("unlock_requirements").notNull().default([]),
  masteryRequirements: jsonb("mastery_requirements").notNull().default({}),
  experience: integer("experience").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("skill_nodes_thread_key_idx").on(table.transformationThreadId, table.key),
  index("skill_nodes_user_thread_idx").on(table.userId, table.transformationThreadId),
]);

// Directed edges make the developmental spillover explicit (for example, a
// sales practice can also build communication and confidence).
export const skillEdges = pgTable("skill_edges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceSkillId: integer("source_skill_id").notNull().references(() => skillNodes.id, { onDelete: "cascade" }),
  targetSkillId: integer("target_skill_id").notNull().references(() => skillNodes.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull().default("reinforces"),
  // User-described strength explains the visual relationship only. It never
  // multiplies XP or determines real-world competence.
  influenceWeight: integer("influence_weight").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("skill_edges_unique_idx").on(table.sourceSkillId, table.targetSkillId, table.relationship),
  index("skill_edges_user_source_idx").on(table.userId, table.sourceSkillId),
]);

// Missions can contribute to more than one capability. The amount is explicit
// and visible to the user rather than an opaque score assigned by AI.
export const questSkillContributions = pgTable("quest_skill_contributions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: integer("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  skillNodeId: integer("skill_node_id").notNull().references(() => skillNodes.id, { onDelete: "cascade" }),
  experienceAmount: integer("experience_amount").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("quest_skill_contributions_unique_idx").on(table.questId, table.skillNodeId),
  index("quest_skill_contributions_user_quest_idx").on(table.userId, table.questId),
]);

// Append-only record of why a skill changed. Cached totals on skillNodes make
// the dashboard fast; this ledger preserves a reviewable explanation.
export const skillProgressionEvents = pgTable("skill_progression_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: integer("skill_node_id").notNull().references(() => skillNodes.id, { onDelete: "cascade" }),
  questId: integer("quest_id").references(() => quests.id, { onDelete: "set null" }),
  transformationThreadId: integer("transformation_thread_id").references(() => transformationThreads.id, { onDelete: "set null" }),
  sourceType: text("source_type").notNull(), // mission_evidence_review | mission_evidence_reversal
  progressionRevision: integer("progression_revision").notNull().default(1),
  reversalOfId: integer("reversal_of_id"),
  experienceDelta: integer("experience_delta").notNull(),
  evidenceSummary: text("evidence_summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("skill_progression_events_user_skill_created_idx").on(table.userId, table.skillNodeId, table.createdAt),
  index("skill_progression_events_quest_idx").on(table.questId),
]);

// Activity XP is an append-only, reversible record derived from canonical
// mission and goal state. It powers game feedback without claiming skill.
export const activityProgressionEvents = pgTable("activity_progression_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull().unique(),
  sourceType: text("source_type").notNull(), // mission | vision_goal
  sourceId: integer("source_id").notNull(),
  action: text("action").notNull(), // earned | reversed
  experienceDelta: integer("experience_delta").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  reversalOfId: integer("reversal_of_id"),
  sourceOccurredAt: timestamp("source_occurred_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("activity_progression_events_user_created_idx").on(table.userId, table.createdAt),
  index("activity_progression_events_user_source_idx").on(table.userId, table.sourceType, table.sourceId),
]);

// Earned markers are deterministic records, never decorative UI state. A
// badge describes the evidence LyfeOS observed; it does not certify a person's
// real-world competence beyond that evidence.
export const progressionBadgeAwards = pgTable("progression_badge_awards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeKey: text("badge_key").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("progression_badge_awards_user_key_idx").on(table.userId, table.badgeKey),
  index("progression_badge_awards_user_awarded_idx").on(table.userId, table.awardedAt),
]);

// Badge state is reconstructed from these events. A reversed marker stays in
// history and can be earned again if qualifying evidence returns.
export const progressionBadgeEvents = pgTable("progression_badge_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull().unique(),
  badgeKey: text("badge_key").notNull(),
  action: text("action").notNull(), // awarded | reversed
  evidence: jsonb("evidence").notNull().default({}),
  reversalOfId: integer("reversal_of_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("progression_badge_events_user_created_idx").on(table.userId, table.createdAt),
  index("progression_badge_events_user_badge_idx").on(table.userId, table.badgeKey, table.createdAt),
]);

// Cross-product sharing is opt-in, scoped, and independent from a product's
// local progression record. LyfeOS does not send progression to UMH until the
// user chooses at least one destination.
export const crossProductSharingPreferences = pgTable("cross_product_sharing_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  ecosystemSharingEnabled: boolean("ecosystem_sharing_enabled").notNull().default(false),
  allowedDestinations: jsonb("allowed_destinations").notNull().default([]),
  allowedPurposes: jsonb("allowed_purposes").notNull().default([]),
  consentedAt: timestamp("consented_at"),
  revokedAt: timestamp("revoked_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A user explicitly creates these links when one real-world work item spans
// LyfeOS and another product. The linked products exchange state through UMH;
// they never share databases or silently infer a linkage from private data.
export const crossProductWorkLinks = pgTable("cross_product_work_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: integer("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  workItemId: uuid("work_item_id").notNull(),
  sharedSummary: text("shared_summary").notNull(),
  destinations: jsonb("destinations").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cross_product_work_links_quest_work_item_idx").on(table.questId, table.workItemId),
  index("cross_product_work_links_user_quest_idx").on(table.userId, table.questId),
]);

// Quests table (Missions Management)
export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").default("general"), // "setup", "rituals", "life pillars", etc.
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"), // Timestamp when quest was completed
  energyCost: integer("energy_cost").notNull().default(1),
  attentionCost: integer("attention_cost").notNull().default(0),
  timeCost: integer("time_cost").notNull().default(0),
  experienceReward: integer("experience_reward").notNull().default(10),
  autoUnlockConditions: jsonb("auto_unlock_conditions").default({}), // e.g., { "setup_complete": true }
  startDate: text("start_date"), // format: "YYYY-MM-DD"
  startTime: text("start_time"), // format: "HH:MM"
  endDate: text("end_date"), // format: "YYYY-MM-DD"
  endTime: text("end_time"), // format: "HH:MM"
  dueDate: text("due_date"), // format: "YYYY-MM-DD", null means no due date (legacy, kept for compatibility)
  notificationEnabled: boolean("notification_enabled").default(false),
  notificationTime: text("notification_time"), // format: "HH:MM" or minutes before like "-15", "-30", "-60" (legacy)
  notifications: jsonb("notifications").default([]), // Array of { date: "YYYY-MM-DD", time: "HH:MM" }
  difficulty: text("difficulty").default("D"), // S, A, B, C, D ranks
  isRitualized: boolean("is_ritualized").default(false),
  ritualGroup: text("ritual_group"),
  repeatFrequency: text("repeat_frequency"), // "hourly", "daily", "weekly", "monthly", "yearly"
  repeatInterval: integer("repeat_interval").default(1), // every X hours/days/weeks/months/years
  repeatDays: text("repeat_days").array(), // for weekly: ["mon","tue","wed","thu","fri","sat","sun"]
  repeatEndDate: text("repeat_end_date"), // format: "YYYY-MM-DD", null means forever
  parentRitualId: integer("parent_ritual_id"), // links generated instances back to the original ritual
  visionGoalId: integer("vision_goal_id").references(() => visionGoals.id),
  // Canonical Project membership. The FK is installed in migration 0097
  // because the historical kanban_boards declaration appears later here.
  projectId: integer("project_id"),
  transformationThreadId: integer("transformation_thread_id").references(() => transformationThreads.id, { onDelete: "set null" }),
  linkedItems: jsonb("linked_items").default([]),
  sortOrder: integer("sort_order").default(0),
  externalId: text("external_id"),
  externalSource: text("external_source"),
  location: text("location"),
  allDay: boolean("all_day").default(false),
  timezone: text("timezone"),
  url: text("url"),
  attendees: jsonb("attendees").default([]),
  missionStatus: text("mission_status").default("confirmed"),
  // Internal idempotency/provenance key for lifecycle adapters. It is never
  // inferred from user health data and is unique only within the owning user.
  lifecycleKey: text("lifecycle_key"),
  lifecyclePayloadHash: text("lifecycle_payload_hash"),
  // Every persisted mission write advances this server-owned version. Calendar
  // clients use it as an optimistic concurrency precondition; it is never a
  // client-controlled progression or gameplay value.
  revision: integer("revision").notNull().default(1),
  // Immutable-at-creation planning inputs and calibration make it possible to
  // explain why a mission received its initial scope. These fields are server
  // controlled and intentionally omitted from insertQuestSchema.
  planningContextSnapshot: jsonb("planning_context_snapshot").notNull().default({}),
  difficultyCalibration: jsonb("difficulty_calibration").notNull().default({}),
  planningDecisionSource: text("planning_decision_source").notNull().default("ui"),
  viewId: integer("view_id"),
  viewColumn: text("view_column"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("quests_user_lifecycle_key_unique_idx").on(table.userId, table.lifecycleKey).where(sql`${table.lifecycleKey} IS NOT NULL`),
  index("quests_user_calendar_window_idx").on(table.userId, table.startDate, table.id).where(sql`${table.deletedAt} IS NULL AND ${table.startDate} IS NOT NULL`),
]);

// A compact server receipt makes retrying an offline Calendar mutation safe.
// It contains no mission payload: only the canonical payload hash and the
// resulting mission version needed to distinguish an exact retry from reuse.
export const missionMutationReceipts = pgTable("mission_mutation_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mutationId: text("mutation_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  operation: text("operation").notNull(),
  questId: integer("quest_id"),
  resultingRevision: integer("resulting_revision"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_mutation_receipts_user_mutation_unique_idx").on(table.userId, table.mutationId),
  index("mission_mutation_receipts_user_created_idx").on(table.userId, table.createdAt),
]);

// A mission contract keeps purpose, expected proof, review mode, and safety
// bounds explicit. It is separate from the task record so legacy missions
// remain readable while new developmental missions can be reviewed honestly.
export const missionContracts = pgTable("mission_contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: integer("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  expectedOutput: text("expected_output").notNull(),
  methodSteps: jsonb("method_steps").notNull().default([]),
  toolRequirements: jsonb("tool_requirements").notNull().default([]),
  capabilityTargets: jsonb("capability_targets").notNull().default([]),
  prerequisites: jsonb("prerequisites").notNull().default([]),
  requiredEvidence: jsonb("required_evidence").notNull().default([]),
  rubricDefinition: jsonb("rubric_definition").notNull().default([]),
  rubricVersion: integer("rubric_version").notNull().default(1),
  acceptanceContextSnapshot: jsonb("acceptance_context_snapshot").notNull().default({}),
  reviewMode: text("review_mode").notNull().default("self"), // self | human
  riskLevel: text("risk_level").notNull().default("low"), // low | medium | high
  stopConditions: jsonb("stop_conditions").notNull().default([]),
  escalationPath: text("escalation_path"),
  state: text("state").notNull().default("draft"), // draft | accepted | awaiting_review | reviewed | revisions_needed
  // Set only after a completed mission's declared evidence receives a positive
  // review. It is the idempotency and audit marker for capability progression.
  progressionAppliedAt: timestamp("progression_applied_at"),
  progressionRevision: integer("progression_revision").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_contracts_quest_unique_idx").on(table.questId),
  index("mission_contracts_user_state_idx").on(table.userId, table.state),
]);

// A deferral is not a failure or a hidden status change. It is a user-owned,
// append-only record that explains why a mission was rescheduled so capacity
// guidance can remain honest over time.
export const missionDeferrals = pgTable("mission_deferrals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: integer("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  previousDueDate: text("previous_due_date"),
  deferredToDate: text("deferred_to_date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("mission_deferrals_user_quest_created_idx").on(table.userId, table.questId, table.createdAt),
]);

// Explicit same-user sequencing. Dependencies are a separate relation rather
// than an overloaded JSON field so the lifecycle can enforce them and the user
// can inspect or remove them without changing the mission's proof plan.
export const missionDependencies = pgTable("mission_dependencies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dependentQuestId: integer("dependent_quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  prerequisiteQuestId: integer("prerequisite_quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_dependencies_unique_idx").on(table.dependentQuestId, table.prerequisiteQuestId),
  index("mission_dependencies_user_dependent_idx").on(table.userId, table.dependentQuestId),
]);

// Evidence is user-owned and append-only. A summary describes the proof while
// an optional reference can point to an artifact without copying private data.
export const missionEvidence = pgTable("mission_evidence", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  missionContractId: integer("mission_contract_id").notNull().references(() => missionContracts.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // self_report | artifact | observation | provider
  sourceReference: text("source_reference"),
  summary: text("summary").notNull(),
  confidence: text("confidence").notNull().default("self_reported"), // self_reported | low | medium | high | provider_record
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
}, (table) => [
  index("mission_evidence_contract_submitted_idx").on(table.missionContractId, table.submittedAt),
]);

// Human review access is capability-scoped: the owner creates an expiring,
// revocable invitation for one mission and LyfeOS stores only a token hash.
// Accepting an invitation binds it to one authenticated principal.
export const missionReviewInvitations = pgTable("mission_review_invitations", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  missionContractId: integer("mission_contract_id").notNull().references(() => missionContracts.id, { onDelete: "cascade" }),
  reviewerUserId: integer("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked | completed | expired
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
  deliveryChannel: text("delivery_channel"), // native_inbox | null (manual capability link)
  deliveryStatus: text("delivery_status"), // delivered | null; external/provider claims require separate evidence
  deliveryMessageId: uuid("delivery_message_id"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_review_invitations_token_unique_idx").on(table.tokenHash),
  index("mission_review_invitations_owner_contract_idx").on(table.ownerUserId, table.missionContractId, table.createdAt),
  index("mission_review_invitations_reviewer_status_idx").on(table.reviewerUserId, table.status),
]);

// Reviews explain whether the declared evidence threshold was met. Human
// reviews record the authenticated reviewer and the exact invitation that
// granted access; userId remains the mission owner's data-partition key.
export const missionReviews = pgTable("mission_reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  missionContractId: integer("mission_contract_id").notNull().references(() => missionContracts.id, { onDelete: "cascade" }),
  reviewerType: text("reviewer_type").notNull().default("self"),
  reviewerUserId: integer("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewInvitationId: integer("review_invitation_id").references(() => missionReviewInvitations.id, { onDelete: "set null" }),
  decision: text("decision").notNull(), // meets_evidence | revisions_needed
  rubric: jsonb("rubric").notNull().default({}),
  rubricVersion: integer("rubric_version").notNull().default(1),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("mission_reviews_contract_created_idx").on(table.missionContractId, table.createdAt),
]);

// A human-review appeal is an explicit request for reconsideration, not a
// silent rewrite. Only the mission owner can open/withdraw it and only the
// reviewer who issued the challenged review can resolve it.
export const missionReviewAppeals = pgTable("mission_review_appeals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  missionContractId: integer("mission_contract_id").notNull().references(() => missionContracts.id, { onDelete: "cascade" }),
  missionReviewId: integer("mission_review_id").notNull().references(() => missionReviews.id, { onDelete: "cascade" }),
  reviewerUserId: integer("reviewer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | withdrawn | upheld | reconsidered
  resolutionSummary: text("resolution_summary"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_review_appeals_open_review_unique_idx").on(table.missionReviewId).where(sql`${table.status} = 'open'`),
  index("mission_review_appeals_owner_created_idx").on(table.userId, table.createdAt),
  index("mission_review_appeals_reviewer_status_idx").on(table.reviewerUserId, table.status, table.createdAt),
]);

// AI Messages table
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sender: text("sender").notNull(), // 'ai' or 'user'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Legacy calendar compatibility records. Canonical user tasks and scheduled
// work live in `quests`; new Calendar views and provider imports must project
// or adapt into the mission lifecycle rather than creating a second authority.
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  startTime: text("start_time").notNull(), // format: "HH:MM"
  endTime: text("end_time"), // format: "HH:MM"
  duration: text("duration").notNull(),
  category: text("category").notNull(), // 'work', 'personal', or 'health'
  date: text("date").notNull(), // format: "YYYY-MM-DD"
  location: text("location"),
  allDay: boolean("all_day").default(false),
  externalId: text("external_id"),
  externalSource: text("external_source"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mission Pages table
export const missionPages = pgTable("mission_pages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  completed: boolean("completed").notNull().default(false),
  xpValue: integer("xp_value").notNull().default(5),
  tags: text("tags").array(),
  eventId: integer("event_id").references(() => calendarEvents.id),
  date: text("date"), // format: "YYYY-MM-DD" - used for filtering by day
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contacts table
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  alias: text("alias"),
  email: text("email"),
  phone: text("phone"),
  secondaryPhone: text("secondary_phone"),
  company: text("company"),
  jobTitle: text("job_title"),
  department: text("department"),
  industry: text("industry"),
  category: text("category").notNull().default("personal"),
  relationshipType: text("relationship_type"),
  notes: text("notes"),
  favorite: boolean("favorite").notNull().default(false),
  lastContacted: timestamp("last_contacted", { mode: "date" }),
  birthday: date("birthday"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  timezone: text("timezone"),
  linkedin: text("linkedin"),
  twitter: text("twitter"),
  instagram: text("instagram"),
  website: text("website"),
  howMet: text("how_met"),
  trustLevel: integer("trust_level"),
  strengths: text("strengths"),
  contactFrequency: text("contact_frequency"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Private relationship intelligence is a LyfeOS domain, not a shared CRM.
// A contact is the address book record; this profile stores user-authored
// context, boundaries, and cadence without exposing it to another projection.
export const personalRelationships = pgTable("personal_relationships", {
  id: serial("id").primaryKey(),
  ecosystemId: uuid("ecosystem_id").notNull().defaultRandom().unique(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().unique().references(() => contacts.id, { onDelete: "cascade" }),
  relationshipKind: text("relationship_kind").notNull().default("personal"),
  state: text("state").notNull().default("active"), // active | paused | ended
  purpose: text("purpose"),
  boundaries: text("boundaries"),
  desiredCadence: text("desired_cadence"),
  privateContext: text("private_context"),
  sharingEnabled: boolean("sharing_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("personal_relationships_user_state_idx").on(table.userId, table.state),
]);

// Interactions are user-recorded evidence, not inferred sentiment or a score.
export const relationshipInteractions = pgTable("relationship_interactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  kind: text("kind").notNull().default("check_in"),
  summary: text("summary").notNull(),
  structuredData: jsonb("structured_data").notNull().default({}),
  source: text("source").notNull().default("self_report"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("relationship_interactions_relationship_occurred_idx").on(table.relationshipId, table.occurredAt),
]);

// Commitments can be linked to a real LyfeOS mission, but neither system marks
// the other complete automatically. The user remains the authority.
export const relationshipCommitments = pgTable("relationship_commitments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  // The database FK is created in migration 0020. `quests` is declared later
  // in this historical schema file, so the ORM declaration remains scalar.
  questId: integer("quest_id"),
  title: text("title").notNull(),
  detail: text("detail"),
  dueDate: text("due_date"),
  state: text("state").notNull().default("open"), // open | completed | cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("relationship_commitments_relationship_state_idx").on(table.relationshipId, table.state),
  index("relationship_commitments_quest_idx").on(table.questId),
]);

// Spreadsheets table
export const spreadsheets = pgTable("spreadsheets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(), // Store spreadsheet data as JSON
  favorite: boolean("favorite").notNull().default(false),
  category: text("category").notNull().default("general"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const spreadsheetRevisions = pgTable("spreadsheet_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  spreadsheetId: integer("spreadsheet_id").notNull().references(() => spreadsheets.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  action: text("action").notNull(),
  sourceRevision: integer("source_revision"),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("spreadsheet_revisions_spreadsheet_revision_unique_idx").on(table.spreadsheetId, table.revisionNumber),
  index("spreadsheet_revisions_user_spreadsheet_created_idx").on(table.userId, table.spreadsheetId, table.createdAt),
]);

// Relationships - Note: some tables are declared later but referenced here
export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
  profile: one(userProfile, {
    fields: [users.id],
    references: [userProfile.userId],
  }),
  dailyLogs: many(userDailyLogs),
  quests: many(quests),
  messages: many(aiMessages),
  events: many(calendarEvents),
  missionPages: many(missionPages),
  contacts: many(contacts),
  spreadsheets: many(spreadsheets),
  userIntegrations: one(userIntegrations, {
    fields: [users.id],
    references: [userIntegrations.userId],
  }),
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export const userProfileRelations = relations(userProfile, ({ one }) => ({
  user: one(users, {
    fields: [userProfile.userId],
    references: [users.id],
  }),
}));

export const userDailyLogsRelations = relations(userDailyLogs, ({ one }) => ({
  user: one(users, {
    fields: [userDailyLogs.userId],
    references: [users.id],
  }),
}));

export const userIntegrationsRelations = relations(userIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [userIntegrations.userId],
    references: [users.id],
  }),
}));

export const questsRelations = relations(quests, ({ one }) => ({
  user: one(users, {
    fields: [quests.userId],
    references: [users.id],
  }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  user: one(users, {
    fields: [aiMessages.userId],
    references: [users.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id],
  }),
  missionPages: many(missionPages),
}));

export const missionPagesRelations = relations(missionPages, ({ one }) => ({
  user: one(users, {
    fields: [missionPages.userId],
    references: [users.id],
  }),
  event: one(calendarEvents, {
    fields: [missionPages.eventId],
    references: [calendarEvents.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, {
    fields: [contacts.userId],
    references: [users.id],
  }),
}));

export const spreadsheetsRelations = relations(spreadsheets, ({ one }) => ({
  user: one(users, {
    fields: [spreadsheets.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  password: true,
  displayName: true,
  firstName: true,
  lastName: true,
  bio: true,
  avatarColor: true,
  title: true,
  profilePicture: true,
  email: true,
  phoneNumber: true,
  authProvider: true,
  firebaseUid: true,
  clerkId: true,
  termsAccepted: true,
  lastLoginAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
});

export const insertUserStatsSchema = createInsertSchema(userStats).pick({
  userId: true,
  timeTokensCurrent: true,
  timeTokensMax: true,
  energyPointsCurrent: true,
  energyPointsMax: true,
  healthPointsCurrent: true,
  healthPointsMax: true,
  attentionTokensCurrent: true,
  attentionTokensMax: true,
  wealthTokensCurrent: true,
  wealthTokensMax: true,
  experienceCurrent: true,
  experienceMax: true,
  level: true,
  streakDays: true,
  lastActiveDate: true,
  previousDayEnergyUsed: true,
  efficiencyScore: true,
  aiAssistantName: true,
  notificationsEnabled: true,
  darkThemeEnabled: true,
  autoSyncEnabled: true,
  aiAssistantEnabled: true,
  primaryColor: true,
});

export const insertQuestSchema = createInsertSchema(quests).pick({
  userId: true,
  title: true,
  description: true,
  category: true,
  completed: true,
  completedAt: true,
  energyCost: true,
  attentionCost: true,
  timeCost: true,
  experienceReward: true,
  transformationThreadId: true,
  projectId: true,
  startDate: true,
  startTime: true,
  endDate: true,
  endTime: true,
  dueDate: true,
  notificationEnabled: true,
  notificationTime: true,
  notifications: true,
  difficulty: true,
  isRitualized: true,
  ritualGroup: true,
  repeatFrequency: true,
  repeatInterval: true,
  repeatDays: true,
  repeatEndDate: true,
  parentRitualId: true,
  visionGoalId: true,
  linkedItems: true,
  createdAt: true,
  sortOrder: true,
  externalId: true,
  externalSource: true,
  location: true,
  allDay: true,
  timezone: true,
  url: true,
  attendees: true,
  missionStatus: true,
  viewId: true,
  viewColumn: true,
  deletedAt: true,
});

export const insertAIMessageSchema = createInsertSchema(aiMessages).pick({
  userId: true,
  sender: true,
  content: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).pick({
  userId: true,
  title: true,
  description: true,
  startTime: true,
  endTime: true,
  duration: true,
  category: true,
  date: true,
  location: true,
  allDay: true,
  externalId: true,
  externalSource: true,
});

export const insertMissionPageSchema = createInsertSchema(missionPages).pick({
  userId: true,
  title: true,
  slug: true,
  content: true,
  completed: true,
  xpValue: true,
  tags: true,
  eventId: true,
  date: true,
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  userId: true,
  name: true,
  alias: true,
  email: true,
  phone: true,
  secondaryPhone: true,
  company: true,
  jobTitle: true,
  department: true,
  industry: true,
  category: true,
  relationshipType: true,
  notes: true,
  favorite: true,
  lastContacted: true,
  birthday: true,
  address: true,
  city: true,
  country: true,
  timezone: true,
  linkedin: true,
  twitter: true,
  instagram: true,
  website: true,
  howMet: true,
  trustLevel: true,
  strengths: true,
  contactFrequency: true,
});

export const insertSpreadsheetSchema = createInsertSchema(spreadsheets).pick({
  userId: true,
  title: true,
  description: true,
  content: true,
  favorite: true,
  category: true,
});

// Insert schemas for new V2 tables
export const insertUserProfileSchema = createInsertSchema(userProfile).pick({
  userId: true,
  startStage: true,
  targetArchetype: true,
  flowStyle: true,
  coreMotivation: true,
  setupMissionStatus: true,
  primaryThemeColor: true,
  futureSelfSummary: true,
  aiPersonalityProfile: true,
  totalXP: true,
  onboardingCompleted: true,
  completedOnboardingMissions: true,
  completedTutorials: true,
});

export const insertUserDailyLogsSchema = createInsertSchema(userDailyLogs).pick({
  userId: true,
  date: true,
  yesterdayXp: true,
  todayPrimaryMission: true,
  optionalBoostsShown: true,
  boostsData: true,
  // Energy log fields
  wakeTime: true,
  sleepTime: true,
  mentalState: true,
  physicalState: true,
  emotionalState: true,
  // Intention log fields
  gratitude: true,
  tomorrowGoals: true,
  annualGoals: true,
  thoughts: true,
  // Data log fields
  contentConsumed: true,
  research: true,
  todoIdeas: true,
  todosConverted: true,
  // Research log fields
  sourceAuthor: true,
  sourceMaterial: true,
  researchNote: true,
  revisionNote: true,
  executionNote: true,
  // Reflection log fields
  wentWell: true,
  couldBeBetter: true,
  learned: true,
});

export const insertUserIntegrationsSchema = createInsertSchema(userIntegrations).pick({
  userId: true,
  appleHealthConnected: true,
  googleCalendarConnected: true,
  notionConnected: true,
  otherIntegrations: true,
});

// Push Subscriptions table (FCM tokens)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  // Nullable only for preserved pre-FCM subscription rows. New subscriptions
  // are still required to provide a token by the insert schema below.
  fcmToken: text("fcm_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).pick({
  userId: true,
  fcmToken: true,
}).extend({ fcmToken: z.string().min(1) });

// Types
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;

export type UserProfile = typeof userProfile.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export type UserDailyLog = typeof userDailyLogs.$inferSelect;
export type InsertUserDailyLog = z.infer<typeof insertUserDailyLogsSchema>;

export type UserIntegration = typeof userIntegrations.$inferSelect;
export type InsertUserIntegration = z.infer<typeof insertUserIntegrationsSchema>;

export type Quest = typeof quests.$inferSelect;
export type InsertQuest = z.infer<typeof insertQuestSchema>;

export type AIMessage = typeof aiMessages.$inferSelect;
export type InsertAIMessage = z.infer<typeof insertAIMessageSchema>;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

export type MissionPage = typeof missionPages.$inferSelect;
export type InsertMissionPage = z.infer<typeof insertMissionPageSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Spreadsheet = typeof spreadsheets.$inferSelect;
export type InsertSpreadsheet = z.infer<typeof insertSpreadsheetSchema>;
export type SpreadsheetRevision = typeof spreadsheetRevisions.$inferSelect;

// Canvas table
export const canvases = pgTable("canvases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull().default({}), // Stores canvas elements like shapes, connections, text
  favorite: boolean("favorite").default(false).notNull(),
  category: text("category").default("general").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Canvas relations
export const canvasRelations = relations(canvases, ({ one }) => ({
  user: one(users, {
    fields: [canvases.userId],
    references: [users.id],
  }),
}));

export const canvasRevisions = pgTable("canvas_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  canvasId: integer("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  action: text("action").notNull(),
  sourceRevision: integer("source_revision"),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("canvas_revisions_canvas_revision_unique_idx").on(table.canvasId, table.revisionNumber),
  index("canvas_revisions_user_canvas_created_idx").on(table.userId, table.canvasId, table.createdAt),
]);

// Insert schema for Canvas
export const insertCanvasSchema = createInsertSchema(canvases).omit({
  id: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
});

// Graph table
export const graphs = pgTable("graphs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull().default({}), // Stores nodes, edges, and styling
  favorite: boolean("favorite").default(false).notNull(),
  category: text("category").default("general").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Graph relations
export const graphRelations = relations(graphs, ({ one }) => ({
  user: one(users, {
    fields: [graphs.userId],
    references: [users.id],
  }),
}));

// Insert schema for Graph
export const insertGraphSchema = createInsertSchema(graphs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Folders table
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  parentId: integer("parent_id"),
  favorite: boolean("favorite").default(false).notNull(),
  source: text("source").default("local").notNull(),
  externalId: text("external_id"),
  externalUrl: text("external_url"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  folderId: integer("folder_id").references(() => folders.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  format: text("format").default("markdown").notNull(),
  favorite: boolean("favorite").default(false).notNull(),
  tags: text("tags").array(),
  source: text("source").default("local").notNull(),
  externalId: text("external_id"),
  externalUrl: text("external_url"),
  lastSyncedAt: timestamp("last_synced_at"),
  fileType: text("file_type"),
  fileData: text("file_data"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  thumbnailData: text("thumbnail_data"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Folder relations
export const folderRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
  children: many(folders),
  documents: many(documents),
}));

// Document relations
export const documentRelations = relations(documents, ({ one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [documents.folderId],
    references: [folders.id],
  }),
}));

// Insert schema for Folder
export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Insert schema for Document
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  deletedAt: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type Canvas = typeof canvases.$inferSelect;
export type InsertCanvas = z.infer<typeof insertCanvasSchema>;
export type CanvasRevision = typeof canvasRevisions.$inferSelect;

export type Graph = typeof graphs.$inferSelect;
export type InsertGraph = z.infer<typeof insertGraphSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// Document Templates
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  format: text("format").default("markdown").notNull(),
  category: text("category").default("general").notNull(),
  tags: text("tags").array(),
  favorite: boolean("favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template relations
export const templateRelations = relations(templates, ({ one }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
}));

// Insert schema for Template
export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;



// Keep original integrations table for backward compatibility with detailed provider info
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // google, notion, etc.
  providerName: text("provider_name").notNull(), // Display name for the provider
  accessToken: text("access_token"), // Encrypted access token
  refreshToken: text("refresh_token"), // Encrypted refresh token
  tokenExpiry: timestamp("token_expiry"), // When the token expires
  scope: text("scope"), // Permissions scope
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  status: text("status").default("active").notNull(), // active, expired, revoked
  settings: jsonb("settings").default({}), // Provider-specific settings
});

// Integrations relations
export const integrationsRelations = relations(integrations, ({ one }) => ({
  user: one(users, {
    fields: [integrations.userId],
    references: [users.id],
  }),
}));

// Insert schema for Integration
export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  connectedAt: true, 
  lastSyncedAt: true,
});

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

// Progress Trackers table
export const progressTrackers = pgTable("progress_trackers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("general").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  targetValue: integer("target_value").notNull(),
  unit: text("unit").default(""), // e.g., "kg", "steps", "hours", etc.
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  color: text("color").default("#00e0ff"),
  favorite: boolean("favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Progress Trackers relations
export const progressTrackerRelations = relations(progressTrackers, ({ one }) => ({
  user: one(users, {
    fields: [progressTrackers.userId],
    references: [users.id],
  }),
}));

// Insert schema for Progress Tracker
export const insertProgressTrackerSchema = createInsertSchema(progressTrackers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProgressTracker = typeof progressTrackers.$inferSelect;
export type InsertProgressTracker = z.infer<typeof insertProgressTrackerSchema>;

// Health & Fitness is a private, user-owned domain. These records establish
// the native foundation before food catalogs or device providers are added.
export const healthProfiles = pgTable("health_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  weightUnit: text("weight_unit").notNull().default("kg"),
  heightUnit: text("height_unit").notNull().default("cm"),
  energyUnit: text("energy_unit").notNull().default("kcal"),
  volumeUnit: text("volume_unit").notNull().default("ml"),
  heightValue: real("height_value"),
  bodyType: text("body_type"),
  trainingExperience: text("training_experience"),
  planningContextEnabled: boolean("planning_context_enabled").notNull().default(false),
  aiContextEnabled: boolean("ai_context_enabled").notNull().default(false),
  timeZone: text("time_zone"),
  utcOffsetMinutes: integer("utc_offset_minutes"),
  hydrationReminderEnabled: boolean("hydration_reminder_enabled").notNull().default(false),
  hydrationReminderIntervalMinutes: integer("hydration_reminder_interval_minutes").notNull().default(120),
  trackedDomains: jsonb("tracked_domains").notNull().default(["nutrition", "training", "recovery", "sleep", "activity", "body", "metrics", "supplements", "planning", "connections"]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaceDatabases = pgTable("workspace_databases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  favorite: boolean("favorite").notNull().default(false),
  definition: jsonb("definition").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workspace_databases_user_updated_idx").on(table.userId, table.updatedAt)]);

export const workspaceDatabaseRows = pgTable("workspace_database_rows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("database_id").notNull().references(() => workspaceDatabases.id, { onDelete: "cascade" }),
  values: jsonb("values").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workspace_database_rows_database_updated_idx").on(table.databaseId, table.updatedAt), index("workspace_database_rows_user_idx").on(table.userId)]);

export const workspaceDatabaseRevisions = pgTable("workspace_database_revisions", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("database_id").notNull().references(() => workspaceDatabases.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(), action: text("action").notNull(), sourceRevision: integer("source_revision"),
  snapshot: jsonb("snapshot").notNull(), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("workspace_database_revisions_database_revision_unique_idx").on(table.databaseId, table.revisionNumber), index("workspace_database_revisions_user_database_created_idx").on(table.userId, table.databaseId, table.createdAt)]);

export const workspaceDatabaseRowRevisions = pgTable("workspace_database_row_revisions", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("database_id").notNull().references(() => workspaceDatabases.id, { onDelete: "cascade" }),
  rowId: integer("row_id").notNull().references(() => workspaceDatabaseRows.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(), action: text("action").notNull(), sourceRevision: integer("source_revision"),
  snapshot: jsonb("snapshot").notNull(), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("workspace_database_row_revisions_row_revision_unique_idx").on(table.rowId, table.revisionNumber), index("workspace_database_row_revisions_user_row_created_idx").on(table.userId, table.rowId, table.createdAt)]);

export const workspaceTableViews = pgTable("workspace_table_views", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("database_id").notNull().references(() => workspaceDatabases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workspace_table_views_user_database_idx").on(table.userId, table.databaseId), uniqueIndex("workspace_table_views_database_name_unique_idx").on(table.databaseId, sql`lower(${table.name})`)]);

export const workspaceForms = pgTable("workspace_forms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("database_id").notNull().references(() => workspaceDatabases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  fieldIds: jsonb("field_ids").notNull(),
  definition: jsonb("definition").notNull(),
  confirmationText: text("confirmation_text").notNull().default("Response saved."),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workspace_forms_user_updated_idx").on(table.userId, table.updatedAt), index("workspace_forms_database_idx").on(table.databaseId)]);

export const workspaceFormAccessGrants = pgTable("workspace_form_access_grants", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").notNull().defaultRandom().unique(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  formId: integer("form_id").notNull().references(() => workspaceForms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at").notNull(),
  maxSubmissions: integer("max_submissions").notNull(),
  submissionCount: integer("submission_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("workspace_form_access_grants_user_form_idx").on(table.userId, table.formId), index("workspace_form_access_grants_public_idx").on(table.publicId)]);

export const workspaceFormSubmissionReceipts = pgTable("workspace_form_submission_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  formId: integer("form_id").notNull().references(() => workspaceForms.id, { onDelete: "cascade" }),
  grantId: integer("grant_id").notNull().references(() => workspaceFormAccessGrants.id, { onDelete: "cascade" }),
  rowId: integer("row_id").notNull().references(() => workspaceDatabaseRows.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("workspace_form_submission_receipts_user_form_idx").on(table.userId, table.formId), uniqueIndex("workspace_form_submission_receipts_grant_row_unique_idx").on(table.grantId, table.rowId)]);

// User-authored, local-only mission automations. The versioned definition is
// validated at every write and execution boundary; enabled defaults to false
// so saving a draft cannot silently begin changing a user's mission system.
export const workflowAutomations = pgTable("workflow_automations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  definition: jsonb("definition").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  pausedAt: timestamp("paused_at"),
  pauseReason: text("pause_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workflow_automations_user_updated_idx").on(table.userId, table.updatedAt), index("workflow_automations_user_enabled_idx").on(table.userId, table.enabled)]);

// Append-preserving execution receipts record only bounded action outcomes and
// mission IDs. Private mission descriptions and generated content are not
// copied into the audit record.
export const workflowAutomationRuns = pgTable("workflow_automation_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  automationId: integer("automation_id").references(() => workflowAutomations.id, { onDelete: "set null" }),
  automationName: text("automation_name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerQuestId: integer("trigger_quest_id").references(() => quests.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key").notNull(),
  definitionSnapshot: jsonb("definition_snapshot"),
  status: text("status").notNull().default("running"),
  actionResults: jsonb("action_results").notNull().default([]),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("workflow_automation_runs_user_automation_key_unique_idx").on(table.userId, table.automationId, table.idempotencyKey),
  index("workflow_automation_runs_user_created_idx").on(table.userId, table.createdAt),
  index("workflow_automation_runs_automation_created_idx").on(table.automationId, table.createdAt),
]);

// One mutable recovery receipt per action keeps already-succeeded effects from
// being replayed. Follow-up creation additionally uses a mission lifecycle key,
// so a worker crash after the write but before this receipt update converges on
// the same mission when the user explicitly repairs the run.
export const workflowAutomationActionReceipts = pgTable("workflow_automation_action_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  runId: integer("run_id").notNull().references(() => workflowAutomationRuns.id, { onDelete: "cascade" }),
  actionIndex: integer("action_index").notNull(),
  actionType: text("action_type").notNull(),
  status: text("status").notNull().default("running"),
  expectedQuestRevision: integer("expected_quest_revision"),
  targetQuestId: integer("target_quest_id").references(() => quests.id, { onDelete: "set null" }),
  attemptCount: integer("attempt_count").notNull().default(1),
  lastErrorCode: text("last_error_code"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("workflow_automation_action_receipts_run_action_unique_idx").on(table.runId, table.actionIndex),
  index("workflow_automation_action_receipts_user_status_idx").on(table.userId, table.status, table.updatedAt),
]);

export const healthConnections = pgTable("health_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerName: text("provider_name").notNull(),
  status: text("status").notNull().default("pending"),
  scopes: jsonb("scopes").notNull().default([]),
  consentVersion: text("consent_version").notNull(),
  consentedAt: timestamp("consented_at").notNull().defaultNow(),
  credentialRef: text("credential_ref"),
  lastSyncAt: timestamp("last_sync_at"),
  lastErrorCode: text("last_error_code"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("health_connections_user_provider_unique_idx").on(table.userId, table.provider),
  index("health_connections_user_status_idx").on(table.userId, table.status),
  index("health_connections_status_error_idx").on(table.status, table.lastErrorCode),
]);

export const healthSyncCursors = pgTable("health_sync_cursors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(),
  cursorValue: text("cursor_value"),
  status: text("status").notNull().default("idle"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastSuccessAt: timestamp("last_success_at"),
  nextRetryAt: timestamp("next_retry_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("health_sync_cursors_connection_resource_unique_idx").on(table.connectionId, table.resourceType),
  index("health_sync_cursors_user_status_idx").on(table.userId, table.status),
  index("health_sync_cursors_status_attempt_idx").on(table.status, table.lastAttemptAt, table.nextRetryAt, table.consecutiveFailures),
]);

export const healthImportRuns = pgTable("health_import_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  resourceType: text("resource_type").notNull(),
  status: text("status").notNull().default("running"),
  fetchedCount: integer("fetched_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  replayedCount: integer("replayed_count").notNull().default(0),
  correctedCount: integer("corrected_count").notNull().default(0),
  suppressedCount: integer("suppressed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
}, (table) => [
  index("health_import_runs_user_started_idx").on(table.userId, table.startedAt),
  index("health_import_runs_connection_status_idx").on(table.connectionId, table.status),
  index("health_import_runs_status_started_idx").on(table.status, table.startedAt),
]);

export const healthImportFailures = pgTable("health_import_failures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  runId: integer("run_id").notNull().references(() => healthImportRuns.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  resourceType: text("resource_type").notNull(),
  errorCode: text("error_code").notNull(),
  retryable: boolean("retryable").notNull().default(true),
  status: text("status").notNull().default("retry_wait"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("health_import_failures_user_status_idx").on(table.userId, table.status),
  index("health_import_failures_run_idx").on(table.runId),
  index("health_import_failures_status_retry_idx").on(table.status, table.nextRetryAt, table.resolvedAt),
]);

export const healthSourceRecords = pgTable("health_source_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  recordType: text("record_type").notNull(),
  observedAt: timestamp("observed_at").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  payloadFingerprint: text("payload_fingerprint").notNull(),
  transformVersion: text("transform_version").notNull(),
  state: text("state").notNull().default("active"),
  sourcePayload: jsonb("source_payload").notNull().default({}),
  sourceMetadata: jsonb("source_metadata").notNull().default({}),
}, (table) => [
  uniqueIndex("health_source_records_user_provider_record_fingerprint_unique_idx").on(table.userId, table.provider, table.sourceRecordId, table.payloadFingerprint),
  index("health_source_records_user_observed_idx").on(table.userId, table.observedAt),
  index("health_source_records_connection_user_idx").on(table.connectionId, table.userId),
]);

export const healthSourceSuppressions = pgTable("health_source_suppressions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => healthConnections.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  sourceRecordKeyHash: text("source_record_key_hash").notNull(),
  reason: text("reason").notNull().default("user_deleted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_source_suppressions_user_provider_key_unique_idx").on(table.userId, table.provider, table.sourceRecordKeyHash)]);

export const healthSourcePreferences = pgTable("health_source_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(),
  orderedSources: jsonb("ordered_sources").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_source_preferences_user_metric_unique_idx").on(table.userId, table.metricKey)]);

export const healthConnectionAudits = pgTable("health_connection_audits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").references(() => healthConnections.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  action: text("action").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("health_connection_audits_user_created_idx").on(table.userId, table.createdAt)]);

export const healthTargets = pgTable("health_targets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // weight | hydration | energy | protein | carbohydrate | fat
  targetValue: real("target_value").notNull(),
  unit: text("unit").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  source: text("source").notNull().default("user"), // user | professional | calculated
  calculationVersion: text("calculation_version"),
  weekdays: jsonb("weekdays").notNull().default([]),
  rationale: text("rationale"),
  methodId: text("method_id"),
  methodVersion: text("method_version"),
  note: text("note"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("health_targets_user_kind_date_idx").on(table.userId, table.kind, table.effectiveFrom)]);

export const healthTargetRevisions = pgTable("health_target_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  action: text("action").notNull(), // baseline | created | updated | deleted
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("health_target_revisions_user_target_revision_unique_idx").on(table.userId, table.targetId, table.revisionNumber),
  index("health_target_revisions_user_created_idx").on(table.userId, table.createdAt),
]);

export const bodyMeasurements = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(), // weight | body_fat_percent | waist | chest | hips | custom
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  observedAt: date("observed_at").notNull(),
  source: text("source").notNull().default("manual"),
  measurementMethod: text("measurement_method").notNull().default("unspecified"),
  measurementProtocol: text("measurement_protocol"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("body_measurements_user_metric_date_idx").on(table.userId, table.metric, table.observedAt), uniqueIndex("body_measurements_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`)]);

export const hydrationEntries = pgTable("hydration_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  volumeMl: integer("volume_ml").notNull(),
  inputQuantity: real("input_quantity"),
  inputUnit: text("input_unit"),
  inputMlPerUnit: real("input_ml_per_unit"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("hydration_entries_user_occurred_idx").on(table.userId, table.occurredAt),
  uniqueIndex("hydration_entries_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`),
]);

// Kanban Board table
export const kanbanBoards = pgTable("kanban_boards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  outcome: text("outcome"),
  state: text("state").notNull().default("planned"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  completedAt: timestamp("completed_at"),
  revision: integer("revision").notNull().default(1),
  origin: text("origin").notNull().default("native"),
  legacyReconciledAt: timestamp("legacy_reconciled_at"),
  deletedAt: timestamp("deleted_at"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Kanban Column table
export const kanbanColumns = pgTable("kanban_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull(), // unique identifier for the column
  order: integer("order").notNull(), // position in the board
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Kanban Task table
export const kanbanTasks = pgTable("kanban_tasks", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(), // Matches column status
  priority: text("priority").notNull().default("medium"), // low, medium, high
  startDate: text("start_date"),
  dueDate: text("due_date"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Board relations
export const kanbanBoardRelations = relations(kanbanBoards, ({ one, many }) => ({
  user: one(users, {
    fields: [kanbanBoards.userId],
    references: [users.id],
  }),
  columns: many(kanbanColumns),
  tasks: many(kanbanTasks),
}));

// Column relations
export const kanbanColumnRelations = relations(kanbanColumns, ({ one }) => ({
  board: one(kanbanBoards, {
    fields: [kanbanColumns.boardId],
    references: [kanbanBoards.id],
  }),
}));

// Task relations
export const kanbanTaskRelations = relations(kanbanTasks, ({ one }) => ({
  board: one(kanbanBoards, {
    fields: [kanbanTasks.boardId],
    references: [kanbanBoards.id],
  }),
}));

// Insert schemas
export const insertKanbanBoardSchema = createInsertSchema(kanbanBoards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKanbanColumnSchema = createInsertSchema(kanbanColumns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKanbanTaskSchema = createInsertSchema(kanbanTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KanbanBoard = typeof kanbanBoards.$inferSelect;
export type InsertKanbanBoard = z.infer<typeof insertKanbanBoardSchema>;

export type KanbanColumn = typeof kanbanColumns.$inferSelect;
export type InsertKanbanColumn = z.infer<typeof insertKanbanColumnSchema>;

export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type InsertKanbanTask = z.infer<typeof insertKanbanTaskSchema>;

// Media Albums table
export const mediaAlbums = pgTable("media_albums", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  coverImageId: integer("cover_image_id"),
  isSmartAlbum: boolean("is_smart_album").default(false).notNull(),
  smartAlbumRules: jsonb("smart_album_rules"), // Rules for automatically populating smart albums
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Media Items table (photos and videos)
export const mediaItems = pgTable("media_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  albumId: integer("album_id").references(() => mediaAlbums.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // 'image' or 'video'
  mimeType: text("mime_type").notNull(), // 'image/jpeg', 'image/png', 'video/mp4', etc.
  fileUrl: text("file_url"), // URL to the stored file (S3 or similar)
  fileData: text("file_data"), // For base64 encoded images if not using external storage
  filePath: text("file_path"), // Local path if stored on server
  thumbnailUrl: text("thumbnail_url"), // Small thumbnail for preview
  title: text("title"),
  description: text("description"),
  tags: text("tags").array(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  dateTaken: timestamp("date_taken"),
  location: jsonb("location"), // { latitude, longitude, placeName }
  metadata: jsonb("metadata"), // Camera info, dimensions, etc.
  size: integer("size"), // File size in bytes
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Media Relations
export const mediaItemsRelations = relations(mediaItems, ({ one }) => ({
  user: one(users, {
    fields: [mediaItems.userId],
    references: [users.id],
  }),
  album: one(mediaAlbums, {
    fields: [mediaItems.albumId],
    references: [mediaAlbums.id],
  }),
}));

export const mediaAlbumsRelations = relations(mediaAlbums, ({ one, many }) => ({
  user: one(users, {
    fields: [mediaAlbums.userId],
    references: [users.id],
  }),
  items: many(mediaItems),
}));

// Insert schemas for media
export const insertMediaItemSchema = createInsertSchema(mediaItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMediaAlbumSchema = createInsertSchema(mediaAlbums).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Media types
export type MediaItem = typeof mediaItems.$inferSelect;
export type InsertMediaItem = z.infer<typeof insertMediaItemSchema>;

export type MediaAlbum = typeof mediaAlbums.$inferSelect;
export type InsertMediaAlbum = z.infer<typeof insertMediaAlbumSchema>;

// ===============================
// AI Chat Conversations & Messages
// ===============================

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const relationshipAssessments = pgTable("relationship_assessments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  assessmentKind: text("assessment_kind").notNull().default("periodic"),
  dimensions: jsonb("dimensions").notNull(),
  reflection: text("reflection"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("relationship_assessments_relationship_occurred_idx").on(table.relationshipId, table.occurredAt)]);

// Consent is purpose-bound, scoped, expiring, and revocable. AI context and
// ecosystem sharing never inherit from one another.
export const relationshipGovernanceConsents = pgTable("relationship_governance_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), // ai_recommendation | ecosystem_share
  allowedScopes: jsonb("allowed_scopes").notNull().default([]),
  allowedDestinations: jsonb("allowed_destinations").notNull().default([]),
  disclosureVersion: text("disclosure_version").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("relationship_governance_consents_user_relationship_idx").on(table.userId, table.relationshipId, table.purpose)]);

export const relationshipAIRecommendations = pgTable("relationship_ai_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  consentId: uuid("consent_id").notNull().references(() => relationshipGovernanceConsents.id, { onDelete: "restrict" }),
  model: text("model").notNull(),
  sourceManifest: jsonb("source_manifest").notNull().default([]),
  recommendations: jsonb("recommendations").notNull().default([]),
  disclosure: text("disclosure").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("relationship_ai_recommendations_relationship_created_idx").on(table.relationshipId, table.createdAt)]);

export const relationshipGovernanceAudit = pgTable("relationship_governance_audit", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationshipId: integer("relationship_id").notNull().references(() => personalRelationships.id, { onDelete: "cascade" }),
  consentId: uuid("consent_id").references(() => relationshipGovernanceConsents.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("relationship_governance_audit_user_created_idx").on(table.userId, table.createdAt)]);

// The assistant persona has a portable, consent-gated identity and a separate
// LyfeOS presentation. Nothing in this record is sent to another product by
// default; projection builders must enforce the destination allow-list.
export const aiPersonaProfiles = pgTable("ai_persona_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  interactionStyle: jsonb("interaction_style").notNull().default({}),
  lyfeosPresentation: jsonb("lyfeos_presentation").notNull().default({ role: "LyfeOS companion" }),
  ecosystemSharingEnabled: boolean("ecosystem_sharing_enabled").notNull().default(false),
  allowedDestinations: jsonb("allowed_destinations").notNull().default([]),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiMemoryPolicies = pgTable("ai_memory_policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  chatHistoryDays: integer("chat_history_days"), // null = keep until the user deletes it
  contextReceiptDays: integer("context_receipt_days").notNull().default(90),
  actionReceiptDays: integer("action_receipt_days").notNull().default(365),
  crossProductMemoryEnabled: boolean("cross_product_memory_enabled").notNull().default(false),
  allowedDestinations: jsonb("allowed_destinations").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A receipt names the records made available to a model without duplicating
// their private values. It is attribution of context, not a claim that the
// model cited or correctly interpreted every source.
export const aiContextReceipts = pgTable("ai_context_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  assistantMessageId: integer("assistant_message_id").references(() => messages.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull().default("assistant_response"),
  sources: jsonb("sources").notNull().default([]),
  disclosure: text("disclosure").notNull().default("Sources were made available as context; the response remains model-generated."),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("ai_context_receipts_user_created_idx").on(table.userId, table.createdAt),
]);

// A provider evidence binding stores only the minimum immutable provenance
// needed to explain a user's explicit Mission-evidence attachment. The source
// payload remains in the private Health domain. Deleting that source is always
// allowed and leaves this historical receipt with a null source reference.
export const missionEvidenceProviderBindings = pgTable("mission_evidence_provider_bindings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  missionEvidenceId: integer("mission_evidence_id").notNull().references(() => missionEvidence.id, { onDelete: "cascade" }),
  providerDomain: text("provider_domain").notNull().default("health"),
  providerSourceRecordId: integer("provider_source_record_id").references(() => healthSourceRecords.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  recordType: text("record_type").notNull(),
  observedAt: timestamp("observed_at").notNull(),
  receivedAt: timestamp("received_at").notNull(),
  payloadFingerprint: text("payload_fingerprint").notNull(),
  transformVersion: text("transform_version").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mission_evidence_provider_bindings_evidence_unique_idx").on(table.missionEvidenceId),
  index("mission_evidence_provider_bindings_user_created_idx").on(table.userId, table.createdAt),
  index("mission_evidence_provider_bindings_source_idx").on(table.providerSourceRecordId),
]);

// Canonical native Messages transport. The historical conversations/messages
// tables above remain the AI companion's private chat history; keeping this
// transport separate prevents relationship messages from being injected into
// AI context or erased by the AI-memory controls.
export const messageConversations = pgTable("message_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("direct"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  queue: text("queue").notNull().default("personal"),
  aiMode: text("ai_mode").notNull().default("observe"),
  snoozedUntil: timestamp("snoozed_until"),
  lastMessageAt: timestamp("last_message_at"),
  closedAt: timestamp("closed_at"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("message_conversations_status_updated_idx").on(table.status, table.updatedAt),
]);

export const messageConversationParticipants = pgTable("message_conversation_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => messageConversations.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  inboxStatus: text("inbox_status").notNull().default("open"),
  snoozedUntil: timestamp("snoozed_until"),
  version: integer("version").notNull().default(1),
  lastReadMessageId: uuid("last_read_message_id"),
  lastReadAt: timestamp("last_read_at"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
}, (table) => [
  uniqueIndex("message_conversation_participant_unique").on(table.conversationId, table.userId),
  index("message_conversation_participant_user_idx").on(table.userId, table.status, table.conversationId),
]);

export const messageChannelBindings = pgTable("message_channel_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => messageConversations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("native"),
  connectionRef: text("connection_ref"),
  channelKind: text("channel_kind").notNull().default("native"),
  externalThreadId: text("external_thread_id"),
  status: text("status").notNull().default("active"),
  capabilities: jsonb("capabilities").notNull().default({ send: true, receive: true, receipts: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("message_channel_binding_native_unique").on(table.conversationId, table.provider, table.channelKind),
]);

export const conversationMessages = pgTable("conversation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => messageConversations.id, { onDelete: "cascade" }),
  senderUserId: integer("sender_user_id").references(() => users.id, { onDelete: "set null" }),
  senderParticipantRef: uuid("sender_participant_ref"),
  direction: text("direction").notNull().default("outbound"),
  provider: text("provider").notNull().default("native"),
  body: text("body").notNull(),
  bodyFormat: text("body_format").notNull().default("plain"),
  status: text("status").notNull().default("queued"),
  replyToMessageId: uuid("reply_to_message_id"),
  providerMessageId: text("provider_message_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  version: integer("version").notNull().default(1),
  extension: jsonb("extension").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("conversation_messages_sender_idempotency_unique").on(table.senderUserId, table.idempotencyKey),
  index("conversation_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const messageAttachments = pgTable("message_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  externalMediaId: text("external_media_id"),
  attachmentKind: text("attachment_kind").notNull().default("file_ref"),
  filename: text("filename"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  durationMs: integer("duration_ms"),
  snapshotData: text("snapshot_data"),
  snapshotSha256: text("snapshot_sha256"),
  snapshotAt: timestamp("snapshot_at"),
  metadata: jsonb("metadata").notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("message_attachments_message_idx").on(table.messageId)]);

export const messageReactions = pgTable("message_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("message_reactions_message_user_unique").on(table.messageId, table.userId),
  index("message_reactions_message_idx").on(table.messageId),
]);

// Every edit preserves the prior body for reviewable account export and
// operational dispute recovery. It is never returned in the conversation API.
export const messageEditHistory = pgTable("message_edit_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  editorUserId: integer("editor_user_id").references(() => users.id, { onDelete: "set null" }),
  priorBody: text("prior_body").notNull(),
  replacementBody: text("replacement_body").notNull(),
  priorVersion: integer("prior_version").notNull(),
  editedAt: timestamp("edited_at").notNull().defaultNow(),
}, (table) => [index("message_edit_history_message_idx").on(table.messageId, table.editedAt)]);

export const messageDeliveryReceipts = pgTable("message_delivery_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  recipientUserId: integer("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("native"),
  state: text("state").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  providerReceiptId: text("provider_receipt_id"),
  failureCode: text("failure_code"),
  failureDetail: text("failure_detail"),
  evidence: jsonb("evidence").notNull().default({}),
  version: integer("version").notNull().default(1),
}, (table) => [
  uniqueIndex("message_delivery_receipt_state_unique").on(table.messageId, table.recipientUserId, table.state),
  index("message_delivery_receipts_message_occurred_idx").on(table.messageId, table.occurredAt),
]);

// Notes are visible only to their author. They are intentionally never joined
// into recipient-visible messages or assistant context.
export const messageInternalNotes = pgTable("message_internal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => messageConversations.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("author_only"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("message_internal_notes_author_conversation_idx").on(table.authorUserId, table.conversationId, table.createdAt)]);

export const messageAuditEvents = pgTable("message_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => messageConversations.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  aggregateVersion: integer("aggregate_version").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
}, (table) => [index("message_audit_events_conversation_occurred_idx").on(table.conversationId, table.occurredAt)]);

export const projectEvents = pgTable("project_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  fromState: text("from_state"),
  toState: text("to_state"),
  aggregateRevision: integer("aggregate_revision").notNull(),
  actorSource: text("actor_source").notNull().default("ui"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
}, (table) => [index("project_events_project_occurred_idx").on(table.projectId, table.occurredAt), index("project_events_user_occurred_idx").on(table.userId, table.occurredAt)]);

// Tool execution receipts are deliberately metadata-only: they make an AI
// mutation reviewable without storing the user's prompt, private tool input,
// or model output a second time.
export const aiActionRecords = pgTable("ai_action_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  risk: text("risk").notNull().default("low"),
  state: text("state").notNull().default("started"), // started | succeeded | rejected | failed
  inputSummary: jsonb("input_summary").notNull().default({}),
  planningContextSnapshot: jsonb("planning_context_snapshot").notNull().default({}),
  outcomeSummary: text("outcome_summary"),
  contextReceiptId: uuid("context_receipt_id").references(() => aiContextReceipts.id, { onDelete: "set null" }),
  repairState: text("repair_state").notNull().default("unavailable"), // unavailable | available | executing | repaired | stale | failed | expired
  repairExpiresAt: timestamp("repair_expires_at"),
  repairedAt: timestamp("repaired_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("ai_action_records_user_created_idx").on(table.userId, table.createdAt),
]);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

// Repair payloads are user-owned operational state. They contain only the
// minimum prior values needed for a bounded, optimistic repair and expire.
export const aiActionRepairs = pgTable("ai_action_repairs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionRecordId: integer("action_record_id").notNull().unique().references(() => aiActionRecords.id, { onDelete: "cascade" }),
  strategy: text("strategy").notNull(),
  payload: jsonb("payload").notNull(),
  state: text("state").notNull().default("available"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("ai_action_repairs_user_state_idx").on(table.userId, table.state, table.createdAt)]);

// Medium-risk assistant actions are held here only until the user explicitly
// approves or rejects them. Payload is never shown in activity receipts; it is
// retained solely to execute the exact reviewed request and is user-exportable.
export const aiPendingActions = pgTable("ai_pending_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionRecordId: integer("action_record_id").notNull().references(() => aiActionRecords.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  payload: jsonb("payload").notNull(),
  state: text("state").notNull().default("pending"), // pending | executing | succeeded | rejected | failed | expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ai_pending_actions_user_state_idx").on(table.userId, table.state, table.createdAt),
  uniqueIndex("ai_pending_actions_action_record_unique_idx").on(table.actionRecordId),
]);

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type AIActionRecord = typeof aiActionRecords.$inferSelect;
export type AIPendingAction = typeof aiPendingActions.$inferSelect;
export type AIPersonaProfile = typeof aiPersonaProfiles.$inferSelect;
export type AIMemoryPolicy = typeof aiMemoryPolicies.$inferSelect;
export type AIContextReceipt = typeof aiContextReceipts.$inferSelect;
export type AIActionRepair = typeof aiActionRepairs.$inferSelect;

export const dismissedKnowledge = pgTable("dismissed_knowledge", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  author: text("author").notNull(),
  sourceMaterial: text("source_material"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDismissedKnowledgeSchema = createInsertSchema(dismissedKnowledge).omit({
  id: true,
  createdAt: true,
});

export type DismissedKnowledge = typeof dismissedKnowledge.$inferSelect;
export type InsertDismissedKnowledge = z.infer<typeof insertDismissedKnowledgeSchema>;

export const visionGoals = pgTable("vision_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  category: text("category").notNull(), // 'legacy', '10year', '5year', '18month', '90day'
  title: text("title").notNull(),
  description: text("description"),
  rewardText: text("reward_text"),
  bonusXp: integer("bonus_xp").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  disconnectedMissionIds: integer("disconnected_mission_ids").array(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVisionGoalSchema = createInsertSchema(visionGoals).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  disconnectedMissionIds: true,
});

export type VisionGoal = typeof visionGoals.$inferSelect;
export type InsertVisionGoal = z.infer<typeof insertVisionGoalSchema>;

export const userCategories = pgTable("user_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  value: text("value").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserCategorySchema = createInsertSchema(userCategories).omit({
  id: true,
  createdAt: true,
});

export type UserCategory = typeof userCategories.$inferSelect;
export type InsertUserCategory = z.infer<typeof insertUserCategorySchema>;

export const ritualGroups = pgTable("ritual_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  value: text("value").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  parentGroupValue: text("parent_group_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRitualGroupSchema = createInsertSchema(ritualGroups).omit({
  id: true,
  createdAt: true,
});

export type RitualGroup = typeof ritualGroups.$inferSelect;
export type InsertRitualGroup = z.infer<typeof insertRitualGroupSchema>;

export const widgetStates = pgTable("widget_states", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  states: jsonb("states").notNull().default({}),
});

export const insertWidgetStatesSchema = createInsertSchema(widgetStates).omit({
  id: true,
});

export type WidgetStates = typeof widgetStates.$inferSelect;
export type InsertWidgetStates = z.infer<typeof insertWidgetStatesSchema>;

export const userActivityEvents = pgTable("user_activity_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertUserActivityEventSchema = createInsertSchema(userActivityEvents).omit({
  id: true,
  occurredAt: true,
});

export type UserActivityEvent = typeof userActivityEvents.$inferSelect;
export type InsertUserActivityEvent = z.infer<typeof insertUserActivityEventSchema>;

export const smartReminders = pgTable("smart_reminders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  reminderType: text("reminder_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  source: text("source").notNull().default("default"),
  preferredHour: integer("preferred_hour").notNull().default(9),
  preferredDays: text("preferred_days").array().notNull().default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  cooldownHours: integer("cooldown_hours").notNull().default(20),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("smart_reminders_user_type_idx").on(table.userId, table.reminderType),
]);

export const insertSmartReminderSchema = createInsertSchema(smartReminders).omit({
  id: true,
  createdAt: true,
});

export type SmartReminder = typeof smartReminders.$inferSelect;
export type InsertSmartReminder = z.infer<typeof insertSmartReminderSchema>;

export const missionViews = pgTable("mission_views", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  viewType: text("view_type").notNull(),
  filters: jsonb("filters").default({}),
  columns: jsonb("columns").default([]),
  sortBy: text("sort_by"),
  sortDirection: text("sort_direction"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const missionViewsRelations = relations(missionViews, ({ one }) => ({
  user: one(users, {
    fields: [missionViews.userId],
    references: [users.id],
  }),
}));

export const insertMissionViewSchema = createInsertSchema(missionViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MissionView = typeof missionViews.$inferSelect;
export type InsertMissionView = z.infer<typeof insertMissionViewSchema>;

export const waitlistEmails = pgTable("waitlist_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  referralSource: text("referral_source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWaitlistEmailSchema = createInsertSchema(waitlistEmails).omit({
  id: true,
  createdAt: true,
});

export type WaitlistEmail = typeof waitlistEmails.$inferSelect;
export type InsertWaitlistEmail = z.infer<typeof insertWaitlistEmailSchema>;

// UMH federation bridge. LyfeOS remains authoritative for missions; these
// records provide durable, replay-safe coordination at the HTTPS boundary.
export const umhFederationInstallations = pgTable("umh_federation_installations", {
  id: serial("id").primaryKey(),
  installationId: text("installation_id").notNull().unique(),
  tenantId: text("tenant_id").notNull(),
  keyId: text("key_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const umhInboundCommands = pgTable("umh_inbound_commands", {
  id: serial("id").primaryKey(),
  commandId: text("command_id").notNull().unique(),
  nonce: text("nonce").notNull().unique(),
  installationId: text("installation_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  localUserId: integer("local_user_id").notNull().references(() => users.id),
  capability: text("capability").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull().default("received"),
  outcome: jsonb("outcome"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("umh_command_idempotency_idx").on(
    table.installationId,
    table.localUserId,
    table.capability,
    table.idempotencyKey,
  ),
]);

export const umhApprovalRequests = pgTable("umh_approval_requests", {
  id: serial("id").primaryKey(),
  commandId: text("command_id").notNull().references(() => umhInboundCommands.commandId),
  risk: text("risk").notNull(),
  state: text("state").notNull().default("not_required"),
  rationale: text("rationale"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const umhAuditRecords = pgTable("umh_audit_records", {
  id: serial("id").primaryKey(),
  commandId: text("command_id").references(() => umhInboundCommands.commandId),
  action: text("action").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  localUserId: integer("local_user_id").references(() => users.id),
  correlationId: text("correlation_id"),
  details: jsonb("details").notNull().default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export const umhOutboxEvents = pgTable("umh_outbox_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UMHInboundCommand = typeof umhInboundCommands.$inferSelect;
export type UMHOutboxEvent = typeof umhOutboxEvents.$inferSelect;

// Nutrition is deliberately modeled as factual diary data: each entry points
// to an owned food record and nutrient quantities retain their source.
export const nutritionFoods = pgTable("nutrition_foods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  source: text("source").notNull().default("manual"),
  catalogProviderId: text("catalog_provider_id"),
  catalogExternalId: text("catalog_external_id"),
  catalogDatasetVersion: text("catalog_dataset_version"),
  catalogItemVersion: text("catalog_item_version"),
  catalogAttributionText: text("catalog_attribution_text"),
  catalogAttributionUrl: text("catalog_attribution_url"),
  catalogTerritory: text("catalog_territory"),
  catalogImportedAt: timestamp("catalog_imported_at"),
  catalogSourceModified: boolean("catalog_source_modified").notNull().default(false),
  servingSizeGrams: real("serving_size_grams").notNull().default(100),
  densityGramsPerMl: real("density_grams_per_ml"),
  favorite: boolean("favorite").notNull().default(false),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("nutrition_foods_user_name_idx").on(table.userId, table.name),
  uniqueIndex("nutrition_foods_user_catalog_item_unique_idx").on(
    table.userId, table.catalogProviderId, table.catalogExternalId, table.catalogDatasetVersion, table.catalogItemVersion,
  ),
]);

export const nutritionFoodNutrients = pgTable("nutrition_food_nutrients", {
  id: serial("id").primaryKey(),
  foodId: integer("food_id").notNull().references(() => nutritionFoods.id, { onDelete: "cascade" }),
  nutrientKey: text("nutrient_key").notNull(),
  amountPer100g: real("amount_per_100g").notNull(),
  unit: text("unit").notNull(),
  source: text("source").notNull().default("manual"),
}, (table) => [uniqueIndex("nutrition_food_nutrients_unique_idx").on(table.foodId, table.nutrientKey)]);

export const nutritionFoodPortions = pgTable("nutrition_food_portions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  foodId: integer("food_id").notNull().references(() => nutritionFoods.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  gramsPerUnit: real("grams_per_unit").notNull(),
  source: text("source").notNull().default("manual"),
  catalogLabel: text("catalog_label"),
  catalogGramsPerUnit: real("catalog_grams_per_unit"),
  sourceModified: boolean("source_modified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("nutrition_food_portions_food_label_unique_idx").on(table.foodId, table.label), index("nutrition_food_portions_user_idx").on(table.userId, table.foodId)]);

export const nutritionDiaryEntries = pgTable("nutrition_diary_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  foodId: integer("food_id").notNull().references(() => nutritionFoods.id, { onDelete: "cascade" }),
  servingGrams: real("serving_grams").notNull(),
  inputQuantity: real("input_quantity"),
  inputUnit: text("input_unit"),
  inputPortionId: integer("input_portion_id").references(() => nutritionFoodPortions.id, { onDelete: "set null" }),
  inputUnitLabel: text("input_unit_label"),
  inputGramsPerUnit: real("input_grams_per_unit"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  nutrientSnapshot: jsonb("nutrient_snapshot").notNull().default([]),
  mealSlot: text("meal_slot").notNull().default("other"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("nutrition_diary_entries_user_occurred_idx").on(table.userId, table.occurredAt)]);

export const nutritionRecipes = pgTable("nutrition_recipes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  servings: real("servings").notNull().default(1),
  note: text("note"),
  folder: text("folder"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("nutrition_recipes_user_name_idx").on(table.userId, table.name)]);

export const nutritionRecipeIngredients = pgTable("nutrition_recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => nutritionRecipes.id, { onDelete: "cascade" }),
  foodId: integer("food_id").notNull().references(() => nutritionFoods.id, { onDelete: "restrict" }),
  grams: real("grams").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [uniqueIndex("nutrition_recipe_ingredients_unique_idx").on(table.recipeId, table.foodId)]);

export const nutritionRecipeRevisions = pgTable("nutrition_recipe_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").notNull().references(() => nutritionRecipes.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  name: text("name").notNull(),
  servings: real("servings").notNull(),
  folder: text("folder"),
  note: text("note"),
  ingredientsSnapshot: jsonb("ingredients_snapshot").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("nutrition_recipe_revisions_number_unique_idx").on(table.recipeId, table.revisionNumber), index("nutrition_recipe_revisions_user_idx").on(table.userId, table.recipeId)]);

export const nutritionMealPlans = pgTable("nutrition_meal_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("active"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("nutrition_meal_plans_user_date_idx").on(table.userId, table.startDate)]);

export const nutritionMealPlanEntries = pgTable("nutrition_meal_plan_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => nutritionMealPlans.id, { onDelete: "cascade" }),
  scheduledDate: date("scheduled_date").notNull(),
  mealSlot: text("meal_slot").notNull(),
  foodId: integer("food_id").references(() => nutritionFoods.id, { onDelete: "restrict" }),
  recipeId: integer("recipe_id").references(() => nutritionRecipes.id, { onDelete: "restrict" }),
  quantity: real("quantity").notNull(),
  inputUnit: text("input_unit").notNull(),
  inputPortionId: integer("input_portion_id").references(() => nutritionFoodPortions.id, { onDelete: "set null" }),
  status: text("status").notNull().default("planned"),
  loggedDiaryEntryIds: jsonb("logged_diary_entry_ids").notNull().default([]),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("nutrition_meal_plan_entries_user_date_idx").on(table.userId, table.scheduledDate)]);

// Captures the label exactly as supplied. Classifications are intentionally
// evidence-aware records, never a blanket medical or safety conclusion.
export const ingredientScans = pgTable("ingredient_scans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  captureMethod: text("capture_method").notNull().default("manual_label"),
  barcode: text("barcode"),
  productName: text("product_name"),
  rawIngredientsText: text("raw_ingredients_text").notNull(),
  catalogProviderId: text("catalog_provider_id"),
  catalogExternalId: text("catalog_external_id"),
  catalogDatasetVersion: text("catalog_dataset_version"),
  catalogItemVersion: text("catalog_item_version"),
  catalogAttributionText: text("catalog_attribution_text"),
  catalogAttributionUrl: text("catalog_attribution_url"),
  catalogTerritory: text("catalog_territory"),
  catalogSourceModified: boolean("catalog_source_modified").notNull().default(false),
  parseVersion: text("parse_version").notNull().default("v1"),
  status: text("status").notNull().default("reviewed"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("ingredient_scans_user_created_idx").on(table.userId, table.createdAt), index("ingredient_scans_user_barcode_idx").on(table.userId, table.barcode)]);

export const ingredientScanItems = pgTable("ingredient_scan_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scanId: integer("scan_id").notNull().references(() => ingredientScans.id, { onDelete: "cascade" }),
  rawName: text("raw_name").notNull(),
  normalizedKey: text("normalized_key").notNull(),
  sourceOrder: integer("source_order").notNull(),
  classification: text("classification").notNull().default("unknown"),
  reason: text("reason"),
  evidenceTitle: text("evidence_title"),
  evidenceUrl: text("evidence_url"),
  evidenceStrength: text("evidence_strength").notNull().default("unverified"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ingredient_scan_items_scan_order_unique_idx").on(table.scanId, table.sourceOrder),
  index("ingredient_scan_items_user_normalized_idx").on(table.userId, table.normalizedKey),
]);

export const ingredientPreferenceRules = pgTable("ingredient_preference_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  normalizedKey: text("normalized_key").notNull(),
  preferenceType: text("preference_type").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("ingredient_preference_rules_user_key_unique_idx").on(table.userId, table.normalizedKey)]);

export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(),
  durationMinutes: integer("duration_minutes"),
  perceivedExertion: integer("perceived_exertion"),
  movingTimeSeconds: integer("moving_time_seconds"),
  elevationGainMeters: real("elevation_gain_meters"),
  averageHeartRateBpm: integer("average_heart_rate_bpm"),
  maxHeartRateBpm: integer("max_heart_rate_bpm"),
  heartRateSource: text("heart_rate_source"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  note: text("note"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("workouts_user_occurred_idx").on(table.userId, table.occurredAt)]);

export const healthDeletionReceipts = pgTable("health_deletion_receipts", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(),
  resourceSnapshot: jsonb("resource_snapshot").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  restoredAt: timestamp("restored_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("health_deletion_receipts_user_expiry_idx").on(table.userId, table.expiresAt)]);

export const healthDataRightsAudit = pgTable("health_data_rights_audit", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  scope: text("scope").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("health_data_rights_audit_user_created_idx").on(table.userId, table.createdAt)]);

// Evidence selectors remain in the private Health domain. Confirmed missions
// receive only the user's chosen title/category and a generic receipt note.
export const healthPlanningDrafts = pgTable("health_planning_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  evidenceStart: date("evidence_start").notNull(),
  evidenceEnd: date("evidence_end").notNull(),
  evidenceSeries: jsonb("evidence_series").notNull().default([]),
  state: text("state").notNull().default("pending"),
  questId: integer("quest_id").references(() => quests.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull().default(sql`now() + interval '7 days'`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (table) => [
  index("health_planning_drafts_user_state_created_idx").on(table.userId, table.state, table.createdAt),
  index("health_planning_drafts_state_decided_idx").on(table.state, table.decidedAt),
]);

export const healthPlanningDraftEvents = pgTable("health_planning_draft_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  draftId: integer("draft_id").notNull().references(() => healthPlanningDrafts.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // created | confirmed | rejected | expired | revoked
  titleSnapshot: text("title_snapshot").notNull(),
  categorySnapshot: text("category_snapshot").notNull(),
  questIdSnapshot: integer("quest_id_snapshot"),
  scopeSnapshot: text("scope_snapshot").notNull().default("mission_title_only"),
  expiresAtSnapshot: timestamp("expires_at_snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("health_planning_draft_events_draft_action_unique_idx").on(table.draftId, table.action),
  index("health_planning_draft_events_user_created_idx").on(table.userId, table.createdAt),
]);

export const workoutExercises = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sets: integer("sets"),
  reps: integer("reps"),
  loadValue: real("load_value"),
  loadUnit: text("load_unit"),
  distanceMeters: real("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  sortOrder: integer("sort_order").notNull().default(0),
  note: text("note"),
}, (table) => [index("workout_exercises_workout_idx").on(table.workoutId)]);

// Individual performed attempts. These are deliberately separate from the
// older aggregate fields on workout_exercises so historic entries remain
// portable and new logs can accurately vary set-level reps/load/RPE.
export const workoutSets = pgTable("workout_sets", {
  id: serial("id").primaryKey(),
  workoutExerciseId: integer("workout_exercise_id").notNull().references(() => workoutExercises.id, { onDelete: "cascade" }),
  setOrder: integer("set_order").notNull().default(0),
  reps: integer("reps"),
  loadValue: real("load_value"),
  loadUnit: text("load_unit"),
  distanceMeters: real("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  perceivedExertion: integer("perceived_exertion"),
  repsInReserve: integer("reps_in_reserve"),
  completed: boolean("completed").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("workout_sets_exercise_order_unique_idx").on(table.workoutExerciseId, table.setOrder)]);

// User-owned definitions are private custom records. A null userId is reserved
// for a future reviewed/licensed shared catalog with explicit source versioning.
export const exerciseDefinitions = pgTable("exercise_definitions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  equipment: text("equipment"),
  primaryMuscles: jsonb("primary_muscles").notNull().default([]),
  secondaryMuscles: jsonb("secondary_muscles").notNull().default([]),
  instructions: text("instructions"),
  source: text("source").notNull().default("user_custom"),
  sourceVersion: text("source_version"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("exercise_definitions_user_name_unique_idx").on(table.userId, table.name),
  index("exercise_definitions_name_idx").on(table.name),
]);

// Planned values only. Loading a template pre-fills a draft; only a submitted
// workout creates factual completed set records.
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  activityType: text("activity_type").notNull(),
  exerciseBlueprint: jsonb("exercise_blueprint").notNull().default([]),
  folder: text("folder"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workout_templates_user_name_idx").on(table.userId, table.name)]);

export const workoutTemplateRevisions = pgTable("workout_template_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => workoutTemplates.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  name: text("name").notNull(),
  activityType: text("activity_type").notNull(),
  folder: text("folder"),
  note: text("note"),
  exerciseBlueprint: jsonb("exercise_blueprint").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  }, (table) => [uniqueIndex("workout_template_revisions_number_unique_idx").on(table.templateId, table.revisionNumber), index("workout_template_revisions_user_idx").on(table.userId, table.templateId)]);

export const workoutRevisions = pgTable("workout_revisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("workout_revisions_number_unique_idx").on(table.workoutId, table.revisionNumber), index("workout_revisions_user_idx").on(table.userId, table.workoutId)]);

export const workoutPrograms = pgTable("workout_programs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("workout_programs_user_idx").on(table.userId, table.updatedAt)]);

// Scheduled sessions are plans. They become completed only when linked to an
// owned submitted workout, keeping planned targets separate from evidence.
export const workoutProgramSessions = pgTable("workout_program_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  programId: integer("program_id").notNull().references(() => workoutPrograms.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => workoutTemplates.id, { onDelete: "set null" }),
  originalTemplateId: integer("original_template_id").references(() => workoutTemplates.id, { onDelete: "set null" }),
  substitutionReason: text("substitution_reason"),
  substitutedAt: timestamp("substituted_at"),
  recurrenceGroupId: uuid("recurrence_group_id"),
  recurrenceIndex: integer("recurrence_index"),
  missionId: integer("mission_id").references(() => quests.id, { onDelete: "set null" }),
  completedWorkoutId: integer("completed_workout_id").references(() => workouts.id, { onDelete: "set null" }),
  completionLinkLostAt: timestamp("completion_link_lost_at"),
  title: text("title").notNull(),
  scheduledDate: date("scheduled_date").notNull(),
  status: text("status").notNull().default("planned"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("workout_program_sessions_user_date_idx").on(table.userId, table.scheduledDate),
  index("workout_program_sessions_user_mission_idx").on(table.userId, table.missionId),
  index("workout_program_sessions_status_completion_idx").on(table.status, table.completedWorkoutId, table.completionLinkLostAt),
  index("workout_program_sessions_completed_workout_idx").on(table.completedWorkoutId),
]);

export const heartRateZoneProfiles = pgTable("heart_rate_zone_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").notNull().default("user"),
  methodId: text("method_id"),
  methodVersion: text("method_version"),
  zones: jsonb("zones").notNull(),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("heart_rate_zone_profiles_user_idx").on(table.userId, table.updatedAt)]);

export const workoutHeartRateSamples = pgTable("workout_heart_rate_samples", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  sampledAt: timestamp("sampled_at").notNull(),
  bpm: integer("bpm").notNull(),
  source: text("source").notNull(),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("workout_hr_samples_workout_time_source_unique_idx").on(table.workoutId, table.sampledAt, table.source), index("workout_hr_samples_user_workout_idx").on(table.userId, table.workoutId, table.sampledAt)]);

// A factual private record only: this is not a medication list, dose advice,
// or a clinical recommendation surface.
export const supplementEntries = pgTable("supplement_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: real("amount"),
  unit: text("unit"),
  brand: text("brand"),
  manufacturer: text("manufacturer"),
  form: text("form"),
  barcode: text("barcode"),
  lotNumber: text("lot_number"),
  expiresOn: date("expires_on"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("supplement_entries_user_occurred_idx").on(table.userId, table.occurredAt), uniqueIndex("supplement_entries_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`)]);

export const supplementSchedules = pgTable("supplement_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: real("amount"),
  unit: text("unit"),
  brand: text("brand"),
  manufacturer: text("manufacturer"),
  form: text("form"),
  barcode: text("barcode"),
  lotNumber: text("lot_number"),
  expiresOn: date("expires_on"),
  cadence: text("cadence").notNull().default("daily"),
  weekdays: jsonb("weekdays").notNull().default([]),
  timeOfDay: text("time_of_day"),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("supplement_schedules_user_idx").on(table.userId, table.active)]);

export const supplementScheduleEvents = pgTable("supplement_schedule_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scheduleId: integer("schedule_id").notNull().references(() => supplementSchedules.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  status: text("status").notNull(),
  supplementEntryId: integer("supplement_entry_id").references(() => supplementEntries.id, { onDelete: "set null" }),
  nameSnapshot: text("name_snapshot").notNull(),
  amountSnapshot: real("amount_snapshot"),
  unitSnapshot: text("unit_snapshot"),
  timeOfDaySnapshot: text("time_of_day_snapshot"),
  brandSnapshot: text("brand_snapshot"),
  manufacturerSnapshot: text("manufacturer_snapshot"),
  formSnapshot: text("form_snapshot"),
  barcodeSnapshot: text("barcode_snapshot"),
  lotNumberSnapshot: text("lot_number_snapshot"),
  expiresOnSnapshot: date("expires_on_snapshot"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("supplement_schedule_events_schedule_date_unique_idx").on(table.scheduleId, table.date)]);

export const fastingWindows = pgTable("fasting_windows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  note: text("note"),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("fasting_windows_user_started_idx").on(table.userId, table.startedAt)]);

export const recoveryRoutines = pgTable("recovery_routines", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  activityType: text("activity_type").notNull(),
  customLabel: text("custom_label"),
  durationMinutes: integer("duration_minutes"),
  intensity: integer("intensity"),
  cadence: text("cadence").notNull().default("daily"),
  weekdays: jsonb("weekdays").notNull().default([]),
  timeOfDay: text("time_of_day"),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  tags: jsonb("tags").notNull().default([]),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("recovery_routines_user_active_idx").on(table.userId, table.active)]);

// Recovery tags never become sharing labels. Classification lets the owner
// identify especially sensitive vocabulary while every class remains private.
export const recoveryTagPolicies = pgTable("recovery_tag_policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  normalizedTag: text("normalized_tag").notNull(),
  displayTag: text("display_tag").notNull(),
  classification: text("classification").notNull().default("private_sensitive"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("recovery_tag_policies_user_tag_unique_idx").on(table.userId, table.normalizedTag)]);

export const recoveryActivities = pgTable("recovery_activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  routineId: integer("routine_id").references(() => recoveryRoutines.id, { onDelete: "set null" }),
  activityType: text("activity_type").notNull(),
  customLabel: text("custom_label"),
  durationMinutes: integer("duration_minutes"),
  intensity: integer("intensity"),
  perceivedEffect: integer("perceived_effect"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  note: text("note"),
  tags: jsonb("tags").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("recovery_activities_user_occurred_idx").on(table.userId, table.occurredAt),
  uniqueIndex("recovery_activities_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`),
]);

export const healthMetricDefinitions = pgTable("health_metric_definitions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(),
  displayName: text("display_name").notNull(),
  category: text("category").notNull(),
  canonicalUnit: text("canonical_unit").notNull(),
  definitionSource: text("definition_source").notNull().default("user"),
  sourceUrl: text("source_url"),
  version: text("version").notNull(),
  validMin: real("valid_min"),
  validMax: real("valid_max"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_metric_definitions_key_version_unique_idx").on(table.userId, table.metricKey, table.version), index("health_metric_definitions_user_active_idx").on(table.userId, table.active)]);

// A panel is a user-owned view recipe, not a derived health conclusion. It
// stores only series selectors and presentation choices; the chart always
// resolves fresh values from the private source ledgers.
export const healthMetricPanels = pgTable("health_metric_panels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  leftSeriesId: text("left_series_id").notNull(),
  rightSeriesId: text("right_series_id").notNull(),
  seriesIds: jsonb("series_ids").notNull().default([]),
  periodDays: integer("period_days").notNull().default(30),
  rollingAverage: boolean("rolling_average").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("health_metric_panels_user_name_unique_idx").on(table.userId, table.name),
  index("health_metric_panels_user_updated_idx").on(table.userId, table.updatedAt),
]);

// Health observations preserve the fact as measured. They intentionally do
// not encode diagnosis or a universal reference-range interpretation.
export const healthObservations = pgTable("health_observations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricDefinitionId: integer("metric_definition_id").references(() => healthMetricDefinitions.id, { onDelete: "set null" }),
  definitionVersion: text("definition_version"),
  category: text("category").notNull(),
  metricKey: text("metric_key").notNull(),
  displayName: text("display_name").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  method: text("method"),
  methodVersion: text("method_version"),
  source: text("source").notNull().default("manual"),
  recordedTimeZone: text("recorded_time_zone"),
  recordedUtcOffsetMinutes: integer("recorded_utc_offset_minutes"),
  clientMutationId: text("client_mutation_id"),
  mutationPayloadHash: text("mutation_payload_hash"),
  sourceRecordId: text("source_record_id"),
  deviceName: text("device_name"),
  importedAt: timestamp("imported_at"),
  observedAt: timestamp("observed_at").notNull(),
  temporalType: text("temporal_type").notNull().default("instant"),
  intervalStartAt: timestamp("interval_start_at"),
  intervalEndAt: timestamp("interval_end_at"),
  aggregationKind: text("aggregation_kind").notNull().default("average"),
  labName: text("lab_name"),
  specimenType: text("specimen_type"),
  collectedAt: timestamp("collected_at"),
  referenceLow: real("reference_low"),
  referenceHigh: real("reference_high"),
  referenceUnit: text("reference_unit"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("health_observations_user_category_metric_date_idx").on(table.userId, table.category, table.metricKey, table.observedAt),
  index("health_observations_user_metric_source_date_idx").on(table.userId, table.metricKey, table.unit, table.source, table.observedAt),
  index("health_observations_user_metric_interval_idx").on(table.userId, table.metricKey, table.intervalStartAt, table.intervalEndAt),
  index("health_observations_user_collected_at_idx").on(table.userId, table.collectedAt),
  uniqueIndex("health_observations_user_mutation_unique_idx").on(table.userId, table.clientMutationId).where(sql`${table.clientMutationId} IS NOT NULL`),
]);

// User-controlled calculation preferences never alter the source observation.
// They only determine whether a preserved fact participates in derived totals.
export const healthObservationCalculationPreferences = pgTable("health_observation_calculation_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  observationId: integer("observation_id").notNull().references(() => healthObservations.id, { onDelete: "cascade" }),
  included: boolean("included").notNull().default(true),
  reason: text("reason").notNull().default("overlap_resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_observation_calculation_preferences_user_observation_unique_idx").on(table.userId, table.observationId)]);

export const healthProgressionEvents = pgTable("health_progression_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  ruleKey: text("rule_key").notNull(),
  evidenceDate: date("evidence_date").notNull(),
  xpDelta: integer("xp_delta").notNull(),
  action: text("action").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  reversalOfId: integer("reversal_of_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_progression_events_user_key_unique_idx").on(table.userId, table.eventKey), index("health_progression_events_user_created_idx").on(table.userId, table.createdAt)]);

export const healthBadgeEvents = pgTable("health_badge_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  badgeKey: text("badge_key").notNull(),
  action: text("action").notNull(),
  evidence: jsonb("evidence").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_badge_events_user_key_unique_idx").on(table.userId, table.eventKey), index("health_badge_events_user_badge_created_idx").on(table.userId, table.badgeKey, table.createdAt)]);

// A user-authored review of recorded practice. It is reflection evidence, not
// a health outcome, clinician note, or verification that an activity occurred.
export const healthPracticeReviews = pgTable("health_practice_reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewDate: date("review_date").notNull(),
  domains: jsonb("domains").notNull().default([]),
  reflection: text("reflection").notNull(),
  nextExperiment: text("next_experiment"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("health_practice_reviews_user_date_unique_idx").on(table.userId, table.reviewDate), index("health_practice_reviews_user_date_idx").on(table.userId, table.reviewDate)]);

// Metadata-only model receipts intentionally omit the private question, source
// values, and model output. Those values live only in the originating response.
export const healthAiRequests = pgTable("health_ai_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  seriesIds: jsonb("series_ids").notNull().default([]),
  periodDays: integer("period_days").notNull(),
  sourceSummary: jsonb("source_summary").notNull().default([]),
  provider: text("provider").notNull().default("none"),
  model: text("model"),
  state: text("state").notNull().default("started"),
  boundaryKind: text("boundary_kind"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [index("health_ai_requests_user_created_idx").on(table.userId, table.createdAt)]);

// A structured model proposal is inert until the user saves or rejects it.
// Even a saved proposal remains an assistant draft, not a verified health fact.
export const healthAiDrafts = pgTable("health_ai_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: integer("request_id").notNull().references(() => healthAiRequests.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  reflection: text("reflection").notNull(),
  domains: jsonb("domains").notNull().default([]),
  nextExperiment: text("next_experiment"),
  state: text("state").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (table) => [index("health_ai_drafts_user_state_created_idx").on(table.userId, table.state, table.createdAt), uniqueIndex("health_ai_drafts_request_unique_idx").on(table.requestId)]);
