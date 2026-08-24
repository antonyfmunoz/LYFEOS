import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { WorkspaceDatabaseDefinition, WorkspaceRowValues } from "@shared/tables";
import { WorkspaceFieldInput } from "@/components/tables/WorkspaceFieldInput";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type FormRecord = { id: number; databaseId: number; title: string; description: string | null; fieldIds: string[]; confirmationText: string; active: boolean };
type Response = { form: FormRecord; database: { id: number; title: string; definition: WorkspaceDatabaseDefinition } };

export default function FormPage() {
  const { formId } = useParams(); const id = Number(formId); const { toast } = useToast(); const [values, setValues] = useState<WorkspaceRowValues>({});
  const query = useQuery<Response>({ queryKey: ["/api/forms", id], queryFn: () => apiRequest(`/api/forms/${id}`), enabled: Number.isInteger(id) });
  usePageTitle(query.data?.form.title || "Form");
  const submit = useMutation({ mutationFn: () => apiRequest<{ confirmationText: string }>(`/api/forms/${id}/submissions`, { method: "POST", body: JSON.stringify({ values }) }), onSuccess: ({ confirmationText }) => { setValues({}); toast({ title: confirmationText }); }, onError: (error) => toast({ title: "Response not saved", description: error instanceof Error ? error.message : "Check the fields", variant: "destructive" }) });
  if (query.isLoading) return <div className="container py-8 text-sm text-muted-foreground">Loading form…</div>; if (!query.data) return <div className="container py-8 text-sm text-destructive">Form unavailable.</div>;
  const { form, database } = query.data; const columns = database.definition.columns.filter((column) => form.fieldIds.includes(column.id));
  return <div className="container max-w-2xl py-6 space-y-5"><div><p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">{database.title}</p><h1 className="font-orbitron text-2xl">{form.title}</h1><p className="text-sm text-muted-foreground">{form.description || "Submit a new validated row to this private table."}</p></div>{!form.active ? <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">This form is closed.</div> : <div className="space-y-4 rounded-xl border border-primary/15 bg-card/35 p-5">{columns.map((column) => <label key={column.id} className="block space-y-1 text-sm"><span>{column.name}{column.required ? " *" : ""}</span><WorkspaceFieldInput column={column} values={values} onChange={(value) => setValues((current) => ({ ...current, [column.id]: value }))} /></label>)}<Button className="w-full" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Saving…" : "Submit"}</Button></div>}<Link href={`/databases/${database.id}`}><Button variant="outline">Back to table</Button></Link></div>;
}
