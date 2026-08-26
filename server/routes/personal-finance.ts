import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { financeAccounts, financeBalanceSnapshots, financeBudgets, financeGoals, financeTransactions } from "@shared/schema";
import { db } from "../db";
import { summarizeAccountBalances, utcMonthBounds } from "../personal-finance";
import { isAuthenticated } from "./middleware";

const idSchema = z.coerce.number().int().positive();
const moneySchema = z.number().int().safe();
const positiveMoneySchema = moneySchema.positive();
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase()).refine((value) => /^[A-Z]{3}$/.test(value));
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const accountTypeSchema = z.enum(["cash", "checking", "savings", "investment", "property", "credit", "loan", "other_asset", "other_liability"]);
const transactionStatusSchema = z.enum(["pending", "posted"]);
const goalTypeSchema = z.enum(["savings", "emergency_fund", "debt_paydown", "net_worth", "other"]);
const categorySchema = z.string().trim().min(1).max(80).transform((value) => value.toLocaleLowerCase("en-US"));

const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  accountType: accountTypeSchema,
  currency: currencySchema,
  balanceMinor: moneySchema,
  includeInNetWorth: z.boolean().default(true),
});
const accountUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  balanceMinor: moneySchema.optional(),
  includeInNetWorth: z.boolean().optional(),
  status: z.enum(["active", "closed"]).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Provide an account change.");
const transactionCreateSchema = z.object({
  accountId: z.number().int().positive(),
  amountMinor: moneySchema.refine((value) => value !== 0),
  transactionDate: localDateSchema,
  description: z.string().trim().min(1).max(240),
  category: categorySchema,
  status: transactionStatusSchema.default("posted"),
  clientMutationId: z.string().trim().uuid().optional(),
});
const transactionUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amountMinor: moneySchema.refine((value) => value !== 0).optional(),
  transactionDate: localDateSchema.optional(),
  description: z.string().trim().min(1).max(240).optional(),
  category: categorySchema.optional(),
  status: transactionStatusSchema.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Provide a transaction change.");
const budgetSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), category: categorySchema, currency: currencySchema, limitMinor: positiveMoneySchema });
const goalCreateSchema = z.object({ name: z.string().trim().min(1).max(120), goalType: goalTypeSchema, currency: currencySchema, targetMinor: positiveMoneySchema, currentMinor: moneySchema.nonnegative().default(0), targetDate: localDateSchema.nullable().optional() });
const goalUpdateSchema = z.object({ expectedVersion: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), targetMinor: positiveMoneySchema.optional(), currentMinor: moneySchema.nonnegative().optional(), targetDate: localDateSchema.nullable().optional(), status: z.enum(["active", "completed", "archived"]).optional() }).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Provide a goal change.");

function privateNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
}

export function registerPersonalFinanceRoutes(app: Express): void {
  app.get("/api/finance/summary", isAuthenticated, async (req: Request, res: Response) => {
    privateNoStore(res);
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
    let bounds: { start: string; end: string };
    try { bounds = utcMonthBounds(requestedMonth); } catch { return res.status(400).json({ error: "Month must use YYYY-MM." }); }
    const userId = req.session.userId!;
    const [accounts, transactions, budgets, goals, snapshots] = await Promise.all([
      db.select().from(financeAccounts).where(eq(financeAccounts.userId, userId)).orderBy(asc(financeAccounts.name)),
      db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), gte(financeTransactions.transactionDate, bounds.start), lt(financeTransactions.transactionDate, bounds.end))).orderBy(desc(financeTransactions.transactionDate), desc(financeTransactions.id)).limit(500),
      db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.month, bounds.start))).orderBy(asc(financeBudgets.currency), asc(financeBudgets.category)),
      db.select().from(financeGoals).where(eq(financeGoals.userId, userId)).orderBy(asc(financeGoals.status), asc(financeGoals.targetDate), asc(financeGoals.id)),
      db.select().from(financeBalanceSnapshots).where(and(eq(financeBalanceSnapshots.userId, userId), gte(financeBalanceSnapshots.observedAt, new Date(`${bounds.start}T00:00:00Z`)), lt(financeBalanceSnapshots.observedAt, new Date(`${bounds.end}T00:00:00Z`)))).orderBy(asc(financeBalanceSnapshots.observedAt), asc(financeBalanceSnapshots.id)).limit(1000),
    ]);
    const cashFlow = new Map<string, { currency: string; incomeMinor: number; spendingMinor: number }>();
    const spentByCategory = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.status !== "posted") continue;
      const total = cashFlow.get(transaction.currency) || { currency: transaction.currency, incomeMinor: 0, spendingMinor: 0 };
      if (transaction.amountMinor > 0) total.incomeMinor += transaction.amountMinor;
      else {
        total.spendingMinor += Math.abs(transaction.amountMinor);
        const key = `${transaction.currency}:${transaction.category.toLowerCase()}`;
        spentByCategory.set(key, (spentByCategory.get(key) || 0) + Math.abs(transaction.amountMinor));
      }
      cashFlow.set(transaction.currency, total);
    }
    return res.json({
      contract: "lyfeos.personal-finance.v1",
      month: requestedMonth,
      accounts,
      balanceSummary: summarizeAccountBalances(accounts),
      cashFlow: Array.from(cashFlow.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
      budgets: budgets.map((budget) => ({ ...budget, spentMinor: spentByCategory.get(`${budget.currency}:${budget.category.toLowerCase()}`) || 0 })),
      goals,
      transactions,
      balanceSnapshots: snapshots,
      provider: { plaid: { available: false, connected: false } },
      disclosure: "Balances and transactions are private owner records. Liability balances are amounts owed. Currency totals stay separate because LyfeOS has no exchange-rate authority. Wealth Tokens are not financial balances, advice, or performance.",
    });
  });

  app.post("/api/finance/accounts", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = accountCreateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid financial account.", details: parsed.error.flatten() });
    const userId = req.session.userId!; const now = new Date();
    const account = await db.transaction(async (tx) => {
      const [created] = await tx.insert(financeAccounts).values({ userId, ...parsed.data, source: "manual", balanceUpdatedAt: now, createdAt: now, updatedAt: now }).returning();
      await tx.insert(financeBalanceSnapshots).values({ userId, accountId: created.id, balanceMinor: created.balanceMinor, currency: created.currency, source: "manual", observedAt: now });
      return created;
    });
    return res.status(201).json(account);
  });

  app.patch("/api/finance/accounts/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idSchema.safeParse(req.params.id); const parsed = accountUpdateSchema.safeParse(req.body); if (!id.success || !parsed.success) return res.status(400).json({ error: "Invalid financial account update." });
    const userId = req.session.userId!; const { expectedVersion, ...changes } = parsed.data; const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(financeAccounts).where(and(eq(financeAccounts.id, id.data), eq(financeAccounts.userId, userId))).limit(1);
      if (!current) return { kind: "missing" as const }; if (current.version !== expectedVersion) return { kind: "conflict" as const, current };
      const [updated] = await tx.update(financeAccounts).set({ ...changes, balanceUpdatedAt: changes.balanceMinor === undefined ? current.balanceUpdatedAt : now, version: current.version + 1, updatedAt: now }).where(and(eq(financeAccounts.id, current.id), eq(financeAccounts.userId, userId), eq(financeAccounts.version, expectedVersion))).returning();
      if (!updated) return { kind: "conflict" as const, current };
      if (changes.balanceMinor !== undefined && changes.balanceMinor !== current.balanceMinor) await tx.insert(financeBalanceSnapshots).values({ userId, accountId: updated.id, balanceMinor: updated.balanceMinor, currency: updated.currency, source: "manual", observedAt: now });
      return { kind: "updated" as const, account: updated };
    });
    if (result.kind === "missing") return res.status(404).json({ error: "Financial account not found." }); if (result.kind === "conflict") return res.status(409).json({ error: "The account changed before this update.", current: result.current }); return res.json(result.account);
  });

  app.post("/api/finance/transactions", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = transactionCreateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid transaction.", details: parsed.error.flatten() });
    const userId = req.session.userId!; const [account] = await db.select().from(financeAccounts).where(and(eq(financeAccounts.id, parsed.data.accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.status, "active"))).limit(1); if (!account) return res.status(404).json({ error: "Active financial account not found." });
    if (parsed.data.clientMutationId) {
      const [created] = await db.insert(financeTransactions).values({ userId, ...parsed.data, currency: account.currency, source: "manual" }).onConflictDoNothing().returning();
      if (created) return res.status(201).json(created);
      const [existing] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.clientMutationId, parsed.data.clientMutationId))).limit(1);
      if (!existing) return res.status(409).json({ error: "The transaction could not be reconciled. Refresh before retrying." });
      const same = existing.accountId === parsed.data.accountId && existing.amountMinor === parsed.data.amountMinor && existing.transactionDate === parsed.data.transactionDate && existing.description === parsed.data.description && existing.category === parsed.data.category && existing.status === parsed.data.status;
      if (!same) return res.status(409).json({ error: "That mutation identity was already used for different transaction data." }); return res.status(200).json(existing);
    }
    const [transaction] = await db.insert(financeTransactions).values({ userId, ...parsed.data, currency: account.currency, source: "manual" }).returning(); return res.status(201).json(transaction);
  });

  app.patch("/api/finance/transactions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idSchema.safeParse(req.params.id); const parsed = transactionUpdateSchema.safeParse(req.body); if (!id.success || !parsed.success) return res.status(400).json({ error: "Invalid transaction update." });
    const { expectedVersion, ...changes } = parsed.data; const userId = req.session.userId!;
    const [updated] = await db.update(financeTransactions).set({ ...changes, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(financeTransactions.id, id.data), eq(financeTransactions.userId, userId), eq(financeTransactions.version, expectedVersion), eq(financeTransactions.source, "manual"))).returning();
    if (updated) return res.json(updated); const [current] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.id, id.data), eq(financeTransactions.userId, userId))).limit(1); if (!current) return res.status(404).json({ error: "Transaction not found." }); return res.status(409).json({ error: current.source === "manual" ? "The transaction changed before this update." : "Provider transactions cannot be edited locally.", current });
  });

  app.delete("/api/finance/transactions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idSchema.safeParse(req.params.id); const expectedVersion = z.coerce.number().int().positive().safeParse(req.query.expectedVersion); if (!id.success || !expectedVersion.success) return res.status(400).json({ error: "A valid expectedVersion is required." });
    const [deleted] = await db.delete(financeTransactions).where(and(eq(financeTransactions.id, id.data), eq(financeTransactions.userId, req.session.userId!), eq(financeTransactions.version, expectedVersion.data), eq(financeTransactions.source, "manual"))).returning({ id: financeTransactions.id }); if (deleted) return res.json({ deleted: true, id: deleted.id });
    const [current] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.id, id.data), eq(financeTransactions.userId, req.session.userId!))).limit(1); if (!current) return res.status(404).json({ error: "Transaction not found." }); return res.status(409).json({ error: current.source === "manual" ? "The transaction changed before deletion." : "Provider transactions must be removed through provider reconciliation." });
  });

  app.put("/api/finance/budgets", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = budgetSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid budget.", details: parsed.error.flatten() }); const userId = req.session.userId!; const month = `${parsed.data.month}-01`; const now = new Date();
    const [budget] = await db.insert(financeBudgets).values({ userId, ...parsed.data, month, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [financeBudgets.userId, financeBudgets.month, financeBudgets.category, financeBudgets.currency], set: { limitMinor: parsed.data.limitMinor, version: sql`${financeBudgets.version} + 1`, updatedAt: now } }).returning(); return res.json(budget);
  });

  app.delete("/api/finance/budgets/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idSchema.safeParse(req.params.id); if (!id.success) return res.status(400).json({ error: "Invalid budget." }); const [deleted] = await db.delete(financeBudgets).where(and(eq(financeBudgets.id, id.data), eq(financeBudgets.userId, req.session.userId!))).returning({ id: financeBudgets.id }); return deleted ? res.json({ deleted: true, id: deleted.id }) : res.status(404).json({ error: "Budget not found." });
  });

  app.post("/api/finance/goals", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = goalCreateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Invalid financial goal.", details: parsed.error.flatten() }); const [goal] = await db.insert(financeGoals).values({ userId: req.session.userId!, ...parsed.data }).returning(); return res.status(201).json(goal);
  });

  app.patch("/api/finance/goals/:id", isAuthenticated, async (req: Request, res: Response) => {
    const id = idSchema.safeParse(req.params.id); const parsed = goalUpdateSchema.safeParse(req.body); if (!id.success || !parsed.success) return res.status(400).json({ error: "Invalid financial goal update." }); const { expectedVersion, ...changes } = parsed.data; const [goal] = await db.update(financeGoals).set({ ...changes, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(financeGoals.id, id.data), eq(financeGoals.userId, req.session.userId!), eq(financeGoals.version, expectedVersion))).returning(); if (goal) return res.json(goal); const [current] = await db.select().from(financeGoals).where(and(eq(financeGoals.id, id.data), eq(financeGoals.userId, req.session.userId!))).limit(1); return current ? res.status(409).json({ error: "The goal changed before this update.", current }) : res.status(404).json({ error: "Financial goal not found." });
  });
}
