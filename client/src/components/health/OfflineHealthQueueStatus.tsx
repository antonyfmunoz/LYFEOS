import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/authContext";
import { discardHealthMutationQueueItem, listHealthMutationQueue, retryHealthMutationQueueItem } from "@/lib/healthOfflineQueue";
import { queryClient } from "@/lib/queryClient";

const title = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function OfflineHealthQueueStatus() {
  const { user } = useAuth();
  const userId = user?.id;
  const queue = useQuery({
    queryKey: ["health-offline-queue", userId],
    queryFn: () => listHealthMutationQueue(userId!),
    enabled: Boolean(userId),
    refetchOnWindowFocus: true,
  });
  const refreshHealthRecords = () => queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0].startsWith("/api/nutrition/") || query.queryKey[0].startsWith("/api/workouts") || query.queryKey[0].startsWith("/api/health-fitness/") || query.queryKey[0].startsWith("/api/recovery-")) });
  const retry = useMutation({
    mutationFn: (id: string) => retryHealthMutationQueueItem(userId!, id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", userId] });
      if (result.sent) { void refreshHealthRecords(); toast({ title: "Offline health record synced" }); }
      else toast({ title: "Record is still waiting to sync", description: "It remains privately stored on this device." });
    },
    onError: (error: Error) => toast({ title: "Could not retry that record", description: error.message, variant: "destructive" }),
  });
  const discard = useMutation({
    mutationFn: async (id: string) => {
      if (!window.confirm("Permanently discard this unsynced record from this device? It was not added to your LyfeOS account and cannot be recovered.")) return false;
      return discardHealthMutationQueueItem(userId!, id);
    },
    onSuccess: (removed) => {
      if (!removed) return;
      void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", userId] });
      toast({ title: "Unsynced record discarded from this device" });
    },
    onError: (error: Error) => toast({ title: "Could not discard that record", description: error.message, variant: "destructive" }),
  });

  if (!userId || (!queue.isError && !queue.data?.length)) return null;
  if (queue.isError) return <section className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4" role="status"><p className="flex items-center gap-2 text-sm text-amber-100"><Database className="h-4 w-4" />Private offline health storage is unavailable.</p><p className="mt-1 text-xs text-amber-100/80">Stay online while saving records on this browser. A failed save remains in its open form; LyfeOS does not claim it was queued.</p></section>;

  return <section className="mb-8 rounded-xl border border-primary/25 bg-background/20 p-4" aria-labelledby="offline-health-queue-heading">
    <h2 id="offline-health-queue-heading" className="flex items-center gap-2 text-sm font-medium text-white"><Database className="h-4 w-4 text-primary" />Records stored only on this device ({queue.data?.length || 0})</h2>
    <p className="mt-1 text-xs text-muted-foreground">Only record type, time, and sync status appear here; the health payload stays in private browser storage. Records disappear after the server accepts them.</p>
    <div className="mt-3 space-y-2">{queue.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-muted/20 px-3 py-2 text-xs"><div><p className="text-white">{title(item.recordType)} record · {new Date(item.createdAt).toLocaleString()}</p><p className={item.status === "failed" ? "text-amber-200" : "text-muted-foreground"}>{item.status === "failed" ? item.lastError || "The server rejected this queued record." : "Waiting for an online sync attempt."}</p></div><div className="flex gap-1">{item.status === "failed" ? <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(item.id)}><RotateCcw />Retry</Button> : null}<Button size="sm" variant="ghost" disabled={discard.isPending} onClick={() => discard.mutate(item.id)}><Trash2 />Discard</Button></div></div>)}</div>
  </section>;
}
