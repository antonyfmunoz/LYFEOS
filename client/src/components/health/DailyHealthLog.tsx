import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Droplets, Pencil, Pill, Play, Plus, Scale, Settings2, Square, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString, localNoonIso } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";
import { volumeFromMl, volumeToMl, type VolumeDisplayUnit } from "@shared/health-display-units";

type HealthSummary = {
  date: string;
  hydration: { consumedMl: number; targetMl: number | null; percent: number | null };
  latestWeight: { value: number; unit: string; observedAt: string } | null;
  disclosure: string;
};

type HealthProfileResponse = {
  profile: { weightUnit: "kg" | "lb"; volumeUnit: VolumeDisplayUnit; hydrationReminderEnabled: boolean; hydrationReminderIntervalMinutes: number } | null;
};

type FastingSummary = {
  recordedWindows: number;
  completedWindows: number;
  inProgressWindows: number;
  invalidCompletedWindows: number;
  completedMinutes: number;
  averageCompletedMinutes: number | null;
  shortestCompletedMinutes: number | null;
  longestCompletedMinutes: number | null;
  overlappingCompletedWindows: number;
};

type FastingResponse = {
  active: { id: number; startedAt: string } | null;
  windows: Array<{ id: number; startedAt: string; endedAt: string | null; note: string | null }>;
  summary: FastingSummary;
  days: number;
  timeZone: string;
  truncated: boolean;
  aggregationBasis: "windows_started_in_selected_period";
  disclosure: string;
};

function today(): string {
  return getLocalDateString();
}

function elapsedLabel(startedAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function completedWindowLabel(startedAt: string, endedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return "Not available";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function localDateTimeInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function refreshHealth(): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/summary"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/measurements"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/targets"] }),
  ]);
}

export default function DailyHealthLog() {
  const { user } = useAuth();
  const [hydrationMl, setHydrationMl] = useState("250");
  const [hydrationUnit, setHydrationUnit] = useState<"ml" | "l" | "fl_oz" | "cup">("ml");
  const [weight, setWeight] = useState("");
  const [hydrationTarget, setHydrationTarget] = useState("");
  const [supplementName, setSupplementName] = useState("");
  const [supplementAmount, setSupplementAmount] = useState("");
  const [supplementUnit, setSupplementUnit] = useState("mg");
  const [supplementBrand, setSupplementBrand] = useState("");
  const [supplementManufacturer, setSupplementManufacturer] = useState("");
  const [supplementForm, setSupplementForm] = useState("");
  const [supplementBarcode, setSupplementBarcode] = useState("");
  const [supplementLotNumber, setSupplementLotNumber] = useState("");
  const [supplementExpiresOn, setSupplementExpiresOn] = useState("");
  const [editingHydrationId, setEditingHydrationId] = useState<number | null>(null);
  const [editingSupplementId, setEditingSupplementId] = useState<number | null>(null);
  const [editingFastId, setEditingFastId] = useState<number | null>(null);
  const [fastStart, setFastStart] = useState("");
  const [fastEnd, setFastEnd] = useState("");
  const [fastingDays, setFastingDays] = useState(30);
  const [dismissedHydrationCue, setDismissedHydrationCue] = useState(false);
  const date = today();
  const summary = useQuery<HealthSummary>({
    queryKey: ["/api/health-fitness/summary", { date }],
    queryFn: () => apiRequest(`/api/health-fitness/summary?date=${date}`),
  });
  const profile = useQuery<HealthProfileResponse>({
    queryKey: ["/api/health-fitness/profile"],
    queryFn: () => apiRequest("/api/health-fitness/profile"),
  });
  const supplements = useQuery<{ entries: Array<{ id: number; name: string; amount: number | null; unit: string | null; brand: string | null; manufacturer: string | null; form: string | null; barcode: string | null; lotNumber: string | null; expiresOn: string | null }>; disclosure: string }>({
    queryKey: ["/api/health-fitness/supplements", { date }],
    queryFn: () => apiRequest(`/api/health-fitness/supplements?date=${date}`),
  });
  const hydrationEntries = useQuery<{ entries: Array<{ id: number; volumeMl: number; inputQuantity: number | null; inputUnit: "ml" | "l" | "fl_oz" | "cup" | null; occurredAt: string }> }>({
    queryKey: ["/api/health-fitness/hydration", { date }],
    queryFn: () => apiRequest(`/api/health-fitness/hydration?date=${date}`),
  });
  const fasting = useQuery<FastingResponse>({
    queryKey: ["/api/health-fitness/fasting", { fastingDays }], queryFn: () => apiRequest(`/api/health-fitness/fasting?days=${fastingDays}`),
  });

  useEffect(() => {
    if (!editingSupplementId) return;
    const entry = supplements.data?.entries.find((candidate) => candidate.id === editingSupplementId);
    if (!entry) return;
    setSupplementBrand(entry.brand || ""); setSupplementManufacturer(entry.manufacturer || ""); setSupplementForm(entry.form || "");
    setSupplementBarcode(entry.barcode || ""); setSupplementLotNumber(entry.lotNumber || ""); setSupplementExpiresOn(entry.expiresOn || "");
  }, [editingSupplementId, supplements.data?.entries]);

  useEffect(() => {
    if (editingHydrationId || !profile.data?.profile?.volumeUnit) return;
    const preferred = profile.data.profile.volumeUnit;
    setHydrationUnit(preferred);
    setHydrationMl(preferred === "fl_oz" ? "8" : "250");
  }, [editingHydrationId, profile.data?.profile?.volumeUnit]);

  const addHydration = useMutation({
    mutationFn: () => { const body = { quantity: Number(hydrationMl), inputUnit: hydrationUnit, ...(editingHydrationId ? {} : { occurredAt: localNoonIso(date) }) }; if (!editingHydrationId) { if (!user?.id) throw new Error("Sign in before saving hydration."); return submitHealthMutation({ userId: user.id, url: "/api/health-fitness/hydration", body }); } return apiRequest(`/api/health-fitness/hydration/${editingHydrationId}`, { method: "PATCH", body: JSON.stringify(body) }); },
    onSuccess: (result) => { setHydrationMl(hydrationUnit === "ml" ? "250" : "1"); setEditingHydrationId(null); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Hydration saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else void Promise.all([refreshHealth(), queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/hydration"] })]); },
    onError: (error: Error) => toast({ title: "Hydration was not saved", description: error.message, variant: "destructive" }),
  });
  const addWeight = useMutation({
    mutationFn: () => { if (!user?.id) throw new Error("Sign in before saving weight."); return submitHealthMutation({ userId: user.id, url: "/api/health-fitness/measurements", body: { metric: "weight", value: Number(weight), unit: profile.data?.profile?.weightUnit || "kg", observedAt: date, source: "manual" } }); },
    onSuccess: (result) => { setWeight(""); if (result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Weight saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else void refreshHealth(); },
    onError: (error: Error) => toast({ title: "Weight was not saved", description: error.message, variant: "destructive" }),
  });
  const saveHydrationTarget = useMutation({
    mutationFn: () => apiRequest("/api/health-fitness/targets", { method: "POST", body: JSON.stringify({ kind: "hydration", targetValue: volumeToMl(Number(hydrationTarget), profile.data?.profile?.volumeUnit || "ml"), unit: "ml", effectiveFrom: date, source: "user" }) }),
    onSuccess: () => { setHydrationTarget(""); void refreshHealth(); },
  });
  const addSupplement = useMutation({
    mutationFn: () => { const body = { name: supplementName, amount: supplementAmount ? Number(supplementAmount) : null, unit: supplementAmount ? supplementUnit : null, brand: supplementBrand.trim() || null, manufacturer: supplementManufacturer.trim() || null, form: supplementForm.trim() || null, barcode: supplementBarcode.trim() || null, lotNumber: supplementLotNumber.trim() || null, expiresOn: supplementExpiresOn || null, ...(editingSupplementId ? {} : { occurredAt: localNoonIso(date) }) }; if (!editingSupplementId) { if (!user?.id) throw new Error("Sign in before saving a supplement entry."); return submitHealthMutation({ userId: user.id, url: "/api/health-fitness/supplements", body }); } return apiRequest(`/api/health-fitness/supplements/${editingSupplementId}`, { method: "PATCH", body: JSON.stringify(body) }); },
    onSuccess: (result) => { setSupplementName(""); setSupplementAmount(""); setSupplementBrand(""); setSupplementManufacturer(""); setSupplementForm(""); setSupplementBarcode(""); setSupplementLotNumber(""); setSupplementExpiresOn(""); setEditingSupplementId(null); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Supplement entry saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/supplements"] }); },
    onError: (error: Error) => toast({ title: "Supplement entry was not saved", description: error.message, variant: "destructive" }),
  });
  const removeHydration = useMutation({ mutationFn: (id: number) => apiRequest(`/api/health-fitness/hydration/${id}`, { method: "DELETE" }), onSuccess: () => void Promise.all([refreshHealth(), queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/hydration"] })]) });
  const removeSupplement = useMutation({ mutationFn: (id: number) => apiRequest(`/api/health-fitness/supplements/${id}`, { method: "DELETE" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/supplements"] }) });
  const startFast = useMutation({ mutationFn: () => apiRequest("/api/health-fitness/fasting/start", { method: "POST", body: JSON.stringify({}) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/fasting"] }) });
  const endFast = useMutation({ mutationFn: () => apiRequest(`/api/health-fitness/fasting/${fasting.data?.active?.id}/end`, { method: "POST", body: JSON.stringify({}) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/fasting"] }) });
  const removeFast = useMutation({ mutationFn: (id: number) => apiRequest(`/api/health-fitness/fasting/${id}`, { method: "DELETE" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/fasting"] }) });
  const updateFast = useMutation({ mutationFn: () => apiRequest(`/api/health-fitness/fasting/${editingFastId}`, { method: "PATCH", body: JSON.stringify({ startedAt: new Date(fastStart).toISOString(), endedAt: fastEnd ? new Date(fastEnd).toISOString() : null }) }), onSuccess: () => { setEditingFastId(null); setFastStart(""); setFastEnd(""); void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/fasting"] }); } });

  const hydration = summary.data?.hydration;
  const hydrationPercent = hydration?.percent ?? 0;
  const weightUnit = profile.data?.profile?.weightUnit || "kg";
  const volumeUnit = profile.data?.profile?.volumeUnit || "ml";
  const displayedHydration = hydration ? volumeFromMl(hydration.consumedMl, volumeUnit) : null;
  const displayedHydrationTarget = hydration?.targetMl ? volumeFromMl(hydration.targetMl, volumeUnit) : null;
  const hydrationReminderDue = (() => {
    if (!profile.data?.profile?.hydrationReminderEnabled || dismissedHydrationCue) return false;
    const latest = hydrationEntries.data?.entries.reduce<number | null>((value, entry) => Math.max(value || 0, new Date(entry.occurredAt).getTime()), null) ?? null;
    return latest === null || Date.now() - latest >= profile.data.profile.hydrationReminderIntervalMinutes * 60_000;
  })();

  return (
    <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="daily-health-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2 id="daily-health-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Droplets className="h-5 w-5" />Daily Health</h2>
          <p className="text-sm text-muted-foreground mt-1">Log the basics first, then use the dedicated nutrition, training, recovery, and connection records below.</p>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground border border-muted/25 rounded px-2 py-1 whitespace-nowrap">PRIVATE BY DEFAULT</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-primary/20 bg-background/30 p-4">
          <div className="flex items-center justify-between gap-3 mb-3"><span className="text-sm font-semibold">Hydration</span><span className="font-mono text-primary text-sm">{displayedHydration !== null ? `${displayedHydration.toLocaleString()} ${volumeUnit === "fl_oz" ? "fl oz" : "ml"}` : "—"}</span></div>
          <div className="h-2 rounded-full overflow-hidden bg-muted/20 mb-2"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${hydrationPercent}%` }} /></div>
          <p className="text-xs text-muted-foreground mb-4">{displayedHydrationTarget !== null ? `${hydrationPercent}% of ${displayedHydrationTarget.toLocaleString()} ${volumeUnit === "fl_oz" ? "fl oz" : "ml"} target` : "Set a daily target when you are ready."}</p>
          <div className="flex gap-2"><Input aria-label="Hydration amount" type="number" min="0.01" step="any" max="20000" value={hydrationMl} onChange={(event) => setHydrationMl(event.target.value)} /><select aria-label="Hydration unit" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={hydrationUnit} onChange={(event) => setHydrationUnit(event.target.value as "ml" | "l" | "fl_oz" | "cup")}><option value="ml">ml</option><option value="l">L</option><option value="fl_oz">fl oz</option><option value="cup">cup</option></select><Button size="sm" disabled={!Number(hydrationMl) || addHydration.isPending} onClick={() => addHydration.mutate()}>{editingHydrationId ? <Pencil /> : <Plus />}{editingHydrationId ? "Update" : "Log"}</Button>{editingHydrationId ? <Button variant="ghost" size="sm" onClick={() => { setEditingHydrationId(null); setHydrationMl("250"); setHydrationUnit("ml"); }}>Cancel</Button> : null}</div>
          {!hydration?.targetMl && <div className="flex gap-2 mt-3"><Input aria-label={`Daily hydration target in ${volumeUnit === "fl_oz" ? "fluid ounces" : "milliliters"}`} type="number" min="1" max="100000" placeholder={`Daily target (${volumeUnit === "fl_oz" ? "fl oz" : "ml"})`} value={hydrationTarget} onChange={(event) => setHydrationTarget(event.target.value)} /><Button variant="outline" size="sm" disabled={!Number(hydrationTarget) || saveHydrationTarget.isPending} onClick={() => saveHydrationTarget.mutate()}><Settings2 />Set</Button></div>}
          {hydrationEntries.data?.entries.length ? <div className="flex flex-wrap gap-2 mt-3">{hydrationEntries.data.entries.map((entry) => <span key={entry.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 bg-background/20 px-2 py-1 text-xs text-muted-foreground">{entry.inputQuantity ?? entry.volumeMl} {entry.inputUnit || "ml"}<span className="font-mono">· {entry.volumeMl} ml</span><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${entry.volumeMl} milliliter hydration entry`} onClick={() => { setEditingHydrationId(entry.id); setHydrationMl(String(entry.inputQuantity ?? entry.volumeMl)); setHydrationUnit(entry.inputUnit || "ml"); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${entry.volumeMl} milliliter hydration entry`} disabled={removeHydration.isPending} onClick={() => removeHydration.mutate(entry.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}
          {hydrationReminderDue ? <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground" role="status"><span>Your optional logging interval has elapsed. Log only if you want to record something.</span><Button size="sm" variant="ghost" onClick={() => setDismissedHydrationCue(true)}>Dismiss today</Button></div> : null}
          {(addHydration.error || saveHydrationTarget.error) && <p className="text-xs text-destructive mt-2">Could not save that hydration record. Please check the value and try again.</p>}
        </div>

        <div className="rounded-xl border border-primary/20 bg-background/30 p-4">
          <div className="flex items-center justify-between gap-3 mb-3"><span className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-primary" />Weight</span><span className="font-mono text-primary text-sm">{summary.data?.latestWeight ? `${summary.data.latestWeight.value} ${summary.data.latestWeight.unit}` : "No entry"}</span></div>
          <p className="text-xs text-muted-foreground mb-4">{summary.data?.latestWeight ? `Last recorded ${summary.data.latestWeight.observedAt}. Your measurements stay separate from points and rank.` : "Log a baseline whenever it is useful to you. No health score is inferred."}</p>
          <div className="flex gap-2"><Input aria-label={`Weight in ${weightUnit}`} type="number" min="1" max="100000" step="0.1" placeholder={`Weight (${weightUnit})`} value={weight} onChange={(event) => setWeight(event.target.value)} /><Button size="sm" disabled={!Number(weight) || addWeight.isPending} onClick={() => addWeight.mutate()}><Plus />Log</Button></div>
          {addWeight.error && <p className="text-xs text-destructive mt-2">Could not save that measurement. Please check the value and try again.</p>}
        </div>
      </div>
      <div className="rounded-xl border border-primary/20 bg-background/30 p-4 mt-4">
        <div className="flex items-center justify-between gap-3 mb-3"><span className="text-sm font-semibold flex items-center gap-2"><Pill className="h-4 w-4 text-primary" />Supplements</span><span className="text-[11px] text-muted-foreground">SELF-REPORTED</span></div>
        <p className="text-xs text-muted-foreground mb-3">A private factual log only—LyfeOS does not provide dosage guidance or treat this as a medication record.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem_6rem_auto_auto]"><Input aria-label="Supplement name" placeholder="Name" value={supplementName} onChange={(event) => setSupplementName(event.target.value)} /><Input aria-label="Supplement amount" type="number" min="0" step="0.01" placeholder="Amount" value={supplementAmount} onChange={(event) => setSupplementAmount(event.target.value)} /><Input aria-label="Supplement unit" placeholder="Unit" value={supplementUnit} onChange={(event) => setSupplementUnit(event.target.value)} /><Button size="sm" disabled={!supplementName.trim() || (supplementAmount !== "" && (!Number(supplementAmount) || !supplementUnit.trim())) || addSupplement.isPending} onClick={() => addSupplement.mutate()}>{editingSupplementId ? <Pencil /> : <Plus />}{editingSupplementId ? "Update" : "Log"}</Button>{editingSupplementId ? <Button variant="ghost" size="sm" onClick={() => { setEditingSupplementId(null); setSupplementName(""); setSupplementAmount(""); }}>Cancel</Button> : null}</div>
        <details className="mt-2 rounded-lg border border-muted/20 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Optional product and lot details</summary><p className="mt-1 text-[11px] text-muted-foreground">Record label facts only. LyfeOS does not verify or interpret product safety, expiry, efficacy, or interactions.</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><Input aria-label="Logged supplement brand" placeholder="Brand" value={supplementBrand} onChange={(event) => setSupplementBrand(event.target.value)} /><Input aria-label="Logged supplement manufacturer" placeholder="Manufacturer" value={supplementManufacturer} onChange={(event) => setSupplementManufacturer(event.target.value)} /><Input aria-label="Logged supplement form" placeholder="Form, e.g. capsule" value={supplementForm} onChange={(event) => setSupplementForm(event.target.value)} /><Input aria-label="Logged supplement barcode" placeholder="Barcode" value={supplementBarcode} onChange={(event) => setSupplementBarcode(event.target.value)} /><Input aria-label="Logged supplement lot number" placeholder="Lot number" value={supplementLotNumber} onChange={(event) => setSupplementLotNumber(event.target.value)} /><Input aria-label="Logged supplement expiration date" type="date" value={supplementExpiresOn} onChange={(event) => setSupplementExpiresOn(event.target.value)} /></div></details>
        {supplements.data?.entries.length ? <div className="flex flex-wrap gap-2 mt-3">{supplements.data.entries.map((entry) => <span key={entry.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 bg-background/20 px-2 py-1 text-xs text-muted-foreground">{entry.name}{entry.amount ? ` ${entry.amount}${entry.unit ? ` ${entry.unit}` : ""}` : ""}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${entry.name} supplement entry`} onClick={() => { setEditingSupplementId(entry.id); setSupplementName(entry.name); setSupplementAmount(entry.amount == null ? "" : String(entry.amount)); setSupplementUnit(entry.unit || "mg"); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${entry.name} supplement entry`} disabled={removeSupplement.isPending} onClick={() => removeSupplement.mutate(entry.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}
        {supplements.data?.entries.some((entry) => entry.brand || entry.manufacturer || entry.form || entry.barcode || entry.lotNumber || entry.expiresOn) ? <details className="mt-3 rounded-lg border border-muted/20 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Recorded product and lot details</summary><div className="mt-2 space-y-1">{supplements.data.entries.filter((entry) => entry.brand || entry.manufacturer || entry.form || entry.barcode || entry.lotNumber || entry.expiresOn).map((entry) => <p className="text-xs text-muted-foreground" key={entry.id}>{entry.name}{entry.brand ? ` · ${entry.brand}` : ""}{entry.manufacturer ? ` · ${entry.manufacturer}` : ""}{entry.form ? ` · ${entry.form}` : ""}{entry.barcode ? ` · barcode ${entry.barcode}` : ""}{entry.lotNumber ? ` · lot ${entry.lotNumber}` : ""}{entry.expiresOn ? ` · label expiry ${entry.expiresOn}` : ""}</p>)}</div></details> : null}
        {addSupplement.error && <p className="text-xs text-destructive mt-2">Could not save that supplement entry. Check the values and try again.</p>}
      </div>
      <div className="rounded-xl border border-primary/20 bg-background/30 p-4 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-primary" />Fasting window</div><p className="text-xs text-muted-foreground mt-1">{fasting.data?.active ? `Active for ${elapsedLabel(fasting.data.active.startedAt)}. This is a timing record, not a recommendation.` : "Log timing only if it is useful to you. No fasting recommendation is implied."}</p></div>
        {fasting.data?.active ? <Button size="sm" variant="outline" disabled={endFast.isPending} onClick={() => endFast.mutate()}><Square />End fast</Button> : <Button size="sm" variant="outline" disabled={startFast.isPending} onClick={() => startFast.mutate()}><Play />Start fast</Button>}
      </div>
      {fasting.data?.windows.length ? <div className="flex flex-wrap gap-2 mt-3">{fasting.data.windows.slice(0, 5).map((window) => <span key={window.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 bg-background/20 px-2 py-1 text-xs text-muted-foreground">{new Date(window.startedAt).toLocaleString()} · {window.endedAt ? completedWindowLabel(window.startedAt, window.endedAt) : "active"}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label="Edit fasting window" onClick={() => { setEditingFastId(window.id); setFastStart(localDateTimeInput(window.startedAt)); setFastEnd(window.endedAt ? localDateTimeInput(window.endedAt) : ""); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label="Delete fasting window" disabled={removeFast.isPending} onClick={() => removeFast.mutate(window.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}
      <details className="mt-3 rounded-lg border border-muted/20 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">View fasting timing history</summary><div className="mt-2 flex justify-end"><select aria-label="Fasting history period" className="h-9 rounded-md border border-input bg-background px-3 text-xs" value={fastingDays} onChange={(event) => setFastingDays(Number(event.target.value))}>{[30, 90, 365, 3650].map((days) => <option key={days} value={days}>{days === 3650 ? "10 years" : `${days} days`}</option>)}</select></div>
        {fasting.data ? <><p className="mt-2 text-[11px] text-muted-foreground">Summary of self-reported windows started during the selected period.</p><dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-md border border-muted/20 p-2"><dt className="text-[10px] uppercase text-muted-foreground">Completed windows</dt><dd className="mt-1 font-mono text-sm text-primary">{fasting.data.summary.completedWindows}</dd></div><div className="rounded-md border border-muted/20 p-2"><dt className="text-[10px] uppercase text-muted-foreground">Recorded completed time</dt><dd className="mt-1 font-mono text-sm text-primary">{durationLabel(fasting.data.summary.completedMinutes)}</dd></div><div className="rounded-md border border-muted/20 p-2"><dt className="text-[10px] uppercase text-muted-foreground">Average completed window</dt><dd className="mt-1 font-mono text-sm text-primary">{durationLabel(fasting.data.summary.averageCompletedMinutes)}</dd></div><div className="rounded-md border border-muted/20 p-2"><dt className="text-[10px] uppercase text-muted-foreground">In progress</dt><dd className="mt-1 font-mono text-sm text-primary">{fasting.data.summary.inProgressWindows}</dd></div></dl></> : null}
        {fasting.data?.summary.overlappingCompletedWindows ? <p className="mt-2 text-xs text-amber-200" role="status">{fasting.data.summary.overlappingCompletedWindows} completed window(s) overlap another record. Recorded durations are shown per window and are not deduplicated.</p> : null}
        {fasting.data?.summary.invalidCompletedWindows ? <p className="mt-2 text-xs text-amber-200" role="status">{fasting.data.summary.invalidCompletedWindows} completed window(s) have an invalid time order and are excluded from duration totals.</p> : null}
        {fasting.data?.truncated ? <p className="mt-2 text-xs text-amber-200" role="status">This period has more than 5,000 records. The summary and history are limited to the 5,000 most recent starts.</p> : null}
        {fasting.data?.windows.length ? <div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-[32rem] text-left text-xs"><caption className="sr-only">Self-reported fasting timing history</caption><thead><tr className="border-b border-muted/20"><th className="p-2" scope="col">Started</th><th className="p-2" scope="col">Ended</th><th className="p-2" scope="col">Elapsed</th><th className="p-2" scope="col">Note</th></tr></thead><tbody>{fasting.data.windows.slice(0, 500).map((window) => <tr className="border-b border-muted/10" key={window.id}><td className="p-2">{new Date(window.startedAt).toLocaleString()}</td><td className="p-2">{window.endedAt ? new Date(window.endedAt).toLocaleString() : "In progress"}</td><td className="p-2">{window.endedAt ? completedWindowLabel(window.startedAt, window.endedAt) : elapsedLabel(window.startedAt)}</td><td className="p-2">{window.note || "—"}</td></tr>)}</tbody></table>{fasting.data.windows.length > 500 ? <p className="p-2 text-[11px] text-muted-foreground">Showing the 500 most recent records in this table; the summary uses all returned records.</p> : null}</div> : <p className="mt-2 text-xs text-muted-foreground">No timing records in this selected period.</p>}<p className="mt-2 text-[11px] text-muted-foreground">{fasting.data?.disclosure}</p></details>
      {editingFastId ? <div className="grid gap-2 mt-3 sm:grid-cols-[1fr_1fr_auto_auto]"><Input aria-label="Fasting start time" type="datetime-local" value={fastStart} onChange={(event) => setFastStart(event.target.value)} /><Input aria-label="Fasting end time" type="datetime-local" value={fastEnd} min={fastStart} onChange={(event) => setFastEnd(event.target.value)} /><Button size="sm" disabled={!fastStart || (fastEnd !== "" && fastEnd <= fastStart) || updateFast.isPending} onClick={() => updateFast.mutate()}><Pencil />Update window</Button><Button size="sm" variant="ghost" onClick={() => setEditingFastId(null)}>Cancel</Button></div> : null}
      <p className="text-[11px] text-muted-foreground mt-4">{summary.data?.disclosure || "Health records are private by default. Logged values and targets are not medical advice or a diagnosis."}</p>
    </section>
  );
}
