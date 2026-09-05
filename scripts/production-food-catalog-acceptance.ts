import { randomUUID } from "node:crypto";

type ApiResult = { status: number; body: any; cookie: string; retryAfterSeconds: number | null };
type Account = { email: string; displayName: string; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const SOURCE = process.env.LYFEOS_ACCEPTANCE_SOURCE || "";
const HARNESS_SOURCE = process.env.LYFEOS_ACCEPTANCE_HARNESS_SOURCE || process.env.GITHUB_SHA || "";
const PASSWORD = "TestPass123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[a-z0-9._%+-]+@example\.com/gi, "[redacted fixture]")
    .slice(0, 1_000);
}

async function request(method: string, pathname: string, body?: unknown, cookie = ""): Promise<ApiResult> {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    retryAfterSeconds: Number.isFinite(Number(response.headers.get("retry-after"))) ? Number(response.headers.get("retry-after")) : null,
  };
}

async function registerDisposableAccount(account: Account): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const registered = await request("POST", "/api/auth/complete-registration", {
      email: account.email,
      password: PASSWORD,
      displayName: account.displayName,
      termsAccepted: true,
    });
    if (registered.status === 201 && registered.cookie) {
      account.cookie = registered.cookie;
      const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, account.cookie);
      assert(onboarding.status === 200, `Onboarding setup returned ${onboarding.status}.`);
      return;
    }
    if (registered.status !== 429 || attempt === 2) throw new Error(`Registration returned ${registered.status}.`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(61, Math.max(1, registered.retryAfterSeconds || 60)) * 1_000 + 250));
  }
}

async function eraseAccount(account: Account): Promise<boolean> {
  if (!account.cookie) return false;
  const erased = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, account.cookie);
  return erased.status === 200;
}

function unknownBarcodeCandidates(): string[] {
  // A public catalog evolves; a fixed all-zero value became a real record in
  // the live provider. Generate a bounded set of valid-format values and
  // require the provider to explicitly say at least one is unknown.
  return Array.from({ length: 5 }, (_, index) => {
    const digits = randomUUID().replace(/-/g, "").split("").map((character) => String(parseInt(character, 16) % 10)).join("");
    // The configured live catalog's known item is EAN-13, so exercise its
    // supported checksum-valid format rather than an adapter-rejected length.
    const body = `9${digits.slice(0, 10)}${index}`;
    const weightedBodySum = body.split("").reverse().reduce((sum, digit, position) => sum + Number(digit) * (position % 2 === 0 ? 3 : 1), 0);
    return `${body}${(10 - (weightedBodySum % 10)) % 10}`;
  });
}

async function findExplicitUnknownBarcode(providerId: string, cookie: string): Promise<ApiResult> {
  for (const barcode of unknownBarcodeCandidates()) {
    const result = await request("GET", `/api/food-catalog/barcodes/${barcode}?providerId=${encodeURIComponent(providerId)}`, undefined, cookie);
    assert(result.status === 200, `Unknown-barcode lookup returned ${result.status}.`);
    if (result.body?.found === false && result.body?.item === null) return result;
  }
  throw new Error("Configured catalog did not return an explicit unknown for any generated valid-format barcode.");
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Production food-catalog acceptance may target only https://lyfeos.net.");
  assert(/^[0-9a-f]{40}$/.test(SOURCE), "Food-catalog acceptance requires the exact deployed source revision.");
  assert(/^[0-9a-f]{40}$/.test(HARNESS_SOURCE), "Food-catalog acceptance requires the exact harness source revision.");
  const release = await request("GET", "/api/release");
  assert(release.status === 200 && release.body?.sourceRevision === SOURCE, "Food-catalog runtime does not match the requested immutable source.");

  const stamp = randomUUID().replace(/-/g, "");
  const account: Account = { email: `catalog_acceptance_${stamp}@example.com`, displayName: `catalogacceptance_${stamp.slice(0, 16)}`, cookie: "" };
  let erased = false;
  try {
    await registerDisposableAccount(account);
    const status = await request("GET", "/api/food-catalog/status", undefined, account.cookie);
    assert(status.status === 200 && status.body?.available === true, `Food catalog status returned ${status.status}; a configured live catalog is required.`);
    const providerId = status.body.defaultProviderId;
    assert(typeof providerId === "string" && status.body.providers?.some((provider: any) => provider.id === providerId), "Food catalog did not disclose a valid default provider.");

    const search = await request("GET", `/api/food-catalog/search?query=oats&territory=US&locale=en-US&limit=10&providerId=${encodeURIComponent(providerId)}`, undefined, account.cookie);
    assert(search.status === 200 && search.body?.provider?.id === providerId && Array.isArray(search.body?.items), `Live catalog search returned ${search.status}.`);
    const item = search.body.items.find((candidate: any) => typeof candidate?.lookupToken === "string" && candidate?.nutrients?.some((nutrient: any) => nutrient?.nutrientKey === "energy_kcal"));
    assert(item, "Live catalog search did not return an importable, energy-attributed food result.");
    assert(item.evidence?.sourceKind && item.evidence?.measurementBasis && item.evidence?.recordUpdatedAt, "Live catalog result omitted source evidence.");

    const imported = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: item.lookupToken }, account.cookie);
    assert(imported.status === 201 && imported.body?.replayed === false && imported.body?.food?.source === "catalog", `Explicit catalog import returned ${imported.status}.`);
    assert(imported.body.food.catalogProviderId === providerId && imported.body.food.catalogExternalId === item.externalId && imported.body.food.catalogAttributionText, "Imported food did not retain provider attribution and external identity.");
    const replay = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: item.lookupToken }, account.cookie);
    assert(replay.status === 200 && replay.body?.replayed === true && replay.body?.food?.id === imported.body.food.id, "Identical catalog import was not idempotent.");

    const invalidImport = await request("POST", "/api/nutrition/foods/catalog-import", { lookupToken: `${item.lookupToken}x` }, account.cookie);
    assert(invalidImport.status === 400, "Tampered catalog receipt was not rejected.");

    let knownBarcodeChecked = false;
    if (/^\d{8,14}$/.test(item.barcode || "")) {
      const barcode = await request("GET", `/api/food-catalog/barcodes/${item.barcode}?providerId=${encodeURIComponent(providerId)}`, undefined, account.cookie);
      assert(barcode.status === 200 && barcode.body?.found === true && barcode.body?.item?.externalId, `Known provider barcode lookup returned ${barcode.status}.`);
      knownBarcodeChecked = true;
    }
    const unknownBarcode = await findExplicitUnknownBarcode(providerId, account.cookie);
    assert(unknownBarcode.status === 200 && unknownBarcode.body?.found === false && unknownBarcode.body?.item === null, "Unknown barcode did not fail closed as an explicit unknown.");

    let nextPageChecked = false;
    if (typeof search.body.nextCursor === "string" && search.body.nextCursor.length >= 80) {
      const next = await request("GET", `/api/food-catalog/search?cursor=${encodeURIComponent(search.body.nextCursor)}`, undefined, account.cookie);
      assert(next.status === 200 && next.body?.provider?.id === providerId && next.body?.provider?.datasetVersion === search.body.provider?.datasetVersion, `Catalog continuation returned ${next.status} or changed its source identity.`);
      nextPageChecked = true;
    }
    console.log(JSON.stringify({ contract: "lyfeos.production-food-catalog.v1", passed: true, providerId, datasetVersion: search.body.provider.datasetVersion, sourceKind: item.evidence.sourceKind, knownBarcodeChecked, nextPageChecked }));
  } finally {
    erased = await eraseAccount(account);
    console.error(`disposable account erased=${erased}`);
  }
  assert(erased, "Food-catalog acceptance account was not erased.");
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
