import type { SpreadsheetChart, SpreadsheetDocument } from "@shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell } from "./spreadsheetFormula";

export type SpreadsheetChartSeries = {
  key: string;
  name: string;
  validCount: number;
  missingCount: number;
};

export type SpreadsheetChartRow = {
  label: string;
  values: Record<string, number | null>;
};

export type SpreadsheetChartData = {
  sheetName: string;
  sourceRange: string;
  rows: SpreadsheetChartRow[];
  series: SpreadsheetChartSeries[];
  numericValueCount: number;
  missingValueCount: number;
};

export type SpreadsheetPieDatum = { key: string; label: string; value: number };
export type SpreadsheetScatterDatum = { label: string; x: number; y: number };

function resolvedCell(document: SpreadsheetDocument, sheetId: string, row: number, column: number): string {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) return "";
  const address = `${columnLabel(column)}${row + 1}`;
  const input = sheet.cells[address]?.input || "";
  return input.startsWith("=") ? evaluateSpreadsheetCell(document, sheetId, address) : input;
}

function finiteNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function spreadsheetChartRangeLabel(chart: SpreadsheetChart): string {
  const { startRow, endRow, startColumn, endColumn } = chart.range;
  return `${columnLabel(startColumn)}${startRow + 1}:${columnLabel(endColumn)}${endRow + 1}`;
}

export function buildSpreadsheetChartData(document: SpreadsheetDocument, chart: SpreadsheetChart): SpreadsheetChartData {
  const sheet = document.sheets.find((candidate) => candidate.id === chart.sheetId);
  if (!sheet) throw new Error("The chart source sheet no longer exists.");
  const series = Array.from({ length: chart.range.endColumn - chart.range.startColumn }, (_, index) => {
    const column = chart.range.startColumn + index + 1;
    return {
      key: `series_${column}`,
      name: resolvedCell(document, sheet.id, chart.range.startRow, column).trim() || columnLabel(column),
      validCount: 0,
      missingCount: 0,
    };
  });
  const rows = Array.from({ length: chart.range.endRow - chart.range.startRow }, (_, index) => {
    const row = chart.range.startRow + index + 1;
    const label = resolvedCell(document, sheet.id, row, chart.range.startColumn).trim() || `Row ${row + 1}`;
    const values: Record<string, number | null> = {};
    series.forEach((entry, seriesIndex) => {
      const column = chart.range.startColumn + seriesIndex + 1;
      const value = finiteNumber(resolvedCell(document, sheet.id, row, column));
      values[entry.key] = value;
      if (value === null) entry.missingCount += 1;
      else entry.validCount += 1;
    });
    return { label, values };
  });
  const numericValueCount = series.reduce((total, entry) => total + entry.validCount, 0);
  const missingValueCount = series.reduce((total, entry) => total + entry.missingCount, 0);
  return { sheetName: sheet.name, sourceRange: spreadsheetChartRangeLabel(chart), rows, series, numericValueCount, missingValueCount };
}

export function buildSpreadsheetPieData(data: SpreadsheetChartData): SpreadsheetPieDatum[] {
  const series = data.series[0];
  if (!series) return [];
  return data.rows.flatMap((row, index) => {
    const value = row.values[series.key];
    return value === null ? [] : [{ key: `slice_${index}`, label: row.label, value }];
  });
}

export function buildSpreadsheetScatterData(data: SpreadsheetChartData): SpreadsheetScatterDatum[] {
  const [xSeries, ySeries] = data.series;
  if (!xSeries || !ySeries) return [];
  return data.rows.flatMap((row) => {
    const x = row.values[xSeries.key];
    const y = row.values[ySeries.key];
    return x === null || y === null ? [] : [{ label: row.label, x, y }];
  });
}
