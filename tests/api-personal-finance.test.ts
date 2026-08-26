import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const describeApi = BASE_URL && DATABASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any, cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

describeApi("Personal Finance authenticated contract", () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let ownerCookie = ""; let otherCookie = ""; let ownerId = 0; let checkingId = 0; let checkingVersion = 0;

  afterAll(async () => {
    if (otherCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, otherCookie);
    if (ownerCookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie);
    await pool.end();
  });

  it("is private and keeps liability and currency arithmetic truthful", async () => {
    expect((await request("GET", "/api/finance/summary?month=2026-08")).status).toBe(401);
    const owner = await request("POST", "/api/auth/complete-registration", { email: `finance_${stamp}@example.com`, password: "TestPass123!", displayName: `finance_${stamp}`, termsAccepted: true });
    expect(owner.status).toBe(201); ownerCookie = owner.cookie; ownerId = owner.data.user.id;
    const checking = await request("POST", "/api/finance/accounts", { name: "Operating", accountType: "checking", currency: "usd", balanceMinor: 250000, includeInNetWorth: true }, ownerCookie);
    expect(checking.status).toBe(201); checkingId = checking.data.id; checkingVersion = checking.data.version;
    expect((await request("POST", "/api/finance/accounts", { name: "Card", accountType: "credit", currency: "USD", balanceMinor: 50000, includeInNetWorth: true }, ownerCookie)).status).toBe(201);
    expect((await request("POST", "/api/finance/accounts", { name: "Travel cash", accountType: "cash", currency: "EUR", balanceMinor: 10000, includeInNetWorth: true }, ownerCookie)).status).toBe(201);
    const summary = await request("GET", "/api/finance/summary?month=2026-08", undefined, ownerCookie);
    expect(summary.status).toBe(200);
    expect(summary.data).toMatchObject({ contract: "lyfeos.personal-finance.v1", provider: { plaid: { available: false, connected: false } } });
    expect(summary.data.balanceSummary).toEqual([{ currency: "EUR", assetsMinor: 10000, liabilitiesMinor: 0, netWorthMinor: 10000 }, { currency: "USD", assetsMinor: 250000, liabilitiesMinor: 50000, netWorthMinor: 200000 }]);
  });

  it("converges exact transaction retries and drives category budgets", async () => {
    const clientMutationId = crypto.randomUUID();
    const body = { accountId: checkingId, amountMinor: -4250, transactionDate: "2026-08-05", description: "Groceries", category: "Food", status: "posted", clientMutationId };
    const created = await request("POST", "/api/finance/transactions", body, ownerCookie);
    const replay = await request("POST", "/api/finance/transactions", body, ownerCookie);
    const changed = await request("POST", "/api/finance/transactions", { ...body, amountMinor: -5000 }, ownerCookie);
    expect(created.status).toBe(201); expect(replay.status).toBe(200); expect(replay.data.id).toBe(created.data.id); expect(changed.status).toBe(409);
    expect((await request("PUT", "/api/finance/budgets", { month: "2026-08", category: "Food", currency: "USD", limitMinor: 25000 }, ownerCookie)).status).toBe(200);
    const summary = await request("GET", "/api/finance/summary?month=2026-08", undefined, ownerCookie);
    expect(summary.data.cashFlow).toContainEqual({ currency: "USD", incomeMinor: 0, spendingMinor: 4250 });
    expect(summary.data.budgets[0]).toMatchObject({ category: "food", limitMinor: 25000, spentMinor: 4250 });
    const corrected = await request("PATCH", `/api/finance/transactions/${created.data.id}`, { expectedVersion: created.data.version, amountMinor: -5000, category: "FOOD" }, ownerCookie);
    expect(corrected.status).toBe(200);
    expect(corrected.data).toMatchObject({ amountMinor: -5000, category: "food", version: created.data.version + 1 });
    expect((await request("DELETE", `/api/finance/transactions/${created.data.id}?expectedVersion=${created.data.version}`, undefined, ownerCookie)).status).toBe(409);
    expect((await request("DELETE", `/api/finance/transactions/${created.data.id}?expectedVersion=${corrected.data.version}`, undefined, ownerCookie)).status).toBe(200);
  });

  it("uses optimistic versions and preserves every balance correction as a snapshot", async () => {
    const first = await request("PATCH", `/api/finance/accounts/${checkingId}`, { expectedVersion: checkingVersion, balanceMinor: 275000 }, ownerCookie);
    expect(first.status).toBe(200); expect(first.data.version).toBe(checkingVersion + 1);
    expect((await request("PATCH", `/api/finance/accounts/${checkingId}`, { expectedVersion: checkingVersion, balanceMinor: 300000 }, ownerCookie)).status).toBe(409);
    const snapshots = await pool.query("SELECT balance_minor FROM finance_balance_snapshots WHERE user_id = $1 AND account_id = $2 ORDER BY id", [ownerId, checkingId]);
    expect(snapshots.rows.map((row) => Number(row.balance_minor))).toEqual([250000, 275000]);
  });

  it("supports complete user-controlled budget, goal, and account lifecycles", async () => {
    const budget = await request("PUT", "/api/finance/budgets", { month: "2026-09", category: "Housing", currency: "usd", limitMinor: 150000 }, ownerCookie);
    expect(budget.status).toBe(200);
    expect((await request("DELETE", `/api/finance/budgets/${budget.data.id}`, undefined, ownerCookie)).status).toBe(200);
    const goal = await request("POST", "/api/finance/goals", { name: "Emergency fund", goalType: "emergency_fund", currency: "USD", targetMinor: 500000, currentMinor: 100000 }, ownerCookie);
    expect(goal.status).toBe(201);
    const completed = await request("PATCH", `/api/finance/goals/${goal.data.id}`, { expectedVersion: goal.data.version, currentMinor: 500000, status: "completed" }, ownerCookie);
    expect(completed.status).toBe(200);
    expect(completed.data).toMatchObject({ currentMinor: 500000, status: "completed", version: goal.data.version + 1 });
    const closed = await request("PATCH", `/api/finance/accounts/${checkingId}`, { expectedVersion: checkingVersion + 1, status: "closed" }, ownerCookie);
    expect(closed.status).toBe(200);
    expect(closed.data.status).toBe("closed");
    checkingVersion = closed.data.version;
  });

  it("isolates owners and includes the domain in portable export and exact erasure", async () => {
    const other = await request("POST", "/api/auth/complete-registration", { email: `finance_other_${stamp}@example.com`, password: "TestPass123!", displayName: `finance_other_${stamp}`, termsAccepted: true });
    expect(other.status).toBe(201); otherCookie = other.cookie;
    expect((await request("PATCH", `/api/finance/accounts/${checkingId}`, { expectedVersion: checkingVersion + 1, balanceMinor: 1 }, otherCookie)).status).toBe(404);
    const exported = await request("GET", "/api/account/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    for (const table of ["finance_accounts", "finance_balance_snapshots", "finance_transactions", "finance_budgets", "finance_goals"]) expect(exported.data.data).toHaveProperty(table);
    expect(exported.data.dataRights.version).toBe("lyfeos.data-rights.v3");
    expect((await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, ownerCookie)).status).toBe(200); ownerCookie = "";
    for (const table of ["finance_accounts", "finance_balance_snapshots", "finance_transactions", "finance_budgets", "finance_goals"]) {
      const count = await pool.query(`SELECT count(*)::integer AS count FROM ${table} WHERE user_id = $1`, [ownerId]);
      expect(count.rows[0].count).toBe(0);
    }
  });
});
