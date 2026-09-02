import { createHash } from "node:crypto";

const categories = new Set(["strength", "endurance", "cardiovascular", "flexibility", "mobility", "recovery", "body_composition", "lab", "other"]);
const requiredHeaders = ["source_record_id", "value", "unit", "observed_at"] as const;
const headerAliases: Record<string, string> = {
  record_id: "source_record_id", result_id: "source_record_id", lab_result_id: "source_record_id",
  accession_number: "source_record_id", accession_id: "source_record_id",
  test_code: "metric_key", metric: "metric_key",
  name: "display_name", test: "display_name", analyte: "display_name",
  result: "value", result_value: "value", measured_value: "value",
  units: "unit", result_unit: "unit",
  date: "observed_at", result_date: "observed_at", collection_date: "observed_at",
  laboratory: "lab_name", lab: "lab_name", specimen: "specimen_type",
  low: "reference_low", high: "reference_high", range_unit: "reference_unit",
};
export type ImportedObservation = { sourceRecordId: string; metricKey: string; displayName: string; category: string; value: number; unit: string; observedAt: Date; method: string | null; methodVersion: string | null; deviceName: string | null; labName: string | null; specimenType: string | null; collectedAt: Date | null; referenceLow: number | null; referenceHigh: number | null; referenceUnit: string | null; note: string | null };
export type HealthCsvPreview = { importHash: string; rows: Array<{ rowNumber: number; entry: ImportedObservation | null; errors: string[] }>; validCount: number; invalidCount: number; disclosure: string };
export type HealthCsvImportOptions = { defaultCategory?: string };

function cells(text: string): string[][] {
  if (!text.trim() || text.length > 250_000) throw new Error("Paste a non-empty CSV of at most 250,000 characters.");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const char = text[i];
    if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else if (char === "\r") { if (text[i + 1] === "\n") i += 1; field += "\n"; } else field += char; }
    else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\r" || char === "\n") { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
    if (field.length > 5_000) throw new Error("CSV cells can contain at most 5,000 characters.");
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted cell.");
  row.push(field); rows.push(row); return rows.filter((values) => values.some((value) => value.trim()));
}
const text = (value: string | undefined, max: number) => { const result = value?.trim() || ""; return result && result.length <= max ? result : null; };
const number = (value: string | undefined) => { const result = Number(value?.trim()); return Number.isFinite(result) ? result : null; };
const date = (value: string | undefined) => { const raw = value?.trim() || ""; if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return null; const result = new Date(raw); return Number.isNaN(result.getTime()) ? null : result; };
const normalizedKey = (value: string | undefined, max = 80) => text(value, max)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || null;
const normalizedHeader = (value: string, index: number) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function previewHealthObservationCsv(csvText: string, options: HealthCsvImportOptions = {}): HealthCsvPreview {
  const rows = cells(csvText); if (rows.length < 2) throw new Error("The CSV needs a header and at least one data row.");
  const sourceHeaders = rows[0].map(normalizedHeader);
  const headers = sourceHeaders.map((header) => headerAliases[header] || header);
  if (headers.length > 20 || new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique and contain at most 20 columns.");
  for (const header of requiredHeaders) if (!headers.includes(header)) throw new Error(`CSV is missing required header: ${header}.`);
  if (options.defaultCategory && !categories.has(options.defaultCategory)) throw new Error("The selected default category is not supported.");
  const index = (header: string) => headers.indexOf(header); const at = (row: string[], header: string) => row[index(header)];
  const rawAt = (row: string[], header: string) => row[sourceHeaders.indexOf(header)];
  const sourceIdIsPanelAccession = sourceHeaders.includes("accession_number") || sourceHeaders.includes("accession_id");
  const previewRows = rows.slice(1, 201).map((row, offset) => {
    const errors: string[] = []; if (row.length > headers.length) errors.push("More values than headers.");
    const suppliedSourceRecordId = text(at(row, "source_record_id"), 200); const testName = text(rawAt(row, "test_name"), 120); const rawMetricKey = text(at(row, "metric_key"), 80) || testName; const metricKey = normalizedKey(rawMetricKey); const sourceRecordId = sourceIdIsPanelAccession && suppliedSourceRecordId && metricKey ? `${suppliedSourceRecordId}::${metricKey}` : suppliedSourceRecordId; const displayName = text(at(row, "display_name"), 120) || testName || text(at(row, "metric_key"), 120); const category = text(at(row, "category"), 40) || options.defaultCategory || null; const value = number(at(row, "value")); const unit = text(at(row, "unit"), 32); const observedAt = date(at(row, "observed_at"));
    if (!sourceRecordId) errors.push("source_record_id is required."); if (!metricKey || !/^[a-z0-9_]{2,80}$/.test(metricKey)) errors.push("metric_key must use lowercase letters, numbers, and underscores."); if (!displayName) errors.push("display_name is required."); if (!category || !categories.has(category)) errors.push("category is not supported."); if (value === null || value < -1_000_000 || value > 1_000_000) errors.push("value must be a finite supported number."); if (!unit) errors.push("unit is required."); if (!observedAt) errors.push("observed_at must be an ISO date-time with timezone.");
    const collectedAt = at(row, "collected_at")?.trim() ? date(at(row, "collected_at")) : null; if (at(row, "collected_at")?.trim() && !collectedAt) errors.push("collected_at must be an ISO date-time with timezone.");
    const referenceLow = at(row, "reference_low")?.trim() ? number(at(row, "reference_low")) : null; const referenceHigh = at(row, "reference_high")?.trim() ? number(at(row, "reference_high")) : null; const referenceUnit = text(at(row, "reference_unit"), 32);
    if ((referenceLow !== null || referenceHigh !== null) && !referenceUnit) errors.push("reference_unit is required with a reference range."); if (referenceLow !== null && referenceHigh !== null && referenceLow > referenceHigh) errors.push("reference_low cannot exceed reference_high.");
    const labName = text(at(row, "lab_name"), 160); if (category === "lab" && !labName) errors.push("lab_name is required for a lab row.");
    const entry = errors.length ? null : { sourceRecordId: sourceRecordId!, metricKey: metricKey!, displayName: displayName!, category: category!, value: value!, unit: unit!, observedAt: observedAt!, method: text(at(row, "method"), 160), methodVersion: text(at(row, "method_version"), 80), deviceName: text(at(row, "device_name"), 160), labName, specimenType: text(at(row, "specimen_type"), 120), collectedAt, referenceLow, referenceHigh, referenceUnit, note: text(at(row, "note"), 1_000) };
    return { rowNumber: offset + 2, entry, errors };
  });
  if (rows.length - 1 > 200) throw new Error("A reviewed health import can contain at most 200 data rows.");
  return { importHash: createHash("sha256").update(JSON.stringify({ csvText, defaultCategory: options.defaultCategory || null })).digest("hex"), rows: previewRows, validCount: previewRows.filter((row) => row.entry).length, invalidCount: previewRows.filter((row) => !row.entry).length, disclosure: `LyfeOS keeps only the rows you explicitly import. It does not retain the CSV file, invent missing measurements, or create a provider connection.${sourceIdIsPanelAccession ? " Accession-number rows use the reported accession plus normalized test key as their stable row identity." : ""} If you selected a fallback category, that is shown in this preview and bound to the reviewed import.` };
}
