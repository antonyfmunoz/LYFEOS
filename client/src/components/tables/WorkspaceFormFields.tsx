import { visibleWorkspaceFormFieldIds, type WorkspaceColumn, type WorkspaceFormDefinition, type WorkspaceRelationOptions, type WorkspaceRowValues } from "@shared/tables";
import { WorkspaceFieldInput } from "./WorkspaceFieldInput";

export function WorkspaceFormFields({ definition, columns, values, relationOptions = {}, onChange }: { definition: WorkspaceFormDefinition; columns: WorkspaceColumn[]; values: WorkspaceRowValues; relationOptions?: WorkspaceRelationOptions; onChange: (fieldId: string, value: unknown) => void }) {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const visible = new Set(visibleWorkspaceFormFieldIds(definition, values));
  return <div className="space-y-5">{definition.sections.map((section) => {
    const fields = section.fieldIds.map((fieldId) => byId.get(fieldId)).filter((column): column is WorkspaceColumn => Boolean(column) && visible.has(column!.id));
    if (!fields.length) return null;
    return <section key={section.id} className="space-y-3" aria-labelledby={`form-section-${section.id}`}><div><h2 id={`form-section-${section.id}`} className="font-medium">{section.title}</h2>{section.description ? <p className="text-xs text-muted-foreground">{section.description}</p> : null}</div>{fields.map((column) => <label key={column.id} className="block space-y-1 text-sm"><span>{column.name}{column.required ? " *" : ""}</span><WorkspaceFieldInput column={column} values={values} relationOptions={relationOptions[column.id]} onChange={(value) => onChange(column.id, value)} /></label>)}</section>;
  })}</div>;
}
