import { eq, and } from "drizzle-orm";
import { personalCapabilities } from "@shared/schema";

export function capabilityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "capability";
}

export function capabilityLevelForExperience(experience: number): number {
  let level = 1;
  let remaining = Math.max(0, experience);
  let threshold = 100;
  while (remaining >= threshold) {
    remaining -= threshold;
    level += 1;
    threshold = Math.floor(threshold * 1.35);
  }
  return level;
}

/** Find or create the private, durable capability behind a Thread-local node. */
export async function ensurePersonalCapability(
  tx: any,
  input: { userId: number; name: string; description: string },
) {
  const key = capabilityKey(input.name);
  const [existing] = await tx.select().from(personalCapabilities).where(and(
    eq(personalCapabilities.userId, input.userId),
    eq(personalCapabilities.key, key),
  )).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(personalCapabilities).values({
    userId: input.userId,
    key,
    name: input.name.trim(),
    description: input.description,
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await tx.select().from(personalCapabilities).where(and(
    eq(personalCapabilities.userId, input.userId),
    eq(personalCapabilities.key, key),
  )).limit(1);
  if (!concurrent) throw new Error("Could not create private capability.");
  return concurrent;
}
