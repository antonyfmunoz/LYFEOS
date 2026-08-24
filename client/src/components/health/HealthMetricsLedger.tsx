import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, BookOpenCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString, localNoonIso } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";

const categories = ["strength", "endurance", "cardiovascular", "flexibility", "mobility", "recovery", "body_composition", "lab", "other"];
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const keyFromName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const localDateTimeValue = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

type MetricDefinition = {
  id: number; metricKey: string; displayName: string; category: string; canonicalUnit: string;
  definitionSource: string; sourceUrl: string | null; version: string; validMin: number | null;
  validMax: number | null; active: boolean;
};
type CatalogMetric = { key: string; displayName: string; category: string; canonicalUnit: string; aggregation: string; valueMeaning: string; acceptedUnits: string[] };
type Observation = {
  id: number; metricDefinitionId: number | null; definitionVersion: string | null; category: string;
  metricKey: string; displayName: string; value: number; unit: string; method: string | null;
  methodVersion: string | null; source: string; sourceRecordId: string | null; deviceName: string | null;
  observedAt: string; labName: string | null; specimenType: string | null; collectedAt: string | null; referenceLow: number | null; referenceHigh: number | null;
  temporalType: string; intervalStartAt: string | null; intervalEndAt: string | null; aggregationKind: string;
  includedInCalculations: boolean;
};
type SourceComparison = {
  metricKey: string; displayName: string; unit: string; observedAt: string; preferredSources: string[]; hasConflict: boolean; disclosure: string;
  displayRecord: Pick<Observation, "id" | "source" | "value" | "unit" | "method" | "methodVersion" | "deviceName">;
  alternatives: Array<Pick<Observation, "id" | "source" | "value" | "unit" | "method" | "methodVersion" | "deviceName">>;
};
type IntervalConflict = {
  id: string; metricKey: string; displayName: string; unit: string; source: string; resolved: boolean;
  records: Array<Pick<Observation, "id" | "value" | "unit" | "method" | "methodVersion" | "deviceName" | "intervalStartAt" | "intervalEndAt" | "includedInCalculations">>;
};

export default function HealthMetricsLedger() {
  const { user } = useAuth();
  const [category, setCategory] = useState("strength");
  const [metricKey, setMetricKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [source, setSource] = useState("manual");
  const [method, setMethod] = useState("");
  const [methodVersion, setMethodVersion] = useState("");
  const [sourceRecordId, setSourceRecordId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [observedDate, setObservedDate] = useState(getLocalDateString());
  const [labName, setLabName] = useState("");
  const [specimenType, setSpecimenType] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [referenceLow, setReferenceLow] = useState("");
  const [referenceHigh, setReferenceHigh] = useState("");
  const [selectedDefinitionId, setSelectedDefinitionId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [definitionName, setDefinitionName] = useState("");
  const [definitionCategory, setDefinitionCategory] = useState("strength");
  const [definitionUnit, setDefinitionUnit] = useState("");
  const [definitionSource, setDefinitionSource] = useState("user");
  const [definitionUrl, setDefinitionUrl] = useState("");
  const [definitionVersion, setDefinitionVersion] = useState("1");
  const [definitionMin, setDefinitionMin] = useState("");
  const [definitionMax, setDefinitionMax] = useState("");
  const [definitionActive, setDefinitionActive] = useState(true);
  const [editingDefinitionId, setEditingDefinitionId] = useState<number | null>(null);

  const definitions = useQuery<{ definitions: MetricDefinition[] }>({
    queryKey: ["/api/health-metric-definitions", { includeInactive: true }],
    queryFn: () => apiRequest("/api/health-metric-definitions?includeInactive=true"),
  });
  const metricCatalog = useQuery<{ version: string; releases: Array<{ version: string; status: string; successor: string | null; note: string }>; migrationPolicy: { id: string; immutableHistory: string; displayOnlyChange: string; semanticChange: string; unsupportedMetric: string }; metrics: CatalogMetric[]; disclosure: string }>({ queryKey: ["/api/health-metric-catalog"], queryFn: () => apiRequest("/api/health-metric-catalog") });
  const observations = useQuery<{ observations: Observation[]; sourceComparisons: SourceComparison[]; intervalConflicts: IntervalConflict[]; providerConnectionStates: Record<string, string> }>({ queryKey: ["/api/health-observations"], queryFn: () => apiRequest("/api/health-observations") });

  const resetDefinition = () => {
    setEditingDefinitionId(null); setDefinitionName(""); setDefinitionCategory("strength"); setDefinitionUnit("");
    setDefinitionSource("user"); setDefinitionUrl(""); setDefinitionVersion("1"); setDefinitionMin("");
    setDefinitionMax(""); setDefinitionActive(true);
  };
  const applyCatalogMetric = (key: string) => {
    const metric = metricCatalog.data?.metrics.find((item) => item.key === key);
    if (!metric) return;
    setEditingDefinitionId(null); setDefinitionName(metric.displayName); setDefinitionCategory(metric.category); setDefinitionUnit(metric.canonicalUnit);
    setDefinitionSource("standard"); setDefinitionUrl(""); setDefinitionVersion(metricCatalog.data?.version || "1"); setDefinitionMin(""); setDefinitionMax(""); setDefinitionActive(true);
  };
  const saveDefinition = useMutation({
    mutationFn: () => apiRequest(editingDefinitionId ? `/api/health-metric-definitions/${editingDefinitionId}` : "/api/health-metric-definitions", {
      method: editingDefinitionId ? "PATCH" : "POST",
      body: JSON.stringify({
        metricKey: keyFromName(definitionName), displayName: definitionName, category: definitionCategory,
        canonicalUnit: definitionUnit, definitionSource, sourceUrl: definitionUrl || null, version: definitionVersion,
        validMin: definitionMin === "" ? null : Number(definitionMin), validMax: definitionMax === "" ? null : Number(definitionMax),
        active: definitionActive,
      }),
    }),
    onSuccess: () => { resetDefinition(); void queryClient.invalidateQueries({ queryKey: ["/api/health-metric-definitions"] }); },
  });
  const removeDefinition = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/health-metric-definitions/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelectedDefinitionId(""); void queryClient.invalidateQueries({ queryKey: ["/api/health-metric-definitions"] }); },
  });

  const selectDefinition = (id: string) => {
    setSelectedDefinitionId(id);
    const definition = definitions.data?.definitions.find((item) => item.id === Number(id));
    if (definition) {
      setCategory(definition.category); setMetricKey(definition.metricKey); setDisplayName(definition.displayName); setUnit(definition.canonicalUnit);
    }
  };
  const resetObservation = () => {
    setEditingId(null); setValue(""); setMethod(""); setMethodVersion(""); setSourceRecordId("");
    setDeviceName(""); setLabName(""); setSpecimenType(""); setCollectedAt(""); setReferenceLow(""); setReferenceHigh("");
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        metricDefinitionId: selectedDefinitionId ? Number(selectedDefinitionId) : null,
        category, metricKey: keyFromName(metricKey || displayName), displayName, value: Number(value), unit, source,
        method: method || null, methodVersion: methodVersion || null,
        sourceRecordId: source === "manual" ? null : sourceRecordId || null, deviceName: deviceName || null,
        importedAt: source === "imported" || source === "device" ? new Date().toISOString() : null,
        labName: labName || null, specimenType: category === "lab" ? specimenType || null : null,
        collectedAt: category === "lab" && collectedAt ? new Date(collectedAt).toISOString() : null, referenceLow: referenceLow ? Number(referenceLow) : null,
        referenceHigh: referenceHigh ? Number(referenceHigh) : null, referenceUnit: (referenceLow || referenceHigh) ? unit : null,
        ...(editingId ? {} : { observedAt: localNoonIso(observedDate) }),
      };
      if (!editingId) {
        if (!user?.id) throw new Error("Sign in before saving a health observation.");
        return submitHealthMutation({ userId: user.id, url: "/api/health-observations", body });
      }
      return apiRequest(`/api/health-observations/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: (result) => {
      resetObservation();
      if (result && typeof result === "object" && "queued" in result && result.queued) {
        void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] });
        toast({ title: "Health observation saved on this device", description: "LyfeOS will add it to your account when this device is online." });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["/api/health-observations"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/capability-coverage"] });
      }
    },
    onError: (error: Error) => toast({ title: "Health observation was not saved", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: number) => apiRequest(`/api/health-observations/${id}`, { method: "DELETE" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-observations"] }) });
  const setCalculationInclusion = useMutation({
    mutationFn: ({ id, included }: { id: number; included: boolean }) => apiRequest(`/api/health-observations/${id}/calculation-inclusion`, { method: "PUT", body: JSON.stringify({ included, confirmed: true }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/health-observations"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/health-insights/trends"] });
    },
  });

  const editDefinition = (definition: MetricDefinition) => {
    setEditingDefinitionId(definition.id); setDefinitionName(definition.displayName); setDefinitionCategory(definition.category);
    setDefinitionUnit(definition.canonicalUnit); setDefinitionSource(definition.definitionSource); setDefinitionUrl(definition.sourceUrl || "");
    setDefinitionVersion(definition.version); setDefinitionMin(definition.validMin == null ? "" : String(definition.validMin));
    setDefinitionMax(definition.validMax == null ? "" : String(definition.validMax)); setDefinitionActive(definition.active);
  };
  const editObservation = (observation: Observation) => {
    setEditingId(observation.id); setSelectedDefinitionId(observation.metricDefinitionId ? String(observation.metricDefinitionId) : "");
    setCategory(observation.category); setMetricKey(observation.metricKey); setDisplayName(observation.displayName);
    setValue(String(observation.value)); setUnit(observation.unit); setSource(observation.source); setMethod(observation.method || "");
    setMethodVersion(observation.methodVersion || ""); setSourceRecordId(observation.sourceRecordId || "");
    setDeviceName(observation.deviceName || ""); setObservedDate(observation.observedAt.slice(0, 10)); setLabName(observation.labName || ""); setSpecimenType(observation.specimenType || ""); setCollectedAt(observation.collectedAt ? localDateTimeValue(observation.collectedAt) : "");
    setReferenceLow(observation.referenceLow == null ? "" : String(observation.referenceLow)); setReferenceHigh(observation.referenceHigh == null ? "" : String(observation.referenceHigh));
  };
  const definitionLocked = !!selectedDefinitionId;
  const deleteObservation = (observation: Observation, providerState?: string) => {
    if (providerState && !window.confirm(`Delete this ${title(observation.source)} record and prevent this connection from importing it again?`)) return;
    remove.mutate(observation.id);
  };
  const changeCalculationInclusion = (record: IntervalConflict["records"][number]) => {
    const next = !record.includedInCalculations;
    if (!window.confirm(`${next ? "Include" : "Exclude"} this preserved record ${next ? "in" : "from"} calculated totals? The source fact will remain stored and visible.`)) return;
    setCalculationInclusion.mutate({ id: record.id, included: next });
  };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="metrics-ledger-heading">
    <div><h2 id="metrics-ledger-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Activity className="h-5 w-5" />Performance & health metrics</h2><p className="text-sm text-muted-foreground mt-1">Record measured facts with their unit, method, source, and version. Values are never automatically interpreted as clinical advice.</p></div>

    <details className="mt-4 rounded-xl border border-muted/20 bg-background/20 p-4">
      <summary className="cursor-pointer text-sm font-medium text-white flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-primary" />Manage reusable metric definitions</summary>
      <p className="mt-2 text-xs text-muted-foreground">Definitions keep repeated measurements comparable. Any ranges are your saved validation metadata, not a diagnosis or universal standard.</p>
      <select aria-label="Governed metric catalog" className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="" onChange={(event) => { applyCatalogMetric(event.target.value); event.currentTarget.value = ""; }}><option value="">Start from a governed metric definition…</option>{metricCatalog.data?.metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.displayName} · {metric.canonicalUnit} · {metric.aggregation}</option>)}</select>
      <p className="mt-1 text-[11px] text-muted-foreground">{metricCatalog.data?.disclosure}</p>
      {metricCatalog.data ? <details className="mt-2 rounded-md border border-muted/20 p-2"><summary className="cursor-pointer text-xs text-muted-foreground">Registry version and migration policy</summary><p className="mt-2 text-xs text-muted-foreground">Current: {metricCatalog.data.version} · {metricCatalog.data.migrationPolicy.id}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground"><li>{metricCatalog.data.migrationPolicy.immutableHistory}</li><li>{metricCatalog.data.migrationPolicy.displayOnlyChange}</li><li>{metricCatalog.data.migrationPolicy.semanticChange}</li><li>{metricCatalog.data.migrationPolicy.unsupportedMetric}</li></ul><div className="mt-2 space-y-1">{metricCatalog.data.releases.map((release) => <p key={release.version} className="text-[11px] text-muted-foreground">{release.version} · {release.status}{release.successor ? ` → ${release.successor}` : ""} · {release.note}</p>)}</div></details> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-4"><Input aria-label="Definition metric name" placeholder="Metric name" value={definitionName} onChange={(event) => setDefinitionName(event.target.value)} /><select aria-label="Definition category" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={definitionCategory} onChange={(event) => setDefinitionCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select><Input aria-label="Definition canonical unit" placeholder="Canonical unit" value={definitionUnit} onChange={(event) => setDefinitionUnit(event.target.value)} /><Input aria-label="Definition version" placeholder="Version" value={definitionVersion} onChange={(event) => setDefinitionVersion(event.target.value)} /></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-4"><select aria-label="Definition source" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={definitionSource} onChange={(event) => setDefinitionSource(event.target.value)}>{["user", "professional", "standard", "provider"].map((item) => <option key={item} value={item}>{title(item)}</option>)}</select><Input aria-label="Definition source URL" type="url" placeholder="Source URL (optional)" value={definitionUrl} onChange={(event) => setDefinitionUrl(event.target.value)} /><Input aria-label="Definition validation minimum" type="number" step="any" placeholder="Optional minimum" value={definitionMin} onChange={(event) => setDefinitionMin(event.target.value)} /><Input aria-label="Definition validation maximum" type="number" step="any" placeholder="Optional maximum" value={definitionMax} onChange={(event) => setDefinitionMax(event.target.value)} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={definitionActive} onChange={(event) => setDefinitionActive(event.target.checked)} />Active</label><Button size="sm" disabled={!definitionName.trim() || !definitionUnit.trim() || !definitionVersion.trim() || saveDefinition.isPending} onClick={() => saveDefinition.mutate()}>{editingDefinitionId ? <Pencil /> : <Plus />}{editingDefinitionId ? "Update definition" : "Add definition"}</Button>{editingDefinitionId ? <Button size="sm" variant="ghost" onClick={resetDefinition}>Cancel</Button> : null}</div>
      {saveDefinition.error ? <p className="mt-2 text-xs text-destructive">Could not save that definition. Check the version, URL, and validation range.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">{definitions.data?.definitions.map((definition) => <span key={definition.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 px-2 py-1 text-xs text-muted-foreground">{definition.displayName} · {definition.canonicalUnit} · v{definition.version}{!definition.active ? " · inactive" : ""}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${definition.displayName} definition`} onClick={() => editDefinition(definition)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${definition.displayName} definition`} disabled={removeDefinition.isPending} onClick={() => removeDefinition.mutate(definition.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div>
    </details>

    <div className="grid gap-2 mt-4 sm:grid-cols-4">
      <select aria-label="Metric definition" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedDefinitionId} onChange={(event) => selectDefinition(event.target.value)}><option value="">One-off measurement</option>{definitions.data?.definitions.filter((item) => item.active).map((definition) => <option key={definition.id} value={definition.id}>{definition.displayName} · {definition.canonicalUnit} · v{definition.version}</option>)}</select>
      <select aria-label="Metric category" disabled={definitionLocked} className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
      <Input aria-label="Metric name" disabled={definitionLocked} placeholder="Metric name" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setMetricKey(event.target.value); }} />
      <Input aria-label="Metric unit" disabled={definitionLocked} placeholder="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
    </div>
    <div className="grid gap-2 mt-2 sm:grid-cols-4"><Input aria-label="Metric value" type="number" step="any" placeholder="Value" value={value} onChange={(event) => setValue(event.target.value)} /><Input aria-label="Observed date" type="date" disabled={!!editingId} value={observedDate} onChange={(event) => setObservedDate(event.target.value)} /><Input aria-label="Measurement method" placeholder="Method (optional)" value={method} onChange={(event) => setMethod(event.target.value)} /><Input aria-label="Measurement method version" placeholder="Method version (optional)" value={methodVersion} onChange={(event) => setMethodVersion(event.target.value)} /></div>
    <div className="grid gap-2 mt-2 sm:grid-cols-4"><select aria-label="Metric source" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value)}>{["manual", "device", "imported", "lab"].map((item) => <option key={item} value={item}>{title(item)}</option>)}</select><Input aria-label="Source record identifier" disabled={source === "manual"} placeholder="Source record ID (optional)" value={sourceRecordId} onChange={(event) => setSourceRecordId(event.target.value)} /><Input aria-label="Device name" placeholder="Device name (optional)" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /><Input aria-label="Lab name or source" placeholder="Lab/source (optional)" value={labName} onChange={(event) => setLabName(event.target.value)} /></div>
    {category === "lab" ? <div className="grid gap-2 mt-2 sm:grid-cols-2"><Input aria-label="Specimen type" placeholder="Specimen type (optional, e.g. blood)" value={specimenType} onChange={(event) => setSpecimenType(event.target.value)} /><label className="text-xs text-muted-foreground">Specimen collected at<Input aria-label="Specimen collected at" className="mt-1" type="datetime-local" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} /></label></div> : null}
    <div className="grid gap-2 mt-2 sm:grid-cols-2"><Input aria-label="Reference low" type="number" step="any" placeholder="Reference low" value={referenceLow} onChange={(event) => setReferenceLow(event.target.value)} /><Input aria-label="Reference high" type="number" step="any" placeholder="Reference high" value={referenceHigh} onChange={(event) => setReferenceHigh(event.target.value)} /></div>
    <div className="mt-2 flex gap-2"><Button size="sm" disabled={!keyFromName(metricKey || displayName) || !displayName.trim() || value === "" || !Number.isFinite(Number(value)) || !unit.trim() || save.isPending || (category === "lab" && source !== "lab" && !labName.trim())} onClick={() => save.mutate()}>{editingId ? <Pencil /> : <Plus />}{editingId ? "Update measurement" : "Save measurement"}</Button>{editingId ? <Button size="sm" variant="ghost" onClick={resetObservation}>Cancel</Button> : null}</div>
    {save.error && <p className="text-xs text-destructive mt-2">Could not save that observation. Check the definition, value, unit, source, and reference range.</p>}
    {observations.data?.intervalConflicts.length ? <details className="mt-4 rounded-xl border border-amber-400/25 bg-background/20 p-4"><summary className="cursor-pointer text-sm font-medium text-white">Resolve overlapping interval totals ({observations.data.intervalConflicts.filter((conflict) => !conflict.resolved).length} unresolved)</summary><p className="mt-2 text-xs text-muted-foreground">Overlapping additive records from the same source are withheld from totals until the overlap is resolved. Exclusion is reversible and never deletes or changes a source fact.</p><div className="mt-3 space-y-3">{observations.data.intervalConflicts.slice(0, 20).map((conflict) => <div key={conflict.id} className="rounded-lg border border-muted/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-white">{conflict.displayName} · {title(conflict.source)}</p><span className={`rounded-md border px-2 py-1 text-[10px] ${conflict.resolved ? "border-primary/30 text-primary" : "border-amber-400/40 text-amber-300"}`}>{conflict.resolved ? "Calculation resolved" : "Total withheld"}</span></div><div className="mt-2 space-y-2">{conflict.records.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className={record.includedInCalculations ? "text-muted-foreground" : "text-muted-foreground line-through"}>{record.intervalStartAt ? new Date(record.intervalStartAt).toLocaleString() : "Unknown start"} → {record.intervalEndAt ? new Date(record.intervalEndAt).toLocaleString() : "Unknown end"} · <span className="font-mono">{record.value} {record.unit}</span>{record.deviceName ? ` · ${record.deviceName}` : ""}</span><Button size="sm" variant="outline" disabled={setCalculationInclusion.isPending} onClick={() => changeCalculationInclusion(record)}>{record.includedInCalculations ? "Exclude from totals" : "Include in totals"}</Button></div>)}</div></div>)}</div>{setCalculationInclusion.error ? <p className="mt-2 text-xs text-destructive">Could not update that calculation preference.</p> : null}</details> : null}
    {observations.data?.sourceComparisons.length ? <details className="mt-4 rounded-xl border border-muted/20 bg-background/20 p-4"><summary className="cursor-pointer text-sm font-medium text-white">Compare overlapping sources ({observations.data.sourceComparisons.length})</summary><p className="mt-2 text-xs text-muted-foreground">Only records with the exact same metric, unit, and observation time are compared. Records from different times remain separate.</p><div className="mt-3 space-y-3">{observations.data.sourceComparisons.slice(0, 20).map((comparison) => <div key={`${comparison.metricKey}:${comparison.unit}:${comparison.observedAt}`} className="rounded-lg border border-muted/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-white">{comparison.displayName} · {new Date(comparison.observedAt).toLocaleString()}</p><span className={`rounded-md border px-2 py-1 text-[10px] ${comparison.hasConflict ? "border-amber-400/40 text-amber-300" : "border-primary/30 text-primary"}`}>{comparison.hasConflict ? "Different recorded values" : "Matching recorded values"}</span></div><p className="mt-2 text-xs"><span className="text-muted-foreground">Displayed from {title(comparison.displayRecord.source)}:</span> <span className="font-mono text-primary">{comparison.displayRecord.value} {comparison.displayRecord.unit}</span></p><div className="mt-2 space-y-1">{comparison.alternatives.map((record) => <p key={record.id} className="text-xs text-muted-foreground">Alternative · {title(record.source)} · <span className="font-mono">{record.value} {record.unit}</span>{record.deviceName ? ` · ${record.deviceName}` : ""}{record.method ? ` · ${record.method}${record.methodVersion ? ` v${record.methodVersion}` : ""}` : ""}</p>)}</div><p className="mt-2 text-[11px] text-muted-foreground">{comparison.preferredSources.length ? `Saved priority: ${comparison.preferredSources.map(title).join(" → ")}. ` : "No saved source priority. "}{comparison.disclosure}</p></div>)}</div></details> : null}
    {observations.data?.observations.length ? <div className="mt-4 space-y-2">{observations.data.observations.slice(0, 12).map((observation) => {
      const providerState = observations.data?.providerConnectionStates[observation.source];
      const providerDeletionAvailable = providerState === "paused" || providerState === "revoked";
      return <div key={observation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-muted/20 bg-background/20 px-3 py-2 text-sm"><span>{observation.displayName} <span className="text-muted-foreground">· {title(observation.category)} · {observation.source}{observation.labName ? ` · ${observation.labName}` : ""}{observation.specimenType ? ` · ${observation.specimenType} specimen` : ""}{observation.collectedAt ? ` · collected ${new Date(observation.collectedAt).toLocaleString()}` : ""}{observation.method ? ` · ${observation.method}${observation.methodVersion ? ` v${observation.methodVersion}` : ""}` : ""}{observation.definitionVersion ? ` · definition v${observation.definitionVersion}` : ""}{observation.deviceName ? ` · ${observation.deviceName}` : ""}{providerState ? ` · connection ${providerState}` : ""}</span></span><div className="flex items-center gap-1"><span className="font-mono text-primary">{observation.value} {observation.unit}</span>{!providerState ? <Button variant="ghost" size="icon" aria-label={`Edit ${observation.displayName} observation`} onClick={() => editObservation(observation)}><Pencil className="h-4 w-4" /></Button> : null}<Button variant="ghost" size="icon" title={providerState && !providerDeletionAvailable ? "Pause or revoke this provider before deleting one imported record." : undefined} aria-label={providerState ? `Delete ${observation.displayName} imported observation and prevent re-import` : `Delete ${observation.displayName} observation`} disabled={remove.isPending || Boolean(providerState && !providerDeletionAvailable)} onClick={() => deleteObservation(observation, providerState)}><Trash2 className="h-4 w-4" /></Button></div>{providerState ? <p className="basis-full text-[11px] text-muted-foreground">Provider records are corrected by their source. Pause or revoke the connection to delete this record and suppress re-import.</p> : null}</div>;
    })}</div> : null}
  </section>;
}
