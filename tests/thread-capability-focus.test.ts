import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("durable capability focus continuity", () => {
  it("stores a Thread's primary focus as a durable owner capability", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0119_thread_capability_focus.sql");
    const release = source("server/release-migrate.ts");
    expect(schema).toContain('primaryCapabilityId: integer("primary_capability_id")');
    expect(migration).toContain('REFERENCES "personal_capabilities"("id") ON DELETE set null');
    expect(migration).toContain('node."kind" = \'primary\'');
    expect(release).toContain('id: "0119_thread_capability_focus"');
  });

  it("serializes initialization and rejects capabilities outside the owner boundary", () => {
    const routes = source("server/routes/transformation-threads.ts");
    expect(routes).toContain('primaryCapabilityId: z.number().int().positive().optional()');
    expect(routes).toContain('eq(personalCapabilities.userId, userId)');
    expect(routes).toContain('SELECT pg_advisory_xact_lock(120103, ${userId})');
    expect(routes).toContain('app.get("/api/capabilities/:id/history"');
    expect(routes).toContain("Each Thread keeps its own missions, reviews, local XP and completion state");
  });

  it("keeps the continuity controls inside the existing compact Thread panel", () => {
    const panel = source("client/src/components/dashboard/TransformationThreadPanel.tsx");
    const constellation = source("client/src/components/dashboard/CapabilityConstellation.tsx");
    expect(panel).toContain('aria-label="Next capability focus"');
    expect(panel).toContain("A Thread is a temporary focus period");
    expect(panel).toContain("View durable history");
    expect(panel).toContain("XP recorded in this Thread");
    expect(panel).toContain('data-testid="transformation-thread-panel"');
    expect(panel).toContain('data-testid="thread-current-path"');
    expect(panel).toContain('data-testid={`capability-history-toggle-${skill.id}`}');
    expect(panel).toContain('data-testid="capability-history-reviewed-xp"');
    expect(panel).toContain('data-testid="capability-history-events"');
    expect(constellation).toContain('data-testid="capability-constellation"');
    expect(constellation).toContain('data-testid={`capability-constellation-node-${node.id}`}');
  });
});
