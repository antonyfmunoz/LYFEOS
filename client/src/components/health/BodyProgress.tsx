import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Scale, TrendingUp, Trash2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString } from "@/lib/utils";
import { bodyMeasurementConversionVersion, convertBodyMeasurement, governedBodyMeasurementUnits } from "@shared/body-measurements";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";

type Measurement = { id: number; metric: string; value: number; unit: string; observedAt: string; measurementMethod: string; measurementProtocol: string | null };
const metricLabels: Record<string, string> = { weight: "Weight", body_fat_percent: "Body fat", waist: "Waist", chest: "Chest", hips: "Hips", custom: "Custom" };
const methodLabels: Record<string, string> = { unspecified: "Method not specified", scale: "Scale", tape: "Tape", bia: "BIA device", caliper: "Caliper", dexa: "DEXA", bod_pod: "Bod Pod", professional: "Professional record", other: "Other" };
const defaultUnit = (metric: string) => metric === "body_fat_percent" ? "%" : metric === "weight" ? "kg" : "cm";

export default function BodyProgress() {
  const { user } = useAuth();
  const [metric, setMetric] = useState("weight");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("kg");
  const [measurementMethod, setMeasurementMethod] = useState("unspecified");
  const [measurementProtocol, setMeasurementProtocol] = useState("");
  const [bodyType, setBodyType] = useState("prefer_not_to_say");
  const [trainingExperience, setTrainingExperience] = useState("prefer_not_to_say");
  const [editingId, setEditingId] = useState<number | null>(null);
  const measurements = useQuery<{ measurements: Measurement[] }>({ queryKey: ["/api/health-fitness/measurements"], queryFn: () => apiRequest("/api/health-fitness/measurements") });
  const profile = useQuery<{ profile: { bodyType: string | null; trainingExperience: string | null; weightUnit: "kg" | "lb"; heightUnit: "cm" | "in" } | null }>({ queryKey: ["/api/health-fitness/profile"], queryFn: () => apiRequest("/api/health-fitness/profile") });
  useEffect(() => {
    if (editingId) return;
    setUnit(metric === "weight" ? profile.data?.profile?.weightUnit || "kg" : ["waist", "chest", "hips"].includes(metric) ? profile.data?.profile?.heightUnit || "cm" : defaultUnit(metric));
  }, [editingId, metric, profile.data?.profile?.heightUnit, profile.data?.profile?.weightUnit]);
  const points = useMemo(() => {
    const selected = measurements.data?.measurements.filter((entry) => entry.metric === metric) || [];
    return selected.filter((entry) => entry.measurementMethod === measurementMethod).slice().reverse().flatMap((entry) => {
      const converted = convertBodyMeasurement(entry.value, entry.metric, entry.unit, unit);
      return converted == null ? [] : [{ id: entry.id, date: entry.observedAt, value: converted, originalValue: entry.value, originalUnit: entry.unit }];
    });
  }, [measurements.data, measurementMethod, metric, unit]);
  const addMeasurement = useMutation({
    mutationFn: () => {
      const body = { metric, value: Number(value), unit, measurementMethod, measurementProtocol: measurementProtocol || null, ...(editingId ? {} : { observedAt: getLocalDateString() }), source: "manual" };
      if (!editingId) {
        if (!user?.id) throw new Error("Sign in before saving a body measurement.");
        return submitHealthMutation({ userId: user.id, url: "/api/health-fitness/measurements", body });
      }
      return apiRequest(`/api/health-fitness/measurements/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: (result) => { setValue(""); setMeasurementProtocol(""); setEditingId(null); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Body measurement saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else { void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/measurements"] }); void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/capability-coverage"] }); } },
    onError: (error: Error) => toast({ title: "Body measurement was not saved", description: error.message, variant: "destructive" }),
  });
  const removeMeasurement = useMutation({ mutationFn: (id: number) => apiRequest(`/api/health-fitness/measurements/${id}`, { method: "DELETE" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/measurements"] }) });
  const saveContext = useMutation({ mutationFn: () => apiRequest("/api/health-fitness/profile", { method: "PATCH", body: JSON.stringify({ bodyType, trainingExperience }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/profile"] }) });

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="body-progress-heading">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="body-progress-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><TrendingUp className="h-5 w-5" />Body progress</h2><p className="text-sm text-muted-foreground mt-1">A private view of entries you chose to log. It does not assign a body score or interpret outcomes.</p></div></div>
    <div className="grid gap-2 mt-4 sm:grid-cols-[1fr_7rem_6rem_auto_auto]"><select aria-label="Body measurement type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={metric} onChange={(event) => { setMetric(event.target.value); setUnit(defaultUnit(event.target.value)); }} >{Object.entries(metricLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><Input aria-label="Body measurement value" type="number" min="0" step="0.1" placeholder="Value" value={value} onChange={(event) => setValue(event.target.value)} />{governedBodyMeasurementUnits(metric) ? <select aria-label="Body measurement unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={unit} onChange={(event) => setUnit(event.target.value)}>{governedBodyMeasurementUnits(metric)?.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select> : <Input aria-label="Body measurement unit" value={unit} onChange={(event) => setUnit(event.target.value)} />}<Button size="sm" disabled={!Number(value) || !unit.trim() || addMeasurement.isPending} onClick={() => addMeasurement.mutate()}>{editingId ? <Pencil /> : <Scale />}{editingId ? "Update" : "Log"}</Button>{editingId ? <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setValue(""); setMeasurementProtocol(""); }}>Cancel</Button> : null}</div>
    <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_1fr]"><select aria-label="Body measurement method" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={measurementMethod} onChange={(event) => setMeasurementMethod(event.target.value)}>{Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Input aria-label="Body measurement protocol" maxLength={300} placeholder="Optional protocol, device, site, or conditions" value={measurementProtocol} onChange={(event) => setMeasurementProtocol(event.target.value)} /></div>
    <p className="mt-2 text-[11px] text-muted-foreground">The trajectory compares only this metric and method. Supported weight and circumference units are converted for display with {bodyMeasurementConversionVersion}; original values stay unchanged. Protocol text is factual context, not a quality judgment.</p>
    <div className="mt-4 rounded-lg border border-primary/15 bg-background/20 p-3"><p className="text-xs text-muted-foreground mb-2">Self-described training context. It is not a clinical classification and does not automatically change targets or prescriptions.</p><div className="grid gap-2 sm:grid-cols-3"><select aria-label="Self-described body type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={bodyType} onChange={(event) => setBodyType(event.target.value)}><option value="prefer_not_to_say">Body type: not set</option><option value="slender">Slender build</option><option value="athletic">Athletic build</option><option value="broad">Broad build</option><option value="mixed">Mixed build</option><option value="other">Other self-description</option></select><select aria-label="Training experience" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={trainingExperience} onChange={(event) => setTrainingExperience(event.target.value)}><option value="prefer_not_to_say">Experience: not set</option><option value="new">New</option><option value="developing">Developing</option><option value="experienced">Experienced</option><option value="advanced">Advanced</option></select><Button variant="outline" size="sm" disabled={saveContext.isPending} onClick={() => saveContext.mutate()}>Save context</Button></div>{profile.data?.profile?.bodyType && <p className="text-[11px] text-muted-foreground mt-2">Saved context: {profile.data.profile.bodyType.replaceAll("_", " ")} · {profile.data.profile.trainingExperience?.replaceAll("_", " ") || "experience not set"}</p>}</div>
    {points.length >= 2 ? <><div className="mt-5 h-48" role="img" aria-label={`${metricLabels[metric]} trajectory in ${unit} using ${methodLabels[measurementMethod]}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} tick={{ fontSize: 11 }} /><YAxis width={36} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(date) => date} formatter={(amount: number) => [`${amount} ${unit}`, metricLabels[metric]]} /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot /></LineChart></ResponsiveContainer></div><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Body trend data table</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Displayed</th><th className="py-1">Recorded</th></tr></thead><tbody>{points.map((point) => <tr key={point.id}><td className="py-1 pr-3">{point.date.slice(0, 10)}</td><td className="py-1 pr-3">{point.value} {unit}</td><td className="py-1">{point.originalValue} {point.originalUnit}</td></tr>)}</tbody></table></div></details></> : <p className="text-sm text-muted-foreground mt-5">Log at least two {metricLabels[metric].toLowerCase()} entries with the same method and compatible units to see a like-for-like trajectory.</p>}
    {measurements.data?.measurements.filter((entry) => entry.metric === metric).slice(0, 4).map((entry) => <div key={entry.id} className="mt-2 flex items-center justify-between rounded-lg border border-muted/20 bg-background/20 px-3 py-2 text-xs"><span>{entry.observedAt.slice(0, 10)} · {entry.value} {entry.unit} · {methodLabels[entry.measurementMethod] || entry.measurementMethod}{entry.measurementProtocol ? ` · ${entry.measurementProtocol}` : ""}</span><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit ${metricLabels[metric]} measurement`} onClick={() => { setEditingId(entry.id); setMetric(entry.metric); setValue(String(entry.value)); setUnit(entry.unit); setMeasurementMethod(entry.measurementMethod); setMeasurementProtocol(entry.measurementProtocol || ""); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Delete ${metricLabels[metric]} measurement`} disabled={removeMeasurement.isPending} onClick={() => removeMeasurement.mutate(entry.id)}><Trash2 className="h-3 w-3" /></Button></div></div>)}
    {addMeasurement.error && <p className="text-xs text-destructive mt-2">Could not save that measurement. Check the value and try again.</p>}
  </section>;
}
