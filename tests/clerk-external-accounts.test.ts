import { describe, expect, it } from "vitest";
import {
  hasGoogleExternalAccount,
  isGoogleExternalAccount,
} from "../server/clerk-external-accounts";

describe("Clerk external account provider detection", () => {
  it("recognizes the provider identifier returned by Clerk's Backend API", () => {
    expect(isGoogleExternalAccount({ provider: "oauth_google" })).toBe(true);
  });

  it("retains compatibility with Clerk's normalized Google identifier", () => {
    expect(isGoogleExternalAccount({ provider: "google" })).toBe(true);
    expect(isGoogleExternalAccount({ provider: " OAUTH_GOOGLE " })).toBe(true);
  });

  it("does not misclassify other or missing providers", () => {
    expect(hasGoogleExternalAccount([
      { provider: "oauth_github" },
      { provider: null },
      {},
    ])).toBe(false);
  });
});
