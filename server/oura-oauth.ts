import { z } from "zod";
import type { HealthCredentialPayload } from "./health-provider-credentials";

export const ouraAuthorizeEndpoint = "https://cloud.ouraring.com/oauth/authorize";
export const ouraTokenEndpoint = "https://api.ouraring.com/oauth/token";
export const ouraRevokeEndpoint = "https://api.ouraring.com/oauth/revoke";

const appScopeToOuraScopes = {
  activity: ["daily"],
  workouts: ["workout"],
  sleep: ["daily"],
  heart_rate: ["heartrate"],
  vitals: ["daily", "spo2Daily"],
} as const;
const supportedOuraScopes = new Set(["email", "personal", "daily", "heartrate", "workout", "tag", "session", "spo2Daily"]);

const ouraTokenResponseSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  refresh_token: z.string().min(1).max(16_384).nullable().optional(),
  expires_in: z.number().int().positive().max(31_536_000),
  token_type: z.string().trim().min(1).max(40).default("Bearer"),
  scope: z.string().trim().max(2_048).optional(),
}).passthrough();

export type OuraOAuthConfiguration = { clientId: string; clientSecret: string; redirectUri: string };
export type OuraTokenResult = { credential: HealthCredentialPayload; grantedProviderScopes: string[] };

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export function configuredOuraOAuth(env: NodeJS.ProcessEnv = process.env): OuraOAuthConfiguration | null {
  const clientId = env.OURA_CLIENT_ID?.trim();
  const clientSecret = env.OURA_CLIENT_SECRET?.trim();
  const redirectUri = env.OURA_REDIRECT_URI?.trim();
  const encryptionKey = env.HEALTH_PROVIDER_CREDENTIAL_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return null;
  let parsedRedirect: URL;
  try { parsedRedirect = new URL(redirectUri); } catch { return null; }
  const localRedirect = parsedRedirect.hostname === "localhost" || parsedRedirect.hostname === "127.0.0.1";
  if (parsedRedirect.protocol !== "https:" && !(localRedirect && parsedRedirect.protocol === "http:")) return null;
  if (Buffer.from(encryptionKey, "base64").length !== 32) return null;
  return { clientId, clientSecret, redirectUri: parsedRedirect.toString() };
}

export function ouraProviderScopesForAppScopes(appScopes: readonly string[]): string[] {
  const scopes = appScopes.flatMap((scope) => appScopeToOuraScopes[scope as keyof typeof appScopeToOuraScopes] || []);
  return unique(scopes);
}

export function ouraAppScopesFromGrantedProviderScopes(providerScopes: readonly string[]): string[] {
  const granted = new Set(providerScopes);
  const scopes: string[] = [];
  if (granted.has("daily")) scopes.push("activity", "sleep");
  if (granted.has("workout")) scopes.push("workouts");
  if (granted.has("heartrate")) scopes.push("heart_rate");
  // LyfeOS' current vitals category includes both daily temperature and daily
  // SpO2. It is only granted when Oura granted both underlying permissions.
  if (granted.has("daily") && granted.has("spo2Daily")) scopes.push("vitals");
  return scopes;
}

export function buildOuraAuthorizationUrl(config: OuraOAuthConfiguration, state: string, appScopes: readonly string[]): string {
  const providerScopes = ouraProviderScopesForAppScopes(appScopes);
  if (!state || state.length < 32) throw new Error("Oura authorization state is invalid.");
  if (!providerScopes.length) throw new Error("At least one supported Oura scope is required.");
  const url = new URL(ouraAuthorizeEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", providerScopes.join(" "));
  return url.toString();
}

export function normalizeOuraGrantedScopes(scope: string | undefined): string[] {
  return unique((scope || "").split(/[\s,]+/).map((value) => value.trim()).filter((value) => supportedOuraScopes.has(value)));
}

async function requestOuraToken(body: URLSearchParams, fetchImpl: typeof fetch): Promise<OuraTokenResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(ouraTokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Oura token request failed with status ${response.status}.`);
    const parsed = ouraTokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Oura returned an invalid token response.");
    const expiresAt = new Date(Date.now() + parsed.data.expires_in * 1_000).toISOString();
    const grantedProviderScopes = normalizeOuraGrantedScopes(parsed.data.scope);
    return {
      credential: {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token ?? null,
        expiresAt,
        tokenType: parsed.data.token_type,
        grantedScopes: grantedProviderScopes,
      },
      grantedProviderScopes,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function exchangeOuraAuthorizationCode(code: string, config: OuraOAuthConfiguration, fetchImpl: typeof fetch = fetch): Promise<OuraTokenResult> {
  if (!code || code.length > 4_096) throw new Error("Oura authorization code is invalid.");
  return requestOuraToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  }), fetchImpl);
}

export function refreshOuraCredential(refreshToken: string, config: OuraOAuthConfiguration, fetchImpl: typeof fetch = fetch): Promise<OuraTokenResult> {
  if (!refreshToken || refreshToken.length > 16_384) throw new Error("Oura refresh token is invalid.");
  return requestOuraToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  }), fetchImpl);
}

export async function revokeOuraAccessToken(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!accessToken || accessToken.length > 16_384) return false;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL(ouraRevokeEndpoint); url.searchParams.set("access_token", accessToken);
    const response = await fetchImpl(url, { method: "POST", signal: controller.signal });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timeout); }
}
