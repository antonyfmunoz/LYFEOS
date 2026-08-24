import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Rights = {
  preferences: { aiContextEnabled: boolean; planningContextEnabled: boolean };
  recordCounts: Record<string, number>; providerConnections: Array<{ id: number; providerName: string; status: string; scopes: string[] }>; disclosure: string;
  retentionBehavior: { status: string; timedPurgeConfigured: boolean; nativeRecords: string; providerRecords: string; suppressionHashes: string; credentialReferences: string; rightsReceipts: string };
};

export default function HealthDataRights() {
  const rights = useQuery<Rights>({ queryKey: ["/api/health-data/rights"], queryFn: () => apiRequest("/api/health-data/rights") });
  const [aiContextEnabled, setAiContextEnabled] = useState(false);
  const [planningContextEnabled, setPlanningContextEnabled] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [exportError, setExportError] = useState(false);
  useEffect(() => {
    if (rights.data) { setAiContextEnabled(rights.data.preferences.aiContextEnabled); setPlanningContextEnabled(rights.data.preferences.planningContextEnabled); }
  }, [rights.data]);
  const totalRecords = useMemo(() => Object.values(rights.data?.recordCounts || {}).reduce((sum, count) => sum + count, 0), [rights.data]);
  const preferences = useMutation({
    mutationFn: () => apiRequest("/api/health-data/preferences", { method: "PATCH", body: JSON.stringify({ aiContextEnabled, planningContextEnabled }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/health-data/rights"] }),
  });
  const deleteHealth = useMutation({
    mutationFn: () => apiRequest<{ deleted: boolean }>("/api/health-data", { method: "DELETE", body: JSON.stringify({ confirmation }) }),
    onSuccess: () => { setConfirmation(""); void queryClient.invalidateQueries(); },
  });
  const download = async () => {
    setExportError(false);
    try {
      const response = await fetch("/api/health-data/export", { credentials: "include" });
      if (!response.ok) throw new Error("Health export failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lyfeos-health-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      URL.revokeObjectURL(url);
      void queryClient.invalidateQueries({ queryKey: ["/api/health-data/rights"] });
    } catch { setExportError(true); }
  };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="health-rights-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="health-rights-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Health data & permissions</h2><p className="mt-1 text-sm text-muted-foreground">Your private health domain currently contains {totalRecords} direct records. Export, permission changes, and deletion create a minimal rights receipt.</p></div><Button size="sm" variant="outline" onClick={download}><Download />Download health JSON</Button></div>
    <div className="mt-4 space-y-3 rounded-xl border border-muted/20 bg-background/20 p-4">
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={aiContextEnabled} onChange={(event) => setAiContextEnabled(event.target.checked)} /><span><span className="text-white">Allow health records as private AI context</span><span className="block text-xs text-muted-foreground">Off by default. This preference does not authorize diagnosis, external sharing, or automatic actions.</span></span></label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={planningContextEnabled} onChange={(event) => setPlanningContextEnabled(event.target.checked)} /><span><span className="text-white">Allow minimal planning context</span><span className="block text-xs text-muted-foreground">Off by default. Raw values, notes, biometrics, food, and lab records remain excluded from federation.</span></span></label>
      <Button size="sm" disabled={preferences.isPending} onClick={() => preferences.mutate()}>Save health permissions</Button>
      {preferences.isSuccess ? <p className="text-xs text-primary">Health permissions saved with a rights receipt.</p> : null}
    </div>
    <div className="mt-4 rounded-xl border border-muted/20 bg-background/20 p-4"><p className="text-sm text-white">Provider connection records</p>{rights.data?.providerConnections.length ? <div className="mt-2 space-y-1">{rights.data.providerConnections.map((connection) => <p key={connection.id} className="text-xs text-muted-foreground">{connection.providerName} · {connection.status} · {connection.scopes.join(", ") || "no scopes"}</p>)}</div> : <p className="mt-1 text-xs text-muted-foreground">No provider consent intent or connection record exists.</p>}<p className="mt-2 text-[11px] text-muted-foreground">Manage consent, pause, revoke, and imported-data deletion in Health connections. Tokens and credential references are never displayed here.</p></div>
    {rights.data?.retentionBehavior ? <details className="mt-4 rounded-xl border border-muted/20 bg-background/20 p-4"><summary className="cursor-pointer text-sm text-white">Current data-retention behavior</summary><p className="mt-2 text-xs text-amber-300">This describes what the code currently does. It is not an approved legal retention policy, and no automatic timed purge is configured.</p><dl className="mt-3 space-y-2 text-xs"><div><dt className="text-white">Native records</dt><dd className="text-muted-foreground">{rights.data.retentionBehavior.nativeRecords}</dd></div><div><dt className="text-white">Provider records</dt><dd className="text-muted-foreground">{rights.data.retentionBehavior.providerRecords}</dd></div><div><dt className="text-white">Deleted-provider suppression</dt><dd className="text-muted-foreground">{rights.data.retentionBehavior.suppressionHashes}</dd></div><div><dt className="text-white">Credential references</dt><dd className="text-muted-foreground">{rights.data.retentionBehavior.credentialReferences}</dd></div><div><dt className="text-white">Rights receipts</dt><dd className="text-muted-foreground">{rights.data.retentionBehavior.rightsReceipts}</dd></div></dl></details> : null}
    <details className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
      <summary className="cursor-pointer text-sm text-destructive">Delete private health-domain data</summary>
      <p className="mt-2 text-xs text-muted-foreground">This permanently removes native health, nutrition, training, recovery, scanner, and sleep records and clears sleep fields from Daily Wellness. Non-health account data and the deletion receipt remain. Download first if you want a copy.</p>
      <Input className="mt-3" aria-label="Health data deletion confirmation" placeholder="Type DELETE MY HEALTH DATA" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      <Button className="mt-3" variant="destructive" disabled={confirmation !== "DELETE MY HEALTH DATA" || deleteHealth.isPending} onClick={() => deleteHealth.mutate()}><Trash2 />Delete health data</Button>
      {deleteHealth.isSuccess ? <p className="mt-2 text-xs text-primary">Health-domain deletion completed.</p> : null}
      {deleteHealth.error ? <p className="mt-2 text-xs text-destructive">Health-domain deletion failed; no completion is being claimed.</p> : null}
    </details>
    <p className="mt-3 text-[11px] text-muted-foreground">{rights.data?.disclosure}</p>
    {exportError ? <p className="mt-2 text-xs text-destructive">Could not download your health export.</p> : null}
  </section>;
}
