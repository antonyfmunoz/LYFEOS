import fs from "node:fs/promises";

type Session = { email: string; displayName: string; cookie: string };

const BASE_URL = new URL(process.env.LYFEOS_ACCEPTANCE_BASE_URL || "https://lyfeos.net");
const SESSION_FILE = process.env.LYFEOS_ACCEPTANCE_SESSION_FILE || "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(method: string, pathname: string, body?: unknown, cookie = "") {
  const response = await fetch(new URL(pathname, BASE_URL), {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function main(): Promise<void> {
  assert(BASE_URL.origin === "https://lyfeos.net", "Disposable browser acceptance cleanup may target only https://lyfeos.net.");
  if (!SESSION_FILE) return;
  const stored = await fs.readFile(SESSION_FILE, "utf8").catch(() => "");
  if (!stored) return;
  const session = JSON.parse(stored) as Session;
  assert(typeof session.cookie === "string" && session.cookie.includes("="), "Disposable browser session file is invalid.");
  const deleted = await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, session.cookie);
  const auth = await request("GET", "/api/auth/me", undefined, session.cookie);
  const email = await request("GET", `/api/auth/check-email?email=${encodeURIComponent(session.email)}`);
  const displayName = await request("GET", `/api/auth/check-display-name?displayName=${encodeURIComponent(session.displayName)}`);
  const erased = deleted.status === 200 && auth.status === 401 && email.body?.available === true && displayName.body?.available === true;
  await fs.rm(SESSION_FILE, { force: true });
  assert(erased, "Disposable browser acceptance account was not fully erased.");
  console.log(JSON.stringify({ contract: "lyfeos.production-browser-disposable-session.v1", erased: true }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
