import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("supplement schedule history", () => {
  it("release-migrates immutable event snapshots and bounded history index", () => {
    const migration = source("migrations/0078_supplement_schedule_history.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "name_snapshot"');
    expect(migration).toContain('ALTER COLUMN "name_snapshot" SET NOT NULL');
    expect(migration).toContain('"supplement_schedule_events_user_date_idx"');
    expect(release).toContain('id: "0078_supplement_schedule_history"');
  });

  it("preserves the schedule identity at first event recording", () => {
    const routes = source("server/routes/supplement-schedules.ts");
    expect(routes).toContain("nameSnapshot: existing?.nameSnapshot || schedule.name");
    expect(routes).toContain("amountSnapshot: existing ? existing.amountSnapshot : schedule.amount");
    expect(routes).toContain('app.get("/api/supplement-schedules/history"');
    expect(routes).toContain("requestedDays > 3650");
    expect(routes).toContain("not a statement of product validity, efficacy, safety, or medical adherence");
  });

  it("captures optional event notes and labels reminders as in-app cues", () => {
    const client = source("client/src/components/health/SupplementSchedules.tsx");
    expect(client).toContain("Optional note for the next taken/skipped record");
    expect(client).toContain("Show in-app due cue");
    expect(client).toContain("background delivery is not claimed");
    expect(client).toContain("Recorded schedule history");
  });

  it("preserves optional product and lot identity in factual entries and schedule event snapshots", () => {
    const migration = source("migrations/0080_supplement_product_provenance.sql");
    const release = source("server/release-migrate.ts");
    const routes = source("server/routes/supplement-schedules.ts");
    const log = source("client/src/components/health/DailyHealthLog.tsx");
    const schedules = source("client/src/components/health/SupplementSchedules.tsx");
    for (const column of ["brand", "manufacturer", "form", "barcode", "lot_number", "expires_on"]) expect(migration).toContain(`"${column}"`);
    expect(migration).toContain('"lot_number_snapshot"');
    expect(release).toContain('id: "0080_supplement_product_provenance"');
    expect(routes).toContain("name: eventSnapshot.nameSnapshot");
    expect(routes).toContain("lotNumber: eventSnapshot.lotNumberSnapshot");
    expect(log).toContain("Optional product and lot details");
    expect(schedules).toContain("Recorded product and lot details");
    expect(schedules).toContain("does not verify a product or interpret expiry, safety, efficacy, or interactions");
  });
});
