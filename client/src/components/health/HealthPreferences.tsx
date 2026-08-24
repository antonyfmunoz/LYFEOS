import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3, Settings2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBrowserTimeZone } from "@/lib/utils";

export const healthTrackingDomains = ["nutrition", "training", "recovery", "sleep", "activity", "body", "metrics", "supplements", "planning", "connections"] as const;
export type HealthTrackingDomain = typeof healthTrackingDomains[number];
type Profile = { weightUnit: string; heightUnit: string; energyUnit: string; volumeUnit: string; timeZone: string | null; utcOffsetMinutes: number | null; hydrationReminderEnabled: boolean; hydrationReminderIntervalMinutes: number; trackedDomains: HealthTrackingDomain[] };

export default function HealthPreferences() {
  const profile = useQuery<{ profile: Profile | null }>({ queryKey: ["/api/health-fitness/profile"], queryFn: () => apiRequest("/api/health-fitness/profile") });
  const [weightUnit, setWeightUnit] = useState("kg");
  const [heightUnit, setHeightUnit] = useState("cm");
  const [energyUnit, setEnergyUnit] = useState("kcal");
  const [volumeUnit, setVolumeUnit] = useState("ml");
  const [timeZone, setTimeZone] = useState(getBrowserTimeZone());
  const [hydrationReminderEnabled, setHydrationReminderEnabled] = useState(false);
  const [hydrationReminderIntervalMinutes, setHydrationReminderIntervalMinutes] = useState(120);
  const [trackedDomains, setTrackedDomains] = useState<HealthTrackingDomain[]>([...healthTrackingDomains]);
  useEffect(() => {
    if (!profile.data?.profile) return;
    setWeightUnit(profile.data.profile.weightUnit); setHeightUnit(profile.data.profile.heightUnit);
    setEnergyUnit(profile.data.profile.energyUnit); setVolumeUnit(profile.data.profile.volumeUnit);
    setTimeZone(profile.data.profile.timeZone || getBrowserTimeZone());
    setHydrationReminderEnabled(profile.data.profile.hydrationReminderEnabled);
    setHydrationReminderIntervalMinutes(profile.data.profile.hydrationReminderIntervalMinutes);
    setTrackedDomains(Array.isArray(profile.data.profile.trackedDomains) ? profile.data.profile.trackedDomains.filter((domain): domain is HealthTrackingDomain => healthTrackingDomains.includes(domain as HealthTrackingDomain)) : [...healthTrackingDomains]);
  }, [profile.data]);
  const save = useMutation({
    mutationFn: () => apiRequest("/api/health-fitness/profile", { method: "PATCH", body: JSON.stringify({ weightUnit, heightUnit, energyUnit, volumeUnit, timeZone, utcOffsetMinutes: -new Date().getTimezoneOffset(), hydrationReminderEnabled, hydrationReminderIntervalMinutes, trackedDomains }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/profile"] }),
  });
  return <details className="glassmorphic rounded-2xl p-5 mb-8 border border-primary/30">
    <summary className="cursor-pointer font-orbitron text-sm text-primary flex items-center gap-2"><Settings2 className="h-4 w-4" />Health units & calendar context</summary>
    <p className="mt-2 text-xs text-muted-foreground">New timestamped records snapshot this device’s IANA timezone and the event-time UTC offset. Historical records are never silently rewritten after travel or daylight-saving changes.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      <select aria-label="Preferred weight unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={weightUnit} onChange={(event) => setWeightUnit(event.target.value)}><option value="kg">Weight: kg</option><option value="lb">Weight: lb</option></select>
      <select aria-label="Preferred height unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={heightUnit} onChange={(event) => setHeightUnit(event.target.value)}><option value="cm">Height: cm</option><option value="in">Height: inches</option></select>
      <select aria-label="Preferred energy unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={energyUnit} onChange={(event) => setEnergyUnit(event.target.value)}><option value="kcal">Energy: kcal</option><option value="kJ">Energy: kJ</option></select>
      <select aria-label="Preferred volume unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={volumeUnit} onChange={(event) => setVolumeUnit(event.target.value)}><option value="ml">Volume: ml</option><option value="fl_oz">Volume: fl oz</option></select>
    </div>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Clock3 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Health calendar IANA time zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} /></div><Button size="sm" variant="outline" onClick={() => setTimeZone(getBrowserTimeZone())}>Use device timezone</Button><Button size="sm" disabled={!timeZone.trim() || save.isPending} onClick={() => save.mutate()}>Save preferences</Button></div>
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-muted/20 p-3 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={hydrationReminderEnabled} onChange={(event) => setHydrationReminderEnabled(event.target.checked)} />Show a neutral in-app hydration logging cue while LyfeOS is open</label><select aria-label="Hydration logging cue interval" className="h-10 rounded-md border border-input bg-background px-3 text-sm" disabled={!hydrationReminderEnabled} value={hydrationReminderIntervalMinutes} onChange={(event) => setHydrationReminderIntervalMinutes(Number(event.target.value))}>{[60, 90, 120, 180, 240, 360, 480].map((minutes) => <option key={minutes} value={minutes}>After {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}</option>)}</select></div>
    <p className="mt-2 text-[11px] text-muted-foreground">This optional cue is based only on the interval you choose. It is not a hydration recommendation, alarm, background notification, or health-status signal.</p>
    <fieldset className="mt-3 rounded-lg border border-muted/20 p-3"><legend className="px-1 text-xs font-medium text-white">Health workspace shortcuts</legend><p className="mb-2 text-[11px] text-muted-foreground">Choose the areas you want quick access to. Everything is optional, and unselected workspaces remain available below.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{healthTrackingDomains.map((domain) => <label key={domain} className="flex items-center gap-2 text-xs capitalize text-muted-foreground"><input type="checkbox" checked={trackedDomains.includes(domain)} onChange={(event) => setTrackedDomains((current) => event.target.checked ? [...current, domain] : current.filter((item) => item !== domain))} />{domain}</label>)}</div></fieldset>
    {save.isSuccess ? <p className="mt-2 text-xs text-primary" role="status">Health units and calendar context saved.</p> : null}
    {save.error ? <p className="mt-2 text-xs text-destructive" role="alert">Could not save these health preferences. Check the IANA timezone name.</p> : null}
  </details>;
}
