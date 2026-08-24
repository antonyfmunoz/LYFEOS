import type { WorkspaceColumn, WorkspaceRowValues } from "@shared/tables";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function WorkspaceFieldInput({ column, values, onChange }: { column: WorkspaceColumn; values: WorkspaceRowValues; onChange: (value: unknown) => void }) {
  const value = values[column.id];
  if (column.type === "boolean") return <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />{column.name}</label>;
  if (column.type === "select") return <select aria-label={column.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm"><option value="">Select…</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === "text") return <Textarea aria-label={column.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder={column.name} className="min-h-9 resize-y py-2" />;
  return <Input aria-label={column.name} type={column.type === "number" ? "number" : column.type === "date" ? "date" : "url"} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(column.type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)} placeholder={column.name} />;
}
