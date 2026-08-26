import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    elapsedMs: performance.now() - startedAt,
  };
}

describeApi("private workspace search at realistic account scale", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const owner = { email: `search_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `search_owner_${stamp}` };
  const other = { email: `search_other_${stamp}@example.com`, password: "TestPass123!", displayName: `search_other_${stamp}` };
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = "";
  let otherCookie = "";
  let ownerId = 0;
  let otherMissionId = 0;

  afterAll(async () => {
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    await pool.end();
  });

  it("builds isolated canonical fixtures without exposing a contact secret as search content", async () => {
    expect((await request("GET", "/api/search?q=atlasneedle")).status).toBe(401);
    const ownerRegistration = await request("POST", "/api/auth/complete-registration", { ...owner, termsAccepted: true });
    const otherRegistration = await request("POST", "/api/auth/complete-registration", { ...other, termsAccepted: true });
    expect([ownerRegistration.status, otherRegistration.status]).toEqual([201, 201]);
    ownerCookie = ownerRegistration.cookie;
    otherCookie = otherRegistration.cookie;

    const accounts = await pool.query(`SELECT id, display_name FROM users WHERE display_name = ANY($1::text[])`, [[owner.displayName, other.displayName]]);
    ownerId = Number(accounts.rows.find((row) => row.display_name === owner.displayName)?.id);
    const otherId = Number(accounts.rows.find((row) => row.display_name === other.displayName)?.id);
    expect(ownerId).toBeGreaterThan(0);
    expect(otherId).toBeGreaterThan(0);

    const fixtureSize = 10_000;
    const missionFixtureSize = 100_000;
    await pool.query(`
      INSERT INTO quests (user_id, title, description)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle mission ' || n ELSE 'Mission ' || n END,
        CASE WHEN n % 1000 = 0 THEN 'Indexed atlasneedle evidence' ELSE 'Ordinary mission evidence' END
      FROM generate_series(1, $2) AS n
    `, [ownerId, missionFixtureSize]);
    await pool.query(`
      INSERT INTO documents (user_id, title, content, description)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle document ' || n ELSE 'Document ' || n END,
        CASE WHEN n % 1000 = 0 THEN 'Indexed atlasneedle content' ELSE 'Ordinary document content' END,
        'Private canonical document'
      FROM generate_series(1, $2) AS n
    `, [ownerId, fixtureSize]);
    await pool.query(`
      INSERT INTO spreadsheets (user_id, title, description, content)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle sheet ' || n ELSE 'Sheet ' || n END,
        CASE WHEN n % 1000 = 0 THEN 'Indexed atlasneedle workspace' ELSE 'Ordinary workspace' END,
        '{"version":1,"sheets":[]}'::jsonb
      FROM generate_series(1, $2) AS n
    `, [ownerId, fixtureSize]);
    await pool.query(`
      INSERT INTO canvases (user_id, title, description, content)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle canvas ' || n ELSE 'Canvas ' || n END,
        CASE WHEN n % 1000 = 0 THEN 'Indexed atlasneedle map' ELSE 'Ordinary map' END,
        '{"version":1,"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb
      FROM generate_series(1, $2) AS n
    `, [ownerId, fixtureSize]);
    await pool.query(`
      INSERT INTO workspace_databases (user_id, title, description, definition)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle table ' || n ELSE 'Table ' || n END,
        CASE WHEN n % 1000 = 0 THEN 'Indexed atlasneedle records' ELSE 'Ordinary records' END,
        '{"version":1,"columns":[{"id":"title","name":"Title","type":"text","required":true}]}'::jsonb
      FROM generate_series(1, $2) AS n
    `, [ownerId, fixtureSize]);
    await pool.query(`
      INSERT INTO contacts (user_id, name, alias, company, job_title, email, notes)
      SELECT $1, CASE WHEN n = $2 THEN 'Atlasneedle' WHEN n % 1000 = 0 THEN 'Atlasneedle person ' || n ELSE 'Person ' || n END,
        NULL, CASE WHEN n % 1000 = 0 THEN 'Atlasneedle collective' ELSE 'Ordinary company' END,
        'Collaborator', 'person' || n || '@example.com', 'Private note'
      FROM generate_series(1, $2) AS n
    `, [ownerId, fixtureSize]);
    await pool.query(`INSERT INTO contacts (user_id, name, email, notes) VALUES ($1, 'Secret-only contact', 'atlasneedle@example.com', 'atlasneedle must remain private')`, [ownerId]);
    const foreign = await pool.query(`INSERT INTO quests (user_id, title, description) VALUES ($1, 'Atlasneedle foreign mission', 'Must remain isolated') RETURNING id`, [otherId]);
    otherMissionId = Number(foreign.rows[0].id);

    for (const table of ["quests", "documents", "spreadsheets", "canvases", "workspace_databases", "contacts"]) {
      await pool.query(`ANALYZE ${table}`);
    }
  }, 90_000);

  it("returns a bounded private cross-domain result set within the local latency budget", async () => {
    const searched = await request("GET", "/api/search?q=atlasneedle&limit=25", undefined, ownerCookie);
    expect(searched.status).toBe(200);
    expect(searched.elapsedMs).toBeLessThan(5_000);
    expect(searched.data.results).toHaveLength(25);
    expect(searched.data.results.some((result: any) => result.id === otherMissionId && result.kind === "mission")).toBe(false);
    expect(searched.data.results.some((result: any) => result.title === "Secret-only contact")).toBe(false);
    expect(Object.values(searched.data.counts).reduce((sum: number, value) => sum + Number(value), 0)).toBe(25);
    expect(new Set(searched.data.results.map((result: any) => result.kind))).toEqual(new Set(["mission", "document", "spreadsheet", "canvas", "database", "relationship"]));
  }, 15_000);

  it("uses a governed workspace-search index for the analyzed mission query", async () => {
    const explained = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM quests
      WHERE user_id = $1 AND deleted_at IS NULL AND (
        title ILIKE '%atlasneedle%'
        OR to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, '')) @@ websearch_to_tsquery('simple', 'atlasneedle')
        OR title % 'atlasneedle'
      )
      ORDER BY updated_at DESC
      LIMIT 25
    `, [ownerId]);
    const plan = JSON.stringify(explained.rows[0]["QUERY PLAN"]);
    expect(plan).toMatch(/quests_workspace_search_(fts|title_trgm)_idx/);
    const executionTime = Number(explained.rows[0]["QUERY PLAN"][0]["Execution Time"]);
    expect(executionTime).toBeLessThan(2_000);
  });
});
