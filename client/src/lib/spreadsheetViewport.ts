import { columnLabel, parseCellAddress } from "./spreadsheetFormula";

export const SPREADSHEET_ROW_HEADER_WIDTH = 48;
export const SPREADSHEET_COLUMN_HEADER_HEIGHT = 32;
export const SPREADSHEET_COLUMN_WIDTH = 120;
export const SPREADSHEET_ROW_HEIGHT = 36;

type SpreadsheetViewportInput = {
  rowCount: number;
  columnCount: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  overscanRows?: number;
  overscanColumns?: number;
};

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

export function calculateSpreadsheetViewportWindow(input: SpreadsheetViewportInput) {
  const rowCount = boundedInteger(input.rowCount, 1, 500);
  const columnCount = boundedInteger(input.columnCount, 1, 100);
  const scrollLeft = Math.max(0, Number.isFinite(input.scrollLeft) ? input.scrollLeft : 0);
  const scrollTop = Math.max(0, Number.isFinite(input.scrollTop) ? input.scrollTop : 0);
  const viewportWidth = Math.max(SPREADSHEET_ROW_HEADER_WIDTH + SPREADSHEET_COLUMN_WIDTH, Number.isFinite(input.viewportWidth) ? input.viewportWidth : 0);
  const viewportHeight = Math.max(SPREADSHEET_COLUMN_HEADER_HEIGHT + SPREADSHEET_ROW_HEIGHT, Number.isFinite(input.viewportHeight) ? input.viewportHeight : 0);
  const overscanRows = boundedInteger(input.overscanRows ?? 4, 0, 20);
  const overscanColumns = boundedInteger(input.overscanColumns ?? 2, 0, 10);

  const firstVisibleColumn = Math.floor(Math.max(0, scrollLeft - SPREADSHEET_ROW_HEADER_WIDTH) / SPREADSHEET_COLUMN_WIDTH);
  const lastVisibleColumn = Math.ceil(Math.max(0, scrollLeft + viewportWidth - SPREADSHEET_ROW_HEADER_WIDTH) / SPREADSHEET_COLUMN_WIDTH) - 1;
  const firstVisibleRow = Math.floor(Math.max(0, scrollTop - SPREADSHEET_COLUMN_HEADER_HEIGHT) / SPREADSHEET_ROW_HEIGHT);
  const lastVisibleRow = Math.ceil(Math.max(0, scrollTop + viewportHeight - SPREADSHEET_COLUMN_HEADER_HEIGHT) / SPREADSHEET_ROW_HEIGHT) - 1;

  const startColumn = boundedInteger(firstVisibleColumn - overscanColumns, 0, columnCount - 1);
  const endColumn = boundedInteger(lastVisibleColumn + overscanColumns, startColumn, columnCount - 1);
  const startRow = boundedInteger(firstVisibleRow - overscanRows, 0, rowCount - 1);
  const endRow = boundedInteger(lastVisibleRow + overscanRows, startRow, rowCount - 1);

  return {
    startColumn,
    endColumn,
    startRow,
    endRow,
    renderedColumnCount: endColumn - startColumn + 1,
    renderedRowCount: endRow - startRow + 1,
    renderedCellCount: (endColumn - startColumn + 1) * (endRow - startRow + 1),
    totalWidth: SPREADSHEET_ROW_HEADER_WIDTH + columnCount * SPREADSHEET_COLUMN_WIDTH,
    totalHeight: SPREADSHEET_COLUMN_HEADER_HEIGHT + rowCount * SPREADSHEET_ROW_HEIGHT,
  };
}

export type SpreadsheetNavigationDirection = "left" | "right" | "up" | "down";

export function moveSpreadsheetAddress(address: string, direction: SpreadsheetNavigationDirection, rowCount: number, columnCount: number): string {
  const position = parseCellAddress(address);
  if (!position) throw new Error("Choose a valid spreadsheet cell.");
  const boundedRowCount = boundedInteger(rowCount, 1, 500);
  const boundedColumnCount = boundedInteger(columnCount, 1, 100);
  const rowDelta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const columnDelta = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  const row = Math.min(boundedRowCount - 1, Math.max(0, position.row + rowDelta));
  const column = Math.min(boundedColumnCount - 1, Math.max(0, position.column + columnDelta));
  return `${columnLabel(column)}${row + 1}`;
}
