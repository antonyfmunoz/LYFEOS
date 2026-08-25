import type { WorkspaceColumn, WorkspaceDatabaseDefinition } from "@shared/tables";
import { isWorkspaceComputedColumn } from "@shared/tables";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DatabaseChoice = { id: number; title: string; definition: WorkspaceDatabaseDefinition };
type Props = {
  currentDatabaseId: number;
  column: WorkspaceColumn;
  definition: WorkspaceDatabaseDefinition;
  databases: DatabaseChoice[];
  canRemove: boolean;
  onChange: (changes: Partial<WorkspaceColumn>) => void;
  onRemove: () => void;
};

const storedScalar = (column: WorkspaceColumn) => ["text", "number", "boolean", "date", "select", "url"].includes(column.type);

export function WorkspaceColumnEditor({ currentDatabaseId, column, definition, databases, canRemove, onChange, onRemove }: Props) {
  const tableDefinition = (databaseId: number) => databaseId === currentDatabaseId ? definition : databases.find((database) => database.id === databaseId)?.definition;
  const availableDatabases = databases.filter((database) => tableDefinition(database.id)?.columns.some(storedScalar));
  const relationColumns = definition.columns.filter((candidate) => candidate.type === "relation" && candidate.relation);
  const usedByRollup = definition.columns.some((candidate) => candidate.type === "rollup" && candidate.rollup?.relationColumnId === column.id);
  const changeType = (type: WorkspaceColumn["type"]) => {
    const base: Partial<WorkspaceColumn> = { type, required: type === "formula" || type === "rollup" ? false : column.required, options: type === "select" ? (column.options.length ? column.options : ["Option 1"]) : [], relation: undefined, formula: undefined, rollup: undefined };
    if (type === "relation") {
      const target = availableDatabases[0]; const display = target ? tableDefinition(target.id)?.columns.find(storedScalar) : undefined;
      base.relation = target && display ? { databaseId: target.id, displayColumnId: display.id } : undefined;
    }
    if (type === "formula") base.formula = { expression: "0" };
    if (type === "rollup") {
      const relation = relationColumns[0]; const target = relation?.relation ? tableDefinition(relation.relation.databaseId) : undefined; const targetColumn = target?.columns.find((candidate) => candidate.type === "number") || target?.columns.find(storedScalar);
      base.rollup = relation && targetColumn ? { relationColumnId: relation.id, targetColumnId: targetColumn.id, aggregation: targetColumn.type === "number" ? "sum" : "count" } : undefined;
    }
    onChange(base);
  };
  const relationTarget = column.relation ? tableDefinition(column.relation.databaseId) : undefined;
  const rollupRelation = column.rollup ? relationColumns.find((candidate) => candidate.id === column.rollup!.relationColumnId) : undefined;
  const rollupTarget = rollupRelation?.relation ? tableDefinition(rollupRelation.relation.databaseId) : undefined;
  const rollupTargetColumns = rollupTarget?.columns.filter((candidate) => column.rollup?.aggregation === "count" ? storedScalar(candidate) : candidate.type === "number") || [];
  const rollupHasNumbers = rollupTarget?.columns.some((candidate) => candidate.type === "number") || false;
  return <div className="rounded border border-primary/10 p-2 space-y-2">
    <div className="grid gap-2 md:grid-cols-[1fr_140px_100px_1.2fr_36px]">
      <Input aria-label="Column name" value={column.name} onChange={(event) => onChange({ name: event.target.value })} />
      <select aria-label={`${column.name} type`} value={column.type} disabled={usedByRollup} onChange={(event) => changeType(event.target.value as WorkspaceColumn["type"])} className="h-9 rounded-md border border-primary/20 bg-background px-2 text-sm">
        {(["text", "number", "boolean", "date", "select", "url", "relation", "formula", "rollup"] as const).map((type) => <option key={type} value={type} disabled={(type === "relation" && !availableDatabases.length) || (type === "rollup" && !relationColumns.length)}>{type}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={column.required} disabled={isWorkspaceComputedColumn(column)} onChange={(event) => onChange({ required: event.target.checked })} />Required</label>
      <Input aria-label={`${column.name} options`} disabled={column.type !== "select"} value={column.options.join(", ")} onChange={(event) => onChange({ options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder={column.type === "select" ? "Options, comma separated" : `ID: ${column.id}`} />
      <Button size="icon" variant="ghost" disabled={!canRemove || usedByRollup} title={usedByRollup ? "Remove the dependent rollup first" : "Remove column"} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {usedByRollup ? <p className="text-[11px] text-amber-300">This relation is used by a rollup. Remove that rollup before changing or deleting it.</p> : null}
    {column.type === "relation" ? <div className="grid gap-2 md:grid-cols-2">
      <label className="space-y-1 text-xs text-muted-foreground"><span>Target Table</span><select aria-label={`${column.name} target Table`} value={column.relation?.databaseId || ""} onChange={(event) => { const databaseId = Number(event.target.value); const display = tableDefinition(databaseId)?.columns.find(storedScalar); onChange({ relation: display ? { databaseId, displayColumnId: display.id } : undefined }); }} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm"><option value="">Choose Table…</option>{availableDatabases.map((database) => <option key={database.id} value={database.id}>{database.title}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground"><span>Display column</span><select aria-label={`${column.name} display column`} value={column.relation?.displayColumnId || ""} onChange={(event) => column.relation && onChange({ relation: { ...column.relation, displayColumnId: event.target.value } })} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm"><option value="">Choose column…</option>{relationTarget?.columns.filter(storedScalar).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}</select></label>
    </div> : null}
    {column.type === "formula" ? <div className="space-y-1"><Input aria-label={`${column.name} formula`} value={column.formula?.expression || ""} maxLength={300} onChange={(event) => onChange({ formula: { expression: event.target.value } })} placeholder="[weight] * [reps]" /><p className="text-[11px] text-muted-foreground">Numeric formula using stored number/formula column IDs, parentheses, and + − × ÷. Available: {definition.columns.filter((candidate) => candidate.id !== column.id && (candidate.type === "number" || candidate.type === "formula")).map((candidate) => `[${candidate.id}]`).join(", ") || "none"}.</p></div> : null}
    {column.type === "rollup" ? <div className="grid gap-2 md:grid-cols-3">
      <label className="space-y-1 text-xs text-muted-foreground"><span>Relation</span><select aria-label={`${column.name} rollup relation`} value={column.rollup?.relationColumnId || ""} onChange={(event) => { const relation = relationColumns.find((candidate) => candidate.id === event.target.value); const target = relation?.relation ? tableDefinition(relation.relation.databaseId) : undefined; const targetColumn = target?.columns.find((candidate) => candidate.type === "number") || target?.columns.find(storedScalar); if (relation && targetColumn) onChange({ rollup: { relationColumnId: relation.id, targetColumnId: targetColumn.id, aggregation: targetColumn.type === "number" ? "sum" : "count" } }); }} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">{relationColumns.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground"><span>Aggregation</span><select aria-label={`${column.name} aggregation`} value={column.rollup?.aggregation || "count"} onChange={(event) => { if (!column.rollup) return; const aggregation = event.target.value as NonNullable<WorkspaceColumn["rollup"]>["aggregation"]; const candidates = rollupTarget?.columns.filter((candidate) => aggregation === "count" ? storedScalar(candidate) : candidate.type === "number") || []; onChange({ rollup: { ...column.rollup, aggregation, targetColumnId: candidates.some((candidate) => candidate.id === column.rollup!.targetColumnId) ? column.rollup.targetColumnId : candidates[0]?.id || column.rollup.targetColumnId } }); }} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">{["count", "sum", "average", "min", "max"].map((aggregation) => <option key={aggregation} disabled={aggregation !== "count" && !rollupHasNumbers}>{aggregation}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground"><span>Target column</span><select aria-label={`${column.name} rollup target`} value={column.rollup?.targetColumnId || ""} onChange={(event) => column.rollup && onChange({ rollup: { ...column.rollup, targetColumnId: event.target.value } })} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">{rollupTargetColumns.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}</select></label>
    </div> : null}
  </div>;
}
