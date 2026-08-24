import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type EvidenceCheck = { criterionId?: string; requirement: string; met: boolean; note?: string };
export type RubricCriterion = {
  id: string;
  requirement: string;
  guidance: string;
  weight: 1 | 2 | 3;
  required: boolean;
};

export function normalizeRubricDefinition(requiredEvidence: unknown, rubricDefinition?: unknown): RubricCriterion[] {
  const requirements = Array.isArray(requiredEvidence)
    ? requiredEvidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
  if (Array.isArray(rubricDefinition) && rubricDefinition.length > 0) {
    const parsed = rubricDefinition.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const requirement = typeof record.requirement === "string" ? record.requirement.trim() : "";
      if (!requirement || !requirements.includes(requirement)) return [];
      const rawWeight = typeof record.weight === "number" ? Math.floor(record.weight) : 1;
      return [{
        id: typeof record.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(record.id) ? record.id : `criterion-${index + 1}`,
        requirement,
        guidance: typeof record.guidance === "string" && record.guidance.trim()
          ? record.guidance.trim().slice(0, 500)
          : "Compare this requirement with the submitted evidence.",
        weight: Math.max(1, Math.min(3, rawWeight)) as 1 | 2 | 3,
        required: record.required !== false,
      }];
    });
    if (parsed.length === requirements.length && new Set(parsed.map((item) => item.requirement)).size === requirements.length) return parsed;
  }
  return requirements.map((requirement, index) => ({
    id: `criterion-${index + 1}`,
    requirement,
    guidance: "Compare this requirement with the submitted evidence.",
    weight: 1,
    required: true,
  }));
}

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
  rubricDefinition?: unknown,
): { ok: true } | { ok: false; status: 400 | 409; error: string } {
  const criteria = normalizeRubricDefinition(requiredEvidence, rubricDefinition);
  const checkByCriterion = new Map(checks.map((check) => [check.criterionId || check.requirement, check.met]));
  const complete = criteria.every((criterion) => checkByCriterion.has(criterion.id) || checkByCriterion.has(criterion.requirement))
    && checkByCriterion.size === criteria.length;
  if (!complete) {
    return { ok: false, status: 400, error: "Review each declared evidence requirement before recording a decision." };
  }
  if (decision === "meets_evidence" && criteria.some((criterion) => criterion.required && !(checkByCriterion.get(criterion.id) ?? checkByCriterion.get(criterion.requirement)))) {
    return { ok: false, status: 409, error: "Every declared evidence requirement must be marked met before this mission can advance progression." };
  }
  return { ok: true };
}
