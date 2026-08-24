import { z } from "zod";

export const relationshipDimensionsSchema = z.object({
  connection: z.number().int().min(1).max(5),
  trust: z.number().int().min(1).max(5),
  reciprocity: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  boundaryAlignment: z.number().int().min(1).max(5),
  repairConfidence: z.number().int().min(1).max(5),
}).strict();

export const relationshipAssessmentInput = z.object({
  assessmentKind: z.enum(["baseline", "periodic", "transition"]),
  dimensions: relationshipDimensionsSchema,
  reflection: z.string().trim().max(2_000).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
}).strict();

export const guidedRelationshipCheckInInput = z.object({
  kind: z.enum(["check_in", "conversation", "shared_activity", "support", "reflection", "other"]),
  summary: z.string().trim().min(2).max(2_000),
  occurredAt: z.string().datetime().optional(),
  structuredData: z.object({
    connection: z.number().int().min(1).max(5),
    energyImpact: z.number().int().min(-2).max(2),
    boundaryAlignment: z.number().int().min(1).max(5),
    followUpNeeded: z.boolean(),
  }).strict(),
}).strict();

export const RELATIONSHIP_AI_SCOPES = ["profile", "assessments", "check_ins", "commitments"] as const;
export const RELATIONSHIP_SHARE_SCOPES = ["identity", "lifecycle", "commitment_status"] as const;
export const RELATIONSHIP_DESTINATIONS = ["umh", "entrepreneuros", "creatoros"] as const;
export const RELATIONSHIP_DISCLOSURE_VERSION = "lyfeos.relationship-governance.v1";

export const relationshipConsentInput = z.object({
  purpose: z.enum(["ai_recommendation", "ecosystem_share"]),
  allowedScopes: z.array(z.string()).min(1).max(4),
  allowedDestinations: z.array(z.enum(RELATIONSHIP_DESTINATIONS)).max(3).default([]),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  disclosureAccepted: z.literal(true),
}).strict().superRefine((value, ctx) => {
  const validScopes = value.purpose === "ai_recommendation" ? RELATIONSHIP_AI_SCOPES : RELATIONSHIP_SHARE_SCOPES;
  if (value.allowedScopes.some((scope) => !(validScopes as readonly string[]).includes(scope))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scope does not belong to this consent purpose." });
  if (value.purpose === "ecosystem_share" && value.allowedDestinations.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sharing consent needs a destination." });
  if (value.purpose === "ai_recommendation" && value.allowedDestinations.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "AI consent cannot authorize cross-product sharing." });
});

export type RelationshipProjectionInput = {
  relationshipRef: string;
  relationshipKind: string;
  state: string;
  openCommitmentCount: number;
  destination: string;
  allowedScopes: string[];
  consentId: string;
  consentExpiresAt: Date;
};

export function buildRelationshipProjection(input: RelationshipProjectionInput) {
  if (!RELATIONSHIP_DESTINATIONS.includes(input.destination as any)) throw new Error("Unsupported relationship destination.");
  const data: Record<string, unknown> = {};
  if (input.allowedScopes.includes("identity")) data.relationshipKind = input.relationshipKind;
  if (input.allowedScopes.includes("lifecycle")) data.state = input.state;
  if (input.allowedScopes.includes("commitment_status")) data.openCommitmentCount = input.openCommitmentCount;
  return {
    schema: "umh.relationship_event.v1",
    eventType: "relationship.snapshot.shared",
    sourceProduct: "lyfeos",
    destination: input.destination,
    relationshipRef: input.relationshipRef,
    consent: { id: input.consentId, expiresAt: input.consentExpiresAt.toISOString(), scopes: input.allowedScopes },
    data,
    disclosure: "No contact name, address, messages, private context, assessment notes, or check-in content is included.",
  } as const;
}
