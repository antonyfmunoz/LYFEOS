import { randomUUID } from "node:crypto";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { email: string; displayName: string; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || "";
const PASSWORD = "TestPass123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

async function registerDisposableAccount(account: Account): Promise<void> {
  const registered = await request("POST", "/api/auth/complete-registration", {
    email: account.email, password: PASSWORD, displayName: account.displayName, termsAccepted: true,
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
  assert(BASE_URL.origin === "https://lyfeos.net", "Production ingredient-scanner acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE) && /^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Ingredient-scanner acceptance requires exact source and harness revisions.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Ingredient-scanner runtime does not match the requested immutable source.");

  const stamp = randomUUID().replace(/-/g, "");
  const account: Account = { email: `ingredient_scanner_${stamp}@example.com`, displayName: `ingredientscanner_${stamp.slice(0, 16)}`, cookie: "" };
  let erased = false;
  try {
    await registerDisposableAccount(account);
    const preference = await request("POST", "/api/ingredient-preferences", {
      displayName: "Red No. 40", preferenceType: "avoid", note: "Private acceptance preference",
    }, account.cookie);
    assert(preference.status === 201 && Number.isInteger(preference.body?.preference?.id), `Ingredient preference returned ${preference.status}.`);

    const barcode = `ACPT-${stamp.slice(0, 12)}`;
    const created = await request("POST", "/api/ingredient-scans", {
      captureMethod: "manual_label", productName: "Acceptance ingredient label", barcode,
      rawIngredientsText: "Ingredients: water, Red No. 40, sucralose",
    }, account.cookie);
    const scanId = Number(created.body?.scan?.id);
    assert(created.status === 201 && Number.isInteger(scanId) && Array.isArray(created.body?.scan?.items), `Ingredient review returned ${created.status}.`);
    assert(created.body.scan.items.some((item: any) => item.classification === "declared_color_additive") && created.body.scan.items.some((item: any) => item.classification === "declared_non_nutritive_sweetener"), "Ingredient review did not preserve conservative evidence-linked identities.");

    const listed = await request("GET", "/api/ingredient-scans", undefined, account.cookie);
    const listedScan = listed.body?.scans?.find((scan: any) => Number(scan.id) === scanId);
    assert(listed.status === 200 && listedScan?.items?.some((item: any) => item.preference?.preferenceType === "avoid" && item.preference?.displayName === "Red No. 40"), "Private preference was not attached only to its matching ingredient label term.");

    const corrected = await request("PATCH", `/api/ingredient-scans/${scanId}`, {
      captureMethod: "manual_label", productName: "Acceptance ingredient label", barcode,
      rawIngredientsText: "Ingredients: water, Red No. 40, sea salt",
    }, account.cookie, { "x-lyfeos-expected-revision": "1" });
    assert(corrected.status === 200 && corrected.body?.scan?.revision === 2 && corrected.body?.scan?.items?.some((item: any) => item.rawName === "sea salt"), "Ingredient correction did not retain its expected revision and reviewed replacement label.");

    const refreshed = await request("POST", `/api/ingredient-scans/${scanId}/evidence-review`, undefined, account.cookie, { "x-lyfeos-expected-revision": "2" });
    assert(refreshed.status === 200 && refreshed.body?.scan?.revision === 3 && refreshed.body?.refreshedItems === 3, "Evidence refresh did not advance only the reviewed scanner revision.");

    const privateLookup = await request("GET", `/api/ingredient-scans/lookup?barcode=${encodeURIComponent(barcode)}`, undefined, account.cookie);
    assert(privateLookup.status === 200 && privateLookup.body?.source === "your_private_history" && Number(privateLookup.body?.scan?.id) === scanId, "Scanner barcode lookup did not stay scoped to private saved-label history.");

    const deleted = await request("DELETE", `/api/ingredient-scans/${scanId}`, undefined, account.cookie, { "x-lyfeos-expected-revision": "3" });
    const afterDelete = await request("GET", "/api/ingredient-scans", undefined, account.cookie);
    assert(deleted.status === 204 && afterDelete.status === 200 && !afterDelete.body?.scans?.some((scan: any) => Number(scan.id) === scanId), "Ingredient review deletion did not remove the owner-scoped scan.");
    const preferenceDeleted = await request("DELETE", `/api/ingredient-preferences/${preference.body.preference.id}`, undefined, account.cookie);
    assert(preferenceDeleted.status === 204, "Ingredient preference deletion failed.");
    console.log(JSON.stringify({ contract: "lyfeos.production-ingredient-scanner.v1", passed: true, evidenceLinkedItems: created.body.scan.items.length, privatePreferenceMatched: true, correctionRevision: corrected.body.scan.revision, refreshedRevision: refreshed.body.scan.revision }));
  } finally {
    erased = await eraseAccount(account);
    console.error(`disposable account erased=${erased}`);
  }
  assert(erased, "Ingredient-scanner acceptance account was not erased.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
