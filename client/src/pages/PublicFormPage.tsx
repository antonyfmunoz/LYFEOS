import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { visibleWorkspaceFormFieldIds, type WorkspaceColumn, type WorkspaceFormDefinition, type WorkspaceRowValues } from "@shared/tables";
import { WorkspaceFormFields } from "@/components/tables/WorkspaceFormFields";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/use-page-title";

type PublicForm = { form: { title: string; description: string | null; definition: WorkspaceFormDefinition }; columns: WorkspaceColumn[]; expiresAt: string; remainingSubmissions: number };

export default function PublicFormPage() {
  const { publicId } = useParams();
  const token = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "", []);
  const [values, setValues] = useState<WorkspaceRowValues>({}); const [confirmation, setConfirmation] = useState("");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const query = useQuery<PublicForm>({ queryKey: ["public-form", publicId], enabled: Boolean(publicId && token), queryFn: () => apiRequest(`/api/public/forms/${publicId}`, { headers }) });
  usePageTitle(query.data?.form.title || "Shared form");
  const submit = useMutation({ mutationFn: () => {
    const visible = new Set(visibleWorkspaceFormFieldIds(query.data!.form.definition, values));
    return apiRequest<{ confirmationText: string }>(`/api/public/forms/${publicId}/submissions`, { method: "POST", headers, body: JSON.stringify({ values: Object.fromEntries(Object.entries(values).filter(([key]) => visible.has(key))) }) });
  }, onSuccess: ({ confirmationText }) => { setValues({}); setConfirmation(confirmationText); }, onError: () => setConfirmation("Response not saved. The link may have expired, reached its limit, or a required field needs attention.") });
  if (!token) return <main className="container max-w-2xl py-12 text-sm text-destructive">This form link is incomplete.</main>;
  if (query.isLoading) return <main className="container max-w-2xl py-12 text-sm text-muted-foreground">Loading form…</main>;
  if (!query.data) return <main className="container max-w-2xl py-12 text-sm text-destructive">This form is unavailable.</main>;
  return <main className="container max-w-2xl py-8 space-y-5" style={{ contain: "content" }}><meta name="referrer" content="no-referrer" /><header><p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">LyfeOS shared form</p><h1 className="font-orbitron text-2xl">{query.data.form.title}</h1>{query.data.form.description ? <p className="text-sm text-muted-foreground">{query.data.form.description}</p> : null}</header><div className="rounded-xl border border-primary/15 bg-card/35 p-5 space-y-5"><WorkspaceFormFields definition={query.data.form.definition} columns={query.data.columns} values={values} onChange={(fieldId, value) => { setConfirmation(""); setValues((current) => ({ ...current, [fieldId]: value })); }} /><Button className="w-full" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Saving…" : "Submit"}</Button></div>{confirmation ? <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{confirmation}</p> : null}<p className="text-xs text-muted-foreground">This purpose-labelled link expires {new Date(query.data.expiresAt).toLocaleString()} and has {query.data.remainingSubmissions} response{query.data.remainingSubmissions === 1 ? "" : "s"} remaining. Responses become records in the form owner's private Table.</p></main>;
}
