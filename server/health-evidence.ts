export type EvidenceDocumentationRecord = {
  recordedDate: string;
  sourceDocumented: boolean;
  methodDocumented?: boolean;
};

export type EvidenceDocumentationAssessment = {
  confidence: "not_assessable" | "low" | "moderate" | "high";
  scorePercent: number | null;
  distinctRecordedDays: number;
  dayCoveragePercent: number;
  sourceDocumentationPercent: number | null;
  methodDocumentationPercent: number | null;
  formula: string;
  meaning: string;
};

/**
 * Describes only how completely the selected records document their sampling,
 * source, and (where applicable) method. It must never be used as a proxy for
 * health, physical competence, readiness, or the accuracy of a measurement.
 */
export function assessEvidenceDocumentation(periodDays: number, records: EvidenceDocumentationRecord[]): EvidenceDocumentationAssessment {
  const distinctRecordedDays = new Set(records.map((record) => record.recordedDate)).size;
  const dayCoveragePercent = Math.round((distinctRecordedDays / periodDays) * 100);
  if (!records.length) return {
    confidence: "not_assessable", scorePercent: null, distinctRecordedDays, dayCoveragePercent,
    sourceDocumentationPercent: null, methodDocumentationPercent: null,
    formula: "No score is calculated without records.",
    meaning: "No records were present in this period, so record-documentation confidence is not assessable.",
  };
  const sourceDocumentationPercent = Math.round((records.filter((record) => record.sourceDocumented).length / records.length) * 100);
  const methodRecords = records.filter((record) => record.methodDocumented !== undefined);
  const methodDocumentationPercent = methodRecords.length
    ? Math.round((methodRecords.filter((record) => record.methodDocumented).length / methodRecords.length) * 100)
    : null;
  const scorePercent = Math.round(methodDocumentationPercent === null
    ? (dayCoveragePercent * 0.6) + (sourceDocumentationPercent * 0.4)
    : (dayCoveragePercent * 0.5) + (sourceDocumentationPercent * 0.25) + (methodDocumentationPercent * 0.25));
  const confidence = scorePercent >= 75 ? "high" : scorePercent >= 40 ? "moderate" : "low";
  return {
    confidence, scorePercent, distinctRecordedDays, dayCoveragePercent, sourceDocumentationPercent, methodDocumentationPercent,
    formula: methodDocumentationPercent === null
      ? "60% recorded-day coverage + 40% source documentation."
      : "50% recorded-day coverage + 25% source documentation + 25% applicable method documentation.",
    meaning: "This confidence describes record documentation only. It does not validate accuracy or measure health, ability, adaptation, readiness, or progress.",
  };
}
