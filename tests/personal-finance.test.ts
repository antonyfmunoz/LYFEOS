import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeAccountBalances, utcMonthBounds } from "../server/personal-finance";

describe("personal finance foundation", () => {
  it("keeps currency authority separate and subtracts positive liability balances", () => {
    expect(summarizeAccountBalances([
      { accountType: "checking", currency: "USD", balanceMinor: 250_000, includeInNetWorth: true, status: "active" },
      { accountType: "credit", currency: "USD", balanceMinor: 50_000, includeInNetWorth: true, status: "active" },
      { accountType: "cash", currency: "EUR", balanceMinor: 10_000, includeInNetWorth: true, status: "active" },
      { accountType: "savings", currency: "USD", balanceMinor: 99_999, includeInNetWorth: false, status: "active" },
      { accountType: "loan", currency: "USD", balanceMinor: 80_000, includeInNetWorth: true, status: "closed" },
    ])).toEqual([
      { currency: "EUR", assetsMinor: 10_000, liabilitiesMinor: 0, netWorthMinor: 10_000 },
      { currency: "USD", assetsMinor: 250_000, liabilitiesMinor: 50_000, netWorthMinor: 200_000 },
    ]);
  });

  it("derives calendar-month boundaries without locale or server-time-zone drift", () => {
    expect(utcMonthBounds("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(() => utcMonthBounds("2026-13")).toThrow("Invalid month");
  });

  it("keeps finance private, portable, erasable, and distinct from Wealth Tokens", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/personal-finance.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "server/routes/profile.ts"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/PersonalFinancePage.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0129_personal_finance_foundation.sql"), "utf8");
    for (const table of ["finance_accounts", "finance_balance_snapshots", "finance_transactions", "finance_budgets", "finance_goals"]) {
      expect(profile).toContain(`"${table}"`);
      expect(migration).toContain(`"${table}"`);
    }
    expect(routes).toContain('private, no-store');
    expect(routes).toContain('Currency totals stay separate');
    expect(page).toContain('This is separate from Wealth Tokens');
    expect(page).toContain('Bank connection is not yet active');
    expect(page).toContain('Save correction');
    expect(page).toContain('Delete ${item.description}');
    expect(page).toContain('Complete');
    expect(page).toContain('Reopen');
  });

  it("binds the complete rendered finance lifecycle to protected production evidence", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/PersonalFinancePage.tsx"), "utf8");
    const script = readFileSync(resolve(process.cwd(), "scripts/production-personal-finance-browser-acceptance.ts"), "utf8");
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/production-browser-acceptance.yml"), "utf8");
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(page).toContain('data-testid="personal-finance"');
    expect(page).toContain('aria-label="Net worth and cash flow"');
    expect(script).toContain('contract: "lyfeos.production-personal-finance-browser.v1"');
    for (const invariant of [
      "assetLiabilityMathReconciled",
      "balanceHistoryReconciled",
      "cashFlowAndBudgetReconciled",
      "correctionReconciled",
      "accountLifecycleReconciled",
      "goalLifecycleReconciled",
      "deletionAndArchiveReconciled",
      "wealthTokensUnchanged",
      "invalidLabelReferences",
      "accountErased",
    ]) expect(script).toContain(invariant);
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("runtime does not match the requested immutable source");
    expect(workflow).toContain("Run disposable production Personal Finance acceptance");
    expect(workflow).toContain("LYFEOS_FINANCE_OUTPUT_DIR");
    expect(workflow).toContain("npm run acceptance:production-personal-finance");
    expect(packageJson).toContain('"acceptance:production-personal-finance"');
  });
});
