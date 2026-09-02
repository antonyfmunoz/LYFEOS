import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import puppeteer, { type Browser } from "puppeteer-core";

type ApiResult = { status: number; body: any; cookie: string };
type Account = { email: string; displayName: string; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_TEST_API_URL || "https://lyfeos.net");
const PASSWORD = "TestPass123!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function within<T>(label: string, operation: Promise<T>, timeoutMs = 30_000): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

async function findChromium(): Promise<string> {
  const candidates = [
    process.env.LYFEOS_CHROMIUM_PATH,
    process.env.CHROME_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next bounded location. */ }
  }
  throw new Error("No Chromium executable found for Web Push acceptance.");
}

function cookieParts(cookie: string): { name: string; value: string } {
  const separator = cookie.indexOf("=");
  assert(separator > 0, "Registration did not return a session cookie.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
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

async function runBrowserLifecycle(account: Account): Promise<{ endpointHost: string; provider: string | null }> {
  let browser: Browser | null = null;
  try {
    console.error("web-push acceptance: launching isolated browser");
    browser = await puppeteer.launch({ headless: true, executablePath: await findChromium(), args: ["--no-first-run", "--no-default-browser-check"] });
    await within("Browser notification permission", browser.defaultBrowserContext().overridePermissions(BASE_URL.origin, ["notifications"]));
    const page = await browser.newPage();
    const session = cookieParts(account.cookie);
    await page.setCookie({ name: session.name, value: session.value, domain: BASE_URL.hostname, path: "/" });
    await within("Profile load", page.goto(new URL("/profile", BASE_URL), { waitUntil: "domcontentloaded", timeout: 30_000 }));
    console.error("web-push acceptance: browser session and service worker ready");
    const result = await within("Browser push subscription lifecycle", page.evaluate(async () => {
      const config = await fetch("/api/push/config").then(async (response) => ({ status: response.status, body: await response.json() }));
      if (config.status !== 200 || !config.body.configured || !config.body.publicKey) throw new Error("Web Push is not configured in this release.");
      const padding = "=".repeat((4 - config.body.publicKey.length % 4) % 4);
      const key = Uint8Array.from(atob((config.body.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) throw new Error("The browser returned an incomplete push subscription.");
      const saved = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: payload.endpoint, expirationTime: payload.expirationTime ?? null, keys: payload.keys }) });
      const savedBody = await saved.json().catch(() => ({}));
      const test = await fetch("/api/push/test", { method: "POST" });
      const testBody = await test.json().catch(() => ({}));
      const revoked = await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: payload.endpoint }) });
      const revokedBody = await revoked.json().catch(() => ({}));
      const unsubscribed = await subscription.unsubscribe();
      return { savedStatus: saved.status, savedError: typeof savedBody.error === "string" ? savedBody.error : null, testStatus: test.status, delivered: Boolean(testBody.delivered), revokedStatus: revoked.status, revoked: Boolean(revokedBody.revoked), unsubscribed, endpointHost: new URL(payload.endpoint).host, provider: config.body.provider as string | null };
    }));
    assert(result.savedStatus === 201, `Push subscription returned ${result.savedStatus}${result.savedError ? `: ${result.savedError}` : ""}.`);
    assert(result.testStatus === 200 && result.delivered, `Push test delivery returned ${result.testStatus}.`);
    assert(result.revokedStatus === 200 && result.revoked && result.unsubscribed, "Push revocation did not complete in both LyfeOS and the browser.");
    return { endpointHost: result.endpointHost, provider: result.provider };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const stamp = randomUUID().replace(/-/g, "");
  const account: Account = { email: `push_acceptance_${stamp}@example.com`, displayName: `pushacceptance_${stamp.slice(0, 16)}`, cookie: "" };
  let erased = false;
  try {
    await registerDisposableAccount(account);
    console.error("web-push acceptance: disposable account registered");
    const result = await runBrowserLifecycle(account);
    console.log(JSON.stringify({ contract: "lyfeos.production-web-push-browser.v1", passed: true, provider: result.provider, endpointHost: result.endpointHost }));
  } finally {
    erased = await eraseAccount(account);
    console.error(`disposable account erased=${erased}`);
  }
  assert(erased, "Web Push acceptance account was not erased.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
