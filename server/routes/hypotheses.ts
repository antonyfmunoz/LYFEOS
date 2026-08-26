import { createHash } from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  createHypothesisSchema,
  HYPOTHESIS_CONSENT_VERSION,
  hypothesisConsentSchema,
  hypothesisInterpretationSchema,
  hypothesisSignal,
  hypothesisSignalRegistry,
  updateHypothesisSchema,
} from "@shared/hypotheses";
import {
  crossDomainHypotheses,
  crossDomainHypothesisInterpretations,
  crossDomainHypothesisSnapshots,
} from "@shared/schema";
import { db } from "../db";
import { validTimeZone } from "../health-fitness";
import { calculateHypothesis, currentHypothesisConsents, recordHypothesisConsent } from "../hypothesis-engine";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

function idParam(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

async function ownedHypothesis(id: number, userId: number) {
  return (await db.select().from(crossDomainHypotheses).where(and(eq(crossDomainHypotheses.id, id), eq(crossDomainHypotheses.userId, userId))).limit(1))[0];
}

async function requiredDomainsEnabled(userId: number, leftSignalId: string, rightSignalId: string): Promise<boolean> {
  const left = hypothesisSignal(leftSignalId), right = hypothesisSignal(rightSignalId);
  if (!left || !right) return false;
  const consents = await currentHypothesisConsents(userId);
  return consents[left.domain] === "enabled" && consents[right.domain] === "enabled";
}

function safeRouteError(res: Response, error: unknown, message: string) {
  const code = error instanceof Error ? error.message : "unknown";
  if (code === "domain_consent_required") return res.status(409).json({ error: "Enable each selected data domain before calculating this hypothesis." });
  if (code === "invalid_time_zone") return res.status(400).json({ error: "Choose a valid IANA time zone." });
  logger.error(message, { error: code });
  return res.status(500).json({ error: message });
}

export function registerHypothesisRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/hypotheses")) noStore(res);
    next();
  });

  app.get("/api/hypotheses/signals", isAuthenticated, async (req: Request, res: Response) => {
    const consents = await currentHypothesisConsents(req.session.userId!);
    return res.json({
      policyVersion: HYPOTHESIS_CONSENT_VERSION,
      consents,
      signals: hypothesisSignalRegistry.map((signal) => ({ ...signal, enabled: consents[signal.domain] === "enabled", availability: "local" })),
      disclosure: "Only user-selected, explicitly enabled LyfeOS domains can be compared. Cross-product signals remain unavailable until a governed adapter supplies a consented canonical signal.",
    });
  });

  app.patch("/api/hypotheses/consents", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = hypothesisConsentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Confirm a supported domain consent change.", details: parsed.error.flatten() });
    const consent = await recordHypothesisConsent(req.session.userId!, parsed.data.domain, parsed.data.state);
    return res.json({ consent, consents: await currentHypothesisConsents(req.session.userId!) });
  });

  app.get("/api/hypotheses", isAuthenticated, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const [hypotheses, snapshots, interpretations] = await Promise.all([
      db.select().from(crossDomainHypotheses).where(eq(crossDomainHypotheses.userId, userId)).orderBy(desc(crossDomainHypotheses.updatedAt), desc(crossDomainHypotheses.id)).limit(50),
      db.select().from(crossDomainHypothesisSnapshots).where(eq(crossDomainHypothesisSnapshots.userId, userId)).orderBy(desc(crossDomainHypothesisSnapshots.createdAt), desc(crossDomainHypothesisSnapshots.id)).limit(250),
      db.select().from(crossDomainHypothesisInterpretations).where(eq(crossDomainHypothesisInterpretations.userId, userId)).orderBy(desc(crossDomainHypothesisInterpretations.createdAt), desc(crossDomainHypothesisInterpretations.id)).limit(250),
    ]);
    const latestByHypothesis = new Map<number, typeof snapshots[number]>();
    for (const snapshot of snapshots) if (!latestByHypothesis.has(snapshot.hypothesisId)) latestByHypothesis.set(snapshot.hypothesisId, snapshot);
    return res.json({
      hypotheses: hypotheses.map((hypothesis) => ({
        ...hypothesis,
        latestSnapshot: latestByHypothesis.get(hypothesis.id) || null,
        interpretations: interpretations.filter((interpretation) => interpretation.hypothesisId === hypothesis.id),
      })),
      limits: { hypotheses: 20, snapshotsReturned: 250, interpretationsReturned: 250, minimumPairedDays: 7, minimumCoverage: 0.2 },
      disclosure: "Saved snapshots retain calculation metadata and quality summaries, not aligned daily values. Results never award XP, change Missions, or trigger recommendations.",
    });
  });

  app.post("/api/hypotheses", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = createHypothesisSchema.safeParse(req.body);
    if (!parsed.success || !validTimeZone(parsed.data?.timeZone || "")) return res.status(400).json({ error: "Review the hypothesis definition and time zone.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const existing = await db.select({ id: crossDomainHypotheses.id }).from(crossDomainHypotheses).where(eq(crossDomainHypotheses.userId, userId)).limit(20);
    if (existing.length >= 20) return res.status(409).json({ error: "Hypothesis limit reached. Delete one before creating another." });
    if (!await requiredDomainsEnabled(userId, parsed.data.leftSignalId, parsed.data.rightSignalId)) return res.status(409).json({ error: "Enable each selected data domain before creating this hypothesis." });
    const [hypothesis] = await db.insert(crossDomainHypotheses).values({
      userId,
      title: parsed.data.title,
      leftSignalId: parsed.data.leftSignalId,
      rightSignalId: parsed.data.rightSignalId,
      periodDays: parsed.data.periodDays,
      lagDays: parsed.data.lagDays,
      timeZone: parsed.data.timeZone,
      status: "active",
    }).returning();
    try {
      const snapshot = await calculateHypothesis(hypothesis, true);
      return res.status(201).json({ hypothesis: { ...hypothesis, latestSnapshot: snapshot }, calculated: Boolean(snapshot) });
    } catch (error) { return safeRouteError(res, error, "Hypothesis was saved, but its first calculation could not be completed."); }
  });

  app.patch("/api/hypotheses/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = updateHypothesisSchema.safeParse(req.body);
    if (!id || !parsed.success || (parsed.data.timeZone && !validTimeZone(parsed.data.timeZone))) return res.status(400).json({ error: "Review the hypothesis update.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const current = await ownedHypothesis(id, userId);
    if (!current) return res.status(404).json({ error: "Hypothesis not found." });
    const nextLeft = parsed.data.leftSignalId || current.leftSignalId;
    const nextRight = parsed.data.rightSignalId || current.rightSignalId;
    if (nextLeft === nextRight) return res.status(400).json({ error: "Choose two different signals." });
    if (parsed.data.status === "active" && !await requiredDomainsEnabled(userId, nextLeft, nextRight)) return res.status(409).json({ error: "Re-enable each selected domain before resuming this hypothesis." });
    const definitionChanged = parsed.data.title !== undefined || parsed.data.leftSignalId !== undefined || parsed.data.rightSignalId !== undefined || parsed.data.periodDays !== undefined || parsed.data.lagDays !== undefined || parsed.data.timeZone !== undefined;
    const [updated] = await db.update(crossDomainHypotheses).set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.leftSignalId !== undefined ? { leftSignalId: parsed.data.leftSignalId } : {}),
      ...(parsed.data.rightSignalId !== undefined ? { rightSignalId: parsed.data.rightSignalId } : {}),
      ...(parsed.data.periodDays !== undefined ? { periodDays: parsed.data.periodDays } : {}),
      ...(parsed.data.lagDays !== undefined ? { lagDays: parsed.data.lagDays } : {}),
      ...(parsed.data.timeZone !== undefined ? { timeZone: parsed.data.timeZone } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      revision: definitionChanged ? current.revision + 1 : current.revision,
      calculationState: "idle",
      lastErrorCode: null,
      nextCalculationAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(crossDomainHypotheses.id, id), eq(crossDomainHypotheses.userId, userId), eq(crossDomainHypotheses.revision, parsed.data.expectedRevision))).returning();
    if (!updated) return res.status(409).json({ error: "This hypothesis changed elsewhere. Refresh before editing it." });
    if (updated.status !== "active") return res.json({ hypothesis: updated, latestSnapshot: null });
    try { return res.json({ hypothesis: updated, latestSnapshot: await calculateHypothesis(updated, true) }); }
    catch (error) { return safeRouteError(res, error, "Hypothesis was updated, but recalculation could not be completed."); }
  });

  app.post("/api/hypotheses/:id/recalculate", isAuthenticated, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    if (!id || req.body?.confirmed !== true) return res.status(400).json({ error: "Explicitly confirm recalculation." });
    const hypothesis = await ownedHypothesis(id, req.session.userId!);
    if (!hypothesis) return res.status(404).json({ error: "Hypothesis not found." });
    if (hypothesis.status !== "active") return res.status(409).json({ error: "Resume this hypothesis before recalculating it." });
    try {
      const snapshot = await calculateHypothesis(hypothesis, true);
      return snapshot ? res.json({ snapshot }) : res.status(409).json({ error: "A calculation is already running. Try again shortly." });
    } catch (error) { return safeRouteError(res, error, "Hypothesis calculation could not be completed."); }
  });

  app.post("/api/hypotheses/:id/interpretations", isAuthenticated, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = hypothesisInterpretationSchema.safeParse(req.body);
    if (!id || !parsed.success) return res.status(400).json({ error: "Review and acknowledge the private interpretation.", details: parsed.success ? undefined : parsed.error.flatten() });
    const userId = req.session.userId!;
    const [hypothesis, snapshot] = await Promise.all([
      ownedHypothesis(id, userId),
      db.select().from(crossDomainHypothesisSnapshots).where(and(eq(crossDomainHypothesisSnapshots.id, parsed.data.snapshotId), eq(crossDomainHypothesisSnapshots.hypothesisId, id), eq(crossDomainHypothesisSnapshots.userId, userId))).limit(1).then((rows) => rows[0]),
    ]);
    if (!hypothesis || !snapshot) return res.status(404).json({ error: "Hypothesis snapshot not found." });
    if ((snapshot.result as { status?: unknown }).status !== "available") return res.status(409).json({ error: "Only a snapshot with sufficient evidence can receive an interpretation." });
    const mutationPayloadHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    const existing = (await db.select().from(crossDomainHypothesisInterpretations).where(and(eq(crossDomainHypothesisInterpretations.userId, userId), eq(crossDomainHypothesisInterpretations.clientMutationId, parsed.data.clientMutationId))).limit(1))[0];
    if (existing) return existing.mutationPayloadHash === mutationPayloadHash ? res.json({ interpretation: existing, replayed: true }) : res.status(409).json({ error: "This interpretation identity was already used for different content." });
    const [created] = await db.insert(crossDomainHypothesisInterpretations).values({
      userId,
      hypothesisId: id,
      snapshotId: snapshot.id,
      interpretation: parsed.data.interpretation,
      note: parsed.data.note,
      acknowledgedExploratory: true,
      clientMutationId: parsed.data.clientMutationId,
      mutationPayloadHash,
    }).onConflictDoNothing().returning();
    if (created) return res.status(201).json({ interpretation: created, replayed: false });
    const raced = (await db.select().from(crossDomainHypothesisInterpretations).where(and(eq(crossDomainHypothesisInterpretations.userId, userId), eq(crossDomainHypothesisInterpretations.clientMutationId, parsed.data.clientMutationId))).limit(1))[0];
    return raced?.mutationPayloadHash === mutationPayloadHash ? res.json({ interpretation: raced, replayed: true }) : res.status(409).json({ error: "Interpretation could not be saved safely." });
  });

  app.delete("/api/hypotheses/:id/interpretations/:interpretationId", isAuthenticated, async (req: Request, res: Response) => {
    const id = idParam(req.params.id), interpretationId = idParam(req.params.interpretationId);
    if (!id || !interpretationId) return res.status(400).json({ error: "Invalid interpretation." });
    const [removed] = await db.delete(crossDomainHypothesisInterpretations).where(and(eq(crossDomainHypothesisInterpretations.id, interpretationId), eq(crossDomainHypothesisInterpretations.hypothesisId, id), eq(crossDomainHypothesisInterpretations.userId, req.session.userId!))).returning({ id: crossDomainHypothesisInterpretations.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Interpretation not found." });
  });

  app.delete("/api/hypotheses/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    if (!id || req.body?.confirmed !== true) return res.status(400).json({ error: "Explicitly confirm hypothesis deletion." });
    const [removed] = await db.delete(crossDomainHypotheses).where(and(eq(crossDomainHypotheses.id, id), eq(crossDomainHypotheses.userId, req.session.userId!))).returning({ id: crossDomainHypotheses.id });
    return removed ? res.status(204).send() : res.status(404).json({ error: "Hypothesis not found." });
  });
}
