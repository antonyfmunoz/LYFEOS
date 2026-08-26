export const LIABILITY_ACCOUNT_TYPES = new Set(["credit", "loan", "other_liability"]);

export type FinanceAccountValue = {
  accountType: string;
  currency: string;
  balanceMinor: number;
  includeInNetWorth: boolean;
  status: string;
};

export type CurrencyBalanceSummary = {
  currency: string;
  assetsMinor: number;
  liabilitiesMinor: number;
  netWorthMinor: number;
};

export function summarizeAccountBalances(accounts: readonly FinanceAccountValue[]): CurrencyBalanceSummary[] {
  const totals = new Map<string, CurrencyBalanceSummary>();
  for (const account of accounts) {
    if (account.status !== "active" || !account.includeInNetWorth) continue;
    const current = totals.get(account.currency) || { currency: account.currency, assetsMinor: 0, liabilitiesMinor: 0, netWorthMinor: 0 };
    const magnitude = Math.abs(account.balanceMinor);
    if (LIABILITY_ACCOUNT_TYPES.has(account.accountType)) current.liabilitiesMinor += magnitude;
    else current.assetsMinor += account.balanceMinor;
    current.netWorthMinor = current.assetsMinor - current.liabilitiesMinor;
    totals.set(account.currency, current);
  }
  return Array.from(totals.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function utcMonthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${year.toString().padStart(4, "0")}-${monthNumber.toString().padStart(2, "0")}-01`,
    end: `${nextYear.toString().padStart(4, "0")}-${nextMonth.toString().padStart(2, "0")}-01`,
  };
}
