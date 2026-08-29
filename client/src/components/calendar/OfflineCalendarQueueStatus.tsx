import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudUpload, RotateCcw, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  discardCalendarMutationQueueItem,
  flushCalendarMutationQueue,
  listCalendarMutationQueue,
  retryCalendarMutationQueueItem,
} from "@/lib/calendarOfflineQueue";
import { queryClient } from "@/lib/queryClient";

export default function OfflineCalendarQueueStatus({ userId }: { userId: number }) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const queue = useQuery({
    queryKey: ["calendar-offline-queue", userId],
    queryFn: () => listCalendarMutationQueue(userId),
    refetchOnWindowFocus: true,
  });

  const refreshCanonicalMissions = () => {
    void queryClient.invalidateQueries({ queryKey: ["calendar-missions"] });
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "/api/users" || query.queryKey[0] === "/api/progression" });
  };

  useEffect(() => {
    let active = true;
    const sync = async () => {
      setOnline(typeof navigator === "undefined" || navigator.onLine);
      try {
        const result = await flushCalendarMutationQueue(userId);
        if (!active) return;
        await queue.refetch();
        if (result.sent) {
          refreshCanonicalMissions();
          toast({ title: `${result.sent} Calendar ${result.sent === 1 ? "change" : "changes"} synced` });
        }
        if (result.conflicts) toast({ title: "A Calendar change needs review", description: "LyfeOS did not overwrite the newer server mission.", variant: "destructive" });
      } catch (error) {
        if (active) toast({ title: "Private Calendar storage is unavailable", description: error instanceof Error ? error.message : "Stay online while changing Calendar missions.", variant: "destructive" });
      }
    };
    void sync();
    window.addEventListener("online", sync);
    const markOffline = () => setOnline(false);
    window.addEventListener("offline", markOffline);
    return () => {
      active = false;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", markOffline);
    };
  }, [userId]);

  const retry = useMutation({
    mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision?: number }) => retryCalendarMutationQueueItem(userId, id, expectedRevision),
    onSuccess: (result) => {
      void queue.refetch();
      if (result.sent) {
        refreshCanonicalMissions();
        toast({ title: "Calendar change synced" });
      } else if (!online) {
        toast({ title: "Change is still on this device", description: "It will retry after you reconnect." });
      }
    },
    onError: (error: Error) => toast({ title: "Calendar change was not synced", description: error.message, variant: "destructive" }),
  });

  const discard = useMutation({
    mutationFn: ({ id, conflict }: { id: string; conflict: boolean }) => {
      const message = conflict
        ? "Keep the current server mission and permanently discard your queued change from this device?"
        : "Permanently discard this unsynced Calendar change from this device?";
      return window.confirm(message) ? discardCalendarMutationQueueItem(userId, id) : Promise.resolve(false);
    },
    onSuccess: (removed) => {
      if (!removed) return;
      void queue.refetch();
      toast({ title: "Queued Calendar change discarded" });
    },
    onError: (error: Error) => toast({ title: "Could not discard that change", description: error.message, variant: "destructive" }),
  });

  if (queue.isPending) return null;
  if (queue.isError) return <section className="border-b border-amber-400/30 bg-amber-400/10 px-3 py-3" role="status">
    <p className="flex items-center gap-2 text-xs text-amber-100"><WifiOff className="h-4 w-4" />Private Calendar storage is unavailable. Stay online while saving mission changes.</p>
  </section>;
  if (!queue.data?.length && online) return null;

  return <section data-testid="calendar-offline-queue" className="border-b border-primary/20 bg-background/30 px-3 py-3" aria-labelledby="offline-calendar-queue-heading">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="offline-calendar-queue-heading" className="flex items-center gap-2 text-sm font-medium text-white">
          {online ? <CloudUpload className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
          {queue.data?.length ? `${queue.data.length} Calendar ${queue.data.length === 1 ? "change" : "changes"} on this device` : "Calendar is offline"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Queued changes are not part of your account until the server accepts them. Conflicts never overwrite a newer mission automatically.</p>
      </div>
      {!online ? <span className="rounded-full border border-amber-300/30 px-2 py-1 text-[11px] text-amber-200">Offline</span> : null}
    </div>
    {queue.data?.length ? <div className="mt-3 space-y-2">{queue.data.map((item) => <div data-testid={`calendar-queue-item-${item.id}`} key={item.id} className={`rounded-lg border px-3 py-2 text-xs ${item.status === "conflict" ? "border-amber-300/30 bg-amber-300/5" : item.status === "failed" ? "border-destructive/30 bg-destructive/5" : "border-primary/15"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-white">{item.status === "conflict" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> : null}{item.kind === "create" ? "Create" : "Update"} · {item.title}</p>
          <p className={item.status === "conflict" ? "mt-1 text-amber-100" : item.status === "failed" ? "mt-1 text-destructive" : "mt-1 text-muted-foreground"}>
            {item.status === "conflict"
              ? item.lastError || "This mission changed elsewhere."
              : item.status === "failed"
                ? item.lastError || "The server rejected this change."
                : online ? "Waiting for the next safe sync attempt." : "Waiting for a connection."}
          </p>
          {item.currentQuest ? <p className="mt-1 text-muted-foreground">Current server version: {item.currentQuest.title} · v{item.currentQuest.revision}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {item.status === "conflict" && item.currentQuest ? <Button size="sm" variant="outline" disabled={retry.isPending || !online} onClick={() => {
            if (window.confirm(`Apply your queued fields to the current server version of “${item.currentQuest!.title}”? Fields changed by your queued edit will replace those same fields on version ${item.currentQuest!.revision}.`)) retry.mutate({ id: item.id, expectedRevision: item.currentQuest!.revision });
          }}><RotateCcw className="h-3.5 w-3.5" />Apply my change</Button> : null}
          {item.status === "failed" ? <Button size="sm" variant="outline" disabled={retry.isPending || !online} onClick={() => retry.mutate({ id: item.id })}><RotateCcw className="h-3.5 w-3.5" />Retry</Button> : null}
          <Button size="sm" variant="ghost" disabled={discard.isPending} onClick={() => discard.mutate({ id: item.id, conflict: item.status === "conflict" })}><Trash2 className="h-3.5 w-3.5" />{item.status === "conflict" ? "Keep server" : "Discard"}</Button>
        </div>
      </div>
    </div>)}</div> : null}
  </section>;
}
