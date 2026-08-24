import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("body measurement method provenance", () => {
  it("versions method and protocol fields through schema, migration, and release", () => {
    const migration = source("migrations/0064_body_measurement_protocols.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('"measurement_method" text NOT NULL DEFAULT \'unspecified\'');
    expect(migration).toContain('"measurement_protocol" text');
    expect(migration).toContain("body_measurements_user_metric_unit_method_date_idx");
    expect(release).toContain('id: "0064_body_measurement_protocols"');
    expect(schema).toContain('measurementMethod: text("measurement_method")');
  });

  it("keeps CRUD owner scoped and compares only like-for-like records", () => {
    const routes = source("server/routes/health-fitness.ts");
    const client = source("client/src/components/health/BodyProgress.tsx");
    expect(routes).toContain('measurementMethod: z.enum(["unspecified", "scale", "tape", "bia", "caliper", "dexa", "bod_pod", "professional", "other"])');
    expect(routes).toContain("eq(bodyMeasurements.userId, req.session.userId!)");
    expect(client).toContain('entry.measurementMethod === measurementMethod');
    expect(client).toContain("convertBodyMeasurement");
    expect(client).toContain('aria-label="Body measurement protocol"');
    expect(client).toContain("same method and compatible units");
    expect(client).toContain("not a quality judgment");
  });
});
