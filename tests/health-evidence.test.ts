import { describe, expect, it } from "vitest";
import { assessEvidenceDocumentation } from "../server/health-evidence";

describe("physical evidence documentation", () => {
  it("does not calculate confidence without records", () => {
    expect(assessEvidenceDocumentation(30, [])).toMatchObject({ confidence: "not_assessable", scorePercent: null, distinctRecordedDays: 0, dayCoveragePercent: 0 });
  });

  it("weights date coverage, source, and applicable method metadata transparently", () => {
    const result = assessEvidenceDocumentation(10, [
      { recordedDate: "2026-08-01", sourceDocumented: true, methodDocumented: true },
      { recordedDate: "2026-08-02", sourceDocumented: true, methodDocumented: false },
      { recordedDate: "2026-08-02", sourceDocumented: false, methodDocumented: true },
      { recordedDate: "2026-08-03", sourceDocumented: true, methodDocumented: true },
    ]);
    expect(result).toMatchObject({ confidence: "moderate", scorePercent: 53, distinctRecordedDays: 3, dayCoveragePercent: 30, sourceDocumentationPercent: 75, methodDocumentationPercent: 75 });
    expect(result.meaning).toContain("does not validate accuracy");
  });

  it("does not invent method incompleteness for record classes without an applicable method field", () => {
    const result = assessEvidenceDocumentation(2, [
      { recordedDate: "2026-08-01", sourceDocumented: true },
      { recordedDate: "2026-08-02", sourceDocumented: true },
    ]);
    expect(result).toMatchObject({ confidence: "high", scorePercent: 100, methodDocumentationPercent: null });
  });
});
