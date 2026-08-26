import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInstallationHostname } from "../server/installation-branding";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("tenant-safe installation branding", () => {
  it("normalizes public DNS names and rejects local or IP authority", () => {
    expect(normalizeInstallationHostname("Example.COM.:443")).toBe("example.com");
    expect(normalizeInstallationHostname("bücher.example")).toBe("xn--bcher-kva.example");
    expect(normalizeInstallationHostname("localhost")).toBeNull();
    expect(normalizeInstallationHostname("127.0.0.1")).toBeNull();
    expect(normalizeInstallationHostname("bad_label.example")).toBeNull();
  });

  it("keeps immutable OST product identity and personal authority boundaries", () => {
    const migration = source("migrations/0135_installation_branding.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/installation-branding.ts");
    expect(release).toContain('id: "0135_installation_branding"');
    expect(migration).toContain(`CHECK ("product_key" = 'lyfeos' AND "product_owner" = 'OST')`);
    expect(migration).toContain("installation_admin_grants");
    expect(routes).toContain("presentation_only_no_personal_record_access");
    expect(routes).toContain("resolveTxt");
    expect(routes).toContain("timingSafeEqual");
    expect(routes).not.toContain("healthObservations");
    expect(routes).not.toContain("financeTransactions");
  });
});
