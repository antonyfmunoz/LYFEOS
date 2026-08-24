import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HeartPulse, Pencil, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString, localNoonIso } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";

const recoveryTypes = ["sauna", "breath_training", "yoga", "meditation", "red_light", "mobility", "walk", "stretching", "cold_exposure", "other"];
const display = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

type RecoveryActivity = {
  id: number; activityType: string; customLabel: string | null; durationMinutes: number | null;
  intensity: number | null; perceivedEffect: number | null; note: string | null; tags: string[];
};
type RecoveryTagPolicy = { normalizedTag: string; displayTag: string; classification: "private_sensitive" | "private_standard"; explicitlyClassified: boolean; sharing: "excluded" };

export default function RecoveryLog() {
  const { user } = useAuth();
  const [date, setDate] = useState(getLocalDateString());
  const [activityType, setActivityType] = useState("sauna");
  const [customLabel, setCustomLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  const [intensity, setIntensity] = useState("");
  const [effect, setEffect] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTag, setFilterTag] = useState("");
  const [trendDays, setTrendDays] = useState(30);
  const [editingId, setEditingId] = useState<number | null>(null);

  const filterParams = new URLSearchParams({ date });
  if (filterType !== "all") filterParams.set("activityType", filterType);
  if (filterTag.trim()) filterParams.set("tag", filterTag.trim());
  const trendParams = new URLSearchParams({ days: String(trendDays) });
  if (filterType !== "all") trendParams.set("activityType", filterType);
  if (filterTag.trim()) trendParams.set("tag", filterTag.trim());
  const recovery = useQuery<{ activities: RecoveryActivity[] }>({
    queryKey: ["/api/recovery-activities", { date, filterType, filterTag }],
    queryFn: () => apiRequest(`/api/recovery-activities?${filterParams.toString()}`),
  });
  const trends = useQuery<{ trend: Array<{ date: string; minutes: number; entries: number }>; disclosure: string }>({
    queryKey: ["/api/recovery-activities/trends", { trendDays, filterType, filterTag }],
    queryFn: () => apiRequest(`/api/recovery-activities/trends?${trendParams.toString()}`),
  });
  const tagPolicies = useQuery<{ tags: RecoveryTagPolicy[]; disclosure: string }>({
    queryKey: ["/api/recovery-tag-policies"], queryFn: () => apiRequest("/api/recovery-tag-policies"),
  });

  const resetDraft = () => {
    setEditingId(null); setActivityType("sauna"); setCustomLabel(""); setMinutes("");
    setIntensity(""); setEffect(""); setNote(""); setTags("");
  };
  const log = useMutation({
    mutationFn: () => {
      const body = {
        activityType, customLabel: activityType === "other" ? customLabel : null,
        durationMinutes: minutes ? Number(minutes) : null, intensity: intensity ? Number(intensity) : null,
        perceivedEffect: effect ? Number(effect) : null,
        ...(editingId ? {} : { occurredAt: localNoonIso(date) }),
        note: note || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      if (!editingId) {
        if (!user?.id) throw new Error("Sign in before saving a recovery activity.");
        return submitHealthMutation({ userId: user.id, url: "/api/recovery-activities", body });
      }
      return apiRequest(`/api/recovery-activities/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: (result) => {
      resetDraft();
      if (result && typeof result === "object" && "queued" in result && result.queued) {
        void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] });
        toast({ title: "Recovery activity saved on this device", description: "LyfeOS will add it to your account when this device is online." });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities/trends"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/recovery-tag-policies"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/capability-coverage"] });
      }
    },
    onError: (error: Error) => toast({ title: "Recovery activity was not saved", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recovery-activities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities/trends"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/capability-coverage"] });
    },
  });
  const classifyTag = useMutation({
    mutationFn: ({ tag, classification }: { tag: string; classification: RecoveryTagPolicy["classification"] }) => apiRequest("/api/recovery-tag-policies", { method: "PUT", body: JSON.stringify({ tag, classification }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/recovery-tag-policies"] }),
  });

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="recovery-heading">
    <div>
      <h2 id="recovery-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><HeartPulse className="h-5 w-5" />Recovery log</h2>
      <p className="text-sm text-muted-foreground mt-1">Record the practices you choose. These are self-reports, not treatment or readiness claims.</p>
    </div>
    <div className="grid gap-2 mt-4 sm:grid-cols-[10rem_1fr_7rem_7rem_7rem_auto]">
      <Input aria-label="Recovery date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <select aria-label="Recovery activity" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={activityType} onChange={(event) => setActivityType(event.target.value)}>{recoveryTypes.map((type) => <option value={type} key={type}>{display(type)}</option>)}</select>
      <Input aria-label="Recovery duration minutes" type="number" min="1" placeholder="Minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      <Input aria-label="Recovery intensity 1 to 10" type="number" min="1" max="10" placeholder="Intensity" value={intensity} onChange={(event) => setIntensity(event.target.value)} />
      <Input aria-label="Perceived recovery effect 1 to 5" type="number" min="1" max="5" placeholder="Effect 1–5" value={effect} onChange={(event) => setEffect(event.target.value)} />
      <Button size="sm" disabled={log.isPending || (activityType === "other" && !customLabel.trim())} onClick={() => log.mutate()}>{editingId ? <Pencil /> : <Plus />}{editingId ? "Update" : "Log"}</Button>
    </div>
    {activityType === "other" ? <Input className="mt-2" aria-label="Custom recovery activity name" placeholder="Name your recovery practice" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} /> : null}
    <Input className="mt-2" aria-label="Recovery activity note" placeholder="Optional note or intent" value={note} onChange={(event) => setNote(event.target.value)} />
    <Input className="mt-2" aria-label="Recovery activity tags" placeholder="Optional tags, comma separated (for example: evening, post-workout)" value={tags} onChange={(event) => setTags(event.target.value)} />
    <p className="mt-1 text-[11px] text-muted-foreground">New tags default to private sensitive. Recovery tags are never sent to AI, planning, social, or cross-product federation.</p>
    {editingId ? <Button className="mt-2" variant="ghost" size="sm" onClick={resetDraft}>Cancel edit</Button> : null}

    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_9rem]" aria-label="Recovery history filters">
      <select aria-label="Filter recovery type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filterType} onChange={(event) => setFilterType(event.target.value)}><option value="all">All recovery types</option>{recoveryTypes.map((type) => <option value={type} key={type}>{display(type)}</option>)}</select>
      <Input aria-label="Filter recovery tag" placeholder="Filter by exact tag" value={filterTag} onChange={(event) => setFilterTag(event.target.value)} />
      <select aria-label="Recovery history period" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={trendDays} onChange={(event) => setTrendDays(Number(event.target.value))}>{[14, 30, 90, 365, 3650].map((days) => <option key={days} value={days}>{days === 3650 ? "10 years" : `${days} days`}</option>)}</select>
    </div>

    {recovery.data?.activities.length ? <div className="mt-4 flex flex-wrap gap-2">{recovery.data.activities.map((activity) => <span key={activity.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 bg-background/20 px-2 py-1 text-xs text-muted-foreground">{activity.customLabel || display(activity.activityType)}{activity.durationMinutes ? ` · ${activity.durationMinutes}m` : ""}{activity.intensity ? ` · intensity ${activity.intensity}/10` : ""}{activity.perceivedEffect ? ` · effect ${activity.perceivedEffect}/5` : ""}{activity.tags?.length ? ` · ${activity.tags.map((tag) => `#${tag}`).join(" ")}` : ""}{activity.note ? ` · ${activity.note}` : ""}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${activity.customLabel || display(activity.activityType)} recovery entry`} onClick={() => { setEditingId(activity.id); setActivityType(activity.activityType); setCustomLabel(activity.customLabel || ""); setMinutes(activity.durationMinutes ? String(activity.durationMinutes) : ""); setIntensity(activity.intensity ? String(activity.intensity) : ""); setEffect(activity.perceivedEffect ? String(activity.perceivedEffect) : ""); setNote(activity.note || ""); setTags(activity.tags?.join(", ") || ""); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${activity.customLabel || display(activity.activityType)} recovery entry`} disabled={remove.isPending} onClick={() => remove.mutate(activity.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : <p className="mt-4 text-xs text-muted-foreground">No matching recovery entries for this date.</p>}
    {tagPolicies.data?.tags.length ? <details className="mt-4 rounded-lg border border-muted/20 bg-background/20 p-3"><summary className="cursor-pointer text-xs font-medium">Private tag classifications</summary><p className="mt-2 text-[11px] text-muted-foreground">{tagPolicies.data.disclosure}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{tagPolicies.data.tags.map((policy) => <label key={policy.normalizedTag} className="flex items-center justify-between gap-2 rounded-md border border-muted/15 px-2 py-2 text-xs"><span>#{policy.displayTag}</span><select aria-label={`Privacy classification for ${policy.displayTag}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={policy.classification} disabled={classifyTag.isPending} onChange={(event) => classifyTag.mutate({ tag: policy.displayTag, classification: event.target.value as RecoveryTagPolicy["classification"] })}><option value="private_sensitive">Private sensitive</option><option value="private_standard">Standard private</option></select></label>)}</div></details> : null}
    {trends.data?.trend.some((entry) => entry.entries > 0) ? <div className="mt-5 h-40"><p className="text-xs text-muted-foreground mb-2">Logged recovery minutes in the selected period</p><ResponsiveContainer width="100%" height="100%"><BarChart data={trends.data.trend}><XAxis dataKey="date" tickFormatter={(item) => item.slice(5)} tick={{ fontSize: 10 }} /><YAxis width={30} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={(item) => item} formatter={(item: number) => [`${item} min`, "Logged recovery"]} /><Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : null}
    {log.error && <p className="text-xs text-destructive mt-2">Could not save that recovery activity. Check the values and try again.</p>}
  </section>;
}
