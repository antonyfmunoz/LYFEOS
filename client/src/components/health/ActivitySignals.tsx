import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Footprints } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type SignalSeries = {
  metricKey: string; displayName: string; unit: string; source: string; aggregation: string; preferred: boolean;
  recordedRecords: number; includedRecords: number; excludedRecords: number;
  points: Array<{ date: string; value: number; records: number }>;
  omittedAmbiguousDates: string[]; disclosure: string;
};
type ActivityResponse = {
  days: number; period: { startDate: string; endDate: string; timeZone: string }; series: SignalSeries[];
  workoutSources: Array<{ source: string; workouts: number; recordedDurationMinutes: number; activities: string[] }>;
  disclosure: string;
};

const displayValue = (value: number, unit: string) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit === "count" ? 0 : 2 }).format(value)} ${unit}`;

export default function ActivitySignals() {
  const [days, setDays] = useState(30);
  const activity = useQuery<ActivityResponse>({
    queryKey: ["/api/health-fitness/activity-signals", { days }],
    queryFn: () => apiRequest(`/api/health-fitness/activity-signals?days=${days}`),
  });
  const grouped = (activity.data?.series || []).reduce<Record<string, SignalSeries[]>>((byMetric, series) => {
    (byMetric[series.metricKey] ||= []).push(series);
    return byMetric;
  }, {});

  return <section className="glassmorphic mb-8 rounded-2xl border border-primary/30 p-6" aria-labelledby="activity-signals-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="activity-signals-heading" className="flex items-center gap-2 font-orbitron text-lg text-primary"><Footprints className="h-5 w-5" />Activity signals</h2><p className="mt-1 text-sm text-muted-foreground">Recorded steps, active energy, distance, and workouts—kept separate by source.</p></div><div className="flex gap-1" aria-label="Activity signal period">{[7, 30, 90, 365].map((option) => <button key={option} type="button" onClick={() => setDays(option)} className={`rounded-md border px-2 py-1 text-xs font-mono ${days === option ? "border-primary/50 bg-primary/20 text-primary" : "border-muted/20 text-muted-foreground"}`}>{option === 365 ? "1y" : `${option}d`}</button>)}</div></div>
    {activity.isLoading ? <p className="mt-4 text-xs text-muted-foreground" role="status">Loading activity records…</p> : null}
    {!activity.isLoading && !activity.data?.series.length && !activity.data?.workoutSources.length ? <p className="mt-4 rounded-lg border border-muted/20 bg-background/20 p-3 text-xs text-muted-foreground">No governed activity signals are recorded in this period. Manual entries can use the governed metric ledger; device imports require an authorized native connector.</p> : null}
    <div className="mt-4 grid gap-4 lg:grid-cols-3">{Object.entries(grouped).map(([metricKey, series]) => <div key={metricKey} className="rounded-xl border border-muted/20 bg-background/20 p-3"><h3 className="text-sm font-semibold">{series?.[0]?.displayName || metricKey}</h3><div className="mt-3 space-y-3">{series?.map((item) => {
      const total = item.points.reduce((sum, point) => sum + point.value, 0);
      const max = Math.max(...item.points.map((point) => Math.abs(point.value)), 1);
      return <div key={`${item.metricKey}:${item.unit}:${item.source}`} className="rounded-lg border border-muted/20 p-2"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-medium capitalize">{item.source.replaceAll("_", " ")}{item.preferred ? <span className="ml-1 rounded border border-primary/20 px-1 text-[9px] uppercase text-primary">preferred</span> : null}</span><span className="font-mono text-primary">{displayValue(total, item.unit)} recorded</span></div><p className="mt-1 text-[10px] text-muted-foreground">{item.points.length} recorded day(s) · {item.includedRecords}/{item.recordedRecords} records included · {item.aggregation}</p><div className="mt-2 flex h-14 items-end gap-0.5" aria-label={`${item.displayName} daily recorded values from ${item.source}`}>{item.points.slice(-31).map((point) => <span key={point.date} title={`${point.date}: ${displayValue(point.value, item.unit)}`} className="min-w-1 flex-1 rounded-t bg-primary/60" style={{ height: `${Math.max(3, Math.abs(point.value) / max * 100)}%` }} />)}</div>{item.omittedAmbiguousDates.length ? <p className="mt-2 text-[10px] text-amber-300">Withheld ambiguous dates: {item.omittedAmbiguousDates.join(", ")}</p> : null}{item.excludedRecords ? <p className="mt-1 text-[10px] text-muted-foreground">{item.excludedRecords} record(s) remain stored but are excluded from derived totals.</p> : null}</div>;
    })}</div></div>)}</div>
    {activity.data?.workoutSources.length ? <div className="mt-4 rounded-xl border border-muted/20 bg-background/20 p-3"><h3 className="text-sm font-semibold">Submitted workouts by source</h3><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{activity.data.workoutSources.map((group) => <div key={group.source} className="rounded-md border border-muted/20 p-2 text-xs"><p className="font-medium capitalize">{group.source.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-primary">{group.workouts} workouts · {group.recordedDurationMinutes} recorded min</p><p className="mt-1 text-[10px] text-muted-foreground">{group.activities.join(", ") || "No activity label"}</p></div>)}</div></div> : null}
    <p className="mt-4 text-[11px] text-muted-foreground">{activity.data?.disclosure || "Sources stay separate; missing records are not treated as zero."}</p>
  </section>;
}
