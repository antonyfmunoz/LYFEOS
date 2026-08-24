import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, Pencil, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Progression = {
  practiceXp: number;
  rank: { level: number; name: string; minimumXp: number };
  nextRank: { level: number; name: string; minimumXp: number } | null;
  badges: Array<{ key: string; name: string; description: string; evidence: Record<string, number>; awardedAt: string }>;
  events: Array<{ id: number; action: "earned" | "reversed"; xpDelta: number; evidenceDate: string; label: string; evidence: { reason?: string; recordCount?: number } }>;
  disclosure: string;
};
type HealthPracticeReview = { id: number; reviewDate: string; domains: string[]; reflection: string; nextExperiment: string | null; revision: number; updatedAt: string };
const reviewDomains = ["nutrition", "training", "recovery", "sleep", "hydration", "body", "metrics", "planning"];

export default function HealthProgression() {
  const [reviewDate, setReviewDate] = useState(getLocalDateString());
  const [domains, setDomains] = useState<string[]>([]);
  const [reflection, setReflection] = useState("");
  const [nextExperiment, setNextExperiment] = useState("");
  const [editingReview, setEditingReview] = useState<HealthPracticeReview | null>(null);
  const progression = useQuery<{ progression: Progression }>({
    queryKey: ["/api/health-progression"],
    queryFn: () => apiRequest("/api/health-progression/reconcile", { method: "POST" }),
    refetchOnMount: "always",
  });
  const data = progression.data?.progression;
  const reviews = useQuery<{ reviews: HealthPracticeReview[]; disclosure: string }>({ queryKey: ["/api/health-practice-reviews"], queryFn: () => apiRequest("/api/health-practice-reviews") });
  const resetReview = () => { setReviewDate(getLocalDateString()); setDomains([]); setReflection(""); setNextExperiment(""); setEditingReview(null); };
  const saveReview = useMutation({
    mutationFn: () => apiRequest(editingReview ? `/api/health-practice-reviews/${editingReview.id}` : "/api/health-practice-reviews", { method: editingReview ? "PATCH" : "POST", headers: editingReview ? { "x-lyfeos-expected-revision": String(editingReview.revision) } : undefined, body: JSON.stringify({ ...(editingReview ? {} : { reviewDate }), domains, reflection, nextExperiment: nextExperiment.trim() || null }) }),
    onSuccess: () => { resetReview(); void queryClient.invalidateQueries({ queryKey: ["/api/health-practice-reviews"] }); void queryClient.invalidateQueries({ queryKey: ["/api/health-progression"] }); toast({ title: "Practice review saved" }); },
    onError: (error: Error) => toast({ title: error.message.startsWith("409:") ? "A newer review version exists" : "Practice review was not saved", description: error.message, variant: "destructive" }),
  });
  const deleteReview = useMutation({
    mutationFn: (review: HealthPracticeReview) => apiRequest(`/api/health-practice-reviews/${review.id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(review.revision) } }),
    onSuccess: () => { resetReview(); void queryClient.invalidateQueries({ queryKey: ["/api/health-practice-reviews"] }); void queryClient.invalidateQueries({ queryKey: ["/api/health-progression"] }); },
    onError: (error: Error) => toast({ title: "Practice review was not deleted", description: error.message, variant: "destructive" }),
  });
  const progress = data?.nextRank ? Math.max(0, Math.min(100, Math.round(((data.practiceXp - data.rank.minimumXp) / (data.nextRank.minimumXp - data.rank.minimumXp)) * 100))) : 100;

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="health-progression-heading">
    <div><h2 id="health-progression-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Sparkles className="h-5 w-5" />Recorded practice progression</h2><p className="mt-1 text-sm text-muted-foreground">A reversible game layer for the process you recorded—not a health, body, readiness, or competence score.</p></div>
    {data ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Practice XP</p><p className="mt-1 font-orbitron text-3xl text-primary">{data.practiceXp}</p></div>
        <div className="rounded-xl border border-muted/20 bg-background/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Practice rank</p><p className="mt-1 text-lg text-white">{data.rank.name}</p><p className="text-xs text-muted-foreground">Level {data.rank.level}</p></div>
        <div className="rounded-xl border border-muted/20 bg-background/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Active badges</p><p className="mt-1 text-lg text-white">{data.badges.length}</p><p className="text-xs text-muted-foreground">Only while evidence still qualifies</p></div>
      </div>
      <div className="mt-3" aria-label="Recorded practice rank progress"><div className="h-2 overflow-hidden rounded-full bg-muted/20"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{data.nextRank ? `${data.nextRank.minimumXp - data.practiceXp} recorded-practice XP to ${data.nextRank.name}` : "Highest current recorded-practice rank"}</p></div>
      <div className="mt-5 rounded-xl border border-muted/20 bg-background/20 p-4"><p className="text-sm font-medium text-white">Review what the record taught you</p><p className="mt-1 text-xs text-muted-foreground">A self-authored review can earn one capped process award per calendar week. It does not verify the underlying activity or create a health conclusion.</p><div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]"><Input aria-label="Health practice review date" type="date" max={getLocalDateString()} disabled={editingReview !== null} value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /><div className="flex flex-wrap gap-1" aria-label="Health practice review domains">{reviewDomains.map((domain) => <Button key={domain} type="button" size="sm" variant={domains.includes(domain) ? "default" : "outline"} aria-pressed={domains.includes(domain)} onClick={() => setDomains((current) => current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain])}>{domain}</Button>)}</div></div><textarea aria-label="Health practice reflection" className="mt-2 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={2000} placeholder="What did you notice, learn, or want to review?" value={reflection} onChange={(event) => setReflection(event.target.value)} /><Input className="mt-2" aria-label="Optional next practice experiment" maxLength={500} placeholder="Optional next experiment or question—never an automatic prescription" value={nextExperiment} onChange={(event) => setNextExperiment(event.target.value)} /><div className="mt-2 flex gap-2"><Button size="sm" disabled={!reviewDate || !domains.length || reflection.trim().length < 3 || saveReview.isPending} onClick={() => saveReview.mutate()}><Save />{editingReview ? "Correct review" : "Save review"}</Button>{editingReview ? <Button size="sm" variant="ghost" onClick={resetReview}>Cancel</Button> : null}</div>{reviews.data?.reviews.length ? <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Practice review history ({reviews.data.reviews.length})</summary><div className="mt-2 space-y-2">{reviews.data.reviews.map((review) => <div className="flex items-start justify-between gap-2 rounded-lg border border-muted/20 p-2 text-xs" key={review.id}><div><p className="text-white">{review.reviewDate} · {review.domains.join(", ")}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{review.reflection}</p>{review.nextExperiment ? <p className="mt-1 text-muted-foreground">Next experiment: {review.nextExperiment}</p> : null}</div><div className="flex"><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit practice review from ${review.reviewDate}`} onClick={() => { setEditingReview(review); setReviewDate(review.reviewDate); setDomains(review.domains); setReflection(review.reflection); setNextExperiment(review.nextExperiment || ""); }}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete practice review from ${review.reviewDate}`} disabled={deleteReview.isPending} onClick={() => deleteReview.mutate(review)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}</div></details> : null}</div>
      {data.badges.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2">{data.badges.map((badge) => <div key={badge.key} className="rounded-xl border border-primary/20 bg-background/20 p-3"><p className="flex items-center gap-2 text-sm text-white"><Award className="h-4 w-4 text-primary" />{badge.name}</p><p className="mt-1 text-xs text-muted-foreground">{badge.description}</p></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">Badges appear from qualifying recorded process and disappear from the active view if its evidence is removed.</p>}
      {data.events.length ? <details className="mt-5 rounded-xl border border-muted/20 bg-background/20 p-4"><summary className="cursor-pointer text-sm text-white">Practice XP ledger</summary><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{data.events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 border-b border-muted/10 pb-2 text-xs"><span className="text-muted-foreground">{event.evidenceDate} · {event.label}{event.evidence.recordCount ? ` · ${event.evidence.recordCount} record${event.evidence.recordCount === 1 ? "" : "s"}` : ""}{event.action === "reversed" ? " · underlying records removed" : ""}</span><span className={event.xpDelta >= 0 ? "text-primary" : "text-amber-300"}>{event.action === "reversed" ? <RotateCcw className="mr-1 inline h-3 w-3" /> : null}{event.xpDelta > 0 ? "+" : ""}{event.xpDelta} XP</span></div>)}</div></details> : null}
      <p className="mt-4 text-[11px] text-muted-foreground">{data.disclosure}</p>
    </> : <p className="mt-4 text-xs text-muted-foreground">Reconciling recorded-practice evidence…</p>}
  </section>;
}
