import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Spirit Log", () => {
  it("keeps Bible study and prayer records private, portable, erasable, and owner-scoped", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0162_spirit_log.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/spirit-log.ts");
    const profile = source("server/routes/profile.ts");

    expect(schema).toContain('pgTable("spirit_entries"');
    expect(migration).toContain('"spirit_entries"');
    expect(release).toContain('id: "0162_spirit_log"');
    expect(profile).toContain('"spirit_entries"');
    expect(routes).toContain('app.get("/api/spirit-entries", isAuthenticated');
    expect(routes).toContain('app.post("/api/spirit-entries", isAuthenticated');
    expect(routes).toContain('app.patch("/api/spirit-entries/:id", isAuthenticated');
    expect(routes).toContain('app.delete("/api/spirit-entries/:id", isAuthenticated');
    expect(routes).toContain('eq(spiritEntries.userId, req.session.userId!)');
    expect(routes).toContain('private, no-store');
    expect(schema).toContain('theological inference layer');
  });

  it("keeps Spirit Log as a dedicated Chronilog workspace rather than merging it into Journal or Knowledge Base", () => {
    const app = source("client/src/App.tsx");
    const chronilog = source("client/src/pages/ChronilogPage.tsx");
    const page = source("client/src/pages/SpiritLogPage.tsx");
    const routes = source("server/routes.ts");

    expect(app).toContain('lazyRoute(() => import("./pages/SpiritLogPage"))');
    expect(app).toContain('<Route path="/spirit-log">');
    expect(chronilog).toContain('id: "spirit-log"');
    expect(chronilog).toContain("navigate('/spirit-log')");
    expect(routes).toContain("registerSpiritLogRoutes(app)");
    expect(page).toContain("Bible study, prayers, reflections, sermons");
    expect(page).toContain('data-testid="spirit-log-create-form"');
    expect(page).toContain('data-testid={`spirit-log-entry-${entry.id}`}');
    expect(page).toContain("Search Spirit Log");
    expect(page).toContain('DatePicker ariaLabel="Spirit Log entry date"');
    expect(page).toContain('SelectItem value="all">All types</SelectItem>');
    expect(page).not.toContain('type="date"');
  });
});
