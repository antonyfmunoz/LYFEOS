import { createHash } from "node:crypto";
import { z } from "zod";
import { healthProviderDefinition, type HealthProviderId } from "./health-connections";
import { canonicalHealthMetricRegistryVersion, normalizeCanonicalHealthMetric } from "./health-provider-metrics";
import { validateProviderSourceMetric, validateProviderTemporalSemantics } from "./health-provider-source-maps";

export const healthImportTransformVersion = "health-import-v3";
export const providerImportDirection = "read_only_import" as const;
export const providerHealthCategories = ["strength", "endurance", "cardiovascular", "flexibility", "mobility", "recovery", "body_composition", "lab", "other"] as const;

export function providerImportLockKey(userId: number, provider: HealthProviderId, sourceRecordId: string): string {
  return `health-import:${userId}:${provider}:${sourceRecordId}`;
}

export function healthSourceRecordKeyHash(provider: HealthProviderId, sourceRecordId: string): string {
  return createHash("sha256").update(`${provider}\u0000${sourceRecordId}`).digest("hex");
}

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const providerHealthEnvelopeSchema = z.object({
  sourceRecordId: z.string().trim().min(1).max(300),
  sourceMetricId: z.string().trim().min(1).max(300),
  observedAt: z.string().datetime(),
  intervalStartAt: z.string().datetime().optional(),
  intervalEndAt: z.string().datetime().optional(),
  metricKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(40),
  method: z.string().trim().max(120).nullable().optional(),
  deviceName: z.string().trim().max(160).nullable().optional(),
  sourceVersion: z.string().trim().min(1).max(80),
  sourceMetadata: z.record(primitive).default({}),
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function prepareProviderHealthImport(provider: HealthProviderId, input: unknown, receivedAt = new Date()) {
  const definition = healthProviderDefinition(provider);
  if (!definition) throw new Error("Unsupported health provider.");
  const parsed = providerHealthEnvelopeSchema.parse(input);
  const normalized = normalizeCanonicalHealthMetric(parsed.metricKey, parsed.value, parsed.unit);
  const sourceMapping = validateProviderSourceMetric(provider, parsed.sourceMetricId, normalized.definition.key, parsed.unit);
  const temporal = validateProviderTemporalSemantics(
    sourceMapping.entry,
    new Date(parsed.observedAt),
    parsed.intervalStartAt ? new Date(parsed.intervalStartAt) : undefined,
    parsed.intervalEndAt ? new Date(parsed.intervalEndAt) : undefined,
  );
  const fingerprintPayload = { provider, transformVersion: healthImportTransformVersion, registryVersion: canonicalHealthMetricRegistryVersion, sourceMapVersion: sourceMapping.sourceMap.version, ...parsed };
  const payloadFingerprint = createHash("sha256").update(canonicalJson(fingerprintPayload)).digest("hex");
  return {
    direction: providerImportDirection,
    sourceRecord: {
      provider, sourceRecordId: parsed.sourceRecordId, recordType: normalized.definition.recordType, observedAt: temporal.observedAt, receivedAt,
      payloadFingerprint, transformVersion: healthImportTransformVersion, state: "active" as const,
      sourcePayload: parsed,
      sourceMetadata: {
        ...parsed.sourceMetadata, sourceVersion: parsed.sourceVersion, sourceMetricId: parsed.sourceMetricId,
        canonicalMetricKey: normalized.definition.key, canonicalMetricRegistryVersion: canonicalHealthMetricRegistryVersion, providerSourceMapVersion: sourceMapping.sourceMap.version,
        temporalType: temporal.temporalType, intervalStartAt: temporal.intervalStartAt?.toISOString() || null, intervalEndAt: temporal.intervalEndAt?.toISOString() || null,
        originalValue: parsed.value, originalUnit: parsed.unit, method: parsed.method || null, deviceName: parsed.deviceName || null,
      },
    },
    observation: {
      category: normalized.definition.category, metricKey: normalized.definition.key, displayName: normalized.definition.displayName,
      value: normalized.value, unit: normalized.unit, observedAt: temporal.observedAt, temporalType: temporal.temporalType,
      intervalStartAt: temporal.intervalStartAt, intervalEndAt: temporal.intervalEndAt, aggregationKind: normalized.definition.aggregation, source: provider,
      sourceRecordId: parsed.sourceRecordId, method: parsed.method || null, methodVersion: parsed.sourceVersion, deviceName: parsed.deviceName || null,
      importedAt: receivedAt,
    },
    requiredScope: normalized.definition.scope,
  };
}

export function healthImportRetryDelayMs(consecutiveFailures: number): number {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 1) return 0;
  return Math.min(24 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(consecutiveFailures - 1, 20)));
}

export type CanonicalHealthCandidate = { id: string | number; source: string; value: number; unit: string; observedAt: Date; receivedAt: Date };

export function selectCanonicalHealthRecord(records: CanonicalHealthCandidate[], orderedSources: string[]) {
  const rank = new Map(orderedSources.map((source, index) => [source, index]));
  const ordered = records.slice().sort((left, right) => {
    const sourceOrder = (rank.get(left.source) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.source) ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrder !== 0) return sourceOrder;
    const receivedOrder = right.receivedAt.getTime() - left.receivedAt.getTime();
    return receivedOrder || String(left.id).localeCompare(String(right.id));
  });
  const canonical = ordered[0] || null;
  return {
    canonical,
    alternatives: canonical ? ordered.slice(1) : [],
    hasConflict: canonical ? ordered.slice(1).some((record) => record.unit !== canonical.unit || record.value !== canonical.value) : false,
    disclosure: "Source priority selects one record for display. Alternatives remain visible and are never summed, averaged, overwritten, or deleted.",
  };
}
