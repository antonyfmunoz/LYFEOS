import { z } from "zod";

export const hypothesisDomains = ["missions", "daily_state", "health"] as const;
export const hypothesisDomainSchema = z.enum(hypothesisDomains);
export type HypothesisDomain = z.infer<typeof hypothesisDomainSchema>;

export const HYPOTHESIS_CONSENT_VERSION = "cross-domain-hypotheses.v1";
export const HYPOTHESIS_CALCULATION_VERSION = "pearson-daily-leave-one-out.v1";

export const hypothesisSignalRegistry = [
  { id: "missions.completed_count", domain: "missions", label: "Completed missions", unit: "missions", aggregation: "sum", provenance: "Canonical Missions completed in LyfeOS", quality: "recorded_activity" },
  { id: "missions.created_count", domain: "missions", label: "Created missions", unit: "missions", aggregation: "sum", provenance: "Canonical Missions created in LyfeOS", quality: "recorded_activity" },
  { id: "daily_state.mental_state", domain: "daily_state", label: "Mental state reflection", unit: "1–10", aggregation: "average", provenance: "User-authored Daily Initialization reflection", quality: "self_report" },
  { id: "daily_state.physical_state", domain: "daily_state", label: "Physical state reflection", unit: "1–10", aggregation: "average", provenance: "User-authored Daily Initialization reflection", quality: "self_report" },
  { id: "daily_state.emotional_state", domain: "daily_state", label: "Emotional state reflection", unit: "1–10", aggregation: "average", provenance: "User-authored Daily Initialization reflection", quality: "self_report" },
  { id: "daily_state.sleep_quality", domain: "daily_state", label: "Sleep quality reflection", unit: "1–5", aggregation: "average", provenance: "User-authored Daily Initialization reflection", quality: "self_report" },
  { id: "health.workout_minutes", domain: "health", label: "Recorded training", unit: "minutes", aggregation: "sum", provenance: "Owner-visible workout records", quality: "mixed_source_record" },
  { id: "health.recovery_minutes", domain: "health", label: "Recorded recovery activity", unit: "minutes", aggregation: "sum", provenance: "Owner-visible recovery activity records", quality: "mixed_source_record" },
  { id: "health.hydration_ml", domain: "health", label: "Recorded hydration", unit: "ml", aggregation: "sum", provenance: "Owner-visible hydration records", quality: "mixed_source_record" },
  { id: "health.sleep_session_minutes", domain: "health", label: "Recorded sleep session", unit: "minutes", aggregation: "sum", provenance: "Owner-visible timestamped sleep sessions", quality: "mixed_source_record" },
] as const satisfies ReadonlyArray<{
  id: string;
  domain: HypothesisDomain;
  label: string;
  unit: string;
  aggregation: "sum" | "average";
  provenance: string;
  quality: "recorded_activity" | "self_report" | "mixed_source_record";
}>;

export type HypothesisSignal = typeof hypothesisSignalRegistry[number];
export const hypothesisSignalIds = hypothesisSignalRegistry.map((signal) => signal.id) as [string, ...string[]];
export const hypothesisSignalIdSchema = z.enum(hypothesisSignalIds);

export function hypothesisSignal(id: string): HypothesisSignal | null {
  return hypothesisSignalRegistry.find((signal) => signal.id === id) || null;
}

const hypothesisDefinitionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  leftSignalId: hypothesisSignalIdSchema,
  rightSignalId: hypothesisSignalIdSchema,
  periodDays: z.union([z.literal(14), z.literal(30), z.literal(60), z.literal(90), z.literal(180), z.literal(365)]),
  lagDays: z.number().int().min(-14).max(14).default(0),
  timeZone: z.string().min(1).max(100),
}).strict();

export const createHypothesisSchema = hypothesisDefinitionSchema.extend({
  acknowledgedExploratory: z.literal(true),
}).strict().superRefine((input, context) => {
  if (input.leftSignalId === input.rightSignalId) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose two different signals." });
});

export const updateHypothesisSchema = hypothesisDefinitionSchema.partial().extend({
  expectedRevision: z.number().int().positive(),
  status: z.enum(["active", "paused"]).optional(),
  acknowledgedExploratory: z.literal(true),
}).strict();

export const hypothesisConsentSchema = z.object({
  domain: hypothesisDomainSchema,
  state: z.enum(["enabled", "revoked"]),
  acknowledgedPrivateAnalysis: z.literal(true),
}).strict();

export const hypothesisInterpretationSchema = z.object({
  snapshotId: z.number().int().positive(),
  interpretation: z.enum(["worth_revisiting", "needs_more_context", "not_meaningful_to_me"]),
  note: z.string().trim().max(2_000).nullable().default(null),
  acknowledgedExploratory: z.literal(true),
  clientMutationId: z.string().uuid(),
}).strict();
