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
    expect(source("client/src/main.tsx")).toContain("isPublicDisclosure");
  });

  it("gates telemetry and external typography on consent", () => {
    expect(source("client/src/instrument.ts")).toContain('import("@sentry/react")');
    expect(source("client/src/components/ProductAnalytics.tsx")).toContain("enabled: Boolean(user?.id) && cookieConsent");
    expect(source("client/index.html")).toContain("if (!consented()) return;");
  });

  it("honors Global Privacy Control and exposes an in-product privacy control", () => {
    expect(source("client/src/lib/cookieConsent.ts")).toContain("globalPrivacyControl");
    expect(source("client/src/components/profile/CookieSettings.tsx")).toContain("Global Privacy Control");
    expect(source("client/src/pages/ProfilePage.tsx")).toContain("<CookieSettings />");
  });
});
