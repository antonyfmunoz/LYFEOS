import { CheckCircle2, ChevronRight, Play, Target } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type StarterMission = {
  title: string;
  rationale: string;
};

type TransformationThread = {
  id: number;
  title: string;
  focus: string;
  rationale: string;
  status: "draft" | "active" | "paused" | "completed";
  starterMissions: StarterMission[];
};

export function TransformationThreadPanel() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ thread: TransformationThread | null }>({
    queryKey: ["/api/transformation-thread"],
  });
  const { data: profile } = useQuery<{ onboardingCompleted?: boolean; completedOnboardingMissions?: number[] }>({
    queryKey: ["/api/profile"],
  });
  const initializeThread = useMutation({
    mutationFn: () => apiRequest("/api/transformation-thread/initialize", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] }),
    onError: () => toast({ title: "System initialization failed", description: "Complete each onboarding mission before creating your plan.", variant: "destructive" }),
  });
  const activateThread = useMutation({
    mutationFn: (threadId: number) => apiRequest(`/api/transformation-thread/${threadId}/activate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
    },
    onError: () => toast({ title: "Plan activation failed", description: "Your draft is still available. Please try again.", variant: "destructive" }),
  });

  const thread = data?.thread;
  const onboardingComplete = profile?.onboardingCompleted && (profile.completedOnboardingMissions?.length || 0) >= 8;
  if (isLoading) return null;

  if (!thread && onboardingComplete) {
    return (
      <section className="mb-6" data-tour="transformation-thread">
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-primary">
                <Target className="h-4 w-4" /> System initialization
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Create a reviewable first focus and three starter missions from your onboarding record. You can edit the missions after activation.</p>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              onClick={() => initializeThread.mutate()}
              disabled={initializeThread.isPending}
            >
              <Target className="mr-2 h-3.5 w-3.5" />
              {initializeThread.isPending ? "Preparing…" : "Prepare my plan"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!thread) return null;

  const starterMissions = Array.isArray(thread.starterMissions) ? thread.starterMissions : [];
  const isDraft = thread.status === "draft";

  return (
    <section className="mb-6" data-tour="transformation-thread">
      <div className="glassmorphic rounded-xl p-4 neon-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-primary">
              <Target className="h-4 w-4" />
              {isDraft ? "System plan ready" : "Current thread"}
            </div>
            <h2 className="mt-2 text-base font-orbitron text-foreground">{thread.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{thread.rationale}</p>
          </div>

          {isDraft ? (
            <Button
              size="sm"
              className="shrink-0 bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              onClick={() => activateThread.mutate(thread.id)}
              disabled={activateThread.isPending}
            >
              <Play className="mr-2 h-3.5 w-3.5" />
              {activateThread.isPending ? "Activating…" : "Activate plan"}
            </Button>
          ) : (
            <Link href="/missions" className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-primary/50 bg-primary/20 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/30">
              View missions <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {isDraft && starterMissions.length > 0 && (
          <div className="mt-4 grid gap-2 border-t border-primary/10 pt-3 md:grid-cols-3">
            {starterMissions.map((mission, index) => (
              <div key={`${mission.title}-${index}`} className="rounded-md border border-primary/15 bg-card/30 p-3">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-primary">0{index + 1}</span>
                  <div>
                    <p className="text-sm text-foreground">{mission.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mission.rationale}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isDraft && (
          <div className="mt-3 flex items-center gap-2 border-t border-primary/10 pt-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Missions and reflections can be linked to this focus as the system evolves.
          </div>
        )}
      </div>
    </section>
  );
}
