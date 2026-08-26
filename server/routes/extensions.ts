import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { extensionAuditEvents, extensionInstallations, extensionPackages, extensionPublishers } from "@shared/schema";
import { db } from "../db";
import { EXTENSION_PERMISSIONS, extensionManifestDigest, extensionManifestSchema, hasExtensionRegistryAuthority, validateExtensionPublicKey, verifyExtensionManifest } from "../extension-registry";
import { isAuthenticated } from "./middleware";

const keyIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/);
const uuidSchema = z.string().uuid();
const publisherInput = z.object({ name: z.string().trim().min(2).max(100), publicKeyPem: z.string().min(80).max(2000) });
const publishInput = z.object({ publisherKeyId: keyIdSchema, manifest: extensionManifestSchema, signature: z.string().min(40).max(500) });
const installInput = z.object({ packageId: z.string().uuid(), grantedPermissions: z.array(z.enum(EXTENSION_PERMISSIONS)).max(5).refine((values) => new Set(values).size === values.length) });
const revokeInput = z.object({ expectedRevision: z.number().int().positive() });

function privateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

function registryAuthorized(req: Request, res: Response): boolean {
  if (hasExtensionRegistryAuthority(req.header("authorization"))) return true;
  res.status(404).json({ error: "Not found." });
  return false;
}

export function registerExtensionRoutes(app: Express): void {
  app.put("/api/internal/extensions/publishers/:keyId", async (req: Request, res: Response) => {
    if (!registryAuthorized(req, res)) return;
    const keyId = keyIdSchema.safeParse(req.params.keyId);
    const parsed = publisherInput.safeParse(req.body);
    if (!keyId.success || !parsed.success || !validateExtensionPublicKey(parsed.success ? parsed.data.publicKeyPem : "")) return res.status(400).json({ error: "A valid Ed25519 publisher key is required." });
    try {
      const [publisher] = await db.insert(extensionPublishers).values({ keyId: keyId.data, name: parsed.data.name, publicKeyPem: parsed.data.publicKeyPem }).returning();
      return res.status(201).json({ publisher: { keyId: publisher.keyId, name: publisher.name, status: publisher.status } });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "Publisher key already exists and is immutable." });
      return res.status(500).json({ error: "Could not register publisher." });
    }
  });

  app.post("/api/internal/extensions/packages", async (req: Request, res: Response) => {
    if (!registryAuthorized(req, res)) return;
    const parsed = publishInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Signed extension package is invalid.", details: parsed.error.flatten() });
    const [publisher] = await db.select().from(extensionPublishers).where(and(eq(extensionPublishers.keyId, parsed.data.publisherKeyId), eq(extensionPublishers.status, "active"))).limit(1);
    if (!publisher) return res.status(400).json({ error: "Publisher is not trusted and active." });
    if (!verifyExtensionManifest(parsed.data.manifest, parsed.data.signature, publisher.publicKeyPem)) return res.status(400).json({ error: "Extension signature verification failed." });
    try {
      const manifest = parsed.data.manifest;
      const [record] = await db.insert(extensionPackages).values({ slug: manifest.slug, version: manifest.version, displayName: manifest.displayName, description: manifest.description, manifest, manifestDigest: extensionManifestDigest(manifest), publisherKeyId: publisher.keyId, signature: parsed.data.signature }).returning();
      return res.status(201).json({ package: { ...record, signature: undefined, manifestVerified: true } });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "This immutable extension version already exists." });
      return res.status(500).json({ error: "Could not publish extension package." });
    }
  });

  app.post("/api/internal/extensions/publishers/:keyId/revoke", async (req: Request, res: Response) => {
    if (!registryAuthorized(req, res)) return;
    const keyId = keyIdSchema.safeParse(req.params.keyId);
    if (!keyId.success) return res.status(400).json({ error: "Invalid publisher key id." });
    const revoked = await db.transaction(async (tx) => {
      const [publisher] = await tx.update(extensionPublishers).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(extensionPublishers.keyId, keyId.data), eq(extensionPublishers.status, "active"))).returning();
      if (!publisher) return null;
      await tx.execute(sql`UPDATE "extension_installations" SET "status"='revoked', "revoked_at"=now(), "updated_at"=now() WHERE "status"='enabled' AND "package_id" IN (SELECT "id" FROM "extension_packages" WHERE "publisher_key_id"=${keyId.data})`);
      await tx.update(extensionPackages).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(extensionPackages.publisherKeyId, keyId.data), eq(extensionPackages.status, "published")));
      await tx.insert(extensionAuditEvents).values({ action: "publisher_revoked", metadata: { publisherKeyId: keyId.data } });
      return publisher;
    });
    return revoked ? res.json({ revoked: true, publisherKeyId: revoked.keyId }) : res.status(404).json({ error: "Active publisher not found." });
  });

  app.post("/api/internal/extensions/packages/:id/revoke", async (req: Request, res: Response) => {
    if (!registryAuthorized(req, res)) return;
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid package id." });
    const result = await db.transaction(async (tx) => {
      const [record] = await tx.update(extensionPackages).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(extensionPackages.id, id.data), eq(extensionPackages.status, "published"))).returning();
      if (!record) return null;
      await tx.update(extensionInstallations).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(extensionInstallations.packageId, id.data), eq(extensionInstallations.status, "enabled")));
      await tx.insert(extensionAuditEvents).values({ packageId: id.data, action: "package_revoked", metadata: { publisherKeyId: record.publisherKeyId, slug: record.slug, version: record.version } });
      return record;
    });
    return result ? res.json({ revoked: true, packageId: result.id }) : res.status(404).json({ error: "Published package not found." });
  });

  app.get("/api/extensions", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const userId = req.session.userId!;
    const [packages, installations, audits] = await Promise.all([
      db.select({ package: extensionPackages, publisherName: extensionPublishers.name, publisherStatus: extensionPublishers.status, publicKeyPem: extensionPublishers.publicKeyPem }).from(extensionPackages).innerJoin(extensionPublishers, eq(extensionPackages.publisherKeyId, extensionPublishers.keyId)).where(and(eq(extensionPackages.status, "published"), eq(extensionPublishers.status, "active"))).orderBy(extensionPackages.slug, desc(extensionPackages.createdAt)),
      db.select().from(extensionInstallations).where(eq(extensionInstallations.userId, userId)).orderBy(desc(extensionInstallations.updatedAt)),
      db.select().from(extensionAuditEvents).where(eq(extensionAuditEvents.userId, userId)).orderBy(desc(extensionAuditEvents.createdAt)).limit(20),
    ]);
    const catalog = packages.filter((entry) => verifyExtensionManifest(entry.package.manifest, entry.package.signature, entry.publicKeyPem)).map((entry) => ({ id: entry.package.id, slug: entry.package.slug, version: entry.package.version, displayName: entry.package.displayName, description: entry.package.description, manifest: entry.package.manifest, manifestDigest: entry.package.manifestDigest, publisherKeyId: entry.package.publisherKeyId, publisherName: entry.publisherName, signatureVerified: true }));
    return res.json({ catalog, installations, audits, executionBoundary: "Extensions are signed permission manifests only. LyfeOS does not load or execute publisher code in the application process." });
  });

  app.post("/api/extensions/installations", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const parsed = installInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Extension installation request is invalid." });
    const [entry] = await db.select({ package: extensionPackages, publisher: extensionPublishers }).from(extensionPackages).innerJoin(extensionPublishers, eq(extensionPackages.publisherKeyId, extensionPublishers.keyId)).where(and(eq(extensionPackages.id, parsed.data.packageId), eq(extensionPackages.status, "published"), eq(extensionPublishers.status, "active"))).limit(1);
    if (!entry || !verifyExtensionManifest(entry.package.manifest, entry.package.signature, entry.publisher.publicKeyPem)) return res.status(404).json({ error: "A verified published extension was not found." });
    const manifest = extensionManifestSchema.parse(entry.package.manifest);
    if (parsed.data.grantedPermissions.some((permission) => !manifest.permissions.includes(permission))) return res.status(400).json({ error: "Granted permissions must be a subset of the signed manifest." });
    const userId = req.session.userId!;
    const installation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`);
      const [existing] = await tx.select().from(extensionInstallations).where(and(eq(extensionInstallations.userId, userId), eq(extensionInstallations.packageId, entry.package.id))).limit(1);
      if (existing?.status === "enabled") return null;
      const superseded = await tx.update(extensionInstallations).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(extensionInstallations.userId, userId), eq(extensionInstallations.extensionSlug, entry.package.slug), eq(extensionInstallations.status, "enabled"))).returning({ id: extensionInstallations.id, packageId: extensionInstallations.packageId });
      const [record] = existing
        ? await tx.update(extensionInstallations).set({ grantedPermissions: parsed.data.grantedPermissions, status: "enabled", revokedAt: null, revision: existing.revision + 1, updatedAt: new Date() }).where(and(eq(extensionInstallations.id, existing.id), eq(extensionInstallations.revision, existing.revision))).returning()
        : await tx.insert(extensionInstallations).values({ userId, packageId: entry.package.id, extensionSlug: entry.package.slug, grantedPermissions: parsed.data.grantedPermissions }).returning();
      await tx.insert(extensionAuditEvents).values({ userId, packageId: entry.package.id, action: superseded.length ? "upgraded" : "installed", metadata: { permissions: parsed.data.grantedPermissions, manifestDigest: entry.package.manifestDigest, supersededPackageIds: superseded.map((item) => item.packageId) } });
      return record;
    });
    return installation ? res.status(201).json({ installation }) : res.status(409).json({ error: "Extension is already enabled." });
  });

  app.post("/api/extensions/installations/:id/revoke", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const id = uuidSchema.safeParse(req.params.id);
    const parsed = revokeInput.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "A valid installation and expected revision are required." });
    const userId = req.session.userId!;
    const installation = await db.transaction(async (tx) => {
      const [record] = await tx.update(extensionInstallations).set({ status: "revoked", revokedAt: new Date(), revision: parsed.data.expectedRevision + 1, updatedAt: new Date() }).where(and(eq(extensionInstallations.id, id.data), eq(extensionInstallations.userId, userId), eq(extensionInstallations.status, "enabled"), eq(extensionInstallations.revision, parsed.data.expectedRevision))).returning();
      if (!record) return null;
      await tx.insert(extensionAuditEvents).values({ userId, packageId: record.packageId, action: "revoked", metadata: { priorRevision: parsed.data.expectedRevision } });
      return record;
    });
    return installation ? res.json({ installation }) : res.status(409).json({ error: "The enabled installation changed before revocation." });
  });
}
