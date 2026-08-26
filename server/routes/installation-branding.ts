import crypto from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { installationAdminGrants, installationAuditEvents, installationBrandRevisions, installationDomainBindings, lyfeosInstallations } from "@shared/schema";
import { db } from "../db";
import { isAuthenticated } from "./middleware";
import { normalizeInstallationHostname } from "../installation-branding";

const DEFAULT_INSTALLATION_ID = "default";
const defaultBrand = { productName: "LyfeOS", shortName: "LyfeOS", accentColor: "#00e0ff", supportUrl: "https://lyfeos.net" } as const;
const brandSchema = z.object({
  productName: z.string().trim().min(2).max(50),
  shortName: z.string().trim().min(2).max(24),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((value) => value.toLowerCase()),
  supportUrl: z.string().url().max(300).refine((value) => value.startsWith("https://")),
}).strict();

function privateNoStore(res: Response): void { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Cookie, Host"); }
function bootstrapAdminIds(): Set<number> {
  return new Set((process.env.LYFEOS_INSTALLATION_ADMIN_USER_IDS || "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0));
}
async function requireInstallationAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = req.session.userId!;
  if (bootstrapAdminIds().has(userId)) return true;
  const [grant] = await db.select({ id: installationAdminGrants.id }).from(installationAdminGrants).where(and(eq(installationAdminGrants.installationId, DEFAULT_INSTALLATION_ID), eq(installationAdminGrants.userId, userId), eq(installationAdminGrants.status, "active"))).limit(1);
  if (grant) return true;
  res.status(403).json({ error: "Installation-brand authority is required. This role does not grant access to personal LyfeOS records." });
  return false;
}
async function currentBrand(installationId: string) {
  const [revision] = await db.select().from(installationBrandRevisions).where(eq(installationBrandRevisions.installationId, installationId)).orderBy(desc(installationBrandRevisions.revision)).limit(1);
  const parsed = brandSchema.safeParse(revision?.brand);
  return { brand: parsed.success ? parsed.data : defaultBrand, revision: revision?.revision || 1 };
}
function tokenHash(token: string): string { return crypto.createHash("sha256").update(token, "utf8").digest("hex"); }

export function registerInstallationBrandingRoutes(app: Express): void {
  app.get("/api/installation/brand", async (req: Request, res: Response) => {
    const hostname = normalizeInstallationHostname(req.hostname || req.get("host") || "");
    const [binding] = hostname ? await db.select().from(installationDomainBindings).where(and(sql`lower(${installationDomainBindings.hostname}) = ${hostname}`, eq(installationDomainBindings.status, "verified"))).limit(1) : [];
    const installationId = binding?.installationId || DEFAULT_INSTALLATION_ID;
    const projection = await currentBrand(installationId);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.setHeader("Vary", "Host");
    return res.json({ installationId, productKey: "lyfeos", productOwner: "OST", recognizedHost: Boolean(binding), ...projection });
  });

  app.get("/api/installation/admin", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireInstallationAdmin(req, res)) return;
    const [projection, domains] = await Promise.all([currentBrand(DEFAULT_INSTALLATION_ID), db.select({ id: installationDomainBindings.id, hostname: installationDomainBindings.hostname, status: installationDomainBindings.status, verifiedAt: installationDomainBindings.verifiedAt, revokedAt: installationDomainBindings.revokedAt, createdAt: installationDomainBindings.createdAt }).from(installationDomainBindings).where(eq(installationDomainBindings.installationId, DEFAULT_INSTALLATION_ID)).orderBy(desc(installationDomainBindings.createdAt))]);
    return res.json({ installationId: DEFAULT_INSTALLATION_ID, productKey: "lyfeos", productOwner: "OST", authorityBoundary: "presentation_only_no_personal_record_access", ...projection, domains });
  });

  app.patch("/api/installation/admin/brand", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireInstallationAdmin(req, res)) return;
    const parsed = z.object({ expectedRevision: z.number().int().positive(), brand: brandSchema, reason: z.string().trim().min(3).max(300) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide a valid brand, expected revision, and reason." });
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'installation-brand:' + DEFAULT_INSTALLATION_ID}))`);
        const [installation] = await tx.select().from(lyfeosInstallations).where(eq(lyfeosInstallations.id, DEFAULT_INSTALLATION_ID)).limit(1);
        if (!installation || installation.currentBrandRevision !== parsed.data.expectedRevision) return null;
        const revision = installation.currentBrandRevision + 1;
        await tx.insert(installationBrandRevisions).values({ installationId: DEFAULT_INSTALLATION_ID, revision, brand: parsed.data.brand, actorUserId: req.session.userId!, reason: parsed.data.reason });
        await tx.update(lyfeosInstallations).set({ currentBrandRevision: revision, updatedAt: new Date() }).where(eq(lyfeosInstallations.id, DEFAULT_INSTALLATION_ID));
        await tx.insert(installationAuditEvents).values({ installationId: DEFAULT_INSTALLATION_ID, actorUserId: req.session.userId!, action: "brand_revised", subjectType: "brand_revision", subjectId: String(revision), metadata: { changedFields: Object.keys(parsed.data.brand).sort() } });
        return { revision, brand: parsed.data.brand };
      });
      return result ? res.json(result) : res.status(409).json({ error: "Brand revision changed. Reload before saving." });
    } catch { return res.status(500).json({ error: "Could not update installation branding." }); }
  });

  app.post("/api/installation/admin/domains", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireInstallationAdmin(req, res)) return;
    const hostname = normalizeInstallationHostname(String(req.body?.hostname || ""));
    if (!hostname) return res.status(400).json({ error: "Provide a valid public hostname." });
    const token = crypto.randomBytes(32).toString("base64url");
    try {
      const [existing] = await db.select().from(installationDomainBindings).where(sql`lower(${installationDomainBindings.hostname}) = ${hostname}`).limit(1);
      if (existing && existing.installationId !== DEFAULT_INSTALLATION_ID) return res.status(409).json({ error: "That hostname is already bound to another installation." });
      const [binding] = existing
        ? await db.update(installationDomainBindings).set({ status: "pending", verificationTokenHash: tokenHash(token), verifiedAt: null, revokedAt: null, updatedAt: new Date() }).where(eq(installationDomainBindings.id, existing.id)).returning()
        : await db.insert(installationDomainBindings).values({ installationId: DEFAULT_INSTALLATION_ID, hostname, status: "pending", verificationTokenHash: tokenHash(token), updatedAt: new Date() }).returning();
      await db.insert(installationAuditEvents).values({ installationId: DEFAULT_INSTALLATION_ID, actorUserId: req.session.userId!, action: "domain_verification_requested", subjectType: "domain_binding", subjectId: String(binding.id), metadata: { hostname } });
      return res.status(201).json({ id: binding.id, hostname, status: "pending", dns: { type: "TXT", name: `_lyfeos-verification.${hostname}`, value: `lyfeos-verification=${token}` }, disclosure: "The verification value is shown once and stored only as a SHA-256 hash." });
    } catch { return res.status(409).json({ error: "That hostname is already bound to another installation." }); }
  });

  app.post("/api/installation/admin/domains/:id/verify", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireInstallationAdmin(req, res)) return;
    const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid domain binding." });
    const [binding] = await db.select().from(installationDomainBindings).where(and(eq(installationDomainBindings.id, id), eq(installationDomainBindings.installationId, DEFAULT_INSTALLATION_ID))).limit(1);
    if (!binding || binding.status === "revoked" || !binding.verificationTokenHash) return res.status(404).json({ error: "Pending domain binding not found." });
    let records: string[][] = []; try { records = await resolveTxt(`_lyfeos-verification.${binding.hostname}`); } catch { return res.status(409).json({ error: "The DNS verification record is not visible yet." }); }
    const prefix = "lyfeos-verification=";
    const accepted = records.map((parts) => parts.join("")).some((value) => value.startsWith(prefix) && crypto.timingSafeEqual(Buffer.from(tokenHash(value.slice(prefix.length))), Buffer.from(binding.verificationTokenHash!)));
    if (!accepted) return res.status(409).json({ error: "The DNS verification value does not match." });
    await db.transaction(async (tx) => { await tx.update(installationDomainBindings).set({ status: "verified", verificationTokenHash: null, verifiedAt: new Date(), revokedAt: null, updatedAt: new Date() }).where(eq(installationDomainBindings.id, id)); await tx.insert(installationAuditEvents).values({ installationId: DEFAULT_INSTALLATION_ID, actorUserId: req.session.userId!, action: "domain_verified", subjectType: "domain_binding", subjectId: String(id), metadata: { hostname: binding.hostname } }); });
    return res.json({ id, hostname: binding.hostname, status: "verified" });
  });

  app.delete("/api/installation/admin/domains/:id", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res); if (!await requireInstallationAdmin(req, res)) return;
    const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid domain binding." });
    const [binding] = await db.update(installationDomainBindings).set({ status: "revoked", verificationTokenHash: null, revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(installationDomainBindings.id, id), eq(installationDomainBindings.installationId, DEFAULT_INSTALLATION_ID), sql`${installationDomainBindings.hostname} NOT IN ('lyfeos.net','www.lyfeos.net','lyfeos-app.fly.dev')`)).returning({ id: installationDomainBindings.id, hostname: installationDomainBindings.hostname });
    if (!binding) return res.status(404).json({ error: "Revocable custom domain not found." });
    await db.insert(installationAuditEvents).values({ installationId: DEFAULT_INSTALLATION_ID, actorUserId: req.session.userId!, action: "domain_revoked", subjectType: "domain_binding", subjectId: String(id), metadata: { hostname: binding.hostname } });
    return res.json({ id, status: "revoked" });
  });
}
