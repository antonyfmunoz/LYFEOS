import { describe, expect, it } from "vitest";
import { previewHealthObservationCsv } from "../server/health-observation-csv";

const header = "source_record_id,metric_key,display_name,category,value,unit,observed_at,lab_name";
describe("reviewed health CSV import", () => {
  it("parses quoted rows without inferring missing health data", () => {
    const preview = previewHealthObservationCsv(`${header}\nlab-1,ldl,\"LDL cholesterol\",lab,120,mg/dL,2026-09-01T10:00:00Z,Example Lab`);
    expect(preview.validCount).toBe(1); expect(preview.invalidCount).toBe(0);
    expect(preview.rows[0].entry).toMatchObject({ sourceRecordId: "lab-1", metricKey: "ldl", value: 120, labName: "Example Lab" });
  });
  it("blocks invalid rows and requires stable source records", () => {
    const preview = previewHealthObservationCsv(`${header}\n,LDL,LDL,lab,not-a-number,mg/dL,2026-09-01,`);
    expect(preview.validCount).toBe(0); expect(preview.rows[0].errors.join(" ")).toContain("source_record_id");
    expect(preview.rows[0].errors.join(" ")).toContain("ISO date-time");
  });
});
