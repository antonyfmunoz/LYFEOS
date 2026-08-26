import React, { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Clock, MapPin, Zap, Award, Save, Edit2, Tag } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import MarkdownEditor from "@/components/markdown/MarkdownEditor";
import { MissionPage as MissionPageType } from "@/lib/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type MissionContractBundle = {
  contract: null | {
    id: number;
    purpose: string;
    expectedOutput: string;
    methodSteps: string[];
    toolRequirements: string[];
    requiredEvidence: string[];
    rubricDefinition: Array<{ id: string; requirement: string; guidance: string; weight: 1 | 2 | 3; required: boolean }>;
    rubricVersion: number;
    contractRevision: number;
    acceptanceContextSnapshot: { capturedAt?: string; capacity?: { availability?: string }; constraints?: string[] };
    stopConditions: string[];
    state: string;
    reviewMode: "self" | "human";
    riskLevel: "low" | "medium" | "high";
    escalationPath: string | null;
  };
  evidence: Array<{
    id: number;
    sourceType: string;
    sourceReference: string | null;
    summary: string;
    confidence: "self_reported" | "low" | "medium" | "high" | "provider_record";
    provenance: null | {
      domain: "health";
      provider: string;
      recordType: string;
      observedAt: string;
      receivedAt: string;
      transformVersion: string;
      status: "active" | "superseded" | "source_deleted";
      disclosure: string;
    };
  }>;
  reviews: Array<{ id: number; decision: string; summary: string; reviewerType: "self" | "human"; reviewerUserId: number | null; rubricVersion: number }>;
  appeals: Array<{ id: number; missionReviewId: number; reason: string; status: "open" | "withdrawn" | "upheld" | "reconsidered"; resolutionSummary: string | null; createdAt: string }>;
  preflights: Array<{
    id: number;
    contractRevision: number;
    assumptions: string[];
    affectedParties: string[];
    scenarios: Array<{ kind: "expected" | "upside" | "downside"; outcome: string; earlySignals: string[] }>;
    reversibility: "reversible" | "partly_reversible" | "irreversible";
    mitigationPlan: string;
    uncertaintyNote: string;
    decision: "proceed" | "revise" | "do_not_proceed";
    decisionRationale: string;
    status: "ready" | "revise" | "stopped";
    createdAt: string;
  }>;
  preflightRequirement: null | {
    required: boolean;
    satisfied: boolean;
    contractRevision: number;
    currentPreflightId: number | null;
    reason: string;
    disclosure: string;
  };
  planningDecision: null | {
    source: string;
    context: { capturedAt: string; capacity: { availability: "low" | "steady" | "high" | "unknown" }; constraints: string[] };
    calibration: { recommendedDifficulty: string; selectedDifficulty: string; selectedBy: string; confidence: string; rationale: string[] };
  };
  unlockResult: null | {
    version: "mission-reviewed-progression.v1";
    state: "not_configured" | "declared" | "applied";
    reviewedSkillExperience: Array<{ skillNodeId: number; skillName: string; experienceAmount: number; capabilityId: number | null; capabilityName: string | null }>;
    totalReviewedSkillExperience: number;
    reversible: true;
    certificationGranted: false;
    authorityGranted: false;
    disclosure: string;
  };
};

type MissionReviewInvitationBundle = {
  invitations: Array<{
    id: number;
    status: "pending" | "accepted" | "revoked" | "completed" | "expired";
    reviewerDisplayName: string | null;
    deliveryChannel: "native_inbox" | null;
    deliveryStatus: "delivered" | null;
    deliveredAt: string | null;
    expiresAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

type ReviewerOption = { id: number; displayName: string | null };

type ProviderRecordBundle = {
  records: Array<{ id: number; provider: string; recordType: string; observedAt: string; receivedAt: string; transformVersion: string }>;
  disclosure: string;
};

type MissionDependencyBundle = {
  dependencies: Array<{ id: number; prerequisiteQuestId: number; title: string; completed: boolean }>;
};

type MissionDeferralBundle = {
  deferrals: Array<{ id: number; previousDueDate: string | null; deferredToDate: string; reason: string | null; createdAt: string }>;
};

export default function MissionDetailPage() {
  const { missionId } = useParams();
  const { 
    events, 
    updateEvent, 
    missionPages, 
    createMissionPage, 
    updateMissionPage, 
    getMissionPageById 
  } = useLYFEOS();
  const { toast } = useToast();
  
  const mission = events.find(event => event.id === missionId);
  
  usePageTitle(mission ? `Mission: ${mission.title}` : 'Mission Detail');
  
  const [missionPage, setMissionPage] = useState<MissionPageType | null>(null);
  const [content, setContent] = useState("");
  
  const [isDirty, setIsDirty] = useState(false);
  const questId = Number(missionId);
  const contractQuery = useQuery<MissionContractBundle>({
    queryKey: ["/api/quests", questId, "contract"],
    queryFn: () => apiRequest(`/api/quests/${questId}/contract`),
    enabled: Number.isInteger(questId),
  });
  const dependencyQuery = useQuery<MissionDependencyBundle>({
    queryKey: ["/api/quests", questId, "dependencies"],
    queryFn: () => apiRequest(`/api/quests/${questId}/dependencies`),
    enabled: Number.isInteger(questId),
  });
  const deferralQuery = useQuery<MissionDeferralBundle>({
    queryKey: ["/api/quests", questId, "deferrals"],
    queryFn: () => apiRequest(`/api/quests/${questId}/deferrals`),
    enabled: Number.isInteger(questId),
  });
  const [purpose, setPurpose] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [methodStepsText, setMethodStepsText] = useState("");
  const [toolRequirementsText, setToolRequirementsText] = useState("");
  const [evidenceRequirement, setEvidenceRequirement] = useState("");
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("low");
  const [reviewMode, setReviewMode] = useState<"self" | "human">("self");
  const [stopCondition, setStopCondition] = useState("");
  const [escalationPath, setEscalationPath] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [evidenceSourceType, setEvidenceSourceType] = useState<"self_report" | "artifact" | "observation" | "provider">("self_report");
  const [evidenceSourceReference, setEvidenceSourceReference] = useState("");
  const [evidenceConfidence, setEvidenceConfidence] = useState<"self_reported" | "low" | "medium" | "high">("self_reported");
  const [providerSourceRecordId, setProviderSourceRecordId] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [evidenceChecks, setEvidenceChecks] = useState<Record<string, boolean>>({});
  const [prerequisiteQuestId, setPrerequisiteQuestId] = useState("");
  const [latestReviewUrl, setLatestReviewUrl] = useState("");
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerOption | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [preflightAssumptions, setPreflightAssumptions] = useState("");
  const [preflightAffectedParties, setPreflightAffectedParties] = useState("");
  const [preflightExpected, setPreflightExpected] = useState("");
  const [preflightUpside, setPreflightUpside] = useState("");
  const [preflightDownside, setPreflightDownside] = useState("");
  const [preflightExpectedSignal, setPreflightExpectedSignal] = useState("");
  const [preflightUpsideSignal, setPreflightUpsideSignal] = useState("");
  const [preflightDownsideSignal, setPreflightDownsideSignal] = useState("");
  const [preflightReversibility, setPreflightReversibility] = useState<"reversible" | "partly_reversible" | "irreversible">("partly_reversible");
  const [preflightMitigation, setPreflightMitigation] = useState("");
  const [preflightUncertainty, setPreflightUncertainty] = useState("");
  const [preflightDecision, setPreflightDecision] = useState<"proceed" | "revise" | "do_not_proceed">("revise");
  const [preflightRationale, setPreflightRationale] = useState("");
  const [preflightAcknowledged, setPreflightAcknowledged] = useState(false);
  const invitationQuery = useQuery<MissionReviewInvitationBundle>({
    queryKey: ["/api/quests", questId, "review-invitations"],
    queryFn: () => apiRequest(`/api/quests/${questId}/review-invitations`),
    enabled: Number.isInteger(questId) && contractQuery.data?.contract?.reviewMode === "human",
  });
  const refreshContract = () => queryClient.invalidateQueries({ queryKey: ["/api/quests", questId, "contract"] });
  const refreshDependencies = () => queryClient.invalidateQueries({ queryKey: ["/api/quests", questId, "dependencies"] });
  const saveContract = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/contract`, {
      method: "PUT",
      body: JSON.stringify({
        purpose,
        expectedOutput,
        methodSteps: methodStepsText.split(/\r?\n/).map((step) => step.trim()).filter(Boolean).slice(0, 12),
        toolRequirements: toolRequirementsText.split(/\r?\n/).map((tool) => tool.trim()).filter(Boolean).slice(0, 12),
        requiredEvidence: evidenceRequirement ? [evidenceRequirement] : [],
        reviewMode,
        riskLevel,
        stopConditions: stopCondition ? [stopCondition] : [],
        escalationPath: escalationPath || null,
        state: "accepted",
      }),
    }),
    onSuccess: (result: MissionContractBundle) => { refreshContract(); toast({ title: "Proof plan saved", description: result.preflightRequirement?.required ? "High-risk plans remain draft until you record and accept a consequence preflight." : "This mission now has a purpose and declared evidence." }); },
  });
  const recordConsequencePreflight = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/contract/preflights`, {
      method: "POST",
      body: JSON.stringify({
        contractRevision: contractQuery.data!.contract!.contractRevision,
        assumptions: preflightAssumptions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 8),
        affectedParties: preflightAffectedParties.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 8),
        scenarios: [
          { kind: "expected", outcome: preflightExpected, earlySignals: [preflightExpectedSignal] },
          { kind: "upside", outcome: preflightUpside, earlySignals: [preflightUpsideSignal] },
          { kind: "downside", outcome: preflightDownside, earlySignals: [preflightDownsideSignal] },
        ],
        reversibility: preflightReversibility,
        mitigationPlan: preflightMitigation,
        uncertaintyNote: preflightUncertainty,
        decision: preflightDecision,
        decisionRationale: preflightRationale,
        acknowledgedNoAuthority: preflightAcknowledged,
      }),
    }),
    onSuccess: () => { refreshContract(); toast({ title: "Preflight recorded", description: preflightDecision === "proceed" ? "Review and accept this exact plan revision before execution." : "The Mission remains draft. Revise it or record a new decision when ready." }); },
    onError: (error: Error) => toast({ title: "Preflight not recorded", description: error.message, variant: "destructive" }),
  });
  const acceptConsequencePreflight = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/contract/accept`, {
      method: "POST",
      body: JSON.stringify({ contractRevision: contractQuery.data!.contract!.contractRevision }),
    }),
    onSuccess: () => { refreshContract(); toast({ title: "High-risk plan accepted", description: "This records your decision; it does not certify safety or grant external authority." }); },
    onError: (error: Error) => toast({ title: "Plan not accepted", description: error.message, variant: "destructive" }),
  });
  const changeReviewMode = useMutation({
    mutationFn: (mode: "self" | "human") => apiRequest(`/api/quests/${questId}/contract/review-mode`, {
      method: "PATCH",
      body: JSON.stringify({ reviewMode: mode }),
    }),
    onSuccess: (_result, mode) => {
      refreshContract();
      toast({
        title: mode === "human" ? "Human review required" : "Self-review enabled",
        description: mode === "human" ? "Progression now waits for an explicitly authorized reviewer." : "This mission can now use the user-owned self-review flow.",
      });
    },
  });
  const createReviewInvitation = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/review-invitations`, {
      method: "POST",
      body: JSON.stringify({ expiresInDays: 7 }),
    }) as Promise<{ reviewPath: string }>,
    onSuccess: async (result) => {
      const inviteUrl = `${window.location.origin}${result.reviewPath}`;
      setLatestReviewUrl(inviteUrl);
      let copied = false;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(inviteUrl);
          copied = true;
        }
      } catch {
        copied = false;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quests", questId, "review-invitations"] });
      toast({ title: copied ? "Review link copied" : "Review link created", description: copied ? "The link expires in seven days and replaces any earlier active link." : "Copy the visible link below. It is shown only for this new invitation." });
    },
    onError: (error: Error) => toast({ title: "Review link not created", description: error.message, variant: "destructive" }),
  });
  const providerRecordsQuery = useQuery<ProviderRecordBundle>({
    queryKey: ["/api/mission-evidence/provider-records"],
    queryFn: () => apiRequest("/api/mission-evidence/provider-records"),
    enabled: evidenceSourceType === "provider",
  });
  const deliverReviewInvitation = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/review-invitations`, {
      method: "POST",
      body: JSON.stringify({ expiresInDays: 7, reviewerUserId: selectedReviewer?.id }),
    }) as Promise<{ delivery: { channel: "native_inbox"; status: "delivered"; deliveredAt: string } }>,
    onSuccess: () => {
      const reviewerName = selectedReviewer?.displayName || "reviewer";
      setReviewerSearch("");
      setSelectedReviewer(null);
      setLatestReviewUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/quests", questId, "review-invitations"] });
      toast({ title: "Review request delivered", description: `${reviewerName} received it in their LyfeOS inbox. This is native inbox evidence, not an email or push-provider claim.` });
    },
    onError: (error: Error) => toast({ title: "Review request not delivered", description: error.message, variant: "destructive" }),
  });
  const revokeReviewInvitation = useMutation({
    mutationFn: (invitationId: number) => apiRequest(`/api/quests/${questId}/review-invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests", questId, "review-invitations"] });
      toast({ title: "Review link revoked", description: "That link can no longer grant access to this mission." });
    },
  });
  const addEvidence = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/evidence`, {
      method: "POST",
      body: JSON.stringify(evidenceSourceType === "provider"
        ? { sourceType: "provider", providerSourceRecordId: Number(providerSourceRecordId), summary: evidenceSummary }
        : { sourceType: evidenceSourceType, sourceReference: evidenceSourceReference || null, summary: evidenceSummary, confidence: evidenceConfidence }),
    }),
    onSuccess: () => { setEvidenceSummary(""); setEvidenceSourceReference(""); setProviderSourceRecordId(""); refreshContract(); toast({ title: "Evidence added", description: "Your proof is attached to this mission." }); },
  });
  const reviewMission = useMutation({
    mutationFn: (decision: "meets_evidence" | "revisions_needed") => apiRequest(`/api/quests/${questId}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        rubric: { evidenceChecks: (contractQuery.data?.contract?.rubricDefinition || []).map((criterion) => ({ criterionId: criterion.id, requirement: criterion.requirement, met: evidenceChecks[criterion.requirement] === true })) },
        summary: reviewSummary,
      }),
    }),
    onSuccess: (_result, decision) => {
      setReviewSummary("");
      refreshContract();
      queryClient.invalidateQueries({ queryKey: ["/api/transformation-thread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      toast({
        title: decision === "meets_evidence" ? "Evidence reviewed" : "Revision recorded",
        description: decision === "meets_evidence" ? "LyfeOS recorded the reviewed practice evidence; it is not external certification." : "Progression remains withheld until the declared evidence is met and reviewed.",
      });
    },
  });
  const reviewerQuery = useQuery<{ users: ReviewerOption[] }>({
    queryKey: ["/api/message-hub/users", "mission-review", reviewerSearch],
    queryFn: () => apiRequest(`/api/message-hub/users?q=${encodeURIComponent(reviewerSearch.trim())}`),
    enabled: reviewerSearch.trim().length >= 2 && !selectedReviewer,
  });
  const createAppeal = useMutation({
    mutationFn: () => apiRequest(`/api/quests/${questId}/review-appeals`, { method: "POST", body: JSON.stringify({ reason: appealReason }) }),
    onSuccess: () => { setAppealReason(""); refreshContract(); toast({ title: "Reconsideration requested", description: "The authorized reviewer can now uphold or reconsider the revision decision." }); },
    onError: (error: Error) => toast({ title: "Appeal was not created", description: error.message, variant: "destructive" }),
  });
  const withdrawAppeal = useMutation({
    mutationFn: (appealId: number) => apiRequest(`/api/quests/${questId}/review-appeals/${appealId}`, { method: "DELETE" }),
    onSuccess: () => { refreshContract(); toast({ title: "Appeal withdrawn" }); },
  });
  const addDependency = useMutation({
    mutationFn: (dependencyQuestId: number) => apiRequest(`/api/quests/${questId}/dependencies`, {
      method: "POST",
      body: JSON.stringify({ prerequisiteQuestId: dependencyQuestId }),
    }),
    onSuccess: () => {
      setPrerequisiteQuestId("");
      refreshDependencies();
      toast({ title: "Prerequisite added", description: "This mission cannot be completed until that mission is complete." });
    },
  });
  const removeDependency = useMutation({
    mutationFn: (dependencyId: number) => apiRequest(`/api/quests/${questId}/dependencies/${dependencyId}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshDependencies();
      toast({ title: "Prerequisite removed", description: "The mission sequence has been updated." });
    },
  });
  useEffect(() => {
    const requirements = contractQuery.data?.contract?.requiredEvidence || [];
    setEvidenceChecks(Object.fromEntries(requirements.map((requirement) => [requirement, false])));
  }, [contractQuery.data?.contract?.id]);
  
  useEffect(() => {
    if (mission) {
      const existingPage = missionPages.find(page => page.eventId === mission.id);
      
      if (existingPage) {
        setMissionPage(existingPage);
        setContent(existingPage.content);
      } else {
        const category = mission.category ?? "general";
        const categoryTag = category.charAt(0).toUpperCase() + category.slice(1);
        const newPage = createMissionPage({
          title: mission.title,
          slug: mission.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-'),
          content: `# ${mission.title}\n\n${mission.description || 'Start documenting this mission...'}\n\n## Notes\n\n- [ ] Add your task items here\n- [ ] Use checkboxes for tasks\n\n## Details\n\n* Time: ${mission.startTime}\n* Duration: ${mission.duration}\n* Category: ${categoryTag}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completed: false,
          xpValue: 15,
          tags: [categoryTag, 'Mission'],
          eventId: mission.id
        });
        
        setMissionPage(newPage);
        setContent(newPage.content);
      }
    }
  }, [mission, missionPages, createMissionPage]);
  
  if (!mission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="glassmorphic rounded-xl p-8 max-w-xl text-center">
          <h1 className="text-2xl font-orbitron mb-4">Mission Not Found</h1>
          <p className="text-muted-foreground mb-6">The mission you're looking for doesn't exist or may have been deleted.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "work":
        return "text-primary";
      case "health":
        return "text-primary";
      case "personal":
        return "text-primary";
      default:
        return "text-primary";
    }
  };
  const declaredEvidenceRequirements = contractQuery.data?.contract?.requiredEvidence || [];
  const allEvidenceRequirementsChecked = declaredEvidenceRequirements.every((requirement) => evidenceChecks[requirement] === true);
  const latestHumanRevision = contractQuery.data?.reviews.find((review) => review.reviewerType === "human" && review.decision === "revisions_needed");
  const openAppeal = contractQuery.data?.appeals.find((appeal) => appeal.status === "open");
  const currentConsequencePreflight = contractQuery.data?.preflights.find((preflight) => preflight.contractRevision === contractQuery.data?.contract?.contractRevision);
  const assumptionLines = preflightAssumptions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const affectedPartyLines = preflightAffectedParties.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const consequencePreflightComplete = assumptionLines.length >= 1 && assumptionLines.length <= 8
    && assumptionLines.every((item) => item.length >= 3 && item.length <= 280)
    && affectedPartyLines.length >= 1 && affectedPartyLines.length <= 8
    && affectedPartyLines.every((item) => item.length >= 2 && item.length <= 280)
    && [preflightExpected, preflightUpside, preflightDownside].every((value) => value.trim().length >= 10)
    && [
    preflightExpectedSignal,
    preflightUpsideSignal,
    preflightDownsideSignal,
  ].every((value) => value.trim().length >= 2)
    && preflightMitigation.trim().length >= 10
    && preflightUncertainty.trim().length >= 10
    && preflightRationale.trim().length >= 10
    && preflightAcknowledged;
  const dependencyIds = new Set((dependencyQuery.data?.dependencies || []).map((dependency) => dependency.prerequisiteQuestId));
  const availablePrerequisites = events.filter((event) => {
    const eventId = Number(event.id);
    return Number.isInteger(eventId) && eventId !== questId && !dependencyIds.has(eventId);
  });
  
  const getCategoryBg = (category: string) => {
    switch (category) {
      case "work":
        return "bg-primary/20";
      case "health":
        return "bg-primary/20";
      case "personal":
        return "bg-primary/20";
      default:
        return "bg-primary/20";
    }
  };
  
  const getCategoryText = (category: string) => {
    switch (category) {
      case "work":
        return "Work Mission";
      case "health":
        return "Health Mission";
      case "personal":
        return "Personal Mission";
      default:
        return "Mission";
    }
  };
  
  const getLocationText = (category: string) => {
    switch (category) {
      case "work":
        return "Conference Room 3";
      case "health":
        return "Gym";
      case "personal":
        return "Virtual";
      default:
        return "Unknown Location";
    }
  };
  
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  const handleSave = () => {
    if (missionPage) {
      updateMissionPage(missionPage.id, { 
        content,
        updatedAt: new Date().toISOString()
      });
      
      updateEvent(mission.id, { 
        description: content.substring(0, 100) + (content.length > 100 ? '...' : '') 
      });
      
      toast({
        title: "Mission Page Updated",
        description: "Your mission document has been saved successfully",
        variant: "default",
        className: "bg-background border border-primary text-white",
        duration: 3000,
      });
    }
  };
  
  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6 flex items-center">
        <Link href="/dashboard" className="mr-3 inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        <h1 className="text-2xl font-orbitron">{mission.title}</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3">
            <div className={"p-4 rounded-xl " + getCategoryBg(mission.category ?? "general") + " mb-4"}>
              <h2 className={"text-lg font-orbitron " + getCategoryColor(mission.category ?? "general")}>
                {getCategoryText(mission.category ?? "general")}
              </h2>
              
              <Separator className="my-3 opacity-50" />
              
              <div className="space-y-4 mt-4">
                <div className="flex items-center">
                  <Clock className={"h-4 w-4 " + getCategoryColor(mission.category ?? "general") + " mr-2"} />
                  <span className="text-sm">{mission.startTime} ({mission.duration})</span>
                </div>
                
                <div className="flex items-center">
                  <MapPin className={"h-4 w-4 " + getCategoryColor(mission.category ?? "general") + " mr-2"} />
                  <span className="text-sm">{getLocationText(mission.category ?? "general")}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className={"h-4 w-4 " + getCategoryColor(mission.category ?? "general") + " mr-2"} />
                  <span className="text-sm">Today</span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-primary/10 rounded-xl">
              <h3 className="font-orbitron text-sm mb-3">MISSION REWARDS</h3>
              
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <Zap className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm">Energy Cost</span>
                </div>
                <span className="text-primary font-mono">-5</span>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Award className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm">XP Reward</span>
                </div>
                <span className="text-primary font-mono">+15</span>
              </div>
            </div>
          </div>
          
          <div className="md:w-2/3">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-orbitron text-lg">Mission Details</h2>
              
              {missionPage && (
                <div className="flex items-center space-x-2">
                  {missionPage.tags.map((tag, index) => (
                    <div 
                      key={index} 
                      className="text-xs px-2 py-1 rounded-md bg-muted/50 border border-muted/40"
                    >
                      <Tag className="h-3 w-3 inline mr-1" />
                      {tag}
                    </div>
                  ))}
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 px-3 ml-2"
                    onClick={handleSave}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </div>
              )}
            </div>
            
            {missionPage ? (
              <MarkdownEditor
                content={content}
                onChange={handleContentChange}
                onSave={handleSave}
                className="mb-4"
              />
            ) : (
              <div className="text-center p-8 bg-card/30 rounded-lg border border-primary/20">
                <p className="text-muted-foreground italic">Loading mission document...</p>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-primary/20 bg-card/30 p-4 space-y-3">
              <div>
                <h3 className="font-orbitron text-sm">MISSION SEQUENCE</h3>
                <p className="text-xs text-muted-foreground">Use prerequisites only where order truly matters. Completing this mission is blocked until each prerequisite is complete.</p>
              </div>
              {dependencyQuery.data?.dependencies.length ? <div className="flex flex-wrap gap-2">
                {dependencyQuery.data.dependencies.map((dependency) => <span key={dependency.id} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-background/30 px-2 py-1 text-xs text-muted-foreground">
                  {dependency.completed ? "✓" : "○"} {dependency.title}
                  <button type="button" className="ml-1 text-primary hover:text-destructive" aria-label={`Remove prerequisite ${dependency.title}`} onClick={() => removeDependency.mutate(dependency.id)} disabled={removeDependency.isPending}>remove</button>
                </span>)}
              </div> : <p className="text-xs text-muted-foreground">No completion prerequisites.</p>}
              {availablePrerequisites.length > 0 && <div className="flex flex-col gap-2 sm:flex-row">
                <select aria-label="Prerequisite mission" value={prerequisiteQuestId} onChange={(event) => setPrerequisiteQuestId(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                  <option value="">Choose a mission that must be completed first</option>
                  {availablePrerequisites.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
                </select>
                <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={() => addDependency.mutate(Number(prerequisiteQuestId))} disabled={!prerequisiteQuestId || addDependency.isPending}>
                  {addDependency.isPending ? "Adding…" : "Add prerequisite"}
                </Button>
              </div>}
              {(deferralQuery.data?.deferrals.length || 0) > 0 && <div className="border-t border-primary/10 pt-3">
                <p className="text-xs font-mono uppercase tracking-[0.1em] text-primary/80">Capacity adjustments</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {deferralQuery.data!.deferrals.map((deferral) => <p key={deferral.id}>Deferred {deferral.previousDueDate ? `from ${deferral.previousDueDate} ` : ""}to {deferral.deferredToDate}{deferral.reason ? ` · ${deferral.reason}` : ""}</p>)}
                </div>
              </div>}
            </div>

            <div className="mt-6 rounded-xl border border-primary/20 bg-card/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-orbitron text-sm">PROOF PLAN</h3>
                  <p className="text-xs text-muted-foreground">Make progress visible without overstating competence.</p>
                </div>
                {contractQuery.data?.contract ? <span className="rounded-full border border-primary/30 px-2 py-1 text-xs text-primary">{contractQuery.data.contract.state.replaceAll("_", " ")}</span> : null}
              </div>
              {contractQuery.data?.planningDecision && <div className="rounded-md border border-primary/10 bg-background/30 p-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono uppercase tracking-[0.1em] text-primary/80">Creation context</span>
                  <span>Capacity: {contractQuery.data.planningDecision.context.capacity.availability}</span>
                  <span>Selected rank: {contractQuery.data.planningDecision.calibration.selectedDifficulty}</span>
                  <span>Suggested rank: {contractQuery.data.planningDecision.calibration.recommendedDifficulty}</span>
                  <span>Evidence confidence: {contractQuery.data.planningDecision.calibration.confidence}</span>
                </div>
                {contractQuery.data.planningDecision.calibration.rationale?.slice(0, 2).map((reason) => <p key={reason} className="mt-1 text-[10px] leading-relaxed">• {reason}</p>)}
                <p className="mt-1 text-[10px]">Captured when this mission was created from {contractQuery.data.planningDecision.source}. This explains the initial scope; it is not a competence verdict.</p>
              </div>}
              {contractQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading proof plan…</p> : !contractQuery.data?.contract ? (
                <div className="grid gap-2">
                  <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Why does this mission matter?" />
                  <Input value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} placeholder="What observable output will show progress?" />
                  <Textarea value={methodStepsText} onChange={(event) => setMethodStepsText(event.target.value)} placeholder={"Method steps, one per line (optional)\nExample: Complete one bounded attempt"} className="min-h-20" maxLength={3400} />
                  <Textarea value={toolRequirementsText} onChange={(event) => setToolRequirementsText(event.target.value)} placeholder={"Tools or references, one per line (optional)"} className="min-h-16" maxLength={3400} />
                  <Input value={evidenceRequirement} onChange={(event) => setEvidenceRequirement(event.target.value)} placeholder="What proof will you attach? (optional)" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select aria-label="Mission risk level" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as typeof riskLevel)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="low">low risk</option>
                      <option value="medium">medium risk</option>
                      <option value="high">high risk</option>
                    </select>
                    <select aria-label="Evidence review method" value={reviewMode} onChange={(event) => setReviewMode(event.target.value as typeof reviewMode)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="self">self review</option>
                      <option value="human">authorized human review</option>
                    </select>
                    <Input value={stopCondition} onChange={(event) => setStopCondition(event.target.value)} placeholder="When should you stop? (optional)" />
                    <Input value={escalationPath} onChange={(event) => setEscalationPath(event.target.value)} placeholder="Who or what helps if blocked? (optional)" />
                  </div>
                  <Button size="sm" className="w-fit" disabled={purpose.trim().length < 3 || expectedOutput.trim().length < 3 || saveContract.isPending} onClick={() => saveContract.mutate()}>
                    {saveContract.isPending ? "Saving…" : "Save proof plan"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p><span className="text-muted-foreground">Purpose:</span> {contractQuery.data.contract.purpose}</p>
                  {contractQuery.data.contract.methodSteps.length ? <div><p><span className="text-muted-foreground">Method:</span></p><ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">{contractQuery.data.contract.methodSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></div> : null}
                  {contractQuery.data.contract.toolRequirements.length ? <p><span className="text-muted-foreground">Tools:</span> {contractQuery.data.contract.toolRequirements.join(" · ")}</p> : null}
                  <p><span className="text-muted-foreground">Expected proof:</span> {contractQuery.data.contract.expectedOutput}</p>
                  {contractQuery.data.contract.acceptanceContextSnapshot?.capturedAt ? <p className="text-xs text-muted-foreground">Accepted with capacity recorded as {contractQuery.data.contract.acceptanceContextSnapshot.capacity?.availability || "unknown"} on {new Date(contractQuery.data.contract.acceptanceContextSnapshot.capturedAt).toLocaleString()}. This context can explain later right-sizing; it does not lock the plan.</p> : null}
                  {contractQuery.data.contract.requiredEvidence.length ? <div>
                    <p><span className="text-muted-foreground">Evidence rubric v{contractQuery.data.contract.rubricVersion}:</span></p>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">{contractQuery.data.contract.rubricDefinition.map((criterion) => <li key={criterion.id} className="rounded border border-primary/10 bg-background/20 p-2"><span className="text-foreground">{criterion.requirement}</span> · weight {criterion.weight}{criterion.required ? " · required" : ""}<br /><span className="text-[11px]">{criterion.guidance}</span></li>)}</ul>
                  </div> : null}
                  <p><span className="text-muted-foreground">Risk:</span> {contractQuery.data.contract.riskLevel}</p>
                  {contractQuery.data.contract.riskLevel === "high" && contractQuery.data.preflightRequirement ? <div className="rounded-md border border-amber-300/20 bg-amber-300/5 p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-amber-100">Consequence preflight · contract revision {contractQuery.data.contract.contractRevision}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{contractQuery.data.preflightRequirement.reason}</p>
                      </div>
                      <span className={`rounded border px-2 py-1 text-[10px] ${contractQuery.data.preflightRequirement.satisfied ? "border-primary/30 text-primary" : "border-amber-300/25 text-amber-100"}`}>{contractQuery.data.preflightRequirement.satisfied ? "decision recorded" : "required before acceptance"}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{contractQuery.data.preflightRequirement.disclosure}</p>
                    {currentConsequencePreflight ? <div className="rounded border border-amber-300/15 bg-background/25 p-2 text-xs text-muted-foreground">
                      <p><span className="text-foreground">Latest decision:</span> {currentConsequencePreflight.decision.replaceAll("_", " ")} · {currentConsequencePreflight.reversibility.replaceAll("_", " ")}</p>
                      <p className="mt-1">{currentConsequencePreflight.decisionRationale}</p>
                      <p className="mt-1 text-[10px]">Recorded {new Date(currentConsequencePreflight.createdAt).toLocaleString()} · append-only receipt</p>
                    </div> : null}
                    {!mission.completed && (contractQuery.data.contract.state !== "accepted" || !contractQuery.data.preflightRequirement.satisfied) ? <details open={!currentConsequencePreflight} className="rounded border border-amber-300/15 bg-background/20 p-2">
                      <summary className="cursor-pointer text-xs text-amber-100">Record a new decision for this revision</summary>
                      <div className="mt-3 grid gap-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Textarea aria-label="Material assumptions" value={preflightAssumptions} onChange={(event) => setPreflightAssumptions(event.target.value)} placeholder={"Material assumptions, one per line\nWhat must be true for this plan to work?"} className="min-h-20" maxLength={2240} />
                          <Textarea aria-label="Affected people or systems" value={preflightAffectedParties} onChange={(event) => setPreflightAffectedParties(event.target.value)} placeholder={"Affected people or systems, one per line\nInclude anyone bearing downside risk"} className="min-h-20" maxLength={2240} />
                        </div>
                        <div className="grid gap-2 lg:grid-cols-3">
                          <div className="space-y-2 rounded border border-primary/10 p-2"><p className="text-xs text-foreground">Expected scenario</p><Textarea aria-label="Expected scenario outcome" value={preflightExpected} onChange={(event) => setPreflightExpected(event.target.value)} placeholder="What reasonably happens?" className="min-h-16" maxLength={800} /><Input aria-label="Expected scenario early signal" value={preflightExpectedSignal} onChange={(event) => setPreflightExpectedSignal(event.target.value)} placeholder="Early signal to watch" maxLength={280} /></div>
                          <div className="space-y-2 rounded border border-primary/10 p-2"><p className="text-xs text-foreground">Upside scenario</p><Textarea aria-label="Upside scenario outcome" value={preflightUpside} onChange={(event) => setPreflightUpside(event.target.value)} placeholder="What could go better?" className="min-h-16" maxLength={800} /><Input aria-label="Upside scenario early signal" value={preflightUpsideSignal} onChange={(event) => setPreflightUpsideSignal(event.target.value)} placeholder="Early signal to watch" maxLength={280} /></div>
                          <div className="space-y-2 rounded border border-amber-300/15 p-2"><p className="text-xs text-amber-100">Downside scenario</p><Textarea aria-label="Downside scenario outcome" value={preflightDownside} onChange={(event) => setPreflightDownside(event.target.value)} placeholder="What harm or failure could occur?" className="min-h-16" maxLength={800} /><Input aria-label="Downside scenario early warning" value={preflightDownsideSignal} onChange={(event) => setPreflightDownsideSignal(event.target.value)} placeholder="Early warning signal" maxLength={280} /></div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select aria-label="Plan reversibility" value={preflightReversibility} onChange={(event) => setPreflightReversibility(event.target.value as typeof preflightReversibility)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground"><option value="reversible">reversible</option><option value="partly_reversible">partly reversible</option><option value="irreversible">irreversible</option></select>
                          <select aria-label="Preflight decision" value={preflightDecision} onChange={(event) => setPreflightDecision(event.target.value as typeof preflightDecision)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground"><option value="revise">revise the plan</option><option value="do_not_proceed">do not proceed</option><option value="proceed">proceed with this revision</option></select>
                        </div>
                        <Textarea aria-label="Mitigation and escalation plan" value={preflightMitigation} onChange={(event) => setPreflightMitigation(event.target.value)} placeholder="How will you contain harm, reverse what is reversible, or escalate?" className="min-h-16" maxLength={1200} />
                        <Textarea aria-label="Remaining uncertainty" value={preflightUncertainty} onChange={(event) => setPreflightUncertainty(event.target.value)} placeholder="What remains unknown or unverified?" className="min-h-16" maxLength={800} />
                        <Textarea aria-label="Preflight decision rationale" value={preflightRationale} onChange={(event) => setPreflightRationale(event.target.value)} placeholder="Why is revise, stop, or proceed the right decision now?" className="min-h-16" maxLength={1000} />
                        <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><input type="checkbox" checked={preflightAcknowledged} onChange={(event) => setPreflightAcknowledged(event.target.checked)} className="mt-0.5" /><span>I understand this is my planning record. LyfeOS has not verified these assumptions, certified safety, granted authority, or replaced qualified professional advice.</span></label>
                        <Button size="sm" variant="outline" className="w-fit border-amber-300/25 text-amber-100" disabled={!consequencePreflightComplete || recordConsequencePreflight.isPending} onClick={() => recordConsequencePreflight.mutate()}>{recordConsequencePreflight.isPending ? "Recording…" : "Record append-only preflight"}</Button>
                      </div>
                    </details> : null}
                    {!mission.completed && contractQuery.data.preflightRequirement.satisfied && contractQuery.data.contract.state === "draft" ? <Button size="sm" className="w-fit" disabled={acceptConsequencePreflight.isPending} onClick={() => acceptConsequencePreflight.mutate()}>{acceptConsequencePreflight.isPending ? "Accepting…" : "Accept this high-risk plan revision"}</Button> : null}
                    {mission.completed && !contractQuery.data.preflightRequirement.satisfied ? <p className="text-xs text-amber-100">Reopen this Mission to record the required pre-execution decision. A receipt cannot be backdated after completion.</p> : null}
                  </div> : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Review:</span>
                    <span className="rounded border border-primary/20 px-2 py-1">{contractQuery.data.contract.reviewMode === "human" ? "authorized human" : "self"}</span>
                    {!mission.completed && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary" disabled={changeReviewMode.isPending} onClick={() => changeReviewMode.mutate(contractQuery.data!.contract!.reviewMode === "human" ? "self" : "human")}>Use {contractQuery.data.contract.reviewMode === "human" ? "self-review" : "human review"}</Button>}
                  </div>
                  {contractQuery.data.contract.stopConditions.length ? <p><span className="text-muted-foreground">Stop condition:</span> {contractQuery.data.contract.stopConditions.join(" · ")}</p> : null}
                  {contractQuery.data.contract.escalationPath ? <p><span className="text-muted-foreground">If blocked:</span> {contractQuery.data.contract.escalationPath}</p> : null}
                  {contractQuery.data.unlockResult ? <div className="rounded-md border border-primary/15 bg-background/25 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-primary/80">Declared unlock result · {contractQuery.data.unlockResult.state.replaceAll("_", " ")}</p>
                    {contractQuery.data.unlockResult.reviewedSkillExperience.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {contractQuery.data.unlockResult.reviewedSkillExperience.map((result) => <li key={result.skillNodeId}><span className="text-foreground">{result.skillName}</span>: +{result.experienceAmount} reviewed skill XP{result.capabilityName ? ` · rolls up to ${result.capabilityName}` : ""}</li>)}
                    </ul> : null}
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{contractQuery.data.unlockResult.disclosure}</p>
                  </div> : null}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {contractQuery.data.evidence.map((item) => <span key={item.id} className="rounded border border-primary/20 px-2 py-1">Evidence ({item.sourceType.replaceAll("_", " ")} · {item.confidence.replaceAll("_", " ")}): {item.summary}{item.sourceReference ? " · reference attached" : ""}{item.provenance ? ` · ${item.provenance.provider} ${item.provenance.recordType} · ${item.provenance.status.replaceAll("_", " ")}` : ""}</span>)}
                    {contractQuery.data.reviews.map((item) => <span key={item.id} className="rounded border border-primary/20 px-2 py-1">{item.reviewerType === "human" ? "Human review" : "Self-review"}: {item.decision.replaceAll("_", " ")}</span>)}
                  </div>
                  <div className={`grid gap-2 ${evidenceSourceType === "provider" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                    <select aria-label="Evidence source" value={evidenceSourceType} onChange={(event) => setEvidenceSourceType(event.target.value as typeof evidenceSourceType)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="self_report">self report</option>
                      <option value="artifact">artifact</option>
                      <option value="observation">observation</option>
                      <option value="provider">provider record</option>
                    </select>
                    {evidenceSourceType === "provider" ? <select aria-label="Imported provider record" value={providerSourceRecordId} onChange={(event) => setProviderSourceRecordId(event.target.value)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                      <option value="">Choose an imported record…</option>
                      {(providerRecordsQuery.data?.records || []).map((record) => <option key={record.id} value={record.id}>{record.provider} · {record.recordType} · {new Date(record.observedAt).toLocaleDateString()}</option>)}
                    </select> : <>
                      <select aria-label="Evidence confidence" value={evidenceConfidence} onChange={(event) => setEvidenceConfidence(event.target.value as typeof evidenceConfidence)} className="h-9 rounded-md border border-primary/20 bg-background/40 px-2 text-sm text-foreground">
                        <option value="self_reported">self-reported</option>
                        <option value="low">low confidence</option>
                        <option value="medium">medium confidence</option>
                        <option value="high">high confidence</option>
                      </select>
                      <Input value={evidenceSourceReference} onChange={(event) => setEvidenceSourceReference(event.target.value)} placeholder="Optional source or link" />
                    </>}
                  </div>
                  {evidenceSourceType === "provider" ? <p className="text-[11px] leading-relaxed text-muted-foreground">{providerRecordsQuery.data?.disclosure || "Loading current imported records…"}{providerRecordsQuery.data && !providerRecordsQuery.data.records.length ? <> No imported records are available. <Link href="/health" className="text-primary underline">Open Health connections</Link>.</> : null}</p> : <p className="text-[11px] text-muted-foreground">Source and confidence are review context you provide; LyfeOS does not infer proof quality from them.</p>}
                  <Textarea value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} placeholder="Add a concise description of the proof you produced…" className="min-h-20" />
                  <Button size="sm" variant="outline" disabled={evidenceSummary.trim().length < 3 || (evidenceSourceType === "provider" && !providerSourceRecordId) || addEvidence.isPending} onClick={() => addEvidence.mutate()}>
                    {addEvidence.isPending ? "Adding…" : "Add evidence"}
                  </Button>
                  {contractQuery.data.contract.reviewMode === "human" ? <div className="border-t border-primary/10 pt-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium">Authorized human review</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">Send a bound request to one LyfeOS user, or create a private capability link. Either route grants access only to this proof plan and its evidence.</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={createReviewInvitation.isPending} onClick={() => createReviewInvitation.mutate()}>{createReviewInvitation.isPending ? "Creating…" : "Copy review link"}</Button>
                    </div>
                    <div className="rounded-md border border-primary/10 bg-background/25 p-2 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Input value={selectedReviewer?.displayName || reviewerSearch} onChange={(event) => { setSelectedReviewer(null); setReviewerSearch(event.target.value); }} placeholder="Find a LyfeOS username…" className="min-w-52 flex-1" />
                        <Button size="sm" disabled={!selectedReviewer || deliverReviewInvitation.isPending} onClick={() => deliverReviewInvitation.mutate()}>{deliverReviewInvitation.isPending ? "Delivering…" : "Send review request"}</Button>
                      </div>
                      {!selectedReviewer && reviewerSearch.trim().length >= 2 && (reviewerQuery.data?.users || []).length > 0 ? <div className="flex flex-wrap gap-1">{reviewerQuery.data!.users.map((reviewer) => <button type="button" key={reviewer.id} onClick={() => setSelectedReviewer(reviewer)} className="rounded border border-primary/15 px-2 py-1 text-xs hover:bg-primary/10">{reviewer.displayName || "LyfeOS user"}</button>)}</div> : null}
                      <p className="text-[10px] leading-relaxed text-muted-foreground">Native delivery is recorded only when the recipient inbox commits. If their inbox state blocks delivery, LyfeOS leaves no invitation behind.</p>
                    </div>
                    {latestReviewUrl && <div className="flex gap-2">
                      <Input readOnly aria-label="New review invitation link" value={latestReviewUrl} className="h-8 text-xs" onFocus={(event) => event.currentTarget.select()} />
                      <Button size="sm" variant="ghost" className="h-8" disabled={!navigator.clipboard} onClick={async () => { await navigator.clipboard.writeText(latestReviewUrl); toast({ title: "Review link copied" }); }}>Copy</Button>
                    </div>}
                    {(invitationQuery.data?.invitations || []).map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/10 bg-background/30 p-2 text-xs">
                      <span>{invitation.status.replaceAll("_", " ")}{invitation.reviewerDisplayName ? ` · ${invitation.reviewerDisplayName}` : ""}{invitation.deliveryStatus === "delivered" ? " · native inbox delivered" : " · private link"} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                      {["pending", "accepted"].includes(invitation.status) && <button type="button" className="text-primary hover:text-destructive" onClick={() => revokeReviewInvitation.mutate(invitation.id)} disabled={revokeReviewInvitation.isPending}>revoke</button>}
                    </div>)}
                    {mission.completed ? <p className="text-xs leading-relaxed text-muted-foreground">Self-review cannot advance this mission. Progression remains withheld until the invited reviewer accepts the link and records a decision.</p> : null}
                  </div> : null}
                  {mission.completed && contractQuery.data.contract.reviewMode === "self" ? <div className="border-t border-primary/10 pt-3 space-y-2">
                    <Textarea value={reviewSummary} onChange={(event) => setReviewSummary(event.target.value)} placeholder="What evidence supports completion, and what will you improve next?" className="min-h-20" />
                    {declaredEvidenceRequirements.length > 0 && <div className="space-y-1 rounded-md border border-primary/10 bg-background/30 p-2">
                      <p className="text-xs text-muted-foreground">Confirm each declared requirement against the evidence you attached:</p>
                      {declaredEvidenceRequirements.map((requirement) => <label key={requirement} className="flex items-start gap-2 text-xs text-foreground">
                        <input type="checkbox" checked={evidenceChecks[requirement] === true} onChange={(event) => setEvidenceChecks((current) => ({ ...current, [requirement]: event.target.checked }))} className="mt-0.5" />
                        <span>{requirement}</span>
                      </label>)}
                    </div>}
                    <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={reviewSummary.trim().length < 3 || !contractQuery.data.evidence.length || !allEvidenceRequirementsChecked || reviewMission.isPending} onClick={() => reviewMission.mutate("meets_evidence")}>
                      {reviewMission.isPending ? "Reviewing…" : "Record self-review"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={reviewSummary.trim().length < 3 || !contractQuery.data.evidence.length || reviewMission.isPending} onClick={() => reviewMission.mutate("revisions_needed")}>
                      Record revision needed
                    </Button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">A self-review records your own assessment and can unlock LyfeOS practice progression. It is not external certification or verification of competence.</p>
                  </div> : null}
                  {latestHumanRevision ? <div className="border-t border-primary/10 pt-3 space-y-2">
                    <p className="text-xs font-medium">Human-review reconsideration</p>
                    <p className="text-[11px] text-muted-foreground">If the reviewer misunderstood the submitted evidence or a criterion, request one explicit reconsideration. This does not grant progression or erase the original review.</p>
                    {openAppeal ? <div className="rounded-md border border-amber-300/20 bg-amber-300/5 p-2 text-xs">
                      <p className="text-amber-100">Appeal open</p><p className="mt-1 text-muted-foreground">{openAppeal.reason}</p>
                      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" disabled={withdrawAppeal.isPending} onClick={() => withdrawAppeal.mutate(openAppeal.id)}>Withdraw appeal</Button>
                    </div> : <>
                      <Textarea value={appealReason} onChange={(event) => setAppealReason(event.target.value)} placeholder="Identify the evidence or rubric criterion you want the reviewer to reconsider…" className="min-h-20" maxLength={2000} />
                      <Button size="sm" variant="outline" disabled={appealReason.trim().length < 10 || createAppeal.isPending} onClick={() => createAppeal.mutate()}>{createAppeal.isPending ? "Requesting…" : "Request reconsideration"}</Button>
                    </>}
                    {contractQuery.data.appeals.filter((appeal) => appeal.status !== "open").slice(0, 3).map((appeal) => <p key={appeal.id} className="text-[11px] text-muted-foreground">Appeal {appeal.status.replaceAll("_", " ")}{appeal.resolutionSummary ? ` · ${appeal.resolutionSummary}` : ""}</p>)}
                  </div> : null}
                </div>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground mt-4">
              <p>This mission document supports Markdown, including task lists using "- [ ]" syntax and wiki-style links with "[[Page Name]]".</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
