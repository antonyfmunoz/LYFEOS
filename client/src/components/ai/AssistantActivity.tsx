import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/authContext";
import { apiRequest, queryClient } from "@/lib/queryClient";

type PendingAction = { id: number; toolName: string; preview: string; expiresAt: string };
type ActionReceipt = { id: number; tool_name: string; outcome_summary?: string | null; state: string; risk: string; repair_state?: "available" | null };

export default function AssistantActivity() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: pending } = useQuery<{ actions: PendingAction[] }>({ queryKey: ["/api/ai-actions/pending"] });
  const { data: history } = useQuery<{ actions: ActionReceipt[] }>({ queryKey: ["/api/account/ai-actions"] });
  const decide = useMutation({
    mutationFn: ({ actionId, decision }: { actionId: number; decision: "approve" | "reject" }) => apiRequest(`/api/ai-actions/${actionId}/${decision}`, { method: "POST" }),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/ai-actions/pending"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/account/ai-actions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/quests/archived"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "profile"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "daily-logs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/vision-goals"] });
      toast({ title: input.decision === "approve" ? "Assistant action approved" : "Assistant action declined", description: input.decision === "approve" ? "LyfeOS executed the exact reviewed action." : "Nothing was changed." });
    },
    onError: (error: Error) => toast({ title: "Could not update assistant action", description: error.message, variant: "destructive" }),
  });
  const repair = useMutation({
    mutationFn: (actionId: number) => apiRequest(`/api/ai-actions/${actionId}/repair`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/account/ai-actions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Assistant action repaired", description: "LyfeOS restored the recorded prior state." });
    },
    onError: (error: Error) => toast({ title: "Could not undo assistant action", description: error.message, variant: "destructive" }),
  });
  const hasActivity = Boolean((pending?.actions || []).length || (history?.actions || []).length);

  return <details className="mb-4 rounded-lg border border-primary/15 bg-card/45 px-3 py-2" data-testid="assistant-activity">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground"><Clock3 className="h-4 w-4 text-primary" />Assistant activity</summary>
    <p className="mt-2 text-xs text-muted-foreground">A private receipt trail for actions your assistant attempted. It never repeats private prompts or raw tool inputs.</p>
    {(pending?.actions || []).length > 0 ? <div className="mt-3 space-y-2 rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-amber-200">Awaiting your approval</p>
      {pending!.actions.map((action) => <div key={action.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><div className="min-w-0"><p className="text-foreground">{action.toolName.replaceAll("_", " ")}</p><p className="mt-0.5 text-muted-foreground">{action.preview} No change has happened. Expires {new Date(action.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p></div><div className="flex gap-2"><Button size="sm" className="h-7 bg-primary/20 px-2 text-xs text-primary hover:bg-primary/30" onClick={() => decide.mutate({ actionId: action.id, decision: "approve" })} disabled={decide.isPending}>Approve</Button><Button size="sm" variant="outline" className="h-7 border-amber-300/30 px-2 text-xs text-amber-200 hover:bg-amber-300/10" onClick={() => decide.mutate({ actionId: action.id, decision: "reject" })} disabled={decide.isPending}>Decline</Button></div></div>)}
    </div> : null}
    {(history?.actions || []).length > 0 ? <div className="mt-3 space-y-2">{history!.actions.slice(0, 5).map((action) => <div key={action.id} className="flex items-start justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate text-foreground">{action.tool_name.replaceAll("_", " ")}</p>{action.outcome_summary ? <p className="mt-0.5 truncate text-muted-foreground">{action.outcome_summary}</p> : null}</div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`font-mono uppercase ${action.state === "succeeded" ? "text-primary" : action.state === "failed" ? "text-red-300" : action.state === "rejected" ? "text-amber-300" : "text-muted-foreground"}`}>{action.state} · {action.risk}</span>{action.repair_state === "available" ? <Button size="sm" variant="outline" className="h-6 border-primary/30 px-2 text-[10px] text-primary" onClick={() => repair.mutate(action.id)} disabled={repair.isPending}>Undo safely</Button> : null}</div></div>)}</div> : null}
    {!hasActivity ? <p className="mt-3 text-xs text-muted-foreground">No assistant actions have been recorded yet.</p> : null}
  </details>;
}
