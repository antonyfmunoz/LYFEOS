import { generateKeyPairSync, sign } from "crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { canonicalExtensionManifest } from "../server/extension-registry";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_TOKEN = process.env.LYFEOS_EXTENSION_REGISTRY_ADMIN_TOKEN;
const describeApi = BASE_URL && DATABASE_URL && ADMIN_TOKEN && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "", authorization = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}), ...(authorization ? { Authorization: authorization } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("signed extensions authenticated and registry journey", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const keyId = `qualification.${stamp.replace(/_/g, ".")}`.toLowerCase();
  const manifest = { schema: "lyfeos.extension.v1" as const, slug: `qual-${Date.now()}`, version: "1.0.0", displayName: "Qualification Extension", description: "Verifies the signed extension lifecycle.", permissions: ["projection.progression.summary.read" as const, "draft.reflection.create" as const], capabilityContract: "projection_and_draft_only" as const };
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const signature = sign(null, Buffer.from(canonicalExtensionManifest(manifest)), keys.privateKey).toString("base64");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let cookie = ""; let userId = 0; let packageId = ""; let installationId = ""; let revision = 0;

  afterAll(async () => { if (cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie); await pool.end(); });

  it("hides registry authority and accepts only a trusted Ed25519 publisher", async () => {
    expect((await request("GET", "/api/extensions")).status).toBe(401);
    expect((await request("PUT", `/api/internal/extensions/publishers/${keyId}`, { name: "Qualification", publicKeyPem })).status).toBe(404);
    const authorized = `Bearer ${ADMIN_TOKEN}`;
    expect((await request("PUT", `/api/internal/extensions/publishers/${keyId}`, { name: "Qualification", publicKeyPem }, "", authorized)).status).toBe(201);
    expect((await request("POST", "/api/internal/extensions/packages", { publisherKeyId: keyId, manifest, signature: Buffer.alloc(64).toString("base64") }, "", authorized)).status).toBe(400);
    const published = await request("POST", "/api/internal/extensions/packages", { publisherKeyId: keyId, manifest, signature }, "", authorized);
    expect(published.status).toBe(201); packageId = published.data.package.id;
    expect(published.data.package).toMatchObject({ slug: manifest.slug, manifestVerified: true });
    expect(published.data.package.signature).toBeUndefined();
  });

  it("installs only signed permissions and supports immediate revocation", async () => {
    const account = await request("POST", "/api/auth/complete-registration", { email: `extension_${stamp}@example.com`, password: "TestPass123!", displayName: `extension_${stamp}`, termsAccepted: true });
    expect(account.status).toBe(201); cookie = account.cookie; userId = account.data.user.id;
    const catalog = await request("GET", "/api/extensions", undefined, cookie);
    expect(catalog.status).toBe(200); expect(catalog.data.catalog.find((entry: any) => entry.id === packageId)).toMatchObject({ signatureVerified: true, manifestDigest: expect.stringMatching(/^sha256:/) });
    expect((await request("POST", "/api/extensions/installations", { packageId, grantedPermissions: ["draft.mission.create"] }, cookie)).status).toBe(400);
    const installed = await request("POST", "/api/extensions/installations", { packageId, grantedPermissions: manifest.permissions }, cookie);
    expect(installed.status).toBe(201); installationId = installed.data.installation.id; revision = installed.data.installation.revision;
    expect((await request("POST", "/api/extensions/installations", { packageId, grantedPermissions: manifest.permissions }, cookie)).status).toBe(409);
    const upgradedManifest = { ...manifest, version: "1.1.0", description: "Verifies atomic extension version upgrades." };
    const upgradedSignature = sign(null, Buffer.from(canonicalExtensionManifest(upgradedManifest)), keys.privateKey).toString("base64");
    const upgradedPackage = await request("POST", "/api/internal/extensions/packages", { publisherKeyId: keyId, manifest: upgradedManifest, signature: upgradedSignature }, "", `Bearer ${ADMIN_TOKEN}`);
    expect(upgradedPackage.status).toBe(201);
    const upgraded = await request("POST", "/api/extensions/installations", { packageId: upgradedPackage.data.package.id, grantedPermissions: upgradedManifest.permissions }, cookie);
    expect(upgraded.status).toBe(201);
    const versions = await pool.query(`SELECT package_id, status FROM extension_installations WHERE user_id=$1 AND extension_slug=$2 ORDER BY installed_at`, [userId, manifest.slug]);
    expect(versions.rows).toEqual(expect.arrayContaining([{ package_id: packageId, status: "revoked" }, { package_id: upgradedPackage.data.package.id, status: "enabled" }]));
    const exported = await request("GET", "/api/account/export", undefined, cookie);
    expect(exported.status).toBe(200); expect(exported.data.data.extension_installations.find((row: any) => row.id === installationId)).toMatchObject({ extension_slug: manifest.slug, version: "1.0.0", publisher_key_id: keyId, manifest_digest: expect.stringMatching(/^sha256:/) }); expect(exported.data.data.extension_audit_events.length).toBeGreaterThan(0);
    expect((await request("POST", `/api/extensions/installations/${installationId}/revoke`, { expectedRevision: revision }, cookie)).status).toBe(409);
    const revoked = await request("POST", `/api/extensions/installations/${upgraded.data.installation.id}/revoke`, { expectedRevision: upgraded.data.installation.revision }, cookie);
    expect(revoked.status).toBe(200); expect(revoked.data.installation.status).toBe("revoked");
  });

  it("cascades account erasure while preserving immutable registry records", async () => {
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, cookie)).status).toBe(200); cookie = "";
    const rows = await pool.query(`SELECT (SELECT count(*) FROM extension_installations WHERE user_id=$1)::int AS installations, (SELECT count(*) FROM extension_audit_events WHERE user_id=$1)::int AS audits, (SELECT count(*) FROM extension_packages WHERE id=$2)::int AS packages`, [userId, packageId]);
    expect(rows.rows[0]).toEqual({ installations: 0, audits: 0, packages: 1 });
    const publisherRevoked = await request("POST", `/api/internal/extensions/publishers/${keyId}/revoke`, undefined, "", `Bearer ${ADMIN_TOKEN}`);
    expect(publisherRevoked.status).toBe(200);
    const registry = await pool.query(`SELECT p.status AS package_status, k.status AS publisher_status FROM extension_packages p INNER JOIN extension_publishers k ON k.key_id=p.publisher_key_id WHERE p.id=$1`, [packageId]);
    expect(registry.rows[0]).toEqual({ package_status: "revoked", publisher_status: "revoked" });
  });
});
