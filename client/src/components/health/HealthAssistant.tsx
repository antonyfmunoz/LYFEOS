import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

type SeriesOption = { id: string; label: string; unit: string };
type Draft = { id: number; title: string; reflection: string; domains: string[]; nextExperiment: string | null; state: "pending" | "saved" | "rejected"; createdAt: string };
type Citation = { id: string; label: string; unit: string; recordedDays: number; withheldDays: number; periodDays: number; timeZone: string };
type AssistantResponse =
  | { status: "blocked"; boundary: { kind: string; message: string }; disclosure: string }
  | { status: "available"; summary: string; observations: Array<{ text: string; citations: string[] }>; citations: Citation[]; draft: Draft | null; disclosure: string };

export default function HealthAssistant() {
  const [leftId, setLeftId] = useState("hydration_ml");
  const [rightId, setRightId] = useState("sleep_session_minutes");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [question, setQuestion] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [proposeReflection, setProposeReflection] = useState(false);
  const options = useQuery<{ options: SeriesOption[] }>({ queryKey: ["/api/health-insights/series-options"], queryFn: () => apiRequest("/api/health-insights/series-options") });
  const drafts = useQuery<{ drafts: Draft[]; disclosure: string }>({ queryKey: ["/api/health-assistant/drafts"], queryFn: () => apiRequest("/api/health-assistant/drafts") });
  const explain = useMutation<AssistantResponse>({
    mutationFn: () => apiRequest("/api/health-assistant/explain", { method: "POST", body: JSON.stringify({ question, seriesIds: rightId && rightId !== leftId ? [leftId, rightId] : [leftId], days, proposeReflection, confirmed: true }) }),
    onSuccess: (result) => { if (result.status === "available" && result.draft) void queryClient.invalidateQueries({ queryKey: ["/api/health-assistant/drafts"] }); },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "save" | "reject" }) => apiRequest(`/api/health-assistant/drafts/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, confirmed: true }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-assistant/drafts"] }),
  });
  const result = explain.data;
  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="health-assistant-heading">
    <div><h2 id="health-assistant-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Bot className="h-5 w-5" />Private health-record assistant</h2><p className="mt-1 text-sm text-muted-foreground">Ask for a bounded explanation of only the daily record series you select. Health AI context must be enabled in data controls; it remains off by default.</p></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3"><select aria-label="First assistant health record series" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={leftId} onChange={(event) => { setLeftId(event.target.value); explain.reset(); }}>{options.data?.options.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.unit}</option>)}</select><select aria-label="Optional second assistant health record series" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={rightId} onChange={(event) => { setRightId(event.target.value); explain.reset(); }}><option value="">One series only</option>{options.data?.options.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.unit}</option>)}</select><select aria-label="Assistant health record period" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={days} onChange={(event) => { setDays(Number(event.target.value) as 7 | 30 | 90); explain.reset(); }}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></div>
    <textarea aria-label="Question about selected health records" className="mt-2 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={500} placeholder="For example: Summarize what is recorded and where the gaps are." value={question} onChange={(event) => { setQuestion(event.target.value); explain.reset(); }} />
    <div className="mt-2 space-y-2 text-xs text-muted-foreground"><label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={proposeReflection} onChange={(event) => setProposeReflection(event.target.checked)} />Allow an editable reflection draft. A draft cannot become a health fact, mission, or XP event.</label><label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Send only these selected record values to the configured AI provider for this request.</label></div>
    <Button className="mt-3" variant="outline" disabled={!confirmed || question.trim().length < 3 || !leftId || leftId === rightId || explain.isPending} onClick={() => explain.mutate()}><ShieldCheck />{explain.isPending ? "Reviewing selected records…" : "Explain selected records"}</Button>
    {explain.error ? <p role="alert" className="mt-3 text-xs text-destructive">{explain.error.message.includes("403:") ? "Enable private Health AI context in Health data controls, then try again." : explain.error.message.includes("503:") ? "The private Health AI provider is not configured." : "A bounded assistant response was not available. No draft or action was created."}</p> : null}
    {result?.status === "blocked" ? <div role="alert" className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100"><p>{result.boundary.message}</p><p className="mt-1 text-muted-foreground">{result.disclosure}</p></div> : null}
    {result?.status === "available" ? <div className="mt-4 rounded-lg border border-primary/20 bg-background/20 p-4"><p className="text-sm text-white">{result.summary}</p>{result.observations.length ? <ul className="mt-3 space-y-2 text-xs text-muted-foreground">{result.observations.map((observation, index) => <li key={index}>{observation.text} <span className="font-mono text-primary">{observation.citations.map((citation) => `[${citation}]`).join(" ")}</span></li>)}</ul> : null}<div className="mt-3 grid gap-2 sm:grid-cols-2">{result.citations.map((citation) => <div key={citation.id} className="rounded-md border border-muted/15 p-2 text-[11px] text-muted-foreground"><p className="font-medium text-foreground">[{citation.id}] {citation.label} · {citation.unit}</p><p>{citation.recordedDays} recorded day(s), {citation.withheldDays} withheld day(s), within {citation.periodDays} days · {citation.timeZone}</p></div>)}</div><p className="mt-3 text-[11px] text-muted-foreground">{result.disclosure}</p></div> : null}
    {drafts.data?.drafts.length ? <details className="mt-4 rounded-lg border border-muted/20 p-3"><summary className="cursor-pointer text-xs font-medium">Assistant reflection drafts</summary><p className="mt-2 text-[11px] text-muted-foreground">{drafts.data.disclosure}</p><div className="mt-2 space-y-2">{drafts.data.drafts.map((draft) => <article key={draft.id} className="rounded-md border border-muted/15 bg-background/20 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm text-white">{draft.title}</p><p className="text-[11px] text-muted-foreground">{draft.domains.join(", ")} · {draft.state}</p></div>{draft.state === "pending" ? <div className="flex gap-1"><Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: draft.id, decision: "save" })}><Check />Save draft</Button><Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: draft.id, decision: "reject" })}><X />Reject</Button></div> : null}</div><p className="mt-2 text-xs text-muted-foreground">{draft.reflection}</p>{draft.nextExperiment ? <p className="mt-1 text-xs text-muted-foreground">Possible next reflection: {draft.nextExperiment}</p> : null}</article>)}</div></details> : null}
  </section>;
}
