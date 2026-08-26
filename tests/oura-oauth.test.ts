import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildOuraAuthorizationUrl, configuredOuraOAuth, exchangeOuraAuthorizationCode, normalizeOuraGrantedScopes, ouraAppScopesFromGrantedProviderScopes, ouraAuthorizeEndpoint, ouraProviderScopesForAppScopes, ouraTokenEndpoint, refreshOuraCredential, revokeOuraAccessToken } from "../server/oura-oauth";

const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://lyfeos.net/api/health-connections/oura/callback" };

describe("Oura OAuth boundary", () => {
  it("fails closed without a complete HTTPS configuration and 256-bit vault key", () => {
    const key = crypto.randomBytes(32).toString("base64");
    expect(configuredOuraOAuth({ OURA_CLIENT_ID: "id", OURA_CLIENT_SECRET: "secret", OURA_REDIRECT_URI: config.redirectUri, HEALTH_PROVIDER_CREDENTIAL_KEY: key } as NodeJS.ProcessEnv)).toEqual({ clientId: "id", clientSecret: "secret", redirectUri: config.redirectUri });
    expect(configuredOuraOAuth({ OURA_CLIENT_ID: "id", OURA_CLIENT_SECRET: "secret", OURA_REDIRECT_URI: "http://lyfeos.net/callback", HEALTH_PROVIDER_CREDENTIAL_KEY: key } as NodeJS.ProcessEnv)).toBeNull();
    expect(configuredOuraOAuth({ OURA_CLIENT_ID: "id", OURA_CLIENT_SECRET: "secret", OURA_REDIRECT_URI: config.redirectUri, HEALTH_PROVIDER_CREDENTIAL_KEY: "short" } as NodeJS.ProcessEnv)).toBeNull();
    expect(configuredOuraOAuth({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("maps only the least provider scopes needed for explicitly selected LyfeOS categories", () => {
    expect(ouraProviderScopesForAppScopes(["activity", "sleep", "vitals", "heart_rate"])).toEqual(["daily", "spo2Daily", "heartrate"]);
    expect(ouraAppScopesFromGrantedProviderScopes(["daily", "workout", "heartrate"])).toEqual(["activity", "sleep", "workouts", "heart_rate"]);
    expect(ouraAppScopesFromGrantedProviderScopes(["spo2Daily"])).not.toContain("vitals");
    expect(ouraAppScopesFromGrantedProviderScopes(["daily", "spo2Daily"])).toContain("vitals");
    expect(normalizeOuraGrantedScopes("daily spo2Daily unknown_scope")).toEqual(["daily", "spo2Daily"]);
  });

  it("builds the official authorization URL without the client secret", () => {
    const url = new URL(buildOuraAuthorizationUrl(config, "state-value-that-is-at-least-thirty-two-characters", ["workouts", "heart_rate"]));
    expect(`${url.origin}${url.pathname}`).toBe(ouraAuthorizeEndpoint);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("workout heartrate");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("exchanges and refreshes through form-encoded server-only requests", async () => {
    const tokenResponse = { access_token: "access", refresh_token: "rotated-refresh", expires_in: 3600, token_type: "Bearer", scope: "daily heartrate" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(tokenResponse), { status: 200, headers: { "content-type": "application/json" } }));
    const exchanged = await exchangeOuraAuthorizationCode("authorization-code", config, fetchMock as typeof fetch);
    const refreshed = await refreshOuraCredential("single-use-refresh", config, fetchMock as typeof fetch);
    expect(exchanged.credential.accessToken).toBe("access");
    expect(exchanged.credential.refreshToken).toBe("rotated-refresh");
    expect(exchanged.grantedProviderScopes).toEqual(["daily", "heartrate"]);
    expect(refreshed.credential.refreshToken).toBe("rotated-refresh");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[0];
    expect(exchangeUrl).toBe(ouraTokenEndpoint);
    expect(exchangeInit?.method).toBe("POST");
    expect(String(exchangeInit?.body)).toContain("grant_type=authorization_code");
    expect(String(exchangeInit?.body)).toContain("client_secret=client-secret");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("grant_type=refresh_token");
  });

  it("never returns provider response bodies on token errors and makes revocation best-effort", async () => {
    const failedFetch = vi.fn(async () => new Response(JSON.stringify({ error: "provider-detail", access_token: "leaked" }), { status: 401 }));
    await expect(exchangeOuraAuthorizationCode("code", config, failedFetch as typeof fetch)).rejects.toThrow("status 401");
    await expect(exchangeOuraAuthorizationCode("code", config, failedFetch as typeof fetch)).rejects.not.toThrow("provider-detail");
    const revokeFetch = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await revokeOuraAccessToken("access", revokeFetch as typeof fetch)).toBe(true);
    expect(String(revokeFetch.mock.calls[0][0])).toContain("https://api.ouraring.com/oauth/revoke");
  });

  it("keeps OAuth state one-use, session-bound, time-limited, and tokens out of responses", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-connections.ts"), "utf8");
    expect(routes).toContain("crypto.timingSafeEqual");
    expect(routes).toContain("ouraOAuthStateLifetimeMs");
    expect(routes.indexOf("clearOuraOAuthSession(req)")).toBeLessThan(routes.indexOf("exchangeOuraAuthorizationCode(code, config)"));
    expect(routes).not.toContain("res.json({ accessToken");
    expect(routes).toContain('action: "authorized"');
    expect(routes).toContain("callbackGrantedScopes");
    expect(routes).not.toContain("token.grantedProviderScopes : requestedProviderScopes");
  });
});
