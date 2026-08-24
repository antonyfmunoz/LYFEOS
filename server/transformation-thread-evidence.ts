import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { transformationThreadEvidence, transformationThreads } from "@shared/schema";

type EvidenceInput = {
  userId: number;
  sourceType: "mission_activity" | "mission_evidence_review" | "daily_reflection" | "weekly_review" | "thread_completion";
  sourceId: string;
  summary: string;
  transformationThreadId?: number;
};

export async function recordTransformationThreadEvidence(input: EvidenceInput): Promise<void> {
  const summary = input.summary.trim();
  if (!summary) return;

  let threadId = input.transformationThreadId;
  if (!threadId) {
    const [activeThread] = await db
      .select({ id: transformationThreads.id })
      .from(transformationThreads)
      .where(and(eq(transformationThreads.userId, input.userId), eq(transformationThreads.status, "active")))
      .limit(1);
    threadId = activeThread?.id;
  }
  if (!threadId) return;

  await db.insert(transformationThreadEvidence).values({
    userId: input.userId,
    transformationThreadId: threadId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    summary,
  }).onConflictDoUpdate({
    target: [
      transformationThreadEvidence.transformationThreadId,
      transformationThreadEvidence.sourceType,
      transformationThreadEvidence.sourceId,
    ],
    set: { summary, updatedAt: new Date() },
  });
}
