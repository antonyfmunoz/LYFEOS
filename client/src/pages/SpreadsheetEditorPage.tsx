import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Plus, Save } from "lucide-react";
import type { SpreadsheetDocument } from "@shared/spreadsheets";
import { createEmptySpreadsheetDocument, normalizeSpreadsheetDocument } from "@shared/spreadsheets";
import { columnLabel, evaluateSpreadsheetCell, insertSpreadsheetAxis, parseCellAddress } from "@/lib/spreadsheetFormula";
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
    updateDocument({ ...document, activeSheetId: id, sheets: [...document.sheets, { id, name: `Sheet ${document.sheets.length + 1}`, rowCount: 40, columnCount: 10, cells: {} }] });
    setSelectedAddress("A1");
  };
  const selectedPosition = parseCellAddress(selectedAddress) || { column: 0, row: 0 };
  const columns = useMemo(() => Array.from({ length: activeSheet.columnCount }, (_, index) => columnLabel(index)), [activeSheet.columnCount]);
  const rows = useMemo(() => Array.from({ length: activeSheet.rowCount }, (_, index) => index + 1), [activeSheet.rowCount]);
  const insertAxis = (axis: "row" | "column") => {
    try {
      const shifted = insertSpreadsheetAxis(activeSheet, axis, axis === "row" ? selectedPosition.row : selectedPosition.column);
      updateDocument({ ...document, sheets: document.sheets.map((sheet) => sheet.id === activeSheet.id ? shifted : sheet) });
    } catch (error) {
      toast({ title: `Could not insert ${axis}`, description: error instanceof Error ? error.message : "The sheet could not be changed.", variant: "destructive" });
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
              return <button key={address} type="button" title={raw || address} onClick={() => setSelectedAddress(address)} className={`h-9 overflow-hidden border-b border-r px-2 text-left text-xs ${selectedAddress === address ? "border-primary bg-primary/10 ring-1 ring-inset ring-primary" : "border-primary/10 hover:bg-primary/5"}`}><span className={display.startsWith("#") ? "text-destructive" : ""}>{display}</span></button>;
            }),
          ])}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-primary/15 bg-background/40 p-2">
        {document.sheets.map((sheet) => <button key={sheet.id} type="button" onClick={() => updateDocument({ ...document, activeSheetId: sheet.id })} className={`rounded px-3 py-1 text-xs ${sheet.id === activeSheet.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-primary/10"}`}>{sheet.name}</button>)}
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Add sheet tab" disabled={document.sheets.length >= 20} onClick={addSheet}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Insertions preserve populated cells and shift affected formula references. Formulas support cell references, +, −, ×, ÷, parentheses, and SUM, AVERAGE, MIN, or MAX. CSV export writes calculated formula results and protects text beginning with spreadsheet-executable prefixes.</p>
  </div>;
}
