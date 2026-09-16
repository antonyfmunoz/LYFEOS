import { useMutation, useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Persona = { name: string; interactionStyle: Record<string, unknown>; ecosystemSharingEnabled: boolean; allowedDestinations: string[]; revision: number };

export default function AssistantIdentity() {
  const { toast } = useToast();
  const { data } = useQuery<{ persona: Persona }>({ queryKey: ["/api/ai/persona"] });
  const persona = data?.persona;
  const save = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!persona) throw new Error("Assistant identity is still loading.");
      return apiRequest("/api/ai/persona", { method: "PUT", body: JSON.stringify({ ...persona, ecosystemSharingEnabled: enabled, allowedDestinations: enabled ? ["umh"] : [] }) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/persona"] });
      toast({ title: "Assistant identity saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save assistant identity", description: error.message, variant: "destructive" }),
  });

  return <details className="mb-4 rounded-lg border border-primary/15 bg-card/45 px-3 py-2" data-testid="assistant-identity">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground"><UserRound className="h-4 w-4 text-primary" />Assistant identity</summary>
    <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-card/40 px-3 py-2"><div><p className="text-xs text-foreground">Portable persona via UMH</p><p className="text-[11px] text-muted-foreground">Shares only the assistant name and interaction style—not chats, health data, or native Messages.</p></div><button type="button" disabled={!persona || save.isPending} onClick={() => save.mutate(!persona?.ecosystemSharingEnabled)} className={`relative h-5 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${persona?.ecosystemSharingEnabled ? "bg-primary/30" : "bg-card"}`} aria-pressed={persona?.ecosystemSharingEnabled || false} aria-label="Share portable AI persona through UMH" role="switch"><span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${persona?.ecosystemSharingEnabled ? "left-5 bg-primary" : "left-0.5 bg-muted-foreground"}`} /></button></div>
  </details>;
}
