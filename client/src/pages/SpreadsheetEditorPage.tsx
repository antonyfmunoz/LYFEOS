import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCopy, ClipboardPaste, Download, Plus, Save, Trash2 } from "lucide-react";
import type { SpreadsheetDocument } from "@shared/spreadsheets";
import { createEmptySpreadsheetDocument, nextSpreadsheetSheetName, normalizeSpreadsheetDocument, removeSpreadsheetSheet, renameSpreadsheetSheet } from "@shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, insertSpreadsheetAxis, parseCellAddress } from "@/lib/spreadsheetFormula";
import { pasteSpreadsheetRange, serializeSpreadsheetRange, spreadsheetRangeBounds } from "@/lib/spreadsheetRange";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type SpreadsheetRecord = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  favorite: boolean;
  content: unknown;
};

export default function SpreadsheetEditorPage() {
  const { spreadsheetId } = useParams();
  const isNew = spreadsheetId === "new";
  const id = Number(spreadsheetId);
  const [, navigate] = useLocation();
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
  const [dirty, setDirty] = useState(isNew);
  usePageTitle(title || "Sheet");
  const query = useQuery<{ spreadsheet: SpreadsheetRecord }>({
    queryKey: ["/api/spreadsheets", id],
    queryFn: () => apiRequest(`/api/spreadsheets/${id}`),
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
  }, [query.data?.spreadsheet.id]);

  const save = useMutation({
    mutationFn: () => apiRequest<{ spreadsheet: SpreadsheetRecord }>(isNew ? "/api/spreadsheets" : `/api/spreadsheets/${id}`, {
      method: isNew ? "POST" : "PATCH",
      body: JSON.stringify({ title, description: description || null, category, favorite: query.data?.spreadsheet.favorite || false, content: document }),
    }),
    onSuccess: (result) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sheet saved", description: "Values and formulas are stored in your private LyfeOS workspace." });
      if (isNew) navigate(`/spreadsheets/${result.spreadsheet.id}`, { replace: true });
    },
  });
  const activeSheet = document.sheets.find((sheet) => sheet.id === document.activeSheetId) || document.sheets[0];
  useEffect(() => setSheetNameDraft(activeSheet.name), [activeSheet.id, activeSheet.name]);
  const selectedInput = activeSheet.cells[selectedAddress]?.input || "";
  const updateDocument = (next: SpreadsheetDocument) => { setDocument(next); setDirty(true); };
  const setCell = (address: string, input: string) => {
    const cells = { ...activeSheet.cells };
    if (input) cells[address] = { input };
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
  const selectedRange = useMemo(() => spreadsheetRangeBounds(rangeAnchor, rangeEnd), [rangeAnchor, rangeEnd]);
  const columns = useMemo(() => Array.from({ length: activeSheet.columnCount }, (_, index) => columnLabel(index)), [activeSheet.columnCount]);
  const rows = useMemo(() => Array.from({ length: activeSheet.rowCount }, (_, index) => index + 1), [activeSheet.rowCount]);
  const insertAxis = (axis: "row" | "column") => {
    try {
      const shifted = insertSpreadsheetAxis(activeSheet, axis, axis === "row" ? selectedPosition.row : selectedPosition.column);
      updateDocument({ ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? shifted : sheet) });
      setRangeAnchor(selectedAddress); setRangeEnd(selectedAddress); setExtendSelection(false);
    } catch (error) {
      toast({ title: `Could not insert ${axis}`, description: error instanceof Error ? error.message : "The sheet could not be changed.", variant: "destructive" });
    }
  };
  const selectCell = (address: string, extendRange: boolean) => {
    setSelectedAddress(address);
    if (extendRange || extendSelection) { setRangeEnd(address); setExtendSelection(false); }
    else { setRangeAnchor(address); setRangeEnd(address); }
  };
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
  const selectedResult = useMemo(() => evaluateSpreadsheetCell(document, activeSheet.id, selectedAddress), [activeSheet.id, document, selectedAddress]);

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

  return <div className="container max-w-[1500px] py-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href="/spreadsheets"><Button variant="outline">Sheets</Button></Link>
        <Input aria-label="Sheet title" value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} className="max-w-md font-medium" />
        {dirty && <span className="text-xs text-amber-400">unsaved</span>}
      </div>
      <div className="flex gap-2"><Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />CSV</Button><Button disabled={!dirty || !title.trim() || save.isPending} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />{save.isPending ? "Saving…" : "Save"}</Button></div>
    </div>
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <Input aria-label="Sheet category" value={category} maxLength={80} onChange={(event) => { setCategory(event.target.value); setDirty(true); }} placeholder="Category" />
      <Textarea aria-label="Sheet description" value={description} maxLength={800} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} placeholder="What is this sheet for?" className="min-h-9 resize-y py-2" />
    </div>
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
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <div className="grid w-max" style={{ gridTemplateColumns: `48px repeat(${columns.length}, 120px)` }}>
          <div className="sticky left-0 top-0 z-30 h-8 border-b border-r border-primary/15 bg-background" />
          {columns.map((column) => <div key={column} className="sticky top-0 z-20 flex h-8 items-center justify-center border-b border-r border-primary/15 bg-background font-mono text-xs text-muted-foreground">{column}</div>)}
          {rows.flatMap((row) => [
            <div key={`row-${row}`} className="sticky left-0 z-10 flex h-9 items-center justify-center border-b border-r border-primary/15 bg-background font-mono text-xs text-muted-foreground">{row}</div>,
            ...columns.map((column) => {
              const address = `${column}${row}`;
              const raw = activeSheet.cells[address]?.input || "";
              const display = raw.startsWith("=") ? evaluateSpreadsheetCell(document, activeSheet.id, address) : raw;
              const position = { row: row - 1, column: parseCellAddress(address)!.column };
              const inRange = position.row >= selectedRange.startRow && position.row <= selectedRange.endRow && position.column >= selectedRange.startColumn && position.column <= selectedRange.endColumn;
              return <button key={address} type="button" title={raw || address} onClick={(event) => selectCell(address, event.shiftKey)} className={`h-9 overflow-hidden border-b border-r px-2 text-left text-xs ${selectedAddress === address ? "border-primary bg-primary/15 ring-1 ring-inset ring-primary" : inRange ? "border-primary/20 bg-primary/5" : "border-primary/10 hover:bg-primary/5"}`}><span className={display.startsWith("#") ? "text-destructive" : ""}>{display}</span></button>;
            }),
          ])}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-primary/15 bg-background/40 p-2">
        {document.sheets.map((sheet) => <button key={sheet.id} type="button" onClick={() => { updateDocument({ ...document, activeSheetId: sheet.id }); setSelectedAddress("A1"); setRangeAnchor("A1"); setRangeEnd("A1"); setExtendSelection(false); }} className={`max-w-40 truncate rounded px-3 py-1 text-xs ${sheet.id === activeSheet.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-primary/10"}`} title={sheet.name}>{sheet.name}</button>)}
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Add sheet tab" disabled={document.sheets.length >= 20} onClick={addSheet}><Plus className="h-4 w-4" /></Button>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Input aria-label="Active sheet name" value={sheetNameDraft} maxLength={80} onChange={(event) => setSheetNameDraft(event.target.value)} className="h-7 w-36 text-xs" />
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={!sheetNameDraft.trim() || sheetNameDraft.trim() === activeSheet.name} onClick={renameActiveSheet}>Rename</Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove sheet ${activeSheet.name}`} disabled={document.sheets.length <= 1} onClick={removeActiveSheet}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Shift-click, or choose Extend and then a cell on touch devices, to select a rectangular range for copy. Paste starts at the active cell and remains unsaved until you review and save. Insertions preserve populated cells and shift affected formula references. Formulas support cell references, +, −, ×, ÷, parentheses, and SUM, AVERAGE, MIN, or MAX. CSV export writes calculated formula results and protects text beginning with spreadsheet-executable prefixes.</p>
  </div>;
}
