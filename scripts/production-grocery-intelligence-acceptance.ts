import { randomUUID } from "node:crypto";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { email: string; displayName: string; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const PASSWORD = "TestPass123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
  };
}

async function registerDisposableAccount(account: Account): Promise<void> {
  const registered = await request("POST", "/api/auth/complete-registration", {
    email: account.email,
    password: PASSWORD,
    displayName: account.displayName,
    termsAccepted: true,
  });
  assert(registered.status === 201 && registered.cookie, `Registration returned ${registered.status}.`);
  account.cookie = registered.cookie;
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
  assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return false;
  const erased = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie);
  return erased.status === 200;
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production grocery acceptance may target only https://lyfeos.net.");
  const stamp = randomUUID().replace(/-/g, "");
  const account: Account = { email: `grocery_acceptance_${stamp}@example.com`, displayName: `groceryacceptance_${stamp.slice(0, 16)}`, cookie: "" };
  let erased = false;
  try {
    await registerDisposableAccount(account);
    const status = await request("GET", "/api/brand-ownership/status", undefined, account.cookie);
    assert(status.status === 200 && status.body.available === true, `Brand ownership status returned ${status.status}.`);

    const cited = await request("POST", "/api/brand-ownership/lookup", { brand: "Burt's Bees" }, account.cookie);
    assert(cited.status === 200 && cited.body.matched === true && cited.body.profile?.status === "corporate_owned" && Array.isArray(cited.body.profile?.evidence) && cited.body.profile.evidence.length >= 2, "Cited brand ownership evidence was not returned.");
    const unknown = await request("POST", "/api/brand-ownership/lookup", { brand: "Acceptance Unknown Brand" }, account.cookie);
    assert(unknown.status === 200 && unknown.body.matched === false && unknown.body.profile === null, "Unknown ownership did not fail closed.");

    const pantry = await request("POST", "/api/grocery-intelligence/pantry", { name: "Acceptance pantry balm", brand: "Burt's Bees", quantity: 1, unit: "item", reorderAt: 0, source: "manual" }, account.cookie);
    assert(pantry.status === 201 && Number.isInteger(pantry.body.item?.id), `Pantry creation returned ${pantry.status}.`);
    const depleted = await request("POST", `/api/grocery-intelligence/pantry/${pantry.body.item.id}/use`, { quantity: 1 }, account.cookie);
    assert(depleted.status === 200 && depleted.body.item?.quantity === 0 && depleted.body.automaticallyAdded?.status === "pending", "Pantry depletion did not create exactly one pending shopping item.");

    const receipt = await request("POST", "/api/grocery-intelligence/receipt-drafts", { sourceText: "OAT MILK 4.99\n2 X ORGANIC OATS 7.98\nSUBTOTAL 12.97\nTAX 1.00\nTOTAL 13.97" }, account.cookie);
    const parsedItems = receipt.body.draft?.parsedItems;
    assert(receipt.status === 201 && Array.isArray(parsedItems) && parsedItems.length === 2 && parsedItems.every((item: any) => !/total|tax|subtotal/i.test(item.name)), "Receipt parsing retained payment totals or omitted reviewed product rows.");

    const recalls = await request("POST", "/api/grocery-intelligence/pantry-recall-review", {}, account.cookie);
    assert(recalls.status === 200 && Array.isArray(recalls.body.reviews) && recalls.body.reviews.length === 1 && typeof recalls.body.disclosure === "string" && recalls.body.disclosure.includes("not stored"), `Live FDA recall review returned ${recalls.status}.`);

    const overview = await request("GET", "/api/grocery-intelligence/overview", undefined, account.cookie);
    assert(overview.status === 200 && overview.body.pantry?.length === 1 && overview.body.shopping?.length === 1 && overview.body.impact?.matchedItems === 1 && overview.body.impact?.corporateOwnedItems === 1, "Grocery overview did not reconcile cited ownership with the private pantry and automatic shopping item.");
    console.log(JSON.stringify({ contract: "lyfeos.production-grocery-intelligence.v1", passed: true, ownershipEvidence: cited.body.profile.evidence.length, pantryItems: overview.body.pantry.length, shoppingItems: overview.body.shopping.length, recallItemsReviewed: recalls.body.reviews.length }));
  } finally {
    erased = await eraseAccount(account);
    console.error(`disposable account erased=${erased}`);
  }
  assert(erased, "Grocery intelligence acceptance account was not erased.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
