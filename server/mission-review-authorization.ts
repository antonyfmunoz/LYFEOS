import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type EvidenceCheck = { requirement: string; met: boolean };

export function createMissionReviewToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashMissionReviewToken(token) };
}

export function hashMissionReviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function missionReviewTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashMissionReviewToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateEvidenceChecks(
  requiredEvidence: unknown,
  checks: EvidenceCheck[],
  decision: "meets_evidence" | "revisions_needed",
): { ok: true } | { ok: false; status: 400 | 409; error: string } {
  const requirements = Array.isArray(requiredEvidence)
    ? requiredEvidence.filter((item): item is string => typeof item === "string")
    : [];
  const checkByRequirement = new Map(checks.map((check) => [check.requirement, check.met]));
  const complete = requirements.every((requirement) => checkByRequirement.has(requirement))
    && checkByRequirement.size === requirements.length;
  if (!complete) {
    return { ok: false, status: 400, error: "Review each declared evidence requirement before recording a decision." };
  }
  if (decision === "meets_evidence" && requirements.some((requirement) => !checkByRequirement.get(requirement))) {
    return { ok: false, status: 409, error: "Every declared evidence requirement must be marked met before this mission can advance progression." };
  }
  return { ok: true };
}
