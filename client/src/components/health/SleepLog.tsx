import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoonStar, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getLocalDateString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";

type SleepRecord = {
  date: string;
  sleepTime: string | null;
  wakeTime: string | null;
  sleepQuality: number | null;
  sleepNote: string | null;
  durationMinutes: number | null;
  source: "manual";
};

type SleepNap = { id: number; date: string; startTime: string; endTime: string; sleepQuality: number | null; note: string | null; source: "manual"; durationMinutes: number };
type SleepSession = { id: number; startedAt: string; endedAt: string; source: "manual" | "transcribed_device" | "imported"; deviceName: string | null; method: string | null; awakeMinutes: number | null; lightMinutes: number | null; deepMinutes: number | null; remMinutes: number | null; subjectiveQuality: number | null; note: string | null; revision: number; durationMinutes: number };
type SleepResponse = { days: number; records: SleepRecord[]; naps: SleepNap[]; sessions: SleepSession[]; disclosure: string };

function durationLabel(minutes: number | null): string {
  if (minutes === null) return "Duration unavailable";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function localDateTimeValue(value: string): string { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }

export default function SleepLog() {
  const { user } = useAuth();
  const [date, setDate] = useState(getLocalDateString());
  const today = getLocalDateString();
  const [sleepTime, setSleepTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [sleepNote, setSleepNote] = useState("");
  const [napStartTime, setNapStartTime] = useState("");
  const [napEndTime, setNapEndTime] = useState("");
  const [napQuality, setNapQuality] = useState("");
  const [napNote, setNapNote] = useState("");
  const [editingNapId, setEditingNapId] = useState<number | null>(null);
  const [sessionStart, setSessionStart] = useState("");
  const [sessionEnd, setSessionEnd] = useState("");
  const [sessionSource, setSessionSource] = useState<"manual" | "transcribed_device">("manual");
  const [sessionDevice, setSessionDevice] = useState("");
  const [sessionMethod, setSessionMethod] = useState("");
  const [sessionStages, setSessionStages] = useState({ awake: "", light: "", deep: "", rem: "" });
  const [sessionQuality, setSessionQuality] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingSessionRevision, setEditingSessionRevision] = useState<number | null>(null);
  const sleep = useQuery<SleepResponse>({
    queryKey: ["/api/health-fitness/sleep", { days: 14 }],
    queryFn: () => apiRequest(`/api/health-fitness/sleep?days=14&endDate=${today}`),
  });
  const selected = sleep.data?.records.find((record) => record.date === date);
  const selectedNaps = sleep.data?.naps.filter((nap) => nap.date === date) || [];

  useEffect(() => {
    setSleepTime(selected?.sleepTime || "");
    setWakeTime(selected?.wakeTime || "");
    setSleepQuality(selected?.sleepQuality ? String(selected.sleepQuality) : "");
    setSleepNote(selected?.sleepNote || "");
  }, [date, selected?.sleepTime, selected?.wakeTime, selected?.sleepQuality, selected?.sleepNote]);

  const save = useMutation({
    mutationFn: () => apiRequest<{ record: SleepRecord }>("/api/health-fitness/sleep", {
      method: "PUT",
      body: JSON.stringify({ date, sleepTime: sleepTime || null, wakeTime: wakeTime || null, sleepQuality: sleepQuality ? Number(sleepQuality) : null, sleepNote: sleepNote.trim() || null }),
    }),
    onSuccess: () => void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/sleep"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/stat-analytics"] }),
    ]),
  });
  const resetNapDraft = () => { setNapStartTime(""); setNapEndTime(""); setNapQuality(""); setNapNote(""); setEditingNapId(null); };
  const saveNap = useMutation({
    mutationFn: () => apiRequest(editingNapId ? `/api/health-fitness/sleep/naps/${editingNapId}` : "/api/health-fitness/sleep/naps", {
      method: editingNapId ? "PATCH" : "POST",
      body: JSON.stringify({ date, startTime: napStartTime, endTime: napEndTime, sleepQuality: napQuality ? Number(napQuality) : null, note: napNote.trim() || null }),
    }),
    onSuccess: () => { resetNapDraft(); void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/sleep"] }); },
  });
  const removeNap = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/health-fitness/sleep/naps/${id}`, { method: "DELETE" }),
    onSuccess: () => { resetNapDraft(); void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/sleep"] }); },
  });
  const editNap = (nap: SleepNap) => {
    setEditingNapId(nap.id);
    setNapStartTime(nap.startTime);
    setNapEndTime(nap.endTime);
    setNapQuality(nap.sleepQuality ? String(nap.sleepQuality) : "");
    setNapNote(nap.note || "");
  };
  const resetSession = () => { setSessionStart(""); setSessionEnd(""); setSessionSource("manual"); setSessionDevice(""); setSessionMethod(""); setSessionStages({ awake: "", light: "", deep: "", rem: "" }); setSessionQuality(""); setSessionNote(""); setEditingSessionId(null); setEditingSessionRevision(null); };
  const saveSession = useMutation({
    mutationFn: () => {
      const body = { startedAt: new Date(sessionStart).toISOString(), endedAt: new Date(sessionEnd).toISOString(), source: sessionSource, deviceName: sessionDevice.trim() || null, method: sessionMethod.trim() || null, awakeMinutes: sessionStages.awake ? Number(sessionStages.awake) : null, lightMinutes: sessionStages.light ? Number(sessionStages.light) : null, deepMinutes: sessionStages.deep ? Number(sessionStages.deep) : null, remMinutes: sessionStages.rem ? Number(sessionStages.rem) : null, subjectiveQuality: sessionQuality ? Number(sessionQuality) : null, note: sessionNote.trim() || null };
      if (!editingSessionId) {
        if (!user?.id) throw new Error("Sign in before saving a sleep session.");
        return submitHealthMutation({ userId: user.id, url: "/api/health-fitness/sleep/sessions", body });
      }
      return apiRequest(`/api/health-fitness/sleep/sessions/${editingSessionId}`, { method: "PATCH", headers: editingSessionRevision ? { "x-lyfeos-expected-revision": String(editingSessionRevision) } : undefined, body: JSON.stringify(body) });
    },
    onSuccess: (result) => { resetSession(); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Sleep session saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/sleep"] }); },
    onError: (error: Error) => toast({ title: "Sleep session was not saved", description: error.message, variant: "destructive" }),
  });
  const removeSession = useMutation({ mutationFn: (id: number) => { const session = sleep.data?.sessions.find((candidate) => candidate.id === id); if (!session) throw new Error("Reload this sleep session before deleting it."); return apiRequest(`/api/health-fitness/sleep/sessions/${id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(session.revision) } }); }, onSuccess: () => { resetSession(); void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/sleep"] }); } });
  const editSession = (session: SleepSession) => { setEditingSessionId(session.id); setEditingSessionRevision(session.revision); setSessionStart(localDateTimeValue(session.startedAt)); setSessionEnd(localDateTimeValue(session.endedAt)); setSessionSource(session.source === "imported" ? "transcribed_device" : session.source); setSessionDevice(session.deviceName || ""); setSessionMethod(session.method || ""); setSessionStages({ awake: session.awakeMinutes == null ? "" : String(session.awakeMinutes), light: session.lightMinutes == null ? "" : String(session.lightMinutes), deep: session.deepMinutes == null ? "" : String(session.deepMinutes), rem: session.remMinutes == null ? "" : String(session.remMinutes) }); setSessionQuality(session.subjectiveQuality == null ? "" : String(session.subjectiveQuality)); setSessionNote(session.note || ""); };
  const chartData = useMemo(() => (sleep.data?.records || []).map((record) => ({
    ...record,
    durationHours: record.durationMinutes === null ? null : Math.round(record.durationMinutes / 6) / 10,
  })), [sleep.data?.records]);

  return (
    <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="sleep-log-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="sleep-log-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><MoonStar className="h-5 w-5" />Sleep log</h2>
          <p className="text-sm text-muted-foreground mt-1">The same bed and wake times used by your daily check-in, now visible in Health.</p>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground border border-muted/25 rounded px-2 py-1 whitespace-nowrap">MANUAL · PRIVATE</span>
      </div>

      <div className="grid gap-2 mt-4 sm:grid-cols-[10rem_1fr_1fr_10rem_auto]">
        <Input aria-label="Sleep record date" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
        <Input aria-label="Sleep time" type="time" value={sleepTime} onChange={(event) => setSleepTime(event.target.value)} />
        <Input aria-label="Following wake time" type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
        <select aria-label="Subjective sleep quality" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={sleepQuality} onChange={(event) => setSleepQuality(event.target.value)}><option value="">Quality (optional)</option><option value="1">1 · Very poor</option><option value="2">2 · Poor</option><option value="3">3 · Fair</option><option value="4">4 · Good</option><option value="5">5 · Very good</option></select>
        <Button size="sm" disabled={!date || (!sleepTime && !wakeTime && !sleepQuality && !sleepNote.trim() && !selected) || save.isPending} onClick={() => save.mutate()}><Save />Save</Button>
      </div>
      <Input className="mt-2" aria-label="Optional sleep reflection" maxLength={500} placeholder="Optional context: interruptions, environment, how it felt" value={sleepNote} onChange={(event) => setSleepNote(event.target.value)} />
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted-foreground">
        <span>Sleep time: {sleepTime || "not recorded"}</span>
        <span>Following wake: {wakeTime || "not recorded"}</span>
        <span>{durationLabel(selected?.durationMinutes ?? null)}</span>
        <span>Subjective quality: {sleepQuality || "not recorded"}{sleepQuality ? "/5" : ""}</span>
      </div>
      {save.error ? <p className="text-xs text-destructive mt-2">Could not save those times. Check the date and times, then try again.</p> : null}

      <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3">
        <p className="text-sm font-semibold">Naps on {date}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Record each nap separately; duration is calculated from your entered times.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
          <Input aria-label="Nap start time" type="time" value={napStartTime} onChange={(event) => setNapStartTime(event.target.value)} />
          <Input aria-label="Nap end time" type="time" value={napEndTime} onChange={(event) => setNapEndTime(event.target.value)} />
          <select aria-label="Subjective nap quality" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={napQuality} onChange={(event) => setNapQuality(event.target.value)}><option value="">Quality (optional)</option><option value="1">1 · Very poor</option><option value="2">2 · Poor</option><option value="3">3 · Fair</option><option value="4">4 · Good</option><option value="5">5 · Very good</option></select>
          <Button size="sm" disabled={!napStartTime || !napEndTime || saveNap.isPending} onClick={() => saveNap.mutate()}>{editingNapId ? <Pencil /> : <Plus />}{editingNapId ? "Update nap" : "Add nap"}</Button>
        </div>
        <Input className="mt-2" aria-label="Optional nap reflection" maxLength={500} placeholder="Optional nap context" value={napNote} onChange={(event) => setNapNote(event.target.value)} />
        {editingNapId ? <Button className="mt-2" variant="ghost" size="sm" onClick={resetNapDraft}>Cancel nap edit</Button> : null}
        {saveNap.error ? <p className="mt-2 text-xs text-destructive">Could not save that nap. Check that both times form a plausible duration.</p> : null}
        {selectedNaps.length ? <div className="mt-3 space-y-2">{selectedNaps.map((nap) => <div key={nap.id} className="flex items-center justify-between gap-2 rounded-lg border border-muted/20 px-3 py-2 text-xs"><span>{nap.startTime}–{nap.endTime} · {durationLabel(nap.durationMinutes)}{nap.sleepQuality ? ` · subjective ${nap.sleepQuality}/5` : ""}{nap.note ? ` · ${nap.note}` : ""}</span><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Edit nap starting ${nap.startTime}`} onClick={() => editNap(nap)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete nap starting ${nap.startTime}`} disabled={removeNap.isPending} onClick={() => removeNap.mutate(nap.id)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div> : null}
      </div>

      <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3">
        <p className="text-sm font-semibold">Detailed sleep sessions</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Keep elapsed time, optional stage durations, named source, and subjective reflection separate. Transcribing a device display does not claim a direct device connection.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Started<Input className="mt-1" aria-label="Sleep session started" type="datetime-local" value={sessionStart} onChange={(event) => setSessionStart(event.target.value)} /></label><label className="text-xs text-muted-foreground">Ended<Input className="mt-1" aria-label="Sleep session ended" type="datetime-local" value={sessionEnd} onChange={(event) => setSessionEnd(event.target.value)} /></label></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3"><select aria-label="Sleep session source" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={sessionSource} onChange={(event) => setSessionSource(event.target.value as typeof sessionSource)}><option value="manual">Manual times</option><option value="transcribed_device">Transcribed from device</option></select><Input aria-label="Sleep session device" disabled={sessionSource === "manual"} placeholder="Device name" value={sessionDevice} onChange={(event) => setSessionDevice(event.target.value)} /><Input aria-label="Sleep measurement method" placeholder="Method/version (optional)" value={sessionMethod} onChange={(event) => setSessionMethod(event.target.value)} /></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4"><Input aria-label="Awake minutes" type="number" min="0" placeholder="Awake min" value={sessionStages.awake} onChange={(event) => setSessionStages((current) => ({ ...current, awake: event.target.value }))} /><Input aria-label="Light sleep minutes" type="number" min="0" placeholder="Light min" value={sessionStages.light} onChange={(event) => setSessionStages((current) => ({ ...current, light: event.target.value }))} /><Input aria-label="Deep sleep minutes" type="number" min="0" placeholder="Deep min" value={sessionStages.deep} onChange={(event) => setSessionStages((current) => ({ ...current, deep: event.target.value }))} /><Input aria-label="REM sleep minutes" type="number" min="0" placeholder="REM min" value={sessionStages.rem} onChange={(event) => setSessionStages((current) => ({ ...current, rem: event.target.value }))} /></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto]"><select aria-label="Subjective session quality" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={sessionQuality} onChange={(event) => setSessionQuality(event.target.value)}><option value="">Reflection</option>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}/5</option>)}</select><Input aria-label="Sleep session note" maxLength={1000} placeholder="Optional reflection" value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} /><Button size="sm" disabled={!sessionStart || !sessionEnd || (sessionSource === "transcribed_device" && !sessionDevice.trim()) || saveSession.isPending} onClick={() => saveSession.mutate()}>{editingSessionId ? <Pencil /> : <Plus />}{editingSessionId ? "Correct session" : "Add session"}</Button></div>
        {editingSessionId ? <Button className="mt-2" variant="ghost" size="sm" onClick={resetSession}>Cancel session edit</Button> : null}
        {saveSession.error ? <p className="mt-2 text-xs text-destructive" role="alert">Could not save that session. Check elapsed time, stage totals, source details, or reload if the record changed.</p> : null}
        {sleep.data?.sessions.length ? <div className="mt-3 space-y-2">{sleep.data.sessions.map((session) => <div key={session.id} className="rounded-lg border border-muted/20 px-3 py-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span>{new Date(session.startedAt).toLocaleString()} → {new Date(session.endedAt).toLocaleString()} · {durationLabel(session.durationMinutes)} · {session.source.replaceAll("_", " ")}{session.deviceName ? ` · ${session.deviceName}` : ""}</span><div className="flex gap-1">{session.source !== "imported" ? <Button variant="ghost" size="icon" aria-label="Edit sleep session" onClick={() => editSession(session)}><Pencil className="h-4 w-4" /></Button> : null}<Button variant="ghost" size="icon" aria-label="Delete sleep session" disabled={removeSession.isPending} onClick={() => removeSession.mutate(session.id)}><Trash2 className="h-4 w-4" /></Button></div></div><p className="mt-1 text-[11px] text-muted-foreground">Stages: awake {session.awakeMinutes ?? "not recorded"}, light {session.lightMinutes ?? "not recorded"}, deep {session.deepMinutes ?? "not recorded"}, REM {session.remMinutes ?? "not recorded"} min{session.subjectiveQuality ? ` · subjective ${session.subjectiveQuality}/5` : ""}{session.note ? ` · ${session.note}` : ""}</p></div>)}</div> : null}
      </div>

      {chartData.some((record) => record.durationHours !== null) ? (
        <div className="mt-5 h-44">
          <p className="text-xs text-muted-foreground mb-2">Calculated duration from the last 14 days of recorded times</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tick={{ fontSize: 10 }} />
              <YAxis width={30} tick={{ fontSize: 10 }} unit="h" />
              <Tooltip labelFormatter={(value) => value} formatter={(value: number) => [`${value} hours`, "Calculated duration"]} />
              <Bar dataKey="durationHours" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground mt-4">{sleep.data?.disclosure || "Duration is calculated from recorded times; quality is subjective. Neither is measured sleep, diagnosis, readiness, or medical guidance."}</p>
    </section>
  );
}
