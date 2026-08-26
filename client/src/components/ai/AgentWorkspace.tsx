import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, ChevronRight, Loader2, Play, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const agentKinds = ["research", "scheduling", "content", "analysis", "integration"] as const;
type AgentKind = typeof agentKinds[number];
interface AgentRun {
  id: string;
  objective: string;
  status: "draft" | "approved" | "running" | "completed" | "cancelled" | "failed";
  requestedAgents: AgentKind[];
  capabilitySnapshot: { externalAccess: false; mutations: false; externalSend: false };
  failureCode: string | null;
  version: number;
  createdAt: string;
}
interface AgentStep { id: string; stepOrder: number; agentKind: AgentKind; status: string; output: string | null }

export default function AgentWorkspace() {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<AgentKind[]>(["analysis", "integration"]);
  const [active, setActive] = useState<{ run: AgentRun; steps: AgentStep[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runs = useQuery<{ runs: AgentRun[] }>({ queryKey: ["/api/ai/orchestration-runs"], queryFn: () => apiRequest("/api/ai/orchestration-runs") });

  const refresh = async (id: string) => {
    const detail = await apiRequest<{ run: AgentRun; steps: AgentStep[] }>(`/api/ai/orchestration-runs/${id}`);
    setActive(detail);
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/orchestration-runs"] });
  };
  const createDraft = async () => {
    if (objective.trim().length < 3 || selectedAgents.length === 0) return;
    setBusy(true); setError("");
    try {
      const record = await apiRequest<{ run: AgentRun; steps: AgentStep[] }>("/api/ai/orchestration-runs", { method: "POST", body: JSON.stringify({ objective, agents: selectedAgents, allowedDomains: [] }) });
      setActive(record);
      await queryClient.invalidateQueries({ queryKey: ["/api/ai/orchestration-runs"] });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^\d+:\s*/, "") : "Could not create the draft."); }
    finally { setBusy(false); }
  };
  const transition = async (action: "approve" | "execute" | "retry") => {
    if (!active) return;
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ run: AgentRun; steps?: AgentStep[] }>(`/api/ai/orchestration-runs/${active.run.id}/${action}`, { method: "POST", body: JSON.stringify({ expectedVersion: active.run.version }) });
      if (result.steps) setActive({ run: result.run, steps: result.steps }); else await refresh(result.run.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/ai/orchestration-runs"] });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replace(/^\d+:\s*/, "") : `Could not ${action} the run.`); }
    finally { setBusy(false); }
  };

  return (
    <section className="border-t border-primary/20 py-3" aria-labelledby="agent-workspace-heading">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left" aria-expanded={open}>
        <Bot className="h-3.5 w-3.5 text-primary" />
        <h3 id="agent-workspace-heading" className="text-xs font-semibold text-foreground flex-1">Specialist workspace</h3>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[11px]">
          {!active && (
            <>
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={4000} rows={3} placeholder="What should the specialists work through?" className="w-full rounded border border-primary/20 bg-card/40 p-2 text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/40" />
              <div className="grid grid-cols-2 gap-1">
                {agentKinds.map((kind) => (
                  <label key={kind} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-primary/5 capitalize cursor-pointer">
                    <input type="checkbox" checked={selectedAgents.includes(kind)} onChange={() => setSelectedAgents((current) => current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind])} className="accent-[var(--primary)]" />
                    {kind}
                  </label>
                ))}
              </div>
              <button type="button" onClick={createDraft} disabled={busy || objective.trim().length < 3 || selectedAgents.length === 0} className="w-full rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-primary disabled:opacity-40">Review draft</button>
            </>
          )}
          {active && (
            <div className="space-y-2">
              <div className="rounded border border-primary/15 bg-card/30 p-2">
                <p className="text-foreground font-medium">{active.run.objective}</p>
                <p className="mt-1 capitalize text-primary">{active.run.status} · {active.run.requestedAgents.join(" → ")}</p>
              </div>
              <p className="flex items-start gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3 mt-0.5 text-primary shrink-0" /> No browsing, external sending, publishing, or record mutation.</p>
              {active.steps.map((step) => (
                <div key={step.id} className="rounded border border-primary/10 p-2">
                  <p className="capitalize text-foreground">{step.stepOrder}. {step.agentKind} <span className="text-muted-foreground">· {step.status}</span></p>
                  {step.output && <p className="mt-1 whitespace-pre-wrap text-muted-foreground max-h-36 overflow-y-auto custom-scrollbar">{step.output}</p>}
                </div>
              ))}
              <div className="flex gap-1.5">
                {active.run.status === "draft" && <button type="button" onClick={() => transition("approve")} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-primary"><Check className="h-3 w-3" /> Approve</button>}
                {active.run.status === "approved" && <button type="button" onClick={() => transition("execute")} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-primary"><Play className="h-3 w-3" /> Run</button>}
                {active.run.status === "failed" && <button type="button" onClick={() => transition("retry")} disabled={busy} className="flex-1 rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-primary">Prepare retry</button>}
                <button type="button" onClick={() => { setActive(null); setError(""); }} disabled={busy} className="rounded border border-primary/15 px-2 py-1.5 text-muted-foreground">New</button>
              </div>
            </div>
          )}
          {busy && <p className="flex items-center gap-1 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Working…</p>}
          {error && <p role="alert" className="rounded border border-red-500/20 bg-red-500/5 p-2 text-red-300">{error}</p>}
          {!active && (runs.data?.runs || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground">Recent runs</p>
              {(runs.data?.runs || []).slice(0, 3).map((run) => <button key={run.id} type="button" onClick={() => { setBusy(true); refresh(run.id).catch(() => setError("Could not load the run.")).finally(() => setBusy(false)); }} className="w-full rounded border border-primary/10 p-1.5 text-left hover:bg-primary/5"><span className="block truncate text-foreground">{run.objective}</span><span className="capitalize text-[10px] text-muted-foreground">{run.status}</span></button>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
