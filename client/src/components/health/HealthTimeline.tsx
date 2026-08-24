import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type TimelineEvent = {
  id: string;
  type: "hydration" | "measurement" | "observation" | "recovery" | "workout" | "supplement" | "fasting" | "nutrition" | "sleep";
  occurredAt: string;
  title: string;
  detail: string;
  source: string;
};

type TimelineCoverage = { type: TimelineEvent["type"]; recordCount: number; status: "recorded" | "not_recorded_in_period"; latestAt: string | null; sources: string[] };
type TimelineResponse = { days: number; startDate: string; endDate: string; timeZone: string; events: TimelineEvent[]; coverage: TimelineCoverage[]; disclosure: string };

const labels: Record<TimelineEvent["type"], string> = {
  hydration: "Hydration",
  measurement: "Body",
  observation: "Metric",
  recovery: "Recovery",
  workout: "Training",
  supplement: "Supplement",
  fasting: "Fasting",
  nutrition: "Nutrition",
  sleep: "Sleep",
};
const destinations: Record<TimelineEvent["type"], string> = {
  hydration: "daily-health-heading",
  measurement: "health-section-body",
  observation: "health-section-metrics",
  recovery: "health-section-recovery",
  workout: "health-section-training",
  supplement: "health-section-supplements",
  fasting: "daily-health-heading",
  nutrition: "health-section-nutrition",
  sleep: "health-section-sleep",
};

export default function HealthTimeline() {
  const [days, setDays] = useState(14);
  const timeline = useQuery<TimelineResponse>({
    queryKey: ["/api/health-fitness/timeline", { days }],
    queryFn: () => apiRequest(`/api/health-fitness/timeline?days=${days}`),
  });

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="health-timeline-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="health-timeline-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Activity className="h-5 w-5" />Health timeline</h2><p className="mt-1 text-sm text-muted-foreground">Automatically assembled from records you already added in Health.</p></div>
      <div className="flex gap-1" aria-label="Health timeline period">{[7, 14, 30].map((option) => <button key={option} type="button" onClick={() => setDays(option)} className={`rounded-md border px-2 py-1 text-xs font-mono ${days === option ? "border-primary/50 bg-primary/20 text-primary" : "border-muted/20 text-muted-foreground"}`}>{option}d</button>)}</div>
    </div>
    {timeline.isLoading ? <p className="mt-4 text-xs text-muted-foreground">Loading your timeline…</p> : null}
    {timeline.data?.coverage.length ? <details className="mt-4 rounded-lg border border-muted/20 bg-background/20 p-3"><summary className="cursor-pointer text-xs font-medium text-white">Record coverage for {timeline.data.startDate} through {timeline.data.endDate}</summary><p className="mt-2 text-[11px] text-muted-foreground">Not recorded means LyfeOS has no record in this selected period. It does not mean the activity did not happen and is not a health judgment.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{timeline.data.coverage.map((item) => <div key={item.type} className="rounded-md border border-muted/20 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="text-white">{labels[item.type]}</span><span className={item.status === "recorded" ? "text-primary" : "text-muted-foreground"}>{item.recordCount} recorded</span></div><p className="mt-1 text-[10px] text-muted-foreground">{item.sources.length ? `Sources: ${item.sources.join(", ")}` : "No source records in this period"}</p><a className="mt-2 inline-block text-[11px] text-primary hover:underline" href={`#${destinations[item.type]}`}>Open {labels[item.type].toLowerCase()}</a></div>)}</div></details> : null}
    {!timeline.isLoading && !timeline.data?.events.length ? <p className="mt-4 rounded-lg border border-muted/20 bg-background/20 p-3 text-xs text-muted-foreground">No Health records in this period yet. Entries appear here automatically after you log them.</p> : null}
    {timeline.data?.events.length ? <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">{timeline.data.events.map((event) => <div key={event.id} className="grid gap-2 rounded-lg border border-muted/20 bg-background/20 px-3 py-2 text-xs sm:grid-cols-[7rem_1fr_auto]">
      <div><span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">{labels[event.type]}</span><p className="mt-1 font-mono text-[10px] text-muted-foreground">{new Date(event.occurredAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
      <div><p className="font-medium capitalize">{event.title}</p><p className="mt-0.5 break-words text-muted-foreground">{event.detail}</p></div>
      <div className="text-right"><span className="block font-mono text-[10px] uppercase text-muted-foreground">{event.source}</span><a className="mt-1 inline-block text-[10px] text-primary hover:underline" href={`#${destinations[event.type]}`}>Open log</a></div>
    </div>)}</div> : null}
    <p className="mt-4 text-[11px] text-muted-foreground">{timeline.data?.disclosure || "This private timeline assembles factual and self-reported records without inferring causes or health conclusions."}</p>
  </section>;
}
