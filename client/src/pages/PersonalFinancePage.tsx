import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Check, Landmark, Loader2, Pencil, Plus, RefreshCcw, RotateCcw, Target, Trash2, WalletCards, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageTitle } from "@/hooks/use-page-title";
import { apiRequest, queryClient } from "@/lib/queryClient";

type FinanceAccount = { id: number; name: string; accountType: string; currency: string; balanceMinor: number; includeInNetWorth: boolean; status: string; version: number };
type FinanceTransaction = { id: number; accountId: number; amountMinor: number; currency: string; transactionDate: string; description: string; category: string; status: string; source: string; version: number };
type FinanceBudget = { id: number; month: string; category: string; currency: string; limitMinor: number; spentMinor: number; version: number };
type FinanceGoal = { id: number; name: string; goalType: string; currency: string; targetMinor: number; currentMinor: number; targetDate: string | null; status: string; version: number };
type FinanceSummary = {
  month: string;
  accounts: FinanceAccount[];
  balanceSummary: Array<{ currency: string; assetsMinor: number; liabilitiesMinor: number; netWorthMinor: number }>;
  cashFlow: Array<{ currency: string; incomeMinor: number; spendingMinor: number }>;
  budgets: FinanceBudget[];
  goals: FinanceGoal[];
  transactions: FinanceTransaction[];
  provider: { plaid: { available: boolean; connected: boolean } };
  disclosure: string;
};

const fieldClass = "bg-background/40 border-primary/20";
const selectClass = "h-10 rounded-md border border-primary/20 bg-background/40 px-3 text-sm text-foreground";
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const toMinor = (value: string) => Math.round(Number(value) * 100);
const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

export default function PersonalFinancePage() {
  usePageTitle("Personal Finance - LYFEOS");
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState({ name: "", accountType: "checking", currency: "USD", balance: "" });
  const [transaction, setTransaction] = useState({ accountId: "", amount: "", direction: "expense", transactionDate: today(), description: "", category: "" });
  const [budget, setBudget] = useState({ category: "", currency: "USD", limit: "" });
  const [goal, setGoal] = useState({ name: "", goalType: "savings", currency: "USD", target: "", current: "", targetDate: "" });
  const [balanceDrafts, setBalanceDrafts] = useState<Record<number, string>>({});
  const [goalDrafts, setGoalDrafts] = useState<Record<number, string>>({});
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);

  const summaryQuery = useQuery<FinanceSummary>({ queryKey: [`/api/finance/summary?month=${month}`] });
  const refresh = async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: [`/api/finance/summary?month=${month}`] });
  };
  const mutation = useMutation({
    mutationFn: ({ url, method, body }: { url: string; method: string; body: unknown }) => apiRequest(url, { method, body: JSON.stringify(body) }),
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message.replace(/^\d+:\s*/, "") : "The financial record could not be saved."),
  });
  const data = summaryQuery.data;
  const activeAccounts = useMemo(() => data?.accounts.filter((item) => item.status === "active") || [], [data]);

  const createAccount = (event: FormEvent) => {
    event.preventDefault(); setError(null);
    mutation.mutate({ url: "/api/finance/accounts", method: "POST", body: { name: account.name, accountType: account.accountType, currency: account.currency, balanceMinor: toMinor(account.balance || "0"), includeInNetWorth: true } }, { onSuccess: () => setAccount({ name: "", accountType: "checking", currency: account.currency, balance: "" }) });
  };
  const createTransaction = (event: FormEvent) => {
    event.preventDefault(); setError(null); const magnitude = Math.abs(toMinor(transaction.amount));
    const values = { amountMinor: transaction.direction === "expense" ? -magnitude : magnitude, transactionDate: transaction.transactionDate, description: transaction.description, category: transaction.category, status: "posted" };
    mutation.mutate(editingTransaction
      ? { url: `/api/finance/transactions/${editingTransaction.id}`, method: "PATCH", body: { ...values, expectedVersion: editingTransaction.version } }
      : { url: "/api/finance/transactions", method: "POST", body: { ...values, accountId: Number(transaction.accountId), clientMutationId: crypto.randomUUID() } },
    { onSuccess: () => { setEditingTransaction(null); setTransaction({ ...transaction, amount: "", description: "", category: "" }); } });
  };
  const saveBudget = (event: FormEvent) => {
    event.preventDefault(); setError(null);
    mutation.mutate({ url: "/api/finance/budgets", method: "PUT", body: { month, category: budget.category, currency: budget.currency, limitMinor: toMinor(budget.limit) } }, { onSuccess: () => setBudget({ ...budget, category: "", limit: "" }) });
  };
  const createGoal = (event: FormEvent) => {
    event.preventDefault(); setError(null);
    mutation.mutate({ url: "/api/finance/goals", method: "POST", body: { name: goal.name, goalType: goal.goalType, currency: goal.currency, targetMinor: toMinor(goal.target), currentMinor: toMinor(goal.current || "0"), targetDate: goal.targetDate || null } }, { onSuccess: () => setGoal({ ...goal, name: "", target: "", current: "", targetDate: "" }) });
  };
  const updateBalance = (item: FinanceAccount) => {
    const draft = balanceDrafts[item.id]; if (draft === undefined || !Number.isFinite(Number(draft))) return;
    mutation.mutate({ url: `/api/finance/accounts/${item.id}`, method: "PATCH", body: { expectedVersion: item.version, balanceMinor: toMinor(draft) } });
  };
  const editTransaction = (item: FinanceTransaction) => {
    setEditingTransaction(item);
    setTransaction({ accountId: String(item.accountId), amount: String(Math.abs(item.amountMinor) / 100), direction: item.amountMinor < 0 ? "expense" : "income", transactionDate: item.transactionDate, description: item.description, category: item.category });
  };
  const cancelTransactionEdit = () => {
    setEditingTransaction(null);
    setTransaction({ ...transaction, amount: "", description: "", category: "" });
  };
  const deleteTransaction = (item: FinanceTransaction) => {
    if (!window.confirm(`Delete ${item.description}? This removes the manual record.`)) return;
    mutation.mutate({ url: `/api/finance/transactions/${item.id}?expectedVersion=${item.version}`, method: "DELETE", body: {} });
  };
  const setAccountStatus = (item: FinanceAccount, status: "active" | "closed") => mutation.mutate({ url: `/api/finance/accounts/${item.id}`, method: "PATCH", body: { expectedVersion: item.version, status } });
  const deleteBudget = (item: FinanceBudget) => mutation.mutate({ url: `/api/finance/budgets/${item.id}`, method: "DELETE", body: {} });
  const updateGoal = (item: FinanceGoal, changes: { currentMinor?: number; status?: "active" | "completed" | "archived" }) => mutation.mutate({ url: `/api/finance/goals/${item.id}`, method: "PATCH", body: { expectedVersion: item.version, ...changes } });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-labelledby="finance-title">
      <Link href="/wealth" className="mb-6 inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/20 px-3 py-2 font-mono text-xs text-primary hover:bg-primary/30"><ArrowLeft className="h-4 w-4" />Back to Wealth Tokens</Link>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h1 id="finance-title" className="flex items-center gap-3 font-orbitron text-3xl text-primary"><Landmark className="h-8 w-8" />Personal Finance</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Private balances, cash flow, budgets, and goals. This is separate from Wealth Tokens and is not financial advice.</p></div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Month<Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={`${fieldClass} w-40`} /></label>
      </div>
      {error && <div role="alert" className="mb-5 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {summaryQuery.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : summaryQuery.isError || !data ? <div className="rounded-xl border border-destructive/40 p-6"><p>Personal finance could not load.</p><Button className="mt-4" onClick={() => summaryQuery.refetch()}><RefreshCcw className="mr-2 h-4 w-4" />Retry</Button></div> : <>
        <section aria-labelledby="balances-heading" className="mb-6 grid gap-4 md:grid-cols-3">
          {data.balanceSummary.length ? data.balanceSummary.map((item) => <div key={item.currency} className="glassmorphic rounded-xl border border-primary/25 p-5"><p className="font-mono text-xs text-muted-foreground">{item.currency} NET WORTH</p><p className="mt-2 text-2xl font-semibold text-primary">{money(item.netWorthMinor, item.currency)}</p><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Assets {money(item.assetsMinor, item.currency)}</span><span>Owed {money(item.liabilitiesMinor, item.currency)}</span></div></div>) : <div className="glassmorphic rounded-xl border border-primary/25 p-5 md:col-span-3"><h2 id="balances-heading" className="font-medium">Add your first account</h2><p className="mt-1 text-sm text-muted-foreground">Manual tracking works without connecting a bank.</p></div>}
          {data.cashFlow.map((item) => <div key={`flow-${item.currency}`} className="glassmorphic rounded-xl border border-primary/25 p-5"><p className="font-mono text-xs text-muted-foreground">{month} CASH FLOW · {item.currency}</p><div className="mt-3 flex justify-between text-sm"><span>Income {money(item.incomeMinor, item.currency)}</span><span>Spent {money(item.spendingMinor, item.currency)}</span></div></div>)}
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="glassmorphic rounded-xl border border-primary/25 p-5"><h2 className="mb-4 flex items-center gap-2 font-orbitron text-lg text-primary"><WalletCards className="h-5 w-5" />Accounts</h2><form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-2"><Input required aria-label="Account name" placeholder="Account name" value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} className={fieldClass} /><select aria-label="Account type" value={account.accountType} onChange={(event) => setAccount({ ...account, accountType: event.target.value })} className={selectClass}>{["checking","savings","cash","investment","property","credit","loan","other_asset","other_liability"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select><Input required inputMode="decimal" aria-label="Current balance or amount owed" placeholder="Current balance / amount owed" value={account.balance} onChange={(event) => setAccount({ ...account, balance: event.target.value })} className={fieldClass} /><Input required maxLength={3} aria-label="Currency" value={account.currency} onChange={(event) => setAccount({ ...account, currency: event.target.value.toUpperCase() })} className={fieldClass} /><Button disabled={mutation.isPending} className="sm:col-span-2"><Plus className="mr-2 h-4 w-4" />Add account</Button></form><div className="mt-5 space-y-3">{data.accounts.map((item) => <div key={item.id} className="rounded-lg border border-muted/20 bg-background/30 p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.accountType.replace("_", " ")} · {item.status} · v{item.version}</p></div><strong className="text-primary">{money(item.balanceMinor, item.currency)}</strong></div><div className="mt-3 flex flex-wrap gap-2">{item.status === "active" && <><Input inputMode="decimal" aria-label={`New balance for ${item.name}`} placeholder="Updated balance" value={balanceDrafts[item.id] ?? ""} onChange={(event) => setBalanceDrafts({ ...balanceDrafts, [item.id]: event.target.value })} className={`${fieldClass} h-9 min-w-32 flex-1`} /><Button type="button" variant="outline" size="sm" onClick={() => updateBalance(item)}>Update</Button></>}<Button type="button" variant="ghost" size="sm" onClick={() => setAccountStatus(item, item.status === "active" ? "closed" : "active")}>{item.status === "active" ? <><Archive className="mr-2 h-4 w-4" />Close</> : <><RotateCcw className="mr-2 h-4 w-4" />Reopen</>}</Button></div></div>)}</div></div>

          <div className="glassmorphic rounded-xl border border-primary/25 p-5"><h2 className="mb-4 font-orbitron text-lg text-primary">Cash flow</h2>{editingTransaction && <div className="mb-3 flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 p-2 text-xs"><span>Correcting {editingTransaction.description}</span><Button type="button" variant="ghost" size="sm" onClick={cancelTransactionEdit}><X className="mr-1 h-4 w-4" />Cancel</Button></div>}<form onSubmit={createTransaction} className="grid gap-3 sm:grid-cols-2"><select required disabled={Boolean(editingTransaction)} aria-label="Transaction account" value={transaction.accountId} onChange={(event) => setTransaction({ ...transaction, accountId: event.target.value })} className={selectClass}><option value="">Choose account</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currency})</option>)}</select><select aria-label="Income or expense" value={transaction.direction} onChange={(event) => setTransaction({ ...transaction, direction: event.target.value })} className={selectClass}><option value="expense">Expense</option><option value="income">Income</option></select><Input required inputMode="decimal" aria-label="Transaction amount" placeholder="Amount" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} className={fieldClass} /><Input required type="date" aria-label="Transaction date" value={transaction.transactionDate} onChange={(event) => setTransaction({ ...transaction, transactionDate: event.target.value })} className={fieldClass} /><Input required aria-label="Description" placeholder="Description" value={transaction.description} onChange={(event) => setTransaction({ ...transaction, description: event.target.value })} className={fieldClass} /><Input required aria-label="Category" placeholder="Category" value={transaction.category} onChange={(event) => setTransaction({ ...transaction, category: event.target.value })} className={fieldClass} /><Button disabled={mutation.isPending || (!editingTransaction && !activeAccounts.length)} className="sm:col-span-2">{editingTransaction ? <><Check className="mr-2 h-4 w-4" />Save correction</> : <><Plus className="mr-2 h-4 w-4" />Add transaction</>}</Button></form><div className="mt-5 max-h-80 space-y-2 overflow-auto">{data.transactions.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-muted/20 bg-background/30 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.transactionDate} · {item.category}</p></div><div className="flex items-center gap-1"><strong className={item.amountMinor < 0 ? "mr-1 text-foreground" : "mr-1 text-primary"}>{money(item.amountMinor, item.currency)}</strong>{item.source === "manual" && <><Button type="button" variant="ghost" size="icon" aria-label={`Correct ${item.description}`} onClick={() => editTransaction(item)}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${item.description}`} onClick={() => deleteTransaction(item)}><Trash2 className="h-4 w-4" /></Button></>}</div></div>)}</div></div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="glassmorphic rounded-xl border border-primary/25 p-5"><h2 className="mb-4 font-orbitron text-lg text-primary">Monthly budgets</h2><form onSubmit={saveBudget} className="grid gap-3 sm:grid-cols-3"><Input required aria-label="Budget category" placeholder="Category" value={budget.category} onChange={(event) => setBudget({ ...budget, category: event.target.value })} className={fieldClass} /><Input required inputMode="decimal" aria-label="Budget limit" placeholder="Limit" value={budget.limit} onChange={(event) => setBudget({ ...budget, limit: event.target.value })} className={fieldClass} /><Input required maxLength={3} aria-label="Budget currency" value={budget.currency} onChange={(event) => setBudget({ ...budget, currency: event.target.value.toUpperCase() })} className={fieldClass} /><Button disabled={mutation.isPending} className="sm:col-span-3">Save budget</Button></form><div className="mt-5 space-y-3">{data.budgets.map((item) => { const pct = Math.min(100, Math.round(item.spentMinor / item.limitMinor * 100)); return <div key={item.id}><div className="flex items-center justify-between gap-2 text-sm"><span>{item.category}</span><div className="flex items-center"><span>{money(item.spentMinor, item.currency)} / {money(item.limitMinor, item.currency)}</span><Button type="button" variant="ghost" size="icon" aria-label={`Delete ${item.category} budget`} onClick={() => deleteBudget(item)}><Trash2 className="h-4 w-4" /></Button></div></div><div className="mt-1 h-2 overflow-hidden rounded bg-muted/20"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div></div>; })}</div></div>

          <div className="glassmorphic rounded-xl border border-primary/25 p-5"><h2 className="mb-4 flex items-center gap-2 font-orbitron text-lg text-primary"><Target className="h-5 w-5" />Financial goals</h2><form onSubmit={createGoal} className="grid gap-3 sm:grid-cols-2"><Input required aria-label="Goal name" placeholder="Goal name" value={goal.name} onChange={(event) => setGoal({ ...goal, name: event.target.value })} className={fieldClass} /><select aria-label="Goal type" value={goal.goalType} onChange={(event) => setGoal({ ...goal, goalType: event.target.value })} className={selectClass}>{["savings","emergency_fund","debt_paydown","net_worth","other"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select><Input required inputMode="decimal" aria-label="Goal target" placeholder="Target" value={goal.target} onChange={(event) => setGoal({ ...goal, target: event.target.value })} className={fieldClass} /><Input inputMode="decimal" aria-label="Goal current progress" placeholder="Current progress" value={goal.current} onChange={(event) => setGoal({ ...goal, current: event.target.value })} className={fieldClass} /><Input type="date" aria-label="Goal target date" value={goal.targetDate} onChange={(event) => setGoal({ ...goal, targetDate: event.target.value })} className={fieldClass} /><Input required maxLength={3} aria-label="Goal currency" value={goal.currency} onChange={(event) => setGoal({ ...goal, currency: event.target.value.toUpperCase() })} className={fieldClass} /><Button disabled={mutation.isPending} className="sm:col-span-2"><Plus className="mr-2 h-4 w-4" />Add goal</Button></form><div className="mt-5 space-y-3">{data.goals.filter((item) => item.status !== "archived").map((item) => { const pct = Math.min(100, Math.round(item.currentMinor / item.targetMinor * 100)); return <div key={item.id} className="rounded-lg border border-muted/20 p-3"><div className="flex justify-between"><span>{item.name}</span><span className="font-mono text-xs text-primary">{item.status === "completed" ? "complete" : `${pct}%`}</span></div><p className="mt-1 text-xs text-muted-foreground">{money(item.currentMinor, item.currency)} of {money(item.targetMinor, item.currency)}{item.targetDate ? ` · ${item.targetDate}` : ""}</p><div className="mt-3 flex flex-wrap gap-2">{item.status === "active" && <><Input inputMode="decimal" aria-label={`Progress for ${item.name}`} placeholder="Current progress" value={goalDrafts[item.id] ?? ""} onChange={(event) => setGoalDrafts({ ...goalDrafts, [item.id]: event.target.value })} className={`${fieldClass} h-9 min-w-28 flex-1`} /><Button type="button" variant="outline" size="sm" onClick={() => updateGoal(item, { currentMinor: toMinor(goalDrafts[item.id] ?? String(item.currentMinor / 100)) })}>Update</Button><Button type="button" variant="ghost" size="sm" onClick={() => updateGoal(item, { currentMinor: item.targetMinor, status: "completed" })}><Check className="mr-2 h-4 w-4" />Complete</Button></>}<Button type="button" variant="ghost" size="sm" onClick={() => updateGoal(item, { status: item.status === "completed" ? "active" : "archived" })}>{item.status === "completed" ? <><RotateCcw className="mr-2 h-4 w-4" />Reopen</> : <><Archive className="mr-2 h-4 w-4" />Archive</>}</Button></div></div>; })}</div></div>
        </section>
        <p className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">{data.disclosure} Bank connection is not yet active; manual tracking remains fully usable.</p>
      </>}
    </div>
  );
}
