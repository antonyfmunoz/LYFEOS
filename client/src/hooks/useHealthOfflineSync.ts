import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/authContext";
import { flushHealthMutationQueue } from "@/lib/healthOfflineQueue";
import { queryClient } from "@/lib/queryClient";

export function useHealthOfflineSync(): void {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const flush = async () => {
      try {
        const result = await flushHealthMutationQueue(user.id);
        if (!active) return;
        void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user.id] });
        if (result.sent) {
          void queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0].startsWith("/api/nutrition/") || query.queryKey[0].startsWith("/api/workouts") || query.queryKey[0].startsWith("/api/health-fitness/") || query.queryKey[0].startsWith("/api/recovery-")) });
          toast({ title: `${result.sent} offline health ${result.sent === 1 ? "record" : "records"} synced` });
        }
        if (result.failed) toast({ title: "An offline health record needs attention", description: "It remains on this device and was not added to your account.", variant: "destructive" });
      } catch {
        if (active) toast({ title: "Offline health storage is unavailable", description: "Stay online while saving health records on this device.", variant: "destructive" });
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => { active = false; window.removeEventListener("online", flush); };
  }, [user?.id]);
}
