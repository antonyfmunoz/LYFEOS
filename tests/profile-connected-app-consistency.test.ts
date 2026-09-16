import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Profile connected-app consistency", () => {
  it("renders health providers as peer cards instead of a nested Health Connections widget", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    const healthConnections = source("client/src/components/health/HealthConnections.tsx");

    expect(profile).toContain("<HealthConnections />");
    expect(profile).not.toContain("<HealthConnections embedded />");
    expect(healthConnections).not.toContain("health-connections-heading");
    expect(healthConnections).toContain("rounded-lg bg-card/50 p-3 transition-colors hover:bg-card/70");
    expect(healthConnections).toContain("Manage permissions");
  });

  it("uses the same Profile card shell for verified extensions", () => {
    const extensions = source("client/src/components/profile/ExtensionSettings.tsx");

    expect(extensions).toContain("mb-4 rounded-lg border border-primary/10 bg-background/40 p-4");
    expect(extensions).not.toContain("mt-6 rounded-xl border border-primary/20 bg-card/30 p-4");
  });

  it("keeps app connections, receipts, and linked work out of Settings", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");
    const settingsCase = profile.slice(profile.indexOf("case 'settings':"), profile.indexOf("default:", profile.indexOf("case 'settings':")));

    expect(profile).toContain("id: 'connected-apps'");
    expect(profile).toContain("id: 'connected-app-activity'");
    expect(profile).toContain("id: 'connected-work'");
    expect(profile).toContain("case 'connected-apps':");
    expect(profile).toContain("case 'connected-app-activity':");
    expect(profile).toContain("case 'connected-work':");
    expect(settingsCase).not.toContain("<IntegrationsSection");
    expect(settingsCase).not.toContain("<CrossProductWorkLinksSection");
  });
});
