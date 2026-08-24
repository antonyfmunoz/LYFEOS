import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString } from "@/lib/utils";

const recoveryTypes = ["sauna", "breath_training", "yoga", "meditation", "red_light", "mobility", "walk", "stretching", "cold_exposure", "other"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

type Routine = {
  id: number; name: string; activityType: string; customLabel: string | null; durationMinutes: number | null;
  intensity: number | null; cadence: string; weekdays: number[]; timeOfDay: string | null;
  reminderEnabled: boolean; tags: string[]; note: string | null; active: boolean; due: boolean;
  loggedActivity: { id: number } | null;
};

export default function RecoveryRoutines() {
  const [date, setDate] = useState(getLocalDateString());
  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState("meditation");
  const [customLabel, setCustomLabel] = useState("");
  const [duration, setDuration] = useState("");
  const [intensity, setIntensity] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const routines = useQuery<{ routines: Routine[]; disclosure: string }>({
    queryKey: ["/api/recovery-routines", { date, includeInactive: true }],
    queryFn: () => apiRequest(`/api/recovery-routines?date=${date}&includeInactive=true`),
  });

  const reset = () => {
    setEditingId(null); setName(""); setActivityType("meditation"); setCustomLabel(""); setDuration("");
    setIntensity(""); setCadence("daily"); setSelectedWeekdays([]); setTimeOfDay("");
    setReminderEnabled(false); setTags(""); setNote(""); setActive(true);
  };
  const save = useMutation({
    mutationFn: () => apiRequest(editingId ? `/api/recovery-routines/${editingId}` : "/api/recovery-routines", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify({
        name, activityType, customLabel: activityType === "other" ? customLabel : null,
        durationMinutes: duration ? Number(duration) : null, intensity: intensity ? Number(intensity) : null,
        cadence, weekdays: cadence === "specific_days" ? selectedWeekdays : [], timeOfDay: timeOfDay || null,
        reminderEnabled, tags: tags.split(",").map((item) => item.trim()).filter(Boolean), note: note || null, active,
      }),
    }),
    onSuccess: () => { reset(); void queryClient.invalidateQueries({ queryKey: ["/api/recovery-routines"] }); void queryClient.invalidateQueries({ queryKey: ["/api/recovery-tag-policies"] }); },
  });
  const log = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recovery-routines/${id}/log`, { method: "POST", body: JSON.stringify({ date }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/recovery-routines"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/recovery-activities/trends"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/capability-coverage"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recovery-routines/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/recovery-routines"] }),
  });

  const edit = (routine: Routine) => {
    setEditingId(routine.id); setName(routine.name); setActivityType(routine.activityType);
    setCustomLabel(routine.customLabel || ""); setDuration(routine.durationMinutes ? String(routine.durationMinutes) : "");
    setIntensity(routine.intensity ? String(routine.intensity) : ""); setCadence(routine.cadence);
    setSelectedWeekdays(routine.weekdays || []); setTimeOfDay(routine.timeOfDay || "");
    setReminderEnabled(routine.reminderEnabled); setTags(routine.tags?.join(", ") || "");
    setNote(routine.note || ""); setActive(routine.active);
  };
  const canSave = name.trim() && (activityType !== "other" || customLabel.trim()) && (cadence !== "specific_days" || selectedWeekdays.length > 0);

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="recovery-routines-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="recovery-routines-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Bell className="h-5 w-5" />Recovery routines</h2><p className="text-sm text-muted-foreground mt-1">Plan recurring practices. In-app reminders show what is due; nothing is recorded until you choose Log.</p></div>
      <Input className="w-40" aria-label="Recovery routine date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      <Input aria-label="Recovery routine name" placeholder="Routine name" value={name} onChange={(event) => setName(event.target.value)} />
      <select aria-label="Recovery routine activity" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={activityType} onChange={(event) => setActivityType(event.target.value)}>{recoveryTypes.map((type) => <option key={type} value={type}>{title(type)}</option>)}</select>
      <Input aria-label="Recovery routine duration" type="number" min="1" placeholder="Minutes" value={duration} onChange={(event) => setDuration(event.target.value)} />
      <Input aria-label="Recovery routine intensity" type="number" min="1" max="10" placeholder="Intensity 1–10" value={intensity} onChange={(event) => setIntensity(event.target.value)} />
    </div>
    {activityType === "other" ? <Input className="mt-2" aria-label="Custom recovery routine activity" placeholder="Custom activity" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} /> : null}
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <select aria-label="Recovery routine cadence" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={cadence} onChange={(event) => setCadence(event.target.value)}><option value="daily">Daily</option><option value="specific_days">Specific days</option><option value="as_needed">As needed</option></select>
      <Input aria-label="Recovery routine time" type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
      <Input aria-label="Recovery routine tags" placeholder="Tags, comma separated" value={tags} onChange={(event) => setTags(event.target.value)} />
    </div>
    {cadence === "specific_days" ? <fieldset aria-label="Recovery routine weekdays" className="mt-3 flex flex-wrap gap-3"><legend className="sr-only">Recovery routine weekdays</legend>{weekdays.map((weekday, index) => <label key={weekday} className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={selectedWeekdays.includes(index)} onChange={() => setSelectedWeekdays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort())} />{weekday}</label>)}</fieldset> : null}
    <Input className="mt-2" aria-label="Recovery routine note" placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <label className="flex items-center gap-2"><input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />Show an in-app reminder when due</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Routine active</label>
      <Button size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{editingId ? <Pencil /> : <Plus />}{editingId ? "Update routine" : "Add routine"}</Button>
      {editingId ? <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button> : null}
    </div>
    {save.error ? <p className="mt-2 text-xs text-destructive">Could not save that routine. Check its schedule and values.</p> : null}

    <div className="mt-5 space-y-2">
      {routines.data?.routines.length ? routines.data.routines.map((routine) => <div key={routine.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-muted/20 bg-background/20 px-3 py-3">
        <div className="min-w-0"><p className="text-sm text-white">{routine.name} {!routine.active ? <span className="text-xs text-muted-foreground">· inactive</span> : routine.loggedActivity ? <span className="text-xs text-primary">· logged</span> : routine.due ? <span className="text-xs text-amber-300">· due</span> : null}</p><p className="text-xs text-muted-foreground">{routine.customLabel || title(routine.activityType)}{routine.durationMinutes ? ` · ${routine.durationMinutes}m` : ""}{routine.timeOfDay ? ` · ${routine.timeOfDay}` : ""} · {title(routine.cadence)}{routine.reminderEnabled ? " · in-app reminder" : ""}</p></div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={routine.loggedActivity ? "ghost" : "default"} disabled={!routine.active || !!routine.loggedActivity || log.isPending} onClick={() => log.mutate(routine.id)}>{routine.loggedActivity ? <Check /> : <Plus />}{routine.loggedActivity ? "Logged" : "Log"}</Button>
          <Button variant="ghost" size="icon" aria-label={`Edit ${routine.name} routine`} onClick={() => edit(routine)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${routine.name} routine`} disabled={remove.isPending} onClick={() => remove.mutate(routine.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>) : <p className="text-xs text-muted-foreground">No recovery routines yet.</p>}
    </div>
    {log.error ? <p className="mt-2 text-xs text-destructive">Could not log that routine. It may already be recorded for this date.</p> : null}
  </section>;
}
