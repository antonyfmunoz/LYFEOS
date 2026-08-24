import { describe, expect, it } from "vitest";
import { buildRelationshipProjection, guidedRelationshipCheckInInput, relationshipAssessmentInput, relationshipConsentInput } from "../shared/relationships";

describe("relationship intelligence governance contract", () => {
  it("requires every bounded self-assessment dimension", () => {
    expect(relationshipAssessmentInput.safeParse({ assessmentKind: "baseline", dimensions: { connection: 4, trust: 4, reciprocity: 3, communication: 3, boundaryAlignment: 5, repairConfidence: 3 } }).success).toBe(true);
    expect(relationshipAssessmentInput.safeParse({ assessmentKind: "baseline", dimensions: { connection: 6 } }).success).toBe(false);
  });

  it("requires structured guided check-in context rather than inferred sentiment", () => {
    expect(guidedRelationshipCheckInInput.safeParse({ kind: "check_in", summary: "We discussed the planned visit.", structuredData: { connection: 4, energyImpact: 1, boundaryAlignment: 5, followUpNeeded: false } }).success).toBe(true);
    expect(guidedRelationshipCheckInInput.safeParse({ kind: "check_in", summary: "Fine" }).success).toBe(false);
  });

  it("keeps AI and ecosystem consent purposes from inheriting from each other", () => {
    expect(relationshipConsentInput.safeParse({ purpose: "ai_recommendation", allowedScopes: ["assessments"], allowedDestinations: [], expiresInDays: 30, disclosureAccepted: true }).success).toBe(true);
    expect(relationshipConsentInput.safeParse({ purpose: "ai_recommendation", allowedScopes: ["assessments"], allowedDestinations: ["umh"], expiresInDays: 30, disclosureAccepted: true }).success).toBe(false);
    expect(relationshipConsentInput.safeParse({ purpose: "ecosystem_share", allowedScopes: ["check_ins"], allowedDestinations: ["umh"], expiresInDays: 30, disclosureAccepted: true }).success).toBe(false);
  });

  it("builds a minimal contract with no contact or private-content fields", () => {
    const projection = buildRelationshipProjection({ relationshipRef: "95c6ef3b-b287-4419-9fbf-3d5fb186f522", relationshipKind: "friend", state: "active", openCommitmentCount: 2, destination: "umh", allowedScopes: ["identity", "lifecycle", "commitment_status"], consentId: "802366d5-15d4-4fc7-bf8d-da9cd0fe7832", consentExpiresAt: new Date("2026-09-01T00:00:00Z") });
    expect(projection).toMatchObject({ schema: "umh.relationship_event.v1", eventType: "relationship.snapshot.shared", sourceProduct: "lyfeos", data: { relationshipKind: "friend", state: "active", openCommitmentCount: 2 } });
    expect(Object.keys(projection)).toEqual(["schema", "eventType", "sourceProduct", "destination", "relationshipRef", "consent", "data", "disclosure"]);
    expect(Object.keys(projection.data)).toEqual(["relationshipKind", "state", "openCommitmentCount"]);
  });
});
