import { isWorkspaceComputedColumn, type WorkspaceColumn, type WorkspaceRelationOption, type WorkspaceRowValues } from "@shared/tables";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function WorkspaceFieldInput({ column, values, onChange, relationOptions = [] }: { column: WorkspaceColumn; values: WorkspaceRowValues; onChange: (value: unknown) => void; relationOptions?: WorkspaceRelationOption[] }) {
  const value = values[column.id];
  if (isWorkspaceComputedColumn(column)) return <div className="flex min-h-9 items-center rounded-md border border-primary/10 bg-muted/20 px-2 text-xs text-muted-foreground">Calculated after the row is saved</div>;
  if (column.type === "relation") {
    const selected = Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
    return <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-primary/20 bg-background p-2" role="group" aria-label={column.name}>{relationOptions.map((option) => <label key={option.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} /><span className="truncate">{option.label}</span><span className="ml-auto text-[10px] text-muted-foreground">#{option.id}</span></label>)}{!relationOptions.length ? <p className="text-xs text-muted-foreground">No target rows are available yet.</p> : null}</div>;
  }
  if (column.type === "boolean") return <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />{column.name}</label>;
  if (column.type === "select") return <select aria-label={column.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm"><option value="">Select…</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === "text") return <Textarea aria-label={column.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder={column.name} className="min-h-9 resize-y py-2" />;
  return <Input aria-label={column.name} type={column.type === "number" ? "number" : column.type === "date" ? "date" : "url"} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(column.type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)} placeholder={column.name} />;
}
