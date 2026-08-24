import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cross-product sharing availability", () => {
  it("does not let a local sharing preference masquerade as enabled delivery", () => {
    const sharing = source("server/cross-product.ts");
    const routes = source("server/routes/cross-product-sharing.ts");
    expect(sharing).toContain("getCrossProductSharingAvailability");
    expect(sharing).toContain("config?.controlPlaneUrl");
    expect(routes).toContain("parsed.data.enabled && !availability.available");
    expect(routes).toContain("res.status(503)");
  });

  it("makes unavailable ecosystem delivery clear in the profile without allowing new links", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    expect(profile).toContain("No ecosystem data is leaving LyfeOS");
    expect(profile).toContain("Ecosystem delivery is unavailable, so no mission can be linked for sharing.");
    expect(profile).toContain("sharing?.availability.available && sharing.enabled");
  });
});
