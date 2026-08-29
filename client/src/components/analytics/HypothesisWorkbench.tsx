import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Domain = "missions" | "daily_state" | "health";
type Signal = { id: string; domain: Domain; label: string; unit: string; aggregation: string; provenance: string; quality: string; enabled: boolean; availability: "local" };
type SignalResponse = { consents: Record<Domain, "enabled" | "revoked">; signals: Signal[]; disclosure: string };
type ConsentResponse = { consent: { domain: Domain; state: "enabled" | "revoked" }; consents: Record<Domain, "enabled" | "revoked"> };
type Snapshot = {
  id: number;
  evidenceStart: string;
  evidenceEnd: string;
  result: { status: "available" | "insufficient"; coefficient?: number; magnitude?: string; direction?: string; pairedSamples: number; coverage: number; reasons?: string[]; uncertainty?: { lower: number; upper: number; disclosure: string }; disclosure: string; automaticActionTaken: false; progressionAwarded: false };
  leftQuality: { signal: Signal; recordedDays: number; missingDays: number; coverage: number; disclosure: string; provenance: string };
  rightQuality: { signal: Signal; recordedDays: number; missingDays: number; coverage: number; disclosure: string; provenance: string };
  createdAt: string;
};
type Interpretation = { id: number; snapshotId: number; interpretation: string; note: string | null; createdAt: string };
type Hypothesis = { id: number; title: string; leftSignalId: string; rightSignalId: string; periodDays: number; lagDays: number; timeZone: string; status: "active" | "paused"; revision: number; calculationState: "idle" | "running" | "failed"; lastErrorCode: string | null; lastCalculatedAt: string | null; latestSnapshot: Snapshot | null; interpretations: Interpretation[] };

const domainCopy: Record<Domain, { title: string; detail: string }> = {
  missions: { title: "Missions", detail: "Created and completed canonical Mission events." },
  daily_state: { title: "Daily state", detail: "Your self-reported mental, physical, emotional, and sleep-quality reflections." },
  health: { title: "Health", detail: "Private workout, recovery, hydration, and sleep-session records." },
};

function HypothesisCard({ hypothesis }: { hypothesis: Hypothesis }) {
  const { toast } = useToast();
  const [interpretation, setInterpretation] = useState("needs_more_context");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["/api/hypotheses"] });
  const recalculate = useMutation({ mutationFn: () => apiRequest(`/api/hypotheses/${hypothesis.id}/recalculate`, { method: "POST", body: JSON.stringify({ confirmed: true }) }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: () => apiRequest(`/api/hypotheses/${hypothesis.id}`, { method: "PATCH", body: JSON.stringify({ expectedRevision: hypothesis.revision, status: hypothesis.status === "active" ? "paused" : "active", acknowledgedExploratory: true }) }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => apiRequest(`/api/hypotheses/${hypothesis.id}`, { method: "DELETE", body: JSON.stringify({ confirmed: true }) }), onSuccess: refresh });
  const saveInterpretation = useMutation({
    mutationFn: () => apiRequest(`/api/hypotheses/${hypothesis.id}/interpretations`, { method: "POST", body: JSON.stringify({ snapshotId: hypothesis.latestSnapshot!.id, interpretation, note: note.trim() || null, acknowledgedExploratory: true, clientMutationId: crypto.randomUUID() }) }),
    onSuccess: () => { setNote(""); setAcknowledged(false); refresh(); toast({ title: "Private interpretation saved" }); },
  });
  const snapshot = hypothesis.latestSnapshot;
  const result = snapshot?.result;
  const marker = result?.status === "available" ? Math.max(0, Math.min(100, ((result.coefficient || 0) + 1) * 50)) : 50;

  return (
    <article className="rounded-xl border border-primary/15 bg-background/35 p-4" aria-labelledby={`hypothesis-${hypothesis.id}`} data-testid={`hypothesis-card-${hypothesis.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id={`hypothesis-${hypothesis.id}`} className="font-medium text-foreground">{hypothesis.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{snapshot?.leftQuality.signal.label || hypothesis.leftSignalId} ↔ {snapshot?.rightQuality.signal.label || hypothesis.rightSignalId} · {hypothesis.periodDays} days · lag {hypothesis.lagDays}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label={hypothesis.status === "active" ? `Pause ${hypothesis.title}` : `Resume ${hypothesis.title}`} onClick={() => toggle.mutate()} disabled={toggle.isPending}>{hypothesis.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" aria-label={`Recalculate ${hypothesis.title}`} onClick={() => recalculate.mutate()} disabled={hypothesis.status !== "active" || recalculate.isPending}><RefreshCw className={`h-4 w-4 ${recalculate.isPending ? "animate-spin" : ""}`} /></Button>
          <Button size="icon" variant="ghost" aria-label={`Delete ${hypothesis.title}`} onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {hypothesis.lastErrorCode ? <p className="mt-2 text-xs text-destructive" role="alert">Calculation paused or delayed: {hypothesis.lastErrorCode.replaceAll("_", " ")}.</p> : null}
      {!snapshot ? <p className="mt-3 text-sm text-muted-foreground">No calculation snapshot yet.</p> : result?.status === "insufficient" ? (
        <div className="mt-3 rounded-lg border border-muted/20 p-3">
          <p className="text-sm text-foreground">Not enough aligned evidence yet</p>
          <p className="mt-1 text-xs text-muted-foreground">{result.pairedSamples} paired days · {Math.round(result.coverage * 100)}% aligned coverage. {(result.reasons || []).join(" ")}</p>
        </div>
      ) : result ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-muted/20 p-3">
            <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Inverse</span><span className="font-mono text-primary">r = {result.coefficient?.toFixed(3)}</span><span className="text-muted-foreground">Same direction</span></div>
            <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-cyan-500/40 via-muted/30 to-emerald-500/40" role="img" aria-label={`Association coefficient ${result.coefficient}`}>
              <span className="absolute -top-1 h-4 w-1 rounded bg-primary" style={{ left: `calc(${marker}% - 2px)` }} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{result.magnitude} {result.direction} association · {result.pairedSamples} paired days · {Math.round(result.coverage * 100)}% aligned coverage</p>
            {result.uncertainty ? <p className="mt-1 text-xs text-muted-foreground">One-day omission range {result.uncertainty.lower.toFixed(3)} to {result.uncertainty.upper.toFixed(3)}. This is a sensitivity range, not a confidence interval.</p> : null}
          </div>
          <details className="rounded-lg border border-muted/20 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">Evidence quality and provenance</summary>
            <div className="mt-2 space-y-2">
              {[snapshot.leftQuality, snapshot.rightQuality].map((quality) => <div key={quality.signal.id}><p className="font-medium text-foreground">{quality.signal.label}: {quality.recordedDays}/{hypothesis.periodDays} recorded days</p><p>{quality.provenance}. {quality.disclosure}</p></div>)}
              <p>{result.disclosure}</p>
            </div>
          </details>
          <div className="rounded-lg border border-primary/15 p-3">
            <Label htmlFor={`interpretation-${hypothesis.id}`} className="text-xs">Your interpretation</Label>
            <select id={`interpretation-${hypothesis.id}`} value={interpretation} onChange={(event) => setInterpretation(event.target.value)} className="mt-1 w-full rounded-md border border-muted/30 bg-background px-3 py-2 text-sm">
              <option value="worth_revisiting">Worth revisiting</option><option value="needs_more_context">Needs more context</option><option value="not_meaningful_to_me">Not meaningful to me</option>
            </select>
            <Input className="mt-2" aria-label="Private interpretation context" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional context only you can see" />
            <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand this is my interpretation of an exploratory association, not a verified fact, cause, prediction, diagnosis, or instruction.</label>
            <Button className="mt-2" size="sm" variant="outline" data-testid={`hypothesis-save-interpretation-${hypothesis.id}`} disabled={!acknowledged || saveInterpretation.isPending} onClick={() => saveInterpretation.mutate()}>Save private interpretation</Button>
          </div>
        </div>
      ) : null}
      {hypothesis.interpretations.length ? <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Saved interpretations ({hypothesis.interpretations.length})</summary><div className="mt-2 space-y-2">{hypothesis.interpretations.map((item) => <div key={item.id} className="rounded border border-muted/15 p-2"><p className="text-foreground">{item.interpretation.replaceAll("_", " ")}</p>{item.note ? <p className="text-muted-foreground">{item.note}</p> : null}</div>)}</div></details> : null}
    </article>
  );
}

export default function HypothesisWorkbench() {
  const { toast } = useToast();
  const signals = useQuery<SignalResponse>({ queryKey: ["/api/hypotheses/signals"], queryFn: () => apiRequest("/api/hypotheses/signals") });
  const records = useQuery<{ hypotheses: Hypothesis[]; disclosure: string }>({ queryKey: ["/api/hypotheses"], queryFn: () => apiRequest("/api/hypotheses") });
  const [title, setTitle] = useState("");
  const [leftSignalId, setLeftSignalId] = useState("");
  const [rightSignalId, setRightSignalId] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [lagDays, setLagDays] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const enabledSignals = useMemo(() => (signals.data?.signals || []).filter((signal) => signal.enabled), [signals.data]);
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ["/api/hypotheses/signals"] }); void queryClient.invalidateQueries({ queryKey: ["/api/hypotheses"] }); };
  const consent = useMutation({
    mutationFn: ({ domain, state }: { domain: Domain; state: "enabled" | "revoked" }) => apiRequest<ConsentResponse>("/api/hypotheses/consents", { method: "PATCH", body: JSON.stringify({ domain, state, acknowledgedPrivateAnalysis: true }) }),
    onSuccess: (response) => {
      queryClient.setQueryData<SignalResponse>(["/api/hypotheses/signals"], (current) => current ? {
        ...current,
        consents: response.consents,
        signals: current.signals.map((signal) => ({ ...signal, enabled: response.consents[signal.domain] === "enabled" })),
      } : current);
      void queryClient.invalidateQueries({ queryKey: ["/api/hypotheses"] });
    },
  });
  const create = useMutation({
    mutationFn: () => apiRequest("/api/hypotheses", { method: "POST", body: JSON.stringify({ title, leftSignalId, rightSignalId, periodDays, lagDays, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", acknowledgedExploratory: true }) }),
    onSuccess: () => { setTitle(""); setAcknowledged(false); invalidate(); toast({ title: "Private hypothesis created" }); },
  });

  return (
    <section className="mt-6 rounded-xl border border-primary/20 bg-card/30 p-4" aria-labelledby="cross-domain-hypotheses-title" data-testid="hypothesis-workbench">
      <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 text-primary" /><div><h3 id="cross-domain-hypotheses-title" className="font-medium text-foreground">Your hypothesis lab</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose what LyfeOS may compare, then test one question at a time. Results stay private and never become automatic advice, Missions, XP, rank, or badges.</p></div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {(Object.keys(domainCopy) as Domain[]).map((domain) => {
          const enabled = signals.data?.consents[domain] === "enabled";
          const saving = consent.isPending && consent.variables?.domain === domain;
          return <button key={domain} type="button" data-testid={`hypothesis-consent-${domain}`} aria-pressed={enabled} aria-busy={saving} disabled={consent.isPending} onClick={() => consent.mutate({ domain, state: enabled ? "revoked" : "enabled" })} className={`rounded-lg border p-3 text-left transition-colors ${enabled ? "border-primary/45 bg-primary/10" : "border-muted/20 bg-background/30"}`}><span className="text-sm font-medium text-foreground">{domainCopy[domain].title}</span><span className="mt-1 block text-xs text-muted-foreground">{domainCopy[domain].detail}</span><span className={`mt-2 block text-[11px] font-mono uppercase ${enabled ? "text-primary" : "text-muted-foreground"}`}>{saving ? "Saving…" : enabled ? "Enabled" : "Off"}</span></button>;
        })}
      </div>
      {consent.error ? <p className="mt-2 text-xs text-destructive" role="alert">The consent change was not saved. Your previous setting remains active. Try again.</p> : null}
      <details className="mt-3 rounded-lg border border-muted/20 p-3 text-xs text-muted-foreground"><summary className="cursor-pointer text-foreground">Signal definitions and source quality</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{(signals.data?.signals || []).map((signal) => <div key={signal.id}><p className="font-medium text-foreground">{signal.label} ({signal.unit})</p><p>{signal.provenance} · {signal.quality.replaceAll("_", " ")} · {signal.aggregation}</p></div>)}</div><p className="mt-2">{signals.data?.disclosure}</p></details>
      <div className="mt-4 rounded-xl border border-muted/20 p-4">
        <h4 className="text-sm font-medium text-foreground">Test a question</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="hypothesis-title" className="text-xs">Question label</Label><Input id="hypothesis-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="For example: Does my recorded sleep move with completed Missions?" /></div>
          <div><Label htmlFor="hypothesis-left" className="text-xs">First signal</Label><select id="hypothesis-left" value={leftSignalId} onChange={(event) => setLeftSignalId(event.target.value)} className="mt-1 w-full rounded-md border border-muted/30 bg-background px-3 py-2 text-sm"><option value="">Choose a signal</option>{enabledSignals.map((signal) => <option key={signal.id} value={signal.id}>{signal.label}</option>)}</select></div>
          <div><Label htmlFor="hypothesis-right" className="text-xs">Second signal</Label><select id="hypothesis-right" value={rightSignalId} onChange={(event) => setRightSignalId(event.target.value)} className="mt-1 w-full rounded-md border border-muted/30 bg-background px-3 py-2 text-sm"><option value="">Choose a signal</option>{enabledSignals.map((signal) => <option key={signal.id} value={signal.id}>{signal.label}</option>)}</select></div>
          <div><Label htmlFor="hypothesis-period" className="text-xs">Evidence window</Label><select id="hypothesis-period" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))} className="mt-1 w-full rounded-md border border-muted/30 bg-background px-3 py-2 text-sm">{[14, 30, 60, 90, 180, 365].map((value) => <option key={value} value={value}>{value} days</option>)}</select></div>
          <div><Label htmlFor="hypothesis-lag" className="text-xs">Day alignment</Label><select id="hypothesis-lag" value={lagDays} onChange={(event) => setLagDays(Number(event.target.value))} className="mt-1 w-full rounded-md border border-muted/30 bg-background px-3 py-2 text-sm">{Array.from({ length: 29 }, (_, index) => index - 14).map((value) => <option key={value} value={value}>{value === 0 ? "Same day" : value > 0 ? `Second signal ${value} day${value === 1 ? "" : "s"} later` : `First signal ${Math.abs(value)} day${value === -1 ? "" : "s"} later`}</option>)}</select></div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I am choosing this comparison. I understand missing records, repeated testing, changing routines, and other factors can change the result, and association is not causation.</label>
        <Button className="mt-3" size="sm" data-testid="hypothesis-create" disabled={!acknowledged || title.trim().length < 3 || !leftSignalId || !rightSignalId || leftSignalId === rightSignalId || create.isPending} onClick={() => create.mutate()}>Create and calculate</Button>
        {create.error ? <p className="mt-2 text-xs text-destructive" role="alert">{create.error instanceof Error ? create.error.message : "The hypothesis could not be created."}</p> : null}
      </div>
      <div className="mt-4 space-y-3">{records.data?.hypotheses.length ? records.data.hypotheses.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} />) : <p className="rounded-lg border border-dashed border-muted/25 p-4 text-center text-sm text-muted-foreground">No saved hypotheses yet. Enable only the domains you want, then create one focused comparison.</p>}</div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Scheduled recalculation runs at most daily for active hypotheses. Snapshots store result metadata and quality summaries, not aligned daily values. Revoking a domain pauses affected hypotheses.</p>
    </section>
  );
}
