import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Plus, RotateCcw, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Draft = {
  id: number; title: string; category: string; evidenceStart: string; evidenceEnd: string;
  state: "pending" | "executing" | "succeeded" | "rejected" | "failed" | "expired" | "revoked"; questId: number | null; expiresAt: string;
};
type DraftEvent = { id: number; draftId: number; action: "created" | "confirmed" | "rejected" | "expired" | "revoked"; titleSnapshot: string; categorySnapshot: string; questIdSnapshot: number | null; scopeSnapshot: string; expiresAtSnapshot: string; createdAt: string };

export default function HealthPlanningHandoff(props: { leftId: string; rightId: string; leftLabel: string; rightLabel: string; days: number }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("personal");
  const [reviewed, setReviewed] = useState(false);
  const drafts = useQuery<{ drafts: Draft[]; events: DraftEvent[]; disclosure: string }>({
    queryKey: ["/api/health-insights/planning-drafts"],
    queryFn: () => apiRequest("/api/health-insights/planning-drafts"),
  });
  useEffect(() => {
    setTitle(`Review my recorded ${props.leftLabel} and ${props.rightLabel} pattern`);
    setReviewed(false);
  }, [props.leftLabel, props.rightLabel]);

  const createDraft = useMutation({
    mutationFn: () => apiRequest("/api/health-insights/planning-drafts", {
      method: "POST",
      body: JSON.stringify({ title, category, left: props.leftId, right: props.rightId, days: props.days, confirmed: true }),
    }),
    onSuccess: () => { setReviewed(false); void queryClient.invalidateQueries({ queryKey: ["/api/health-insights/planning-drafts"] }); },
  });
  const decide = useMutation<{ disclosure: string }, Error, { id: number; decision: "confirm" | "reject" | "revoke" }>({
    mutationFn: ({ id, decision }) => apiRequest(`/api/health-insights/planning-drafts/${id}/${decision}`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/health-insights/planning-drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
    },
  });
  const pending = drafts.data?.drafts.filter((draft) => draft.state === "pending") || [];
  const revocable = drafts.data?.drafts.filter((draft) => draft.state === "succeeded") || [];

  return <div className="mt-4 rounded-xl border border-primary/20 bg-background/20 p-4" aria-labelledby="health-planning-handoff-heading">
    <h3 id="health-planning-handoff-heading" className="flex items-center gap-2 text-sm font-medium text-white"><ClipboardCheck className="h-4 w-4 text-primary" />Optional planning hand-off</h3>
    <p className="mt-1 text-xs text-muted-foreground">Draft a neutral review task from the selected evidence window; nothing enters Missions until you confirm. Only its reviewed title/category can cross that boundary. The handoff expires after seven days if pending and can be revoked; health values and evidence references stay in Health.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
      <Input aria-label="Health planning draft title" value={title} maxLength={180} onChange={(event) => { setTitle(event.target.value); setReviewed(false); }} />
      <select aria-label="Health planning draft category" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => { setCategory(event.target.value); setReviewed(false); }}><option value="personal">Personal</option><option value="health">Health</option><option value="fitness">Fitness</option><option value="nutrition">Nutrition</option><option value="recovery">Recovery</option></select>
      <Button size="sm" variant="outline" disabled={!reviewed || title.trim().length < 3 || createDraft.isPending} onClick={() => createDraft.mutate()}><Plus />Create review draft</Button>
    </div>
    <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><input className="mt-0.5" type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed this title and want a private pending draft for the selected {props.days}-day evidence window.</label>
    {createDraft.isSuccess ? <p className="mt-2 text-xs text-primary" role="status">Pending draft created. Review it below; no mission exists yet.</p> : null}
    {createDraft.error || decide.error ? <p className="mt-2 text-xs text-destructive" role="alert">The planning hand-off could not be saved. No action was assumed.</p> : null}
    {pending.length ? <div className="mt-3 space-y-2" aria-label="Pending health planning drafts">{pending.map((draft) => <div key={draft.id} className="flex flex-col gap-2 rounded-lg border border-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-white">{draft.title}</p><p className="text-[11px] text-muted-foreground">{draft.evidenceStart} to {draft.evidenceEnd} · {draft.category} · title-only scope · expires {new Date(draft.expiresAt).toLocaleString()}</p></div><div className="flex gap-2"><Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: draft.id, decision: "confirm" })}><ClipboardCheck />Confirm into Missions</Button><Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: draft.id, decision: "reject" })}><X />Discard</Button></div></div>)}</div> : null}
    {revocable.length ? <div className="mt-3 space-y-2" aria-label="Confirmed health planning handoffs">{revocable.map((draft) => <div key={draft.id} className="flex items-center justify-between gap-2 rounded-lg border border-muted/20 p-3"><div><p className="text-sm text-white">{draft.title}</p><p className="text-[11px] text-muted-foreground">Confirmed title-only handoff · Mission {draft.questId}</p></div><Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: draft.id, decision: "revoke" })}><RotateCcw />Revoke handoff</Button></div>)}</div> : null}
    {drafts.data?.events.length ? <details className="mt-3 rounded-lg border border-muted/20 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Private planning receipt history</summary><div className="mt-2 space-y-1">{drafts.data.events.map((event) => <p className="text-[11px] text-muted-foreground" key={event.id}>{new Date(event.createdAt).toLocaleString()} · {event.titleSnapshot} · {event.categorySnapshot} · {event.action} · {event.scopeSnapshot.replaceAll("_", " ")} · expires {new Date(event.expiresAtSnapshot).toLocaleString()}{event.questIdSnapshot ? ` · Mission ${event.questIdSnapshot}` : ""}</p>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Receipts contain the reviewed title, category, scope, expiry, decision, and optional Mission ID—not health values or evidence selectors.</p></details> : null}
    {decide.isSuccess ? <p className="mt-2 text-xs text-primary" role="status">Decision recorded. If confirmed, the reviewed title was added to Missions without health values or evidence references.</p> : null}
  </div>;
}
