import { and, asc, eq } from "drizzle-orm";
import { groceryPantryItems, groceryRecallAlerts, groceryRecallMonitoringPreferences } from "@shared/schema";
import { db } from "./db";
import { FoodRecallError, lookupFoodRecalls } from "./food-recalls";
import { log } from "./vite";

const minimumCheckIntervalMs = 24 * 60 * 60 * 1_000;
const defaultItemLimit = 25;
const defaultPerUserItemLimit = 5;
const schedulerIntervalMs = 6 * 60 * 60 * 1_000;
let groceryRecallMonitorInterval: ReturnType<typeof setInterval> | null = null;

type MonitorInput = {
  userId?: number;
  now?: Date;
  itemLimit?: number;
  lookup?: typeof lookupFoodRecalls;
};

export function groceryRecallCheckIsDue(lastCheckedAt: Date | null, now: Date, intervalMs = minimumCheckIntervalMs): boolean {
  return !lastCheckedAt || now.getTime() - lastCheckedAt.getTime() >= intervalMs;
}

export async function runGroceryRecallMonitor(input: MonitorInput = {}) {
  const now = input.now || new Date();
  const itemLimit = Math.max(1, Math.min(input.itemLimit || defaultItemLimit, 100));
  const lookup = input.lookup || lookupFoodRecalls;
  const preferences = await db.select().from(groceryRecallMonitoringPreferences)
    .where(and(eq(groceryRecallMonitoringPreferences.enabled, true), input.userId ? eq(groceryRecallMonitoringPreferences.userId, input.userId) : undefined))
    .orderBy(asc(groceryRecallMonitoringPreferences.lastCheckedAt), asc(groceryRecallMonitoringPreferences.updatedAt));

  let reviewedItems = 0;
  let newAlerts = 0;
  let providerFailures = 0;
  for (const preference of preferences) {
    if (reviewedItems >= itemLimit) break;
    let reviewedForUser = 0;
    let failuresForUser = 0;
    const items = await db.select().from(groceryPantryItems)
      .where(and(eq(groceryPantryItems.userId, preference.userId), eq(groceryPantryItems.status, "active")))
      .orderBy(asc(groceryPantryItems.lastRecallCheckedAt), asc(groceryPantryItems.id))
      .limit(Math.min(itemLimit - reviewedItems, input.userId ? itemLimit : defaultPerUserItemLimit));

    for (const item of items) {
      if (!groceryRecallCheckIsDue(item.lastRecallCheckedAt, now)) continue;
      try {
        const result = await lookup({ productName: item.name, brand: item.brand, packageCode: item.barcode });
        for (const match of result.matches) {
          const [existing] = await db.select({ id: groceryRecallAlerts.id }).from(groceryRecallAlerts)
            .where(and(eq(groceryRecallAlerts.pantryItemId, item.id), eq(groceryRecallAlerts.recallNumber, match.recallNumber))).limit(1);
          if (!existing) newAlerts += 1;
          await db.insert(groceryRecallAlerts).values({
            userId: preference.userId,
            pantryItemId: item.id,
            recallNumber: match.recallNumber,
            productDescription: match.productDescription,
            classification: match.classification,
            reasonForRecall: match.reasonForRecall,
            codeInfo: match.codeInfo,
            sourceUrl: match.sourceUrl,
            status: "open",
            detectedAt: now,
            lastSeenAt: now,
          }).onConflictDoUpdate({
            target: [groceryRecallAlerts.pantryItemId, groceryRecallAlerts.recallNumber],
            set: { lastSeenAt: now },
          });
        }
        await db.update(groceryPantryItems).set({ lastRecallCheckedAt: now, updatedAt: now }).where(eq(groceryPantryItems.id, item.id));
        reviewedItems += 1;
        reviewedForUser += 1;
      } catch (error) {
        // Do not advance the check cursor on failure. A later bounded run may
        // retry, but neither an outage nor an empty result becomes a safety
        // finding.
        providerFailures += 1;
        failuresForUser += 1;
        if (!(error instanceof FoodRecallError)) throw error;
      }
    }
    // Rotate through opted-in accounts fairly. A failed provider attempt also
    // advances this user in the queue; the individual pantry cursor remains
    // untouched and will still be retried later.
    if (reviewedForUser || failuresForUser) await db.update(groceryRecallMonitoringPreferences).set({ lastCheckedAt: now }).where(eq(groceryRecallMonitoringPreferences.id, preference.id));
  }
  return { reviewedItems, newAlerts, providerFailures, ranAt: now.toISOString() };
}

export function startGroceryRecallMonitor(): void {
  if (groceryRecallMonitorInterval) return;
  const run = () => void runGroceryRecallMonitor().then((receipt) => {
    if (receipt.reviewedItems || receipt.providerFailures) log(`grocery recall monitor: reviewed ${receipt.reviewedItems}, new alerts ${receipt.newAlerts}, provider failures ${receipt.providerFailures}`);
  }).catch((error) => log(`grocery recall monitor failed: ${error instanceof Error ? error.message : "unknown error"}`));
  // Delay the first run so a new deployment has completed initialization.
  setTimeout(run, 60_000);
  groceryRecallMonitorInterval = setInterval(run, schedulerIntervalMs);
}

export function stopGroceryRecallMonitor(): void {
  if (!groceryRecallMonitorInterval) return;
  clearInterval(groceryRecallMonitorInterval);
  groceryRecallMonitorInterval = null;
}
