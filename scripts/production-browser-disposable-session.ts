import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type ApiResult = { status: number; body: any; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const SESSION_FILE = process.env.LYFEOS_ACCEPTANCE_SESSION_FILE || "";
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
  return { status: response.status, body: await response.json().catch(() => ({})), cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0] };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Disposable browser acceptance setup may target only https://lyfeos.net.");
  assert(SESSION_FILE, "LYFEOS_ACCEPTANCE_SESSION_FILE is required for disposable browser acceptance setup.");
  const stamp = randomUUID().replace(/-/g, "");
  const email = `browser_acceptance_${stamp}@example.com`;
  const displayName = `browseracceptance_${stamp.slice(0, 16)}`;
  const registered = await request("POST", "/api/auth/complete-registration", { email, password: PASSWORD, displayName, termsAccepted: true });
  assert(registered.status === 201 && registered.cookie, `Disposable browser registration returned ${registered.status}.`);
  const onboarding = await request("PATCH", "/api/profile", { onboardingCompleted: true }, registered.cookie);
  assert(onboarding.status === 200, `Disposable browser onboarding setup returned ${onboarding.status}.`);
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, `${JSON.stringify({ email, displayName, cookie: registered.cookie })}\n`, "utf8");
  console.log(JSON.stringify({ contract: "lyfeos.production-browser-disposable-session.v1", created: true }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
