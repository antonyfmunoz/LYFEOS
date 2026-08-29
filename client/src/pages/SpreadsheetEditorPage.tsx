import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, ClipboardCopy, ClipboardPaste, Download, Eraser, History, Italic, Plus, Redo2, RotateCcw, Save, Trash2, Undo2, Upload } from "lucide-react";
import type { SpreadsheetColorToken, SpreadsheetDocument, SpreadsheetNumberFormat, SpreadsheetSheet } from "@shared/spreadsheets";
import { createEmptySpreadsheetDocument, createSpreadsheetChart, nextSpreadsheetSheetName, normalizeSpreadsheetDocument, removeSpreadsheetChart, removeSpreadsheetSheet, renameSpreadsheetSheet, shiftSpreadsheetChartsForAxis, uniqueSpreadsheetSheetName, updateSpreadsheetChart } from "@shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, formatSpreadsheetDisplayValue, insertSpreadsheetAxis, parseCellAddress } from "@/lib/spreadsheetFormula";
import { createSpreadsheetSheetFromDelimited, formatSpreadsheetRange, pasteSpreadsheetRange, serializeSpreadsheetRange, spreadsheetRangeBounds } from "@/lib/spreadsheetRange";
import { calculateSpreadsheetViewportWindow, moveSpreadsheetAddress, SPREADSHEET_COLUMN_HEADER_HEIGHT, SPREADSHEET_COLUMN_WIDTH, SPREADSHEET_ROW_HEADER_WIDTH, SPREADSHEET_ROW_HEIGHT, type SpreadsheetNavigationDirection } from "@/lib/spreadsheetViewport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { SpreadsheetChartCard } from "@/components/spreadsheets/SpreadsheetChartCard";

type SpreadsheetRecord = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  favorite: boolean;
  revision: number;
  content: unknown;
};

type SpreadsheetRevisionRecord = {
  id: number;
  revisionNumber: number;
  action: "created" | "updated" | "restored";
  sourceRevision: number | null;
  createdAt: string;
};

const spreadsheetTextColorClasses: Record<SpreadsheetColorToken, string> = {
  red: "text-red-700 dark:text-red-300",
  amber: "text-amber-700 dark:text-amber-300",
  green: "text-emerald-700 dark:text-emerald-300",
  blue: "text-sky-700 dark:text-sky-300",
  purple: "text-violet-700 dark:text-violet-300",
};

const spreadsheetBackgroundColorClasses: Record<SpreadsheetColorToken, string> = {
  red: "bg-red-100 dark:bg-red-950/60",
  amber: "bg-amber-100 dark:bg-amber-950/60",
  green: "bg-emerald-100 dark:bg-emerald-950/60",
  blue: "bg-sky-100 dark:bg-sky-950/60",
  purple: "bg-violet-100 dark:bg-violet-950/60",
};

export default function SpreadsheetEditorPage() {
  const [location, navigate] = useLocation();
  const { spreadsheetId } = useParams();
  const isNew = location === "/spreadsheets/new" || spreadsheetId === "new";
  const id = Number(spreadsheetId);
  const { toast } = useToast();
  const [title, setTitle] = useState("Untitled Sheet");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [document, setDocument] = useState<SpreadsheetDocument>(() => createEmptySpreadsheetDocument());
  const [selectedAddress, setSelectedAddress] = useState("A1");
  const [rangeAnchor, setRangeAnchor] = useState("A1");
  const [rangeEnd, setRangeEnd] = useState("A1");
  const [extendSelection, setExtendSelection] = useState(false);
  const [sheetNameDraft, setSheetNameDraft] = useState("Sheet 1");
  const [pendingImport, setPendingImport] = useState<{ sheet: SpreadsheetSheet; sourceRows: number; sourceColumns: number; populatedCellCount: number; formulaCount: number; fileName: string } | null>(null);
  const [dirty, setDirty] = useState(isNew);
  const [localHistoryState, setLocalHistoryState] = useState({ canUndo: false, canRedo: false });
  const [gridViewport, setGridViewport] = useState({ scrollLeft: 0, scrollTop: 0, viewportWidth: 1200, viewportHeight: 600 });
  const importInput = useRef<HTMLInputElement>(null);
  const gridViewportRef = useRef<HTMLDivElement>(null);
  const pendingCellFocus = useRef<string | null>(null);
  const undoStack = useRef<SpreadsheetDocument[]>([]);
  const redoStack = useRef<SpreadsheetDocument[]>([]);
  usePageTitle(title || "Sheet");
  const query = useQuery<{ spreadsheet: SpreadsheetRecord }>({
    queryKey: ["/api/spreadsheets", id],
    queryFn: () => apiRequest(`/api/spreadsheets/${id}`),
    enabled: !isNew && Number.isInteger(id),
  });
  const revisions = useQuery<{ revisions: SpreadsheetRevisionRecord[]; disclosure: string }>({
    queryKey: ["/api/spreadsheets", id, "revisions"],
    queryFn: () => apiRequest(`/api/spreadsheets/${id}/revisions`),
    enabled: !isNew && Number.isInteger(id),
  });
  useEffect(() => {
    const sheet = query.data?.spreadsheet;
    if (!sheet) return;
    setTitle(sheet.title);
    setDescription(sheet.description || "");
    setCategory(sheet.category);
    setDocument(normalizeSpreadsheetDocument(sheet.content));
    setDirty(false);
    undoStack.current = [];
    redoStack.current = [];
    setLocalHistoryState({ canUndo: false, canRedo: false });
  }, [query.data?.spreadsheet.id]);

  const save = useMutation({
    mutationFn: () => apiRequest<{ spreadsheet: SpreadsheetRecord }>(isNew ? "/api/spreadsheets" : `/api/spreadsheets/${id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: !isNew && query.data?.spreadsheet.revision ? { "x-lyfeos-expected-revision": String(query.data.spreadsheet.revision) } : undefined,
      body: JSON.stringify({ title, description: description || null, category, favorite: query.data?.spreadsheet.favorite || false, content: document }),
    }),
    onSuccess: (result) => {
      setDirty(false);
      undoStack.current = []; redoStack.current = []; setLocalHistoryState({ canUndo: false, canRedo: false });
      if (!isNew) queryClient.setQueryData(["/api/spreadsheets", id], result);
      void queryClient.invalidateQueries({ queryKey: ["/api/spreadsheets", id, "revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sheet saved", description: "Values and formulas are stored in your private LyfeOS workspace." });
      if (isNew) navigate(`/spreadsheets/${result.spreadsheet.id}`, { replace: true });
    },
  });
  const restoreRevision = useMutation({
    mutationFn: (revisionNumber: number) => apiRequest<{ spreadsheet: SpreadsheetRecord }>(`/api/spreadsheets/${id}/revisions/${revisionNumber}/restore`, {
      method: "POST",
      headers: { "x-lyfeos-expected-revision": String(query.data!.spreadsheet.revision) },
    }),
    onSuccess: (result) => {
      const restored = result.spreadsheet;
      setTitle(restored.title); setDescription(restored.description || ""); setCategory(restored.category); setDocument(normalizeSpreadsheetDocument(restored.content)); setDirty(false);
      setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false); setPendingImport(null);
      undoStack.current = []; redoStack.current = []; setLocalHistoryState({ canUndo: false, canRedo: false });
      queryClient.setQueryData(["/api/spreadsheets", id], result);
      void queryClient.invalidateQueries({ queryKey: ["/api/spreadsheets", id, "revisions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: `Restored as version ${restored.revision}`, description: "The historical snapshot was copied into a new immutable version." });
    },
  });
  const activeSheet = document.sheets.find((sheet) => sheet.id === document.activeSheetId) || document.sheets[0];
  useEffect(() => setSheetNameDraft(activeSheet.name), [activeSheet.id, activeSheet.name]);
  useEffect(() => {
    const viewport = gridViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    const synchronize = () => setGridViewport({ scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, viewportWidth: viewport.clientWidth || 1200, viewportHeight: viewport.clientHeight || 600 });
    synchronize();
    const observer = new ResizeObserver(synchronize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activeSheet.id, query.isError, query.isLoading]);
  const selectedInput = activeSheet.cells[selectedAddress]?.input || "";
  const updateDocument = (next: SpreadsheetDocument) => {
    undoStack.current = [...undoStack.current.slice(-19), document];
    redoStack.current = [];
    setDocument(next); setDirty(true); setLocalHistoryState({ canUndo: true, canRedo: false });
  };
  const undoDocument = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current = [...redoStack.current.slice(-19), document];
    setDocument(previous); setDirty(true); setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1");
    setLocalHistoryState({ canUndo: undoStack.current.length > 0, canRedo: true });
  };
  const redoDocument = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current.slice(-19), document];
    setDocument(next); setDirty(true); setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1");
    setLocalHistoryState({ canUndo: true, canRedo: redoStack.current.length > 0 });
  };
  const setCell = (address: string, input: string) => {
    const cells = { ...activeSheet.cells };
    if (input) cells[address] = { ...cells[address], input };
    else delete cells[address];
    updateDocument({ ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? { ...sheet, cells } : sheet) });
  };
  const addSheet = () => {
    const id = `sheet_${Math.random().toString(36).slice(2, 12)}`;
    updateDocument({ ...document, activeSheetId: id, sheets: [...document.sheets, { id, name: nextSpreadsheetSheetName(document), rowCount: 40, columnCount: 10, cells: {} }] });
    setSelectedAddress("A1");
    setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false);
  };
  const renameActiveSheet = () => {
    try {
      updateDocument(renameSpreadsheetSheet(document, activeSheet.id, sheetNameDraft));
    } catch (error) {
      toast({ title: "Could not rename sheet", description: error instanceof Error ? error.message : "The sheet could not be renamed.", variant: "destructive" });
    }
  };
  const removeActiveSheet = () => {
    if (!window.confirm(`Remove “${activeSheet.name}” and its ${Object.keys(activeSheet.cells).length} populated cells? This is not permanent until you save.`)) return;
    try {
      const next = removeSpreadsheetSheet(document, activeSheet.id);
      updateDocument(next);
      setSelectedAddress("A1");
      setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false);
    } catch (error) {
      toast({ title: "Could not remove sheet", description: error instanceof Error ? error.message : "The sheet could not be removed.", variant: "destructive" });
    }
  };
  const selectedPosition = parseCellAddress(selectedAddress) || { column: 0, row: 0 };
  const activeCellFormat = activeSheet.cells[selectedAddress]?.format;
  const selectedRange = useMemo(() => spreadsheetRangeBounds(rangeAnchor, rangeEnd), [rangeAnchor, rangeEnd]);
  const columns = useMemo(() => Array.from({ length: activeSheet.columnCount }, (_, index) => columnLabel(index)), [activeSheet.columnCount]);
  const rows = useMemo(() => Array.from({ length: activeSheet.rowCount }, (_, index) => index + 1), [activeSheet.rowCount]);
  const viewportWindow = useMemo(() => calculateSpreadsheetViewportWindow({ rowCount: activeSheet.rowCount, columnCount: activeSheet.columnCount, ...gridViewport }), [activeSheet.columnCount, activeSheet.rowCount, gridViewport]);
  const visibleColumnIndexes = useMemo(() => Array.from({ length: viewportWindow.renderedColumnCount }, (_, index) => viewportWindow.startColumn + index), [viewportWindow]);
  const visibleRowIndexes = useMemo(() => Array.from({ length: viewportWindow.renderedRowCount }, (_, index) => viewportWindow.startRow + index), [viewportWindow]);
  const insertAxis = (axis: "row" | "column") => {
    try {
      const shifted = insertSpreadsheetAxis(activeSheet, axis, axis === "row" ? selectedPosition.row : selectedPosition.column);
      const withShiftedCells = { ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? shifted : sheet) };
      updateDocument(shiftSpreadsheetChartsForAxis(withShiftedCells, activeSheet.id, axis, axis === "row" ? selectedPosition.row : selectedPosition.column));
      setRangeAnchor(selectedAddress); setRangeEnd(selectedAddress); setExtendSelection(false);
    } catch (error) {
      toast({ title: `Could not insert ${axis}`, description: error instanceof Error ? error.message : "The sheet could not be changed.", variant: "destructive" });
    }
  };
  const addChart = () => {
    try {
      if (selectedRange.endRow <= selectedRange.startRow || selectedRange.endColumn <= selectedRange.startColumn) {
        throw new Error("Select at least two rows and two columns. Use the first row for series names and the first column for observation labels.");
      }
      const id = `chart_${Math.random().toString(36).slice(2, 12)}`;
      updateDocument(createSpreadsheetChart(document, {
        id,
        title: `${activeSheet.name} chart ${document.charts.length + 1}`,
        kind: "line",
        sheetId: activeSheet.id,
        range: {
          startRow: selectedRange.startRow,
          endRow: selectedRange.endRow,
          startColumn: selectedRange.startColumn,
          endColumn: selectedRange.endColumn,
        },
      }));
      toast({ title: "Live chart added", description: "The chart reads this selected range directly. Review it, then save the spreadsheet." });
    } catch (error) {
      toast({ title: "Could not add chart", description: error instanceof Error ? error.message : "The selected range could not become a chart.", variant: "destructive" });
    }
  };
  const reviseChart = (chartId: string, patch: Parameters<typeof updateSpreadsheetChart>[2]) => {
    try { updateDocument(updateSpreadsheetChart(document, chartId, patch)); }
    catch (error) { toast({ title: "Could not update chart", description: error instanceof Error ? error.message : "The chart could not be updated.", variant: "destructive" }); }
  };
  const deleteChart = (chartId: string, chartTitle: string) => {
    if (!window.confirm(`Remove chart “${chartTitle}”? Its source cells will not be changed.`)) return;
    try { updateDocument(removeSpreadsheetChart(document, chartId)); }
    catch (error) { toast({ title: "Could not remove chart", description: error instanceof Error ? error.message : "The chart could not be removed.", variant: "destructive" }); }
  };
  const selectCell = (address: string, extendRange: boolean) => {
    setSelectedAddress(address);
    if (extendRange || extendSelection) { setRangeEnd(address); setExtendSelection(false); }
    else { setRangeAnchor(address); setRangeEnd(address); }
  };
  const ensureCellVisible = (address: string) => {
    const viewport = gridViewportRef.current;
    const position = parseCellAddress(address);
    if (!viewport || !position) return;
    const left = SPREADSHEET_ROW_HEADER_WIDTH + position.column * SPREADSHEET_COLUMN_WIDTH;
    const right = left + SPREADSHEET_COLUMN_WIDTH;
    const top = SPREADSHEET_COLUMN_HEADER_HEIGHT + position.row * SPREADSHEET_ROW_HEIGHT;
    const bottom = top + SPREADSHEET_ROW_HEIGHT;
    if (left < viewport.scrollLeft + SPREADSHEET_ROW_HEADER_WIDTH) viewport.scrollLeft = Math.max(0, left - SPREADSHEET_ROW_HEADER_WIDTH);
    else if (right > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = right - viewport.clientWidth;
    if (top < viewport.scrollTop + SPREADSHEET_COLUMN_HEADER_HEIGHT) viewport.scrollTop = Math.max(0, top - SPREADSHEET_COLUMN_HEADER_HEIGHT);
    else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
  };
  const navigateCellWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, address: string) => {
    const position = parseCellAddress(address);
    if (!position) return;
    const direction: SpreadsheetNavigationDirection | null = event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : null;
    if (!direction) return;
    event.preventDefault();
    const nextAddress = moveSpreadsheetAddress(address, direction, activeSheet.rowCount, activeSheet.columnCount);
    selectCell(nextAddress, event.shiftKey);
    pendingCellFocus.current = nextAddress;
    ensureCellVisible(nextAddress);
  };
  useEffect(() => {
    const address = pendingCellFocus.current;
    if (!address) return;
    const cell = gridViewportRef.current?.querySelector<HTMLButtonElement>(`[data-sheet-address="${address}"]`);
    if (!cell) return;
    cell.focus();
    pendingCellFocus.current = null;
  }, [gridViewport.scrollLeft, gridViewport.scrollTop, selectedAddress]);
  const copyRange = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard writing is unavailable in this browser.");
      await navigator.clipboard.writeText(serializeSpreadsheetRange(activeSheet, rangeAnchor, rangeEnd));
      toast({ title: "Range copied", description: `${selectedRange.cellCount} cell${selectedRange.cellCount === 1 ? "" : "s"} copied as tabular text.` });
    } catch (error) {
      toast({ title: "Could not copy range", description: error instanceof Error ? error.message : "Clipboard writing failed.", variant: "destructive" });
    }
  };
  const pasteRange = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard reading is unavailable in this browser.");
      const pasted = pasteSpreadsheetRange(activeSheet, selectedAddress, await navigator.clipboard.readText());
      updateDocument({ ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? pasted.sheet : sheet) });
      setRangeAnchor(selectedAddress); setRangeEnd(pasted.endAddress);
      toast({ title: "Range pasted", description: `${pasted.rowCount} row${pasted.rowCount === 1 ? "" : "s"} × ${pasted.columnCount} column${pasted.columnCount === 1 ? "" : "s"}. Review before saving.` });
    } catch (error) {
      toast({ title: "Could not paste range", description: error instanceof Error ? error.message : "Clipboard reading failed.", variant: "destructive" });
    }
  };
  const applyRangeFormat = (patch: Parameters<typeof formatSpreadsheetRange>[3]) => {
    try {
      const formatted = formatSpreadsheetRange(activeSheet, rangeAnchor, rangeEnd, patch);
      if (!formatted.changedCellCount) {
        toast({ title: "No populated cells selected", description: "Enter a value first, then apply formatting to it." });
        return;
      }
      updateDocument({ ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? formatted.sheet : sheet) });
    } catch (error) {
      toast({ title: "Could not format range", description: error instanceof Error ? error.message : "The selected cells could not be formatted.", variant: "destructive" });
    }
  };
  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (document.sheets.length >= 20) throw new Error("Remove a sheet tab before importing another one.");
      const format = file.name.toLocaleLowerCase().endsWith(".csv") ? "csv" : file.name.toLocaleLowerCase().endsWith(".tsv") ? "tsv" : null;
      if (!format) throw new Error("Choose a .csv or .tsv file.");
      if (file.size > 2_000_000) throw new Error("Import files can be at most 2 MB.");
      const id = `sheet_${Math.random().toString(36).slice(2, 12)}`;
      const requestedName = file.name.replace(/\.(csv|tsv)$/i, "");
      setPendingImport({ ...createSpreadsheetSheetFromDelimited(id, uniqueSpreadsheetSheetName(document, requestedName), await file.text(), format), fileName: file.name });
    } catch (error) {
      setPendingImport(null);
      toast({ title: "Could not review import", description: error instanceof Error ? error.message : "The file could not be read.", variant: "destructive" });
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };
  const confirmImport = () => {
    if (!pendingImport) return;
    try {
      if (document.sheets.length >= 20) throw new Error("Remove a sheet tab before adding this import.");
      const sheet = { ...pendingImport.sheet, name: uniqueSpreadsheetSheetName(document, pendingImport.sheet.name) };
      updateDocument({ ...document, activeSheetId: sheet.id, sheets: [...document.sheets, sheet] });
      setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false); setPendingImport(null);
      toast({ title: "Import added as a new tab", description: "Review the imported cells, then save the spreadsheet when they are correct." });
    } catch (error) {
      toast({ title: "Could not add import", description: error instanceof Error ? error.message : "The import could not be added.", variant: "destructive" });
    }
  };
  const selectedResult = useMemo(() => formatSpreadsheetDisplayValue(evaluateSpreadsheetCell(document, activeSheet.id, selectedAddress), activeSheet.cells[selectedAddress]?.format?.numberFormat), [activeSheet.cells, activeSheet.id, document, selectedAddress]);

  const exportCsv = () => {
    const lines = rows.map((row) => columns.map((column) => {
      const address = `${column}${row}`;
      const raw = activeSheet.cells[address]?.input || "";
      const value = raw.startsWith("=") ? evaluateSpreadsheetCell(document, activeSheet.id, address) : (/^[=+\-@]/.test(raw) ? `'${raw}` : raw);
      return `"${value.replaceAll('"', '""')}"`;
    }).join(","));
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "lyfeos-sheet"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (query.isLoading) return <div className="container py-8 text-sm text-muted-foreground">Loading sheet…</div>;
  if (query.isError) return <div className="container py-8 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Sheet unavailable."}</div>;

  return <div data-testid="sheet-editor" className="container max-w-[1500px] py-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href="/spreadsheets"><Button variant="outline">Sheets</Button></Link>
        <Input aria-label="Sheet title" value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} className="max-w-md font-medium" />
        {!isNew && query.data?.spreadsheet.revision && <span data-testid="sheet-revision" className="whitespace-nowrap text-xs text-muted-foreground">version {query.data.spreadsheet.revision}</span>}
        {dirty && <span className="text-xs text-amber-400">unsaved</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="icon" variant="outline" aria-label="Undo last unsaved spreadsheet change" disabled={!localHistoryState.canUndo} onClick={undoDocument}><Undo2 className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" aria-label="Redo last undone spreadsheet change" disabled={!localHistoryState.canRedo} onClick={redoDocument}><Redo2 className="h-4 w-4" /></Button>
        <input ref={importInput} className="sr-only" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" aria-label="Choose a CSV or TSV file" onChange={(event) => void readImportFile(event.target.files?.[0])} />
        <Button variant="outline" disabled={document.sheets.length >= 20} onClick={() => importInput.current?.click()}><Upload className="mr-1 h-4 w-4" />Import</Button>
        <Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />CSV</Button>
        <Button data-testid="sheet-save" disabled={!dirty || !title.trim() || save.isPending} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />{save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
    {save.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{save.error instanceof Error ? save.error.message : "The sheet could not be saved."} If this sheet changed in another session, reload it before applying your changes again.</p>}
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <Input aria-label="Sheet category" value={category} maxLength={80} onChange={(event) => { setCategory(event.target.value); setDirty(true); }} placeholder="Category" />
      <Textarea aria-label="Sheet description" value={description} maxLength={800} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} placeholder="What is this sheet for?" className="min-h-9 resize-y py-2" />
    </div>
    {pendingImport && <section className="rounded-lg border border-primary/20 bg-primary/5 p-3" aria-labelledby="sheet-import-review-heading">
      <h2 id="sheet-import-review-heading" className="text-sm font-medium">Review local import: {pendingImport.fileName}</h2>
      <p className="mt-1 text-xs text-muted-foreground">New tab “{pendingImport.sheet.name}” · {pendingImport.sourceRows} rows × {pendingImport.sourceColumns} columns · {pendingImport.populatedCellCount} populated cells · {pendingImport.formulaCount} formula inputs. The file stays on this device and nothing changes until you add the tab, review it, and save.</p>
      <div className="mt-2 flex gap-2"><Button type="button" size="sm" onClick={confirmImport}>Add as new tab</Button><Button type="button" size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancel</Button></div>
    </section>}
    <div className="rounded-xl border border-primary/15 bg-card/30 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 p-2">
        <span className="w-12 rounded border border-primary/15 bg-background/40 px-2 py-1 text-center font-mono text-xs">{selectedAddress}</span>
        <Input aria-label="Cell input or formula" value={selectedInput} onChange={(event) => setCell(selectedAddress, event.target.value)} placeholder="Value or formula, for example =SUM(A1:A5)" className="h-8 min-w-52 flex-1 font-mono text-xs" />
        {selectedInput.startsWith("=") && <span className="max-w-40 truncate text-xs text-muted-foreground">= {selectedResult}</span>}
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" aria-label={`Insert row before row ${selectedPosition.row + 1}`} disabled={activeSheet.rowCount >= 500} onClick={() => insertAxis("row")}><Plus className="mr-1 h-3.5 w-3.5" />Row</Button>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" aria-label={`Insert column before column ${columnLabel(selectedPosition.column)}`} disabled={activeSheet.columnCount >= 100} onClick={() => insertAxis("column")}><Plus className="mr-1 h-3.5 w-3.5" />Column</Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`Copy selected range of ${selectedRange.cellCount} cells`} onClick={() => void copyRange()}><ClipboardCopy className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`Paste range starting at ${selectedAddress}`} onClick={() => void pasteRange()}><ClipboardPaste className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant={extendSelection ? "default" : "outline"} className="h-8 shrink-0" aria-pressed={extendSelection} aria-label={`Extend range from ${rangeAnchor}`} onClick={() => setExtendSelection((current) => !current)}>Extend</Button>
        <Button data-testid="sheet-chart-create" type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={document.charts.length >= 20} aria-label={`Create chart from selected range of ${selectedRange.cellCount} cells`} onClick={addChart}><BarChart3 className="mr-1 h-3.5 w-3.5" />Chart</Button>
        <Button type="button" size="icon" variant={activeCellFormat?.bold ? "default" : "outline"} className="h-8 w-8 shrink-0" aria-label="Toggle bold on selected populated cells" aria-pressed={Boolean(activeCellFormat?.bold)} onClick={() => applyRangeFormat({ bold: !activeCellFormat?.bold })}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant={activeCellFormat?.italic ? "default" : "outline"} className="h-8 w-8 shrink-0" aria-label="Toggle italic on selected populated cells" aria-pressed={Boolean(activeCellFormat?.italic)} onClick={() => applyRangeFormat({ italic: !activeCellFormat?.italic })}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Align selected populated cells left" onClick={() => applyRangeFormat({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Align selected populated cells center" onClick={() => applyRangeFormat({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Align selected populated cells right" onClick={() => applyRangeFormat({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
        <Select value={activeCellFormat?.numberFormat || "automatic"} onValueChange={(value) => applyRangeFormat({ numberFormat: value === "automatic" ? undefined : value as SpreadsheetNumberFormat })}>
          <SelectTrigger className="h-8 w-[112px] shrink-0 text-xs" aria-label="Number display format"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="decimal">Number 0.00</SelectItem><SelectItem value="percent">Percent</SelectItem><SelectItem value="currency_usd">USD currency</SelectItem></SelectContent>
        </Select>
        <Select value={activeCellFormat?.textColor || "default"} onValueChange={(value) => applyRangeFormat({ textColor: value === "default" ? undefined : value as SpreadsheetColorToken })}>
          <SelectTrigger className="h-8 w-[104px] shrink-0 text-xs" aria-label="Text color"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="default">Text default</SelectItem><SelectItem value="red">Text red</SelectItem><SelectItem value="amber">Text amber</SelectItem><SelectItem value="green">Text green</SelectItem><SelectItem value="blue">Text blue</SelectItem><SelectItem value="purple">Text purple</SelectItem></SelectContent>
        </Select>
        <Select value={activeCellFormat?.backgroundColor || "default"} onValueChange={(value) => applyRangeFormat({ backgroundColor: value === "default" ? undefined : value as SpreadsheetColorToken })}>
          <SelectTrigger className="h-8 w-[104px] shrink-0 text-xs" aria-label="Cell fill color"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="default">Fill default</SelectItem><SelectItem value="red">Fill red</SelectItem><SelectItem value="amber">Fill amber</SelectItem><SelectItem value="green">Fill green</SelectItem><SelectItem value="blue">Fill blue</SelectItem><SelectItem value="purple">Fill purple</SelectItem></SelectContent>
        </Select>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Clear formatting from selected populated cells" onClick={() => applyRangeFormat(null)}><Eraser className="h-3.5 w-3.5" /></Button>
      </div>
      <div data-testid="sheet-grid" ref={gridViewportRef} className="overflow-auto max-h-[65vh]" role="region" aria-label={`${activeSheet.name} spreadsheet grid`} onScroll={(event) => setGridViewport({ scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop, viewportWidth: event.currentTarget.clientWidth || 1200, viewportHeight: event.currentTarget.clientHeight || 600 })}>
        <div className="relative" style={{ width: viewportWindow.totalWidth, height: viewportWindow.totalHeight }}>
          <div className="absolute z-30 border-b border-r border-primary/15 bg-background" style={{ left: gridViewport.scrollLeft, top: gridViewport.scrollTop, width: SPREADSHEET_ROW_HEADER_WIDTH, height: SPREADSHEET_COLUMN_HEADER_HEIGHT }} />
          {visibleColumnIndexes.map((columnIndex) => <div key={`column-${columnIndex}`} className="absolute z-20 flex items-center justify-center border-b border-r border-primary/15 bg-background font-mono text-xs text-muted-foreground" style={{ left: SPREADSHEET_ROW_HEADER_WIDTH + columnIndex * SPREADSHEET_COLUMN_WIDTH, top: gridViewport.scrollTop, width: SPREADSHEET_COLUMN_WIDTH, height: SPREADSHEET_COLUMN_HEADER_HEIGHT }}>{columnLabel(columnIndex)}</div>)}
          {visibleRowIndexes.flatMap((rowIndex) => [
            <div key={`row-${rowIndex}`} className="absolute z-10 flex items-center justify-center border-b border-r border-primary/15 bg-background font-mono text-xs text-muted-foreground" style={{ left: gridViewport.scrollLeft, top: SPREADSHEET_COLUMN_HEADER_HEIGHT + rowIndex * SPREADSHEET_ROW_HEIGHT, width: SPREADSHEET_ROW_HEADER_WIDTH, height: SPREADSHEET_ROW_HEIGHT }}>{rowIndex + 1}</div>,
            ...visibleColumnIndexes.map((columnIndex) => {
              const address = `${columnLabel(columnIndex)}${rowIndex + 1}`;
              const raw = activeSheet.cells[address]?.input || "";
              const format = activeSheet.cells[address]?.format;
              const display = formatSpreadsheetDisplayValue(raw.startsWith("=") ? evaluateSpreadsheetCell(document, activeSheet.id, address) : raw, format?.numberFormat);
              const position = { row: rowIndex, column: columnIndex };
              const inRange = position.row >= selectedRange.startRow && position.row <= selectedRange.endRow && position.column >= selectedRange.startColumn && position.column <= selectedRange.endColumn;
              const alignment = format?.align === "center" ? "text-center" : format?.align === "right" ? "text-right" : "text-left";
              const textColor = format?.textColor ? spreadsheetTextColorClasses[format.textColor] : "";
              const backgroundColor = format?.backgroundColor ? spreadsheetBackgroundColorClasses[format.backgroundColor] : "";
              const selection = selectedAddress === address ? `border-primary ring-1 ring-inset ring-primary ${backgroundColor ? "" : "bg-primary/15"}` : inRange ? `border-primary/20 ${backgroundColor ? "" : "bg-primary/5"}` : `border-primary/10 ${backgroundColor ? "" : "hover:bg-primary/5"}`;
              return <button key={address} type="button" data-sheet-address={address} aria-label={`${address}: ${display || "empty"}`} aria-selected={selectedAddress === address} title={raw || address} onClick={(event) => selectCell(address, event.shiftKey)} onKeyDown={(event) => navigateCellWithKeyboard(event, address)} className={`absolute overflow-hidden border-b border-r px-2 text-xs ${alignment} ${backgroundColor} ${selection}`} style={{ left: SPREADSHEET_ROW_HEADER_WIDTH + columnIndex * SPREADSHEET_COLUMN_WIDTH, top: SPREADSHEET_COLUMN_HEADER_HEIGHT + rowIndex * SPREADSHEET_ROW_HEIGHT, width: SPREADSHEET_COLUMN_WIDTH, height: SPREADSHEET_ROW_HEIGHT }}><span className={`${display.startsWith("#") ? "text-destructive" : textColor} ${format?.bold ? "font-semibold" : ""} ${format?.italic ? "italic" : ""}`}>{display}</span></button>;
            }),
          ])}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-primary/15 bg-background/40 p-2">
        {document.sheets.map((sheet) => <button key={sheet.id} type="button" onClick={() => { if (sheet.id !== activeSheet.id) updateDocument({ ...document, activeSheetId: sheet.id }); setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false); }} className={`max-w-40 truncate rounded px-3 py-1 text-xs ${sheet.id === activeSheet.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-primary/10"}`} title={sheet.name}>{sheet.name}</button>)}
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Add sheet tab" disabled={document.sheets.length >= 20} onClick={addSheet}><Plus className="h-4 w-4" /></Button>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Input aria-label="Active sheet name" value={sheetNameDraft} maxLength={80} onChange={(event) => setSheetNameDraft(event.target.value)} className="h-7 w-36 text-xs" />
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={!sheetNameDraft.trim() || sheetNameDraft.trim() === activeSheet.name} onClick={renameActiveSheet}>Rename</Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove sheet ${activeSheet.name}`} disabled={document.sheets.length <= 1} onClick={removeActiveSheet}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">The grid renders only the visible rows and columns plus a small safety margin, even at the 500-row × 100-column limit. Use arrow keys to move one cell at a time and Shift+Arrow to extend a selection; choose Extend and then a cell on touch devices. Undo and Redo retain up to 20 unsaved grid, tab, and chart changes on this device and reset after save, reload, or restore. Shift-click also selects a rectangular range for copy, formatting, or a chart. Number, percent, USD currency, text-color, and fill-color formats change display only; raw values and formula inputs remain authoritative. Formatting applies only to populated cells; clipboard and CSV/TSV transfer values and formulas, not presentation, while plain-text paste preserves existing destination formatting. Paste starts at the active cell and remains unsaved until you review and save. Insertions preserve populated cells, formatting, affected formula references, and chart source alignment. Formulas support cell references, +, −, ×, ÷, parentheses, and SUM, AVERAGE, MIN, or MAX. CSV export writes unformatted calculated formula results and protects text beginning with spreadsheet-executable prefixes.</p>
    {document.charts.length > 0 && <section data-testid="sheet-charts" aria-labelledby="sheet-charts-heading" className="space-y-3">
      <div><h2 id="sheet-charts-heading" className="text-lg font-semibold">Charts</h2><p className="text-xs text-muted-foreground">Charts are saved definitions over canonical sheet cells. Editing a source cell updates its chart; missing values remain missing rather than becoming zero.</p></div>
      <div className="grid gap-3 xl:grid-cols-2">{document.charts.map((chart) => <SpreadsheetChartCard key={chart.id} document={document} chart={chart} onUpdate={(patch) => reviseChart(chart.id, patch)} onRemove={() => deleteChart(chart.id, chart.title)} />)}</div>
    </section>}
    {!isNew && <details data-testid="sheet-history" className="rounded-xl border border-primary/15 bg-card/30 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><History className="h-4 w-4" />Saved version history</summary>
      <p className="mt-2 text-xs text-muted-foreground">Saved versions are immutable. Restoring copies the selected snapshot into a new version; it never deletes or rewrites history. The 100 most recent versions are shown.</p>
      {revisions.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading saved versions…</p>}
      {revisions.isError && <p role="alert" className="mt-3 text-sm text-destructive">{revisions.error instanceof Error ? revisions.error.message : "Saved versions are unavailable."}</p>}
      {restoreRevision.isError && <p role="alert" className="mt-3 text-sm text-destructive">{restoreRevision.error instanceof Error ? restoreRevision.error.message : "That version could not be restored."} Reload the sheet if another session saved a newer version.</p>}
      {revisions.data?.revisions && <ol className="mt-3 divide-y divide-primary/10">
        {revisions.data.revisions.map((revision) => {
          const isCurrent = revision.revisionNumber === query.data?.spreadsheet.revision;
          const action = revision.action === "restored" ? `restored from version ${revision.sourceRevision}` : revision.action;
          return <li data-testid={`sheet-history-version-${revision.revisionNumber}`} key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium">Version {revision.revisionNumber}{isCurrent ? " · current" : ""}</p><p className="text-xs text-muted-foreground">{action} · {new Date(revision.createdAt).toLocaleString()}</p></div>
            <Button type="button" size="sm" variant="outline" disabled={isCurrent || restoreRevision.isPending || dirty} onClick={() => { if (window.confirm(`Restore version ${revision.revisionNumber} as a new saved version? Your existing history will remain available.`)) restoreRevision.mutate(revision.revisionNumber); }}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restore</Button>
          </li>;
        })}
      </ol>}
      {dirty && <p className="mt-2 text-xs text-amber-400">Save or discard your current unsaved changes before restoring a saved version.</p>}
    </details>}
  </div>;
}
