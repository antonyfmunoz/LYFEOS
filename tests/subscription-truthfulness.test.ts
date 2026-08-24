import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("subscription truthfulness", () => {
  it("does not expose a checkout flow before billing and entitlements are implemented", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/SubscriptionPage.tsx"), "utf8");
    expect(page).toContain("Billing is not available yet");
    expect(page).toContain("No charge, checkout, or subscription can be created here.");
    expect(page).not.toContain("/api/stripe/checkout");
    expect(page).not.toContain("Upgrade to Pro");
  });
});
