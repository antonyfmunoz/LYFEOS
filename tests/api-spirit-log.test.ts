import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0], cacheControl: response.headers.get("cache-control") || "" };
}

describeApi("Spirit Log authenticated contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = ""; let otherCookie = ""; let ownerId = 0; let entryId = 0;

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("requires authentication and stores only an owner-authored private record", async () => {
    expect((await request("GET", "/api/spirit-entries")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `spirit_${stamp}@example.com`, password: "TestPass123!", displayName: `spirit_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); ownerCookie = owner.cookie; ownerId = owner.data.user.id;
    const created = await request("POST", "/api/spirit-entries", { entryDate: "2026-09-16", kind: "bible_study", title: "Abide", scripture: "John 15:1–8", content: "Study notes in my own words." }, ownerCookie);
    expect(created.status).toBe(201); entryId = created.data.id;
    expect(created.data).toMatchObject({ userId: ownerId, kind: "bible_study", title: "Abide", scripture: "John 15:1–8" });
    const listed = await request("GET", "/api/spirit-entries", undefined, ownerCookie);
    expect(listed.status).toBe(200); expect(listed.cacheControl).toContain("private, no-store");
    expect(listed.data.entries).toHaveLength(1);
    expect(listed.data.disclosure).toContain("user-authored");
  });

  it("supports correction, ownership isolation, export, deletion, and account erasure", async () => {
    const other = await request("POST", "/api/auth/complete-registration", { email: `spirit_other_${stamp}@example.com`, password: "TestPass123!", displayName: `spirit_other_${stamp}`, termsAccepted: true });
    expect(other.status).toBe(201); otherCookie = other.cookie;
    expect((await request("PATCH", `/api/spirit-entries/${entryId}`, { title: "Forged" }, otherCookie)).status).toBe(404);
    const corrected = await request("PATCH", `/api/spirit-entries/${entryId}`, { entryDate: "2026-09-17", kind: "prayer", title: "Prayer for wisdom", scripture: null, content: "A private prayer." }, ownerCookie);
    expect(corrected.status).toBe(200); expect(corrected.data).toMatchObject({ kind: "prayer", title: "Prayer for wisdom", scripture: null });
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200); expect(exported.data.data.spirit_entries).toHaveLength(1);
    expect((await request("DELETE", `/api/spirit-entries/${entryId}`, undefined, ownerCookie)).status).toBe(200);
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    const remaining = await pool.query("SELECT count(*)::integer AS count FROM spirit_entries WHERE user_id = $1", [ownerId]);
    expect(remaining.rows[0].count).toBe(0);
  });
});
