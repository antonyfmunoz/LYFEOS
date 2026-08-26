import { and, desc, eq, inArray } from "drizzle-orm";
import { healthSourceRecords, missionEvidence, missionEvidenceProviderBindings } from "@shared/schema";
import { db } from "./db";

export type MissionEvidenceProvenance = {
  domain: "health";
  provider: string;
  recordType: string;
  observedAt: Date;
  receivedAt: Date;
  transformVersion: string;
  status: "active" | "superseded" | "source_deleted";
  disclosure: string;
};

export async function missionEvidenceForContracts(contractIds: number[], userId?: number) {
  if (!contractIds.length) return [];
  const rows = await db.select({
    evidence: missionEvidence,
    binding: missionEvidenceProviderBindings,
    sourceState: healthSourceRecords.state,
  }).from(missionEvidence)
    .leftJoin(missionEvidenceProviderBindings, eq(missionEvidenceProviderBindings.missionEvidenceId, missionEvidence.id))
    .leftJoin(healthSourceRecords, eq(healthSourceRecords.id, missionEvidenceProviderBindings.providerSourceRecordId))
    .where(and(
      inArray(missionEvidence.missionContractId, contractIds),
      userId ? eq(missionEvidence.userId, userId) : undefined,
    ))
    .orderBy(desc(missionEvidence.submittedAt));

  return rows.map(({ evidence, binding, sourceState }) => ({
    ...evidence,
    provenance: binding ? providerProvenance(binding, sourceState) : null,
  }));
}

export function providerEvidenceStatus(
  providerSourceRecordId: number | null,
  sourceState: string | null,
): MissionEvidenceProvenance["status"] {
  if (providerSourceRecordId == null) return "source_deleted";
  return sourceState === "active" ? "active" : "superseded";
}

function providerProvenance(
  binding: typeof missionEvidenceProviderBindings.$inferSelect,
  sourceState: string | null,
): MissionEvidenceProvenance {
  const status = providerEvidenceStatus(binding.providerSourceRecordId, sourceState);
  const disclosure = status === "active"
    ? "LyfeOS matched this receipt to the current imported provider record. It supports provenance, not mission completion by itself."
    : status === "superseded"
      ? "The imported provider record was corrected after this evidence was attached. This receipt preserves the original review context."
      : "The user deleted the imported provider record. This historical receipt remains, but LyfeOS can no longer match it to the private source.";
  return {
    domain: "health",
    provider: binding.provider,
    recordType: binding.recordType,
    observedAt: binding.observedAt,
    receivedAt: binding.receivedAt,
    transformVersion: binding.transformVersion,
    status,
    disclosure,
  };
}
