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
  it("maps common lab-export header aliases without loosening identity or timestamp requirements", () => {
    const preview = previewHealthObservationCsv("Lab Result ID,Test Name,Name,Category,Result,Units,Collection Date,Lab\nabc-1,LDL,LDL cholesterol,lab,120,mg/dL,2026-09-01T10:00:00Z,Example Lab");
    expect(preview.validCount).toBe(1);
    expect(preview.rows[0].entry).toMatchObject({ sourceRecordId: "abc-1", metricKey: "ldl", displayName: "LDL cholesterol" });
  });
  it("uses a reviewed category fallback and Test Name only when the export supplies no separate display metadata", () => {
    const preview = previewHealthObservationCsv("Accession Number,Test Name,Result,Units,Collection Date,Lab\nacc-1,HDL Cholesterol,55,mg/dL,2026-09-01T10:00:00Z,Example Lab", { defaultCategory: "lab" });
    expect(preview.validCount).toBe(1);
    expect(preview.rows[0].entry).toMatchObject({ sourceRecordId: "acc-1::hdl_cholesterol", metricKey: "hdl_cholesterol", displayName: "HDL Cholesterol", category: "lab" });
  });
  it("keeps each result in a multi-test accession panel independently identifiable", () => {
    const preview = previewHealthObservationCsv("Accession Number,Test Name,Result,Units,Collection Date,Lab\nacc-1,HDL Cholesterol,55,mg/dL,2026-09-01T10:00:00Z,Example Lab\nacc-1,LDL Cholesterol,120,mg/dL,2026-09-01T10:00:00Z,Example Lab", { defaultCategory: "lab" });
    expect(preview.validCount).toBe(2);
    expect(preview.rows.map((row) => row.entry?.sourceRecordId)).toEqual(["acc-1::hdl_cholesterol", "acc-1::ldl_cholesterol"]);
  });
  it("rejects timestamps with an unknown timezone instead of inventing a collection time", () => {
    const preview = previewHealthObservationCsv(`${header}\nlab-1,ldl,LDL,lab,120,mg/dL,2026-09-01T10:00:00,Example Lab`);
    expect(preview.validCount).toBe(0);
    expect(preview.rows[0].errors.join(" ")).toContain("ISO date-time with timezone");
  });
});
