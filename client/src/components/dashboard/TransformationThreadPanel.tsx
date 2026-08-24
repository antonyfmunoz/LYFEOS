import { Award, CheckCircle2, ChevronRight, Pause, Play, Plus, Target } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CapabilityConstellation } from "@/components/dashboard/CapabilityConstellation";

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
  sourceSnapshot?: {
    planningContext?: {
      capturedAt: string;
      declaredWeeklyHours: number | null;
      capacity: { energy: number | null; time: number | null; attention: number | null; availability: "low" | "steady" | "high" | "unknown" };
      constraints: string[];
    };
  };
  progress?: { missionsTotal: number; missionsCompleted: number; evidenceCount: number };
  evidence?: Array<{ id: number; sourceType: string; summary: string; createdAt: string }>;
  completionReadiness?: { completedMissionCount: number; evidenceBackedMissionCount: number; requiredMissionCount: number; reviewCount: number; requiredReviewCount: number; activeDays: number; requiredActiveDays: number; remainingDays: number; ready: boolean };
  skills?: Array<{ id: number; key: string; name: string; description: string; kind: "primary" | "supporting" | "capacity" | "application"; capabilityId?: number | null; experience: number; level: number }>;
  skillEdges?: Array<{ id: number; sourceSkillId: number; targetSkillId: number; relationship: string; influenceWeight?: number }>;
  skillGraph?: {
    reviewCount: number;
    nodes: Array<{
      id: number;
      key: string;
      name: string;
      description: string;
      kind: "primary" | "supporting" | "capacity" | "application";
      experience: number;
      level: number;
      status: "locked" | "unlocked" | "mastered";
      unmetRequirements: string[];
      masteryRequirements: { minExperience: number; minCompletedMissions: number; minReviews: number };
      completedMissionCount: number;
      threadExperience: number;
    }>;
    nextPractice: null | {
      skillNodeId: number;
      skillName: string;
      questId: number | null;
      deferralCount: number;
      revisionCount: number;
      title: string;
      description: string;
      fitsCurrentCapacity: boolean;
      selectionBasis: string;
      planningContext: { capturedAt: string; capacity: { availability: "low" | "steady" | "high" | "unknown" } };
      difficultyCalibration: {
        recommendedDifficulty: "D" | "C" | "B" | "A" | "S";
        confidence: "limited" | "developing" | "strong";
        rationale: string[];
      };
      supportPlan: null | {
        headline: string;
        actions: Array<{ type: string; label: string; explanation: string }>;
        disclosure: string;
      };
    };
  };
  progression?: { level: number; rank: { name: string; color: string }; badges: Array<{ key: string; name: string; description: string }>; competenceSignals: { practicingSkills: number; evidenceBackedSkills: number; note: string } };
};

export function TransformationThreadPanel() {
  const { toast } = useToast();
  const [reflection, setReflection] = useState("");
  const [branchName, setBranchName] = useState("");
  const [edgeSourceId, setEdgeSourceId] = useState("");
  const [edgeTargetId, setEdgeTargetId] = useState("");
  const [edgeRelationship, setEdgeRelationship] = useState("reinforces");
  const [edgeInfluenceWeight, setEdgeInfluenceWeight] = useState("1");
  const { data, isLoading } = useQuery<{ thread: TransformationThread | null }>({
    queryKey: ["/api/transformation-thread"],
  });
  const { data: profile } = useQuery<{ onboardingCompleted?: boolean; completedOnboardingMissions?: number[] }>({
    queryKey: ["/api/profile"],
  });
  const { data: capabilityData } = useQuery<{ capabilities: Array<{ id: number; name: string; experience: number; level: number }> }>({
    queryKey: ["/api/capabilities"],
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
  const updateThread = useMutation({
    mutationFn: ({ threadId, action, body }: { threadId: number; action: "pause" | "resume" | "review" | "complete"; body?: Record<string, string> }) =>
      apiRequest(`/api/transformation-thread/${threadId}/${action}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }),
    onSuccess: (_, variables) => {
      setReflection("");
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
      if (variables.action === "complete") queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
    },
    onError: (error: Error) => toast({ title: "Thread update failed", description: error.message || "Your progress has not been changed.", variant: "destructive" }),
  });

  const thread = data?.thread;
  const addSkillBranch = useMutation({
    mutationFn: ({ threadId, name }: { threadId: number; name: string }) =>
      apiRequest(`/api/transformation-thread/${threadId}/skills`, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setBranchName("");
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
    },
    onError: (error: Error) => toast({ title: "Could not add skill branch", description: error.message || "Your growth map is unchanged.", variant: "destructive" }),
  });
  const addSkillEdge = useMutation({
    mutationFn: ({ threadId, sourceSkillId, targetSkillId, relationship, influenceWeight }: { threadId: number; sourceSkillId: number; targetSkillId: number; relationship: string; influenceWeight: number }) =>
      apiRequest(`/api/transformation-thread/${threadId}/skill-edges`, { method: "POST", body: JSON.stringify({ sourceSkillId, targetSkillId, relationship, influenceWeight }) }),
    onSuccess: () => {
      setEdgeSourceId("");
      setEdgeTargetId("");
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
    },
    onError: (error: Error) => toast({ title: "Could not connect skills", description: error.message || "Your growth map is unchanged.", variant: "destructive" }),
  });
  const removeSkillEdge = useMutation({
    mutationFn: ({ threadId, edgeId }: { threadId: number; edgeId: number }) =>
      apiRequest(`/api/transformation-thread/${threadId}/skill-edges/${edgeId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] }),
    onError: (error: Error) => toast({ title: "Could not remove connection", description: error.message || "Your growth map is unchanged.", variant: "destructive" }),
  });
  const deferMission = useMutation({
    mutationFn: (questId: number) => apiRequest(`/api/quests/${questId}/defer`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      toast({ title: "Mission deferred", description: "Moved to tomorrow. This capacity decision is kept with the mission." });
    },
    onError: (error: Error) => toast({ title: "Could not defer mission", description: error.message || "Your mission was not changed.", variant: "destructive" }),
  });
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
  const isActive = thread.status === "active";
  const progress = thread.progress || { missionsTotal: 0, missionsCompleted: 0, evidenceCount: 0 };
  const skills = thread.skills || [];
  const primarySkill = skills.find((skill) => skill.kind === "primary");
  const edges = thread.skillEdges || [];
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const graphNodesById = new Map((thread.skillGraph?.nodes || []).map((skill) => [skill.id, skill]));
  const nextPractice = thread.skillGraph?.nextPractice;
  const edgeLabels = new Map(edges.map((edge) => [edge.targetSkillId, edge.relationship]));
  const completionReadiness = thread.completionReadiness;
  const progression = thread.progression;
  const planningContext = thread.sourceSnapshot?.planningContext;
  const capabilitiesById = new Map((capabilityData?.capabilities || []).map((capability) => [capability.id, capability]));

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
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/missions" className="inline-flex h-9 items-center justify-center rounded-md border border-primary/50 bg-primary/20 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/30">
                View missions <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => updateThread.mutate({ threadId: thread.id, action: isActive ? "pause" : "resume" })}
                disabled={updateThread.isPending}
              >
                {isActive ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                {isActive ? "Pause" : "Resume"}
              </Button>
            </div>
          )}
        </div>

        {planningContext && (
          <div className="mt-3 rounded-md border border-primary/10 bg-card/20 px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono uppercase tracking-[0.1em] text-primary/80">Plan context at setup</span>
              <span title="Source: your available energy, time, and attention at setup">Capacity: {planningContext.capacity.availability}</span>
            {planningContext.declaredWeeklyHours !== null && <span>{planningContext.declaredWeeklyHours}h/week declared</span>}
            {planningContext.constraints.slice(0, 2).map((constraint) => <span key={constraint} className="truncate">• {constraint}</span>)}
              <Link href="/profile" className="ml-auto text-primary hover:underline">Update inputs</Link>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">Sources: Profile direction and constraints, plus your current capacity and daily check-in. This setup record stays intact; updates inform your next plan.</p>
          </div>
        )}

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
          <div className="mt-4 border-t border-primary/10 pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-primary" />{progress.missionsCompleted}/{progress.missionsTotal} linked missions complete</span>
              <span>{progress.evidenceCount} recent evidence records</span>
              {thread.status === "paused" && <span className="text-primary">Focus paused — nothing is discarded.</span>}
            </div>

            {isActive && (
              <div className="mt-3 rounded-md border border-primary/15 bg-card/30 p-3">
                <Label htmlFor="thread-review" className="text-xs font-mono uppercase tracking-[0.12em] text-primary">Weekly review</Label>
                <Textarea
                  id="thread-review"
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  placeholder="What moved forward, what needs to change, or why this focus is complete?"
                  className="mt-2 min-h-20 border-primary/20 bg-background/40 text-sm"
                  maxLength={2000}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => updateThread.mutate({ threadId: thread.id, action: "review", body: { reflection } })}
                    disabled={reflection.trim().length < 3 || updateThread.isPending}
                  >
                    Record review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/20 text-muted-foreground hover:bg-primary/10"
                    onClick={() => updateThread.mutate({ threadId: thread.id, action: "complete", body: { reflection } })}
                    disabled={reflection.trim().length < 3 || !completionReadiness?.ready || updateThread.isPending}
                  >
                    Complete focus
                  </Button>
                </div>
                {completionReadiness && !completionReadiness.ready && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Completion is earned through sustained evidence: {completionReadiness.evidenceBackedMissionCount}/{completionReadiness.requiredMissionCount} reviewed linked missions, {completionReadiness.reviewCount}/{completionReadiness.requiredReviewCount} reviews, and {completionReadiness.remainingDays > 0 ? `${completionReadiness.remainingDays} more active days` : "active duration complete"}.
                  </p>
                )}
              </div>
            )}

            {thread.evidence && thread.evidence.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {thread.evidence.slice(0, 3).map((item) => (
                  <p key={item.id} className="truncate"><span className="mr-2 font-mono uppercase text-primary/80">{item.sourceType.replaceAll("_", " ")}</span>{item.summary}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {skills.length > 0 && (
          <div className="mt-4 border-t border-primary/10 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.12em] text-primary">Growth map</p>
                <p className="mt-1 text-xs text-muted-foreground">This Thread’s map is private. Reviewed capability history carries forward across LyfeOS; Thread missions and reviews remain distinct.</p>
              </div>
              {primarySkill && <span className="text-xs text-primary">Primary: {primarySkill.name}</span>}
            </div>
            {thread.skillGraph?.nodes && <CapabilityConstellation nodes={thread.skillGraph.nodes} edges={edges} />}
            {edges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {edges.map((edge) => {
                  const source = skillsById.get(edge.sourceSkillId);
                  const target = skillsById.get(edge.targetSkillId);
                  if (!source || !target) return null;
                  const strength = edge.influenceWeight === 3 ? "strong" : edge.influenceWeight === 2 ? "meaningful" : "light";
                  return (
                    <span key={edge.id} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-card/30 px-2 py-1 text-[10px] text-muted-foreground">
                      <span className="max-w-24 truncate text-foreground">{source.name}</span> {edge.relationship} <span className="max-w-24 truncate text-foreground">{target.name}</span> · {strength}
                      {isActive && <button type="button" aria-label={`Remove ${source.name} ${edge.relationship} ${target.name} connection`} onClick={() => removeSkillEdge.mutate({ threadId: thread.id, edgeId: edge.id })} disabled={removeSkillEdge.isPending} className="ml-1 text-primary hover:text-destructive disabled:opacity-50">remove</button>}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {skills.map((skill) => {
                const relationship = edgeLabels.get(skill.id);
                const graphNode = graphNodesById.get(skill.id);
                const capability = skill.capabilityId ? capabilitiesById.get(skill.capabilityId) : undefined;
                const status = graphNode?.status || "unlocked";
                const recordedExperience = graphNode?.experience ?? capability?.experience ?? skill.experience;
                const recordedLevel = graphNode?.level ?? capability?.level ?? skill.level;
                return (
                  <div key={skill.id} className={`rounded-md border p-3 ${status === "locked" ? "border-primary/10 bg-card/20 opacity-70" : skill.kind === "primary" ? "border-primary/45 bg-primary/10" : status === "mastered" ? "border-emerald-400/40 bg-emerald-400/5" : "border-primary/15 bg-card/30"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-primary/80">{status === "locked" ? "Locked" : status === "mastered" ? "Evidence met" : skill.kind === "primary" ? "Focus" : relationship || skill.kind}</span>
                      <span className="text-xs text-muted-foreground">Lv {recordedLevel}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{skill.name}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, recordedExperience % 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{recordedExperience} reviewed skill XP</p>
                    {graphNode && graphNode.threadExperience !== recordedExperience && <p className="mt-1 text-[10px] text-muted-foreground">This Thread: {graphNode.threadExperience} XP</p>}
                    {graphNode && status === "locked" && graphNode.unmetRequirements[0] && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{graphNode.unmetRequirements[0]}</p>}
                    {graphNode && status !== "locked" && <p className="mt-1 text-[10px] text-muted-foreground">{graphNode.completedMissionCount}/{graphNode.masteryRequirements.minCompletedMissions} reviewed missions · {thread.skillGraph?.reviewCount || 0}/{graphNode.masteryRequirements.minReviews} reviews</p>}
                  </div>
                );
              })}
            </div>
            {nextPractice && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-primary">Recommended next practice · {nextPractice.skillName}</p>
                <p className="mt-1 text-sm text-foreground">{nextPractice.title}</p>
                <p className={`mt-1 text-xs ${nextPractice.fitsCurrentCapacity ? "text-muted-foreground" : "text-amber-200"}`}>{nextPractice.description}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded-full border border-primary/20 px-2 py-1">Suggested scope: Rank {nextPractice.difficultyCalibration.recommendedDifficulty}</span>
                  <span className="rounded-full border border-primary/20 px-2 py-1">Evidence confidence: {nextPractice.difficultyCalibration.confidence}</span>
                  <span className="rounded-full border border-primary/20 px-2 py-1">Current capacity: {nextPractice.planningContext.capacity.availability}</span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{nextPractice.selectionBasis}</p>
                {nextPractice.difficultyCalibration.rationale.slice(0, 2).map((reason) => <p key={reason} className="mt-1 text-[10px] leading-relaxed text-muted-foreground">• {reason}</p>)}
                {nextPractice.deferralCount >= 2 && <p className="mt-2 text-[11px] leading-relaxed text-amber-200">This mission has been deferred {nextPractice.deferralCount} times. That is a scheduling signal, not a failure—consider reducing its scope, changing its timing, or asking for support.</p>}
                {nextPractice.supportPlan && <div className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/5 p-2">
                  <p className="text-xs text-amber-100">{nextPractice.supportPlan.headline}</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">{nextPractice.supportPlan.actions.map((action) => <li key={action.type}><span className="text-foreground">{action.label}:</span> {action.explanation}</li>)}</ul>
                  <p className="mt-1 text-[10px] text-muted-foreground">{nextPractice.supportPlan.disclosure}</p>
                </div>}
                {nextPractice.questId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/mission/${nextPractice.questId}`} className="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10">Review or right-size mission</Link>
                    {!nextPractice.fitsCurrentCapacity && <Button size="sm" variant="outline" className="h-8 border-primary/30 text-primary hover:bg-primary/10" onClick={() => deferMission.mutate(nextPractice.questId!)} disabled={deferMission.isPending}>
                      {deferMission.isPending ? "Deferring…" : "Defer to tomorrow"}
                    </Button>}
                  </div>
                )}
              </div>
            )}
            {isActive && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    placeholder="Add a connected skill branch"
                    maxLength={72}
                    className="h-9 border-primary/20 bg-background/40 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => thread && addSkillBranch.mutate({ threadId: thread.id, name: branchName.trim() })}
                    disabled={branchName.trim().length < 2 || addSkillBranch.isPending}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add branch
                  </Button>
                </div>
                {skills.length >= 2 && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select aria-label="Source skill" value={edgeSourceId} onChange={(event) => setEdgeSourceId(event.target.value)} className="h-9 min-w-0 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground sm:flex-1">
                      <option value="">From skill</option>
                      {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                    </select>
                    <select aria-label="Skill relationship" value={edgeRelationship} onChange={(event) => setEdgeRelationship(event.target.value)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="reinforces">reinforces</option>
                      <option value="supports">supports</option>
                      <option value="requires">requires</option>
                      <option value="clarifies">clarifies</option>
                      <option value="sustains">sustains</option>
                    </select>
                    <select aria-label="Connection strength" value={edgeInfluenceWeight} onChange={(event) => setEdgeInfluenceWeight(event.target.value)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="1">light link</option>
                      <option value="2">meaningful link</option>
                      <option value="3">strong link</option>
                    </select>
                    <select aria-label="Target skill" value={edgeTargetId} onChange={(event) => setEdgeTargetId(event.target.value)} className="h-9 min-w-0 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground sm:flex-1">
                      <option value="">To skill</option>
                      {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => thread && addSkillEdge.mutate({ threadId: thread.id, sourceSkillId: Number(edgeSourceId), targetSkillId: Number(edgeTargetId), relationship: edgeRelationship, influenceWeight: Number(edgeInfluenceWeight) })}
                      disabled={!edgeSourceId || !edgeTargetId || edgeSourceId === edgeTargetId || addSkillEdge.isPending}
                    >
                      Connect
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {progression && (
          <div className="mt-4 border-t border-primary/10 pt-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.12em] text-primary">Progress record</p>
                <p className="mt-1 text-xs text-muted-foreground">Activity level {progression.level} · <span style={{ color: progression.rank.color }}>{progression.rank.name} activity rank</span> · {progression.competenceSignals.practicingSkills} evidence-backed practice branches</p>
              </div>
              <Award className="h-4 w-4 text-primary" />
            </div>
            {progression.badges.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {progression.badges.map((badge) => <span key={badge.key} title={badge.description} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary">{badge.name}</span>)}
              </div>
            ) : <p className="mt-2 text-[11px] text-muted-foreground">Complete real missions and record reviews to earn truthful, reversible markers.</p>}
            <p className="mt-2 text-[10px] text-muted-foreground/80">{progression.competenceSignals.note}</p>
          </div>
        )}
      </div>
    </section>
  );
}
