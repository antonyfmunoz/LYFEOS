import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cookie consent boundary", () => {
  it("keeps the landing page available while optional services wait for acceptance", () => {
    expect(source("client/src/components/CookieConsentBanner.tsx")).toContain("Accept");
    expect(source("client/src/components/CookieConsentBanner.tsx")).toContain("Reject optional");
    expect(source("client/src/components/CookieConsentBanner.tsx")).toContain("Cookie settings");
    expect(source("client/src/main.tsx")).toContain('lazy(() => import("./AppBootstrap"))');
    expect(source("client/src/main.tsx")).toContain("if (!hasConsent) {");
    expect(source("client/src/main.tsx")).toContain('publicPath === "/privacy"');
  });

  it("gates telemetry and external typography on consent", () => {
    expect(source("client/src/instrument.ts")).toContain('import("@sentry/react")');
    expect(source("client/src/components/ProductAnalytics.tsx")).toContain("enabled: Boolean(user?.id) && cookieConsent");
    expect(source("client/index.html")).toContain("if (!consented()) return;");
    expect(source("client/index.html")).toContain("navigator.globalPrivacyControl !== true");
  });

  it("honors Global Privacy Control and exposes an in-product privacy control", () => {
    expect(source("client/src/lib/cookieConsent.ts")).toContain("globalPrivacyControl");
    expect(source("client/src/components/profile/CookieSettings.tsx")).toContain("Global Privacy Control");
    expect(source("client/src/pages/ProfilePage.tsx")).toContain("<CookieSettings />");
    expect(source("client/src/pages/ConsumerPrivacyNoticePage.tsx")).toContain("Global Privacy Control");
    expect(source("client/src/pages/ConsumerHealthDataNoticePage.tsx")).toContain("Consumer Health Data Notice");
  });

  it("makes browser fixtures record an explicit consent choice before opening protected routes", () => {
    const fixtureSignals = source("scripts/lib/production-browser-signals.ts");
    expect(fixtureSignals).toContain('COOKIE_CONSENT_STORAGE_KEY = "lyfeos.cookie-consent.v1"');
    expect(fixtureSignals).toContain('localStorage.setItem(consentStorageKey, "accepted")');
    for (const script of [
      "scripts/automation-recovery-browser-acceptance.ts",
      "scripts/ai-memory-browser-acceptance.ts",
      "scripts/thread-successor-browser-acceptance.ts",
      "scripts/messages-browser-acceptance.ts",
      "scripts/mission-safety-browser-acceptance.ts",
      "scripts/production-projects-browser-acceptance.ts",
      "scripts/production-search-browser-acceptance.ts",
    ]) {
      expect(source(script)).toContain("installFixtureUserStorageSeed");
      expect(source(script)).toContain("adultEligibilityAcknowledged: true");
    }
  });
});
