import pg from "pg";
import { request as httpRequest } from "node:http";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;
async function request(method: string, path: string, body?: unknown, cookie = "", host = "lyfeos.net") {
  return new Promise<any>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const target = new URL(`${BASE_URL}${path}`);
    const req = httpRequest({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", Host: host, ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) } }, (response) => {
      const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let data: any = {}; try { data = JSON.parse(text); } catch {} const setCookie = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"][0] : response.headers["set-cookie"] || ""; resolve({ status: response.statusCode || 0, data, cookie: setCookie.split(";", 1)[0], cache: response.headers["cache-control"] || null, vary: response.headers.vary || null }); });
    });
    req.on("error", reject); if (payload) req.write(payload); req.end();
  });
}

describeApi("installation branding authority contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let adminCookie = ""; let otherCookie = ""; let adminId = 0; let domainId = 0;
  afterAll(async () => { if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie); if (adminCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, adminCookie); await pool.query(`UPDATE lyfeos_installations SET current_brand_revision = 1 WHERE id = 'default'`); await pool.query(`DELETE FROM installation_brand_revisions WHERE installation_id = 'default' AND revision > 1`); await pool.end(); });

  it("serves only the safe host-bound public projection", async () => {
    const known = await request("GET", "/api/installation/brand");
    expect(known.status).toBe(200); expect(known.cache).toContain("public"); expect(known.vary).toContain("Host");
    expect(known.data).toMatchObject({ installationId: "default", productKey: "lyfeos", productOwner: "OST", recognizedHost: true, revision: 1 });
    expect(known.data).not.toHaveProperty("domains"); expect(known.data).not.toHaveProperty("adminGrants");
    const unknown = await request("GET", "/api/installation/brand", undefined, "", `unknown-${stamp}.example.com`);
    expect(unknown.data.recognizedHost).toBe(false);
    expect((await request("GET", "/api/installation/admin")).status).toBe(401);
  });

  it("requires an explicit grant and preserves optimistic brand history", async () => {
    const admin = await request("POST", "/api/auth/complete-registration", { email: `brand_${stamp}@example.com`, password: "TestPass123!", displayName: `brand_${stamp}`, termsAccepted: true });
    expect(admin.status).toBe(201); adminCookie = admin.cookie; adminId = admin.data.user.id;
    expect((await request("GET", "/api/installation/admin", undefined, adminCookie)).status).toBe(403);
    await pool.query(`INSERT INTO installation_admin_grants (installation_id,user_id,role,status) VALUES ('default',$1,'installation_owner','active')`, [adminId]);
    const adminState = await request("GET", "/api/installation/admin", undefined, adminCookie);
    expect(adminState.status).toBe(200); expect(adminState.data.authorityBoundary).toBe("presentation_only_no_personal_record_access");
    const changed = await request("PATCH", "/api/installation/admin/brand", { expectedRevision: 1, brand: { productName: "LyfeOS Test", shortName: "LyfeOS", accentColor: "#123abc", supportUrl: "https://lyfeos.net/support" }, reason: "isolated contract test" }, adminCookie);
    expect(changed.status).toBe(200); expect(changed.data.revision).toBe(2);
    expect((await request("PATCH", "/api/installation/admin/brand", { expectedRevision: 1, brand: changed.data.brand, reason: "stale retry" }, adminCookie)).status).toBe(409);
  });

  it("shows DNS proof once, stores only its hash, and denies other users", async () => {
    const hostname = `brand-${stamp.replace(/_/g, "-")}.example.com`;
    const created = await request("POST", "/api/installation/admin/domains", { hostname }, adminCookie);
    expect(created.status).toBe(201); domainId = created.data.id; expect(created.data.dns.value).toMatch(/^lyfeos-verification=/);
    const stored = await pool.query(`SELECT verification_token_hash FROM installation_domain_bindings WHERE id = $1`, [domainId]);
    expect(stored.rows[0].verification_token_hash).toMatch(/^[0-9a-f]{64}$/); expect(stored.rows[0].verification_token_hash).not.toContain(created.data.dns.value.slice(20));
    const other = await request("POST", "/api/auth/complete-registration", { email: `brand_other_${stamp}@example.com`, password: "TestPass123!", displayName: `brand_other_${stamp}`, termsAccepted: true });
    expect(other.status).toBe(201); otherCookie = other.cookie;
    expect((await request("GET", "/api/installation/admin", undefined, otherCookie)).status).toBe(403);
    expect((await request("DELETE", `/api/installation/admin/domains/${domainId}`, undefined, adminCookie)).status).toBe(200);
  });
});
