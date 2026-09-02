import type { Express, Request, Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { brandOwnershipProfileSchema } from "@shared/brand-ownership";
import { brandOwnershipRegistryEntries, brandOwnershipRegistryLookupKeys, brandOwnershipRegistryRevisions, brandOwnershipResearchReports, ownershipReviewGrants } from "@shared/schema";
import { db } from "../db";
import { normalizeBrandOwnershipKey } from "../brand-ownership";
import { isAuthenticated } from "./middleware";

const publicationSchema = z.object({
  decision: z.enum(["publish", "reject"]),
  reason: z.string().trim().min(3).max(500),
  profile: brandOwnershipProfileSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "publish" && !value.profile) context.addIssue({ code: z.ZodIssueCode.custom, message: "A cited ownership profile is required before publishing." });
  if (value.decision === "reject" && value.profile) context.addIssue({ code: z.ZodIssueCode.custom, message: "A rejected report cannot publish a profile." });
});

function privateNoStore(res: Response): void { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Cookie"); }
function bootstrapReviewerIds(): Set<number> {
  return new Set((process.env.LYFEOS_OWNERSHIP_REVIEWER_USER_IDS || "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0));
}

// This role sees only intentionally submitted ownership-report fields. It is
// separate from installation-brand administration and confers no authority to
// browse a person's LyfeOS records.
async function requireOwnershipReviewer(req: Request, res: Response): Promise<boolean> {
  const userId = req.session.userId!;
  if (bootstrapReviewerIds().has(userId)) return true;
  const [reviewGrant] = await db.select({ id: ownershipReviewGrants.id }).from(ownershipReviewGrants)
    .where(and(eq(ownershipReviewGrants.userId, userId), eq(ownershipReviewGrants.status, "active")))
    .limit(1);
  if (reviewGrant) return true;
  res.status(403).json({ error: "Ownership-review authority is required. This role can see only ownership reports deliberately submitted for review." });
  return false;
}

function reportId(value: unknown) { return z.coerce.number().int().positive().safeParse(value); }
function profileKeys(profile: z.infer<typeof brandOwnershipProfileSchema>): string[] {
  return Array.from(new Set([profile.brand, ...profile.aliases].map(normalizeBrandOwnershipKey).filter(Boolean)));
}

export function registerOwnershipReviewRoutes(app: Express): void {
  app.get("/api/ownership-review/status", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireOwnershipReviewer(req, res)) return;
    return res.json({ authorized: true, authorityBoundary: "submitted_ownership_reports_and_cited_registry_only" });
  });

  app.get("/api/ownership-review/reports", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireOwnershipReviewer(req, res)) return;
    const reports = await db.select({ id: brandOwnershipResearchReports.id, brand: brandOwnershipResearchReports.brand, barcode: brandOwnershipResearchReports.barcode, reportType: brandOwnershipResearchReports.reportType, note: brandOwnershipResearchReports.note, evidenceUrl: brandOwnershipResearchReports.evidenceUrl, status: brandOwnershipResearchReports.status, createdAt: brandOwnershipResearchReports.createdAt })
      .from(brandOwnershipResearchReports)
      .where(and(eq(brandOwnershipResearchReports.reviewerAccessGranted, true), inArray(brandOwnershipResearchReports.status, ["received", "under_review"])))
      .orderBy(brandOwnershipResearchReports.createdAt)
      .limit(100);
    return res.json({ reports, disclosure: "These fields were intentionally submitted as ownership-review intake. Do not use them to inspect any other LyfeOS data." });
  });

  app.post("/api/ownership-review/reports/:id/resolve", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireOwnershipReviewer(req, res)) return;
    const id = reportId(req.params.id);
    const input = publicationSchema.safeParse(req.body);
    if (!id.success || !input.success) return res.status(400).json({ error: "Provide a valid review decision, reason, and cited profile when publishing.", details: input.success ? undefined : input.error.flatten() });
    const actorUserId = req.session.userId!;
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ownership-review:" + id.data}))`);
        const [report] = await tx.select().from(brandOwnershipResearchReports).where(eq(brandOwnershipResearchReports.id, id.data)).limit(1);
        if (!report || !report.reviewerAccessGranted || !["received", "under_review"].includes(report.status)) return null;
        if (input.data.decision === "reject") {
          await tx.update(brandOwnershipResearchReports).set({ status: "rejected" }).where(eq(brandOwnershipResearchReports.id, report.id));
          return { reportId: report.id, status: "rejected" as const, entry: null };
        }
        const profile = input.data.profile!;
        const canonicalKey = normalizeBrandOwnershipKey(profile.brand);
        const keys = profileKeys(profile);
        if (!canonicalKey || !keys.length) throw new Error("INVALID_PROFILE_KEY");
        const [existing] = await tx.select().from(brandOwnershipRegistryEntries).where(eq(brandOwnershipRegistryEntries.canonicalKey, canonicalKey)).limit(1);
        const collisions = await tx.select().from(brandOwnershipRegistryLookupKeys).where(inArray(brandOwnershipRegistryLookupKeys.normalizedKey, keys));
        if (collisions.some((entry) => !existing || entry.entryId !== existing.id)) throw new Error("LOOKUP_KEY_CONFLICT");
        const revision = (existing?.revision || 0) + 1;
        const [entry] = existing
          ? await tx.update(brandOwnershipRegistryEntries).set({ profile, status: "active", revision, sourceReportId: report.id, reviewedByUserId: actorUserId, reviewNote: input.data.reason, updatedAt: new Date() }).where(eq(brandOwnershipRegistryEntries.id, existing.id)).returning()
          : await tx.insert(brandOwnershipRegistryEntries).values({ canonicalKey, profile, status: "active", revision, sourceReportId: report.id, reviewedByUserId: actorUserId, reviewNote: input.data.reason }).returning();
        await tx.delete(brandOwnershipRegistryLookupKeys).where(eq(brandOwnershipRegistryLookupKeys.entryId, entry.id));
        await tx.insert(brandOwnershipRegistryLookupKeys).values(keys.map((normalizedKey) => ({ normalizedKey, entryId: entry.id })));
        await tx.insert(brandOwnershipRegistryRevisions).values({ entryId: entry.id, revision, profile, status: "active", sourceReportId: report.id, reviewedByUserId: actorUserId, reason: input.data.reason });
        await tx.update(brandOwnershipResearchReports).set({ status: "resolved" }).where(eq(brandOwnershipResearchReports.id, report.id));
        return { reportId: report.id, status: "resolved" as const, entry: { id: entry.id, revision, brand: profile.brand } };
      });
      if (!result) return res.status(409).json({ error: "That report was already resolved or withdrawn." });
      return res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "LOOKUP_KEY_CONFLICT") return res.status(409).json({ error: "A different active registry entry already uses this brand or alias. Review the existing citation first." });
      if (error instanceof Error && error.message === "INVALID_PROFILE_KEY") return res.status(400).json({ error: "The profile must have a valid brand and at least one lookup key." });
      return res.status(500).json({ error: "Could not complete the ownership review." });
    }
  });
}
