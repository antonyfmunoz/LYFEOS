import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ExtensionPackage = { id: string; slug: string; version: string; displayName: string; description: string; manifest: { permissions: string[] }; manifestDigest: string; publisherKeyId: string; publisherName: string; signatureVerified: true };
type Installation = { id: string; packageId: string; grantedPermissions: string[]; status: "enabled" | "revoked"; revision: number };
type ExtensionState = { catalog: ExtensionPackage[]; installations: Installation[]; executionBoundary: string };

export default function ExtensionSettings() {
  const state = useQuery<ExtensionState>({ queryKey: ["/api/extensions"], queryFn: () => apiRequest("/api/extensions") });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const byPackage = useMemo(() => new Map((state.data?.installations || []).map((item) => [item.packageId, item])), [state.data]);

  const install = async (entry: ExtensionPackage) => {
    setBusy(entry.id); setError("");
    try { await apiRequest("/api/extensions/installations", { method: "POST", body: JSON.stringify({ packageId: entry.id, grantedPermissions: entry.manifest.permissions }) }); await queryClient.invalidateQueries({ queryKey: ["/api/extensions"] }); }
    catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^\d+:\s*/, "") : "Could not install extension."); }
    finally { setBusy(""); }
  };
  const revoke = async (installation: Installation) => {
    setBusy(installation.id); setError("");
    try { await apiRequest(`/api/extensions/installations/${installation.id}/revoke`, { method: "POST", body: JSON.stringify({ expectedRevision: installation.revision }) }); await queryClient.invalidateQueries({ queryKey: ["/api/extensions"] }); }
    catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^\d+:\s*/, "") : "Could not revoke extension."); }
    finally { setBusy(""); }
  };

  return <div className="mt-6 rounded-xl border border-primary/20 bg-card/30 p-4">
    <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="text-sm font-semibold text-foreground">Verified extensions</h3><p className="mt-1 text-xs text-muted-foreground">Install only immutable packages whose publisher signature verifies. Permissions are explicit and immediately revocable.</p></div></div>
    {state.isLoading ? <p className="mt-3 text-xs text-muted-foreground">Loading verified catalog…</p> : null}
    {!state.isLoading && !(state.data?.catalog.length) ? <p className="mt-3 rounded border border-primary/10 p-3 text-xs text-muted-foreground">No signed extension packages have been published for this installation.</p> : null}
    <div className="mt-3 space-y-3">{state.data?.catalog.map((entry) => { const installation = byPackage.get(entry.id); return <div key={entry.id} className="rounded border border-primary/15 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-foreground">{entry.displayName} <span className="font-mono text-[10px] text-muted-foreground">v{entry.version}</span></p><p className="mt-1 text-xs text-muted-foreground">{entry.description}</p></div><span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><ShieldCheck className="h-3 w-3" />verified</span></div><p className="mt-2 text-[10px] text-muted-foreground">Publisher: {entry.publisherName} · {entry.manifest.permissions.join(" · ") || "no permissions"}</p>{installation?.status === "enabled" ? <button type="button" disabled={Boolean(busy)} onClick={() => revoke(installation)} className="mt-2 rounded border border-destructive/30 px-2 py-1 text-xs text-destructive disabled:opacity-40">Revoke</button> : <button type="button" disabled={Boolean(busy)} onClick={() => install(entry)} className="mt-2 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary disabled:opacity-40">Review and grant listed permissions</button>}</div>; })}</div>
    {state.data?.executionBoundary ? <p className="mt-3 text-[10px] text-muted-foreground">{state.data.executionBoundary}</p> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}
  </div>;
}
