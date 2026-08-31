import crypto from "crypto";

export interface OAuthDisplayNameSeed {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

const MAX_BASE_LENGTH = 72;

function normalizedBase(seed: OAuthDisplayNameSeed): string {
  const fullName = [seed.firstName, seed.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const emailLocalPart = seed.email.split("@", 1)[0]?.replace(/\s+/g, " ").trim();
  const candidate = fullName || emailLocalPart || "Commander";
  return candidate.slice(0, MAX_BASE_LENGTH) || "Commander";
}

export function oauthDisplayNameCandidate(seed: OAuthDisplayNameSeed, attempt: number): string {
  const base = normalizedBase(seed);
  if (attempt <= 0) return base;

  const stableSuffix = crypto.createHash("sha256").update(seed.clerkId).digest("hex").slice(0, 6);
  const attemptSuffix = attempt === 1 ? stableSuffix : `${stableSuffix}-${attempt}`;
  return `${base.slice(0, MAX_BASE_LENGTH - attemptSuffix.length - 1)}-${attemptSuffix}`;
}

export function isDisplayNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const cause = record.cause && typeof record.cause === "object"
    ? record.cause as Record<string, unknown>
    : undefined;
  return (record.code === "23505" || cause?.code === "23505")
    && (record.constraint === "users_display_name_lower_unique"
      || cause?.constraint === "users_display_name_lower_unique");
}
