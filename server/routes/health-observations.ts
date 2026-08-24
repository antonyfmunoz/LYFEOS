import type { Express, Request, Response } from "express";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { healthConnections, healthMetricDefinitions, healthObservationCalculationPreferences, healthObservations, healthSourcePreferences, healthSourceRecords, healthSourceSuppressions } from "@shared/schema";
import { db } from "../db";
import { isAuthenticated } from "./middleware";
import { requestTimeContext } from "../health-fitness";
import { healthConnectionLockKey, healthProviderCatalog, healthProviderDefinition } from "../health-connections";
import { buildHealthSourceComparisons } from "../health-source-comparison";
import { healthSourceRecordKeyHash } from "../health-import";
import { canonicalHealthMetricDefinition, canonicalHealthMetricMigrationPolicy, canonicalHealthMetricRegistry, canonicalHealthMetricRegistryReleases, canonicalHealthMetricRegistryVersion } from "../health-provider-metrics";
import { buildHealthIntervalConflictGroups } from "../health-interval-conflicts";
import { healthMutationId, healthMutationPayloadHash } from "../health-mutation-integrity";

const categories = ["strength", "endurance", "cardiovascular", "flexibility", "mobility", "recovery", "body_composition", "lab", "other"] as const;
const sources = ["manual", "lab", "device", "imported"] as const;
const observableSources = new Set<string>([...sources, ...healthProviderCatalog.map((provider) => provider.id)]);
const definitionSources = ["user", "professional", "standard", "provider"] as const;

const definitionInput = z.object({
  metricKey: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(80),
  displayName: z.string().trim().min(1).max(120),
  category: z.enum(categories),
  canonicalUnit: z.string().trim().min(1).max(32),
  definitionSource: z.enum(definitionSources).default("user"),
  sourceUrl: z.string().trim().url().max(500).nullable().optional(),
  version: z.string().trim().min(1).max(40),
  validMin: z.number().finite().nullable().optional(),
  validMax: z.number().finite().nullable().optional(),
  active: z.boolean().default(true),
}).superRefine((input, context) => {
  if (input.validMin !== null && input.validMin !== undefined && input.validMax !== null && input.validMax !== undefined && input.validMin > input.validMax) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Validation minimum cannot exceed maximum." });
  }
});

const observationInput = z.object({
  metricDefinitionId: z.number().int().positive().nullable().optional(),
  category: z.enum(categories), metricKey: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(80), displayName: z.string().trim().min(1).max(120),
  value: z.number().finite().min(-1_000_000).max(1_000_000), unit: z.string().trim().min(1).max(32), method: z.string().trim().max(160).nullable().optional(),
  methodVersion: z.string().trim().max(80).nullable().optional(), source: z.enum(sources).default("manual"),
  sourceRecordId: z.string().trim().min(1).max(200).nullable().optional(), deviceName: z.string().trim().max(160).nullable().optional(),
  importedAt: z.string().datetime().nullable().optional(), observedAt: z.string().datetime().optional(),
  labName: z.string().trim().max(160).nullable().optional(), specimenType: z.string().trim().max(120).nullable().optional(), collectedAt: z.string().datetime().nullable().optional(), referenceLow: z.number().finite().nullable().optional(), referenceHigh: z.number().finite().nullable().optional(), referenceUnit: z.string().trim().max(32).nullable().optional(), note: z.string().trim().max(1000).nullable().optional(),
});
const validateObservation = (input: z.infer<typeof observationInput>, context: z.RefinementCtx) => {
  if ((input.referenceLow !== null && input.referenceLow !== undefined) || (input.referenceHigh !== null && input.referenceHigh !== undefined)) {
    if (!input.referenceUnit) context.addIssue({ code: z.ZodIssueCode.custom, message: "A reference unit is required with a reference range." });
    if (input.referenceLow !== null && input.referenceLow !== undefined && input.referenceHigh !== null && input.referenceHigh !== undefined && input.referenceLow > input.referenceHigh) context.addIssue({ code: z.ZodIssueCode.custom, message: "Reference low cannot exceed reference high." });
  }
  if (input.category === "lab" && input.source !== "lab" && !input.labName) context.addIssue({ code: z.ZodIssueCode.custom, message: "Use a lab source or identify the originating lab for a lab observation." });
  if (input.category !== "lab" && (input.specimenType || input.collectedAt)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Specimen and collection metadata can only be attached to a lab observation." });
  if (input.source === "manual" && input.sourceRecordId) context.addIssue({ code: z.ZodIssueCode.custom, message: "A manual entry cannot claim an external source record identifier." });
};
const observationSchema = observationInput.superRefine(validateObservation);
const observationUpdateSchema = observationInput.omit({ observedAt: true }).superRefine(validateObservation);
const calculationInclusionInput = z.object({ included: z.boolean(), confirmed: z.literal(true) });

async function ownedDefinition(userId: number, id: number | null | undefined) {
  if (!id) return null;
  const [definition] = await db.select().from(healthMetricDefinitions).where(and(eq(healthMetricDefinitions.id, id), eq(healthMetricDefinitions.userId, userId))).limit(1);
  return definition || undefined;
}

function matchesDefinition(input: z.infer<typeof observationInput>, definition: NonNullable<Awaited<ReturnType<typeof ownedDefinition>>>): boolean {
  return input.metricKey === definition.metricKey
    && input.displayName === definition.displayName
    && input.category === definition.category
    && input.unit === definition.canonicalUnit;
}

function rangeValidation(value: number, definition: NonNullable<Awaited<ReturnType<typeof ownedDefinition>>> | null) {
  if (!definition || (definition.validMin === null && definition.validMax === null)) return null;
  return {
    configuredMin: definition.validMin,
    configuredMax: definition.validMax,
    withinConfiguredRange: (definition.validMin === null || value >= definition.validMin) && (definition.validMax === null || value <= definition.validMax),
    disclosure: "This only checks a range saved with this metric definition; it is not a clinical interpretation.",
  };
}

function observationAggregationKind(metricKey: string, unit: string) {
  const definition = canonicalHealthMetricDefinition(metricKey);
  return definition?.canonicalUnit === unit ? definition.aggregation : "average";
}

export function registerHealthObservationRoutes(app: Express): void {
  app.get("/api/health-metric-catalog", isAuthenticated, (_req: Request, res: Response) => {
    return res.json({
      version: canonicalHealthMetricRegistryVersion,
      releases: canonicalHealthMetricRegistryReleases,
      migrationPolicy: canonicalHealthMetricMigrationPolicy,
      metrics: canonicalHealthMetricRegistry.map((metric) => ({ key: metric.key, displayName: metric.displayName, category: metric.category, canonicalUnit: metric.canonicalUnit, aggregation: metric.aggregation, valueMeaning: metric.valueMeaning, acceptedUnits: metric.acceptedUnits.map((unit) => unit.unit) })),
      disclosure: "This governed catalog defines record names, units, conversions, aggregation, and immutable-history transition rules only. It does not provide reference ranges, diagnosis, treatment, or a provider connection.",
    });
  });
  app.get("/api/health-metric-definitions", isAuthenticated, async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === "true";
    const conditions = [eq(healthMetricDefinitions.userId, req.session.userId!)];
    if (!includeInactive) conditions.push(eq(healthMetricDefinitions.active, true));
    const definitions = await db.select().from(healthMetricDefinitions).where(and(...conditions)).orderBy(desc(healthMetricDefinitions.createdAt));
    return res.json({ definitions, disclosure: "Definitions are user-controlled provenance and validation metadata, not medical standards or advice." });
  });

  app.post("/api/health-metric-definitions", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = definitionInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid metric definition.", details: parsed.error.flatten() });
    const [existing] = await db.select({ id: healthMetricDefinitions.id }).from(healthMetricDefinitions).where(and(
      eq(healthMetricDefinitions.userId, req.session.userId!), eq(healthMetricDefinitions.metricKey, parsed.data.metricKey), eq(healthMetricDefinitions.version, parsed.data.version),
    )).limit(1);
    if (existing) return res.status(409).json({ error: "That metric key and definition version already exist." });
    const [definition] = await db.insert(healthMetricDefinitions).values({
      userId: req.session.userId!, ...parsed.data, sourceUrl: parsed.data.sourceUrl || null,
      validMin: parsed.data.validMin ?? null, validMax: parsed.data.validMax ?? null,
    }).returning();
    return res.status(201).json({ definition });
  });

  app.patch("/api/health-metric-definitions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = definitionInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid metric definition.", details: parsed.success ? undefined : parsed.error.flatten() });
    const [duplicate] = await db.select({ id: healthMetricDefinitions.id }).from(healthMetricDefinitions).where(and(
      eq(healthMetricDefinitions.userId, req.session.userId!), eq(healthMetricDefinitions.metricKey, parsed.data.metricKey),
      eq(healthMetricDefinitions.version, parsed.data.version), ne(healthMetricDefinitions.id, id),
    )).limit(1);
    if (duplicate) return res.status(409).json({ error: "That metric key and definition version already exist." });
    const [definition] = await db.update(healthMetricDefinitions).set({
      ...parsed.data, sourceUrl: parsed.data.sourceUrl || null,
      validMin: parsed.data.validMin ?? null, validMax: parsed.data.validMax ?? null,
    }).where(and(eq(healthMetricDefinitions.id, id), eq(healthMetricDefinitions.userId, req.session.userId!))).returning();
    return definition ? res.json({ definition }) : res.status(404).json({ error: "Metric definition not found." });
  });

  app.delete("/api/health-metric-definitions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid metric definition." });
    const [definition] = await db.delete(healthMetricDefinitions).where(and(eq(healthMetricDefinitions.id, id), eq(healthMetricDefinitions.userId, req.session.userId!))).returning({ id: healthMetricDefinitions.id });
    return definition ? res.status(204).send() : res.status(404).json({ error: "Metric definition not found." });
  });

  app.get("/api/health-observations", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const category = typeof req.query.category === "string" && categories.includes(req.query.category as typeof categories[number]) ? req.query.category : undefined;
    const metricKey = typeof req.query.metricKey === "string" && /^[a-z0-9_]{2,80}$/.test(req.query.metricKey) ? req.query.metricKey : undefined;
    const source = typeof req.query.source === "string" && observableSources.has(req.query.source) ? req.query.source : undefined;
    const definitionId = Number(req.query.metricDefinitionId);
    const conditions = [eq(healthObservations.userId, userId)];
    if (category) conditions.push(eq(healthObservations.category, category));
    if (metricKey) conditions.push(eq(healthObservations.metricKey, metricKey));
    if (source) conditions.push(eq(healthObservations.source, source));
    if (Number.isInteger(definitionId) && definitionId > 0) conditions.push(eq(healthObservations.metricDefinitionId, definitionId));
    const observations = await db.select().from(healthObservations).where(and(...conditions)).orderBy(desc(healthObservations.observedAt)).limit(500);
    const [preferences, providerConnections, calculationPreferences] = await Promise.all([
      db.select().from(healthSourcePreferences).where(eq(healthSourcePreferences.userId, userId)),
      db.select({ provider: healthConnections.provider, status: healthConnections.status }).from(healthConnections).where(eq(healthConnections.userId, userId)),
      db.select({ observationId: healthObservationCalculationPreferences.observationId, included: healthObservationCalculationPreferences.included })
        .from(healthObservationCalculationPreferences).where(eq(healthObservationCalculationPreferences.userId, userId)),
    ]);
    const calculationInclusion = new Map(calculationPreferences.map((preference) => [preference.observationId, preference.included]));
    const observationsWithCalculationPreferences = observations.map((observation) => ({
      ...observation,
      includedInCalculations: calculationInclusion.get(observation.id) ?? true,
    }));
    const priorities = Object.fromEntries(preferences.map((preference) => [preference.metricKey, Array.isArray(preference.orderedSources) ? preference.orderedSources.filter((item): item is string => typeof item === "string") : []]));
    const sourceComparisons = buildHealthSourceComparisons(observations.map((observation) => ({
      id: observation.id, metricKey: observation.metricKey, displayName: observation.displayName, source: observation.source,
      value: observation.value, unit: observation.unit, observedAt: observation.observedAt,
      temporalType: observation.temporalType, intervalStartAt: observation.intervalStartAt, intervalEndAt: observation.intervalEndAt,
      receivedAt: observation.importedAt || observation.createdAt, method: observation.method,
      methodVersion: observation.methodVersion, deviceName: observation.deviceName,
    })), priorities);
    const intervalConflicts = buildHealthIntervalConflictGroups(observationsWithCalculationPreferences.map((observation) => ({
      id: observation.id, metricKey: observation.metricKey, displayName: observation.displayName, unit: observation.unit,
      source: observation.source, value: observation.value, temporalType: observation.temporalType,
      aggregationKind: observation.aggregationKind, intervalStartAt: observation.intervalStartAt,
      intervalEndAt: observation.intervalEndAt, method: observation.method, methodVersion: observation.methodVersion,
      deviceName: observation.deviceName, includedInCalculations: observation.includedInCalculations,
    })));
    return res.json({ observations: observationsWithCalculationPreferences, sourceComparisons, intervalConflicts, providerConnectionStates: Object.fromEntries(providerConnections.map((connection) => [connection.provider, connection.status])), disclosure: "Observations preserve the value, unit, source, method, definition version, and supplied reference range. Calculation inclusion is reversible and never changes the source fact. LyfeOS does not diagnose or interpret clinical results." });
  });

  app.put("/api/health-observations/:id/calculation-inclusion", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = calculationInclusionInput.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Choose whether to include this record and explicitly confirm the change." });
    const userId = req.session.userId!;
    const [observation] = await db.select({
      id: healthObservations.id, temporalType: healthObservations.temporalType, aggregationKind: healthObservations.aggregationKind,
    }).from(healthObservations).where(and(eq(healthObservations.id, id), eq(healthObservations.userId, userId))).limit(1);
    if (!observation) return res.status(404).json({ error: "Health observation not found." });
    if (observation.temporalType !== "interval" || observation.aggregationKind !== "sum") {
      return res.status(409).json({ error: "Only additive interval records can be included or excluded from overlap calculations." });
    }
    const [preference] = await db.insert(healthObservationCalculationPreferences).values({
      userId, observationId: observation.id, included: parsed.data.included, reason: "overlap_resolution",
    }).onConflictDoUpdate({
      target: [healthObservationCalculationPreferences.userId, healthObservationCalculationPreferences.observationId],
      set: { included: parsed.data.included, reason: "overlap_resolution", updatedAt: new Date() },
    }).returning();
    return res.json({ preference, disclosure: "The observation remains stored and visible. This preference only controls whether it participates in derived totals." });
  });

  app.post("/api/health-observations", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid health observation.", details: parsed.error.flatten() });
    const userId = req.session.userId!;
    const rawMutationId = req.header("x-lyfeos-mutation-id");
    const clientMutationId = healthMutationId(rawMutationId);
    if (rawMutationId && !clientMutationId) return res.status(400).json({ error: "Invalid mutation identity." });
    const mutationPayloadHash = clientMutationId ? healthMutationPayloadHash(parsed.data) : null;
    if (clientMutationId) {
      const [existing] = await db.select().from(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.clientMutationId, clientMutationId))).limit(1);
      if (existing) return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ observation: existing, rangeValidation: null, replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different health observation." });
    }
    const definition = await ownedDefinition(userId, parsed.data.metricDefinitionId);
    if (definition === undefined) return res.status(404).json({ error: "Metric definition not found." });
    if (definition && (!definition.active || !matchesDefinition(parsed.data, definition))) return res.status(409).json({ error: "The observation fields must match the selected active metric definition." });
    if (parsed.data.sourceRecordId) {
      const [duplicate] = await db.select({ id: healthObservations.id }).from(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.source, parsed.data.source), eq(healthObservations.sourceRecordId, parsed.data.sourceRecordId))).limit(1);
      if (duplicate) return res.status(409).json({ error: "That source record has already been imported.", observationId: duplicate.id });
    }
    const observedAt = parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date();
    const importedAt = parsed.data.importedAt ? new Date(parsed.data.importedAt) : null;
    const collectedAt = parsed.data.collectedAt ? new Date(parsed.data.collectedAt) : null;
    if (Number.isNaN(observedAt.getTime()) || (importedAt && Number.isNaN(importedAt.getTime())) || (collectedAt && Number.isNaN(collectedAt.getTime()))) return res.status(400).json({ error: "Invalid observation, collection, or import time." });
    const { observedAt: _observedAt, importedAt: _importedAt, collectedAt: _collectedAt, ...values } = parsed.data;
    const timeContext = requestTimeContext(req, observedAt);
    try {
      const [observation] = await db.insert(healthObservations).values({
        userId, ...values, metricDefinitionId: definition?.id || null, definitionVersion: definition?.version || null,
        observedAt, importedAt, collectedAt, method: values.method || null, methodVersion: values.methodVersion || null,
        sourceRecordId: values.sourceRecordId || null, deviceName: values.deviceName || null, labName: values.labName || null, specimenType: values.specimenType || null,
        referenceLow: values.referenceLow ?? null, referenceHigh: values.referenceHigh ?? null,
        referenceUnit: values.referenceUnit || null, note: values.note || null,
        aggregationKind: observationAggregationKind(values.metricKey, values.unit),
        recordedTimeZone: timeContext.timeZone, recordedUtcOffsetMinutes: timeContext.utcOffsetMinutes, clientMutationId, mutationPayloadHash,
      }).returning();
      return res.status(201).json({ observation, rangeValidation: rangeValidation(observation.value, definition), replayed: false });
    } catch (error) {
      if (!clientMutationId) throw error;
      const [existing] = await db.select().from(healthObservations).where(and(eq(healthObservations.userId, userId), eq(healthObservations.clientMutationId, clientMutationId))).limit(1);
      if (!existing) throw error;
      return existing.mutationPayloadHash === mutationPayloadHash
        ? res.json({ observation: existing, rangeValidation: rangeValidation(existing.value, definition), replayed: true })
        : res.status(409).json({ error: "This mutation identity was already used for a different health observation." });
    }
  });

  app.patch("/api/health-observations/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = observationUpdateSchema.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: "Invalid health observation.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const definition = await ownedDefinition(userId, parsed.data.metricDefinitionId);
    if (definition === undefined) return res.status(404).json({ error: "Metric definition not found." });
    if (definition && (!definition.active || !matchesDefinition(parsed.data, definition))) return res.status(409).json({ error: "The observation fields must match the selected active metric definition." });
    if (parsed.data.sourceRecordId) {
      const [duplicate] = await db.select({ id: healthObservations.id }).from(healthObservations).where(and(
        eq(healthObservations.userId, userId), eq(healthObservations.source, parsed.data.source),
        eq(healthObservations.sourceRecordId, parsed.data.sourceRecordId), ne(healthObservations.id, id),
      )).limit(1);
      if (duplicate) return res.status(409).json({ error: "That source record has already been imported.", observationId: duplicate.id });
    }
    const importedAt = parsed.data.importedAt ? new Date(parsed.data.importedAt) : null;
    const collectedAt = parsed.data.collectedAt ? new Date(parsed.data.collectedAt) : null;
    if ((importedAt && Number.isNaN(importedAt.getTime())) || (collectedAt && Number.isNaN(collectedAt.getTime()))) return res.status(400).json({ error: "Invalid collection or import time." });
    const { importedAt: _importedAt, collectedAt: _collectedAt, ...values } = parsed.data;
    const [observation] = await db.update(healthObservations).set({
      ...values, metricDefinitionId: definition?.id || null, definitionVersion: definition?.version || null,
      importedAt, collectedAt, method: values.method || null, methodVersion: values.methodVersion || null,
      sourceRecordId: values.sourceRecordId || null, deviceName: values.deviceName || null, labName: values.labName || null, specimenType: values.specimenType || null,
      referenceLow: values.referenceLow ?? null, referenceHigh: values.referenceHigh ?? null,
      referenceUnit: values.referenceUnit || null, note: values.note || null,
      aggregationKind: observationAggregationKind(values.metricKey, values.unit),
    }).where(and(eq(healthObservations.id, id), eq(healthObservations.userId, userId))).returning();
    return observation ? res.json({ observation, rangeValidation: rangeValidation(observation.value, definition) }) : res.status(404).json({ error: "Health observation not found." });
  });

  app.delete("/api/health-observations/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid health observation." });
    const userId = req.session.userId!;
    const [current] = await db.select().from(healthObservations).where(and(eq(healthObservations.id, id), eq(healthObservations.userId, userId))).limit(1);
    if (!current) return res.status(404).json({ error: "Health observation not found." });
    const provider = healthProviderDefinition(current.source);
    if (!provider || !current.sourceRecordId) {
      await db.delete(healthObservations).where(and(eq(healthObservations.id, id), eq(healthObservations.userId, userId)));
      return res.status(204).send();
    }
    const outcome = await db.transaction(async (tx) => {
      const [connection] = await tx.select().from(healthConnections).where(and(eq(healthConnections.userId, userId), eq(healthConnections.provider, provider.id))).limit(1);
      if (!connection) return { kind: "missing_connection" as const };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${healthConnectionLockKey(connection.id)}))`);
      const [lockedConnection] = await tx.select().from(healthConnections).where(and(eq(healthConnections.id, connection.id), eq(healthConnections.userId, userId))).limit(1);
      if (!lockedConnection || (lockedConnection.status !== "paused" && lockedConnection.status !== "revoked")) return { kind: "active" as const };
      await tx.insert(healthSourceSuppressions).values({
        userId, connectionId: lockedConnection.id, provider: provider.id,
        sourceRecordKeyHash: healthSourceRecordKeyHash(provider.id, current.sourceRecordId!), reason: "user_deleted",
      }).onConflictDoNothing();
      await tx.delete(healthSourceRecords).where(and(
        eq(healthSourceRecords.userId, userId), eq(healthSourceRecords.provider, provider.id), eq(healthSourceRecords.sourceRecordId, current.sourceRecordId!),
      ));
      const [deleted] = await tx.delete(healthObservations).where(and(eq(healthObservations.id, id), eq(healthObservations.userId, userId), eq(healthObservations.source, provider.id))).returning({ id: healthObservations.id });
      return deleted ? { kind: "deleted" as const } : { kind: "missing" as const };
    });
    if (outcome.kind === "active") return res.status(409).json({ error: "Pause or revoke this provider before deleting an imported observation." });
    if (outcome.kind === "missing_connection") return res.status(409).json({ error: "The provider connection required to suppress re-import was not found." });
    return outcome.kind === "deleted" ? res.status(204).send() : res.status(404).json({ error: "Health observation not found." });
  });
}
