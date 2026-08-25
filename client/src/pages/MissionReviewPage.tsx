import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type ReviewBundle = {
  invitation: { id: number; status: string; expiresAt: string; accepted: boolean };
  owner: { displayName: string };
  mission: { id: number; title: string; completed: boolean };
  contract: { purpose: string; expectedOutput: string; requiredEvidence: string[]; rubricDefinition: Array<{ id: string; requirement: string; guidance: string; weight: number; required: boolean }>; rubricVersion: number; riskLevel: string; stopConditions: string[]; escalationPath: string | null };
  evidence: Array<{ id: number; sourceType: string; sourceReference: string | null; summary: string; confidence: string; submittedAt: string }>;
};

type AssignedAppeal = {
  id: number;
  missionTitle: string;
  ownerDisplayName: string;
  reason: string;
  reviewSummary: string;
  expectedOutput: string;
  requiredEvidence: string[];
  rubricDefinition: Array<{ id: string; requirement: string; guidance: string; weight: number; required: boolean }>;
  rubricVersion: number;
  evidence: ReviewBundle["evidence"];
};

const tokenStorageKey = "lyfeos-pending-review-token";
const invitationStorageKey = "lyfeos-pending-review-invitation-id";

function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function MissionReviewPage() {
  usePageTitle("Mission Evidence Review");
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [assignedInvitationId, setAssignedInvitationId] = useState("");
  const [summary, setSummary] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [appealSummaries, setAppealSummaries] = useState<Record<number, string>>({});
  const [appealChecks, setAppealChecks] = useState<Record<number, Record<string, boolean>>>({});

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashToken = hash.get("token");
    const hashInvitationId = hash.get("invitation");
    const resolved = hashToken || sessionStorage.getItem(tokenStorageKey) || "";
    const resolvedInvitationId = /^\d+$/.test(hashInvitationId || "") ? hashInvitationId! : sessionStorage.getItem(invitationStorageKey) || "";
    if (resolved) {
      sessionStorage.setItem(tokenStorageKey, resolved);
      setToken(resolved);
    }
    if (resolvedInvitationId) {
      sessionStorage.setItem(invitationStorageKey, resolvedInvitationId);
      setAssignedInvitationId(resolvedInvitationId);
    }
    if (window.location.hash) window.history.replaceState({}, "", "/review-mission");
  }, []);

  const request = useMemo<RequestInit>(() => {
    const headers: Record<string, string> = {};
    if (token) headers["x-lyfeos-review-token"] = token;
    else headers["x-lyfeos-review-invitation-id"] = assignedInvitationId;
    return { headers };
  }, [token, assignedInvitationId]);
  const invitationLocator = token || assignedInvitationId;
  const reviewQuery = useQuery<ReviewBundle>({
    queryKey: ["/api/mission-review-invitations/resolve", invitationLocator],
    queryFn: () => apiRequest("/api/mission-review-invitations/resolve", request),
    enabled: isAuthenticated && invitationLocator.length > 0,
    retry: false,
  });
  const assignedAppeals = useQuery<{ appeals: AssignedAppeal[] }>({
    queryKey: ["/api/mission-review-appeals/assigned"],
    queryFn: () => apiRequest("/api/mission-review-appeals/assigned"),
    enabled: isAuthenticated,
  });
  useEffect(() => {
    const requirements = reviewQuery.data?.contract.requiredEvidence || [];
    setChecks(Object.fromEntries(requirements.map((requirement) => [requirement, false])));
  }, [reviewQuery.data?.invitation.id]);

  const accept = useMutation({
    mutationFn: () => apiRequest("/api/mission-review-invitations/accept", { method: "POST", ...request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mission-review-invitations/resolve", invitationLocator] }),
  });
  const submit = useMutation({
    mutationFn: (decision: "meets_evidence" | "revisions_needed") => apiRequest("/api/mission-review-invitations/review", {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        decision,
        summary,
        rubric: { evidenceChecks: (reviewQuery.data?.contract.rubricDefinition || []).map((criterion) => ({ criterionId: criterion.id, requirement: criterion.requirement, met: checks[criterion.requirement] === true })) },
      }),
    }),
    onSuccess: (_result, decision) => {
      sessionStorage.removeItem(tokenStorageKey);
      sessionStorage.removeItem(invitationStorageKey);
      queryClient.removeQueries({ queryKey: ["/api/mission-review-invitations/resolve", invitationLocator] });
      toast({ title: decision === "meets_evidence" ? "Review recorded" : "Revision requested", description: "Your decision is now part of this mission's evidence history." });
    },
  });
  const resolveAppeal = useMutation({
    mutationFn: ({ appeal, decision }: { appeal: AssignedAppeal; decision: "upheld" | "reconsidered" }) => apiRequest(`/api/mission-review-appeals/${appeal.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        summary: appealSummaries[appeal.id] || "",
        rubric: { evidenceChecks: appeal.rubricDefinition.map((criterion) => ({ criterionId: criterion.id, requirement: criterion.requirement, met: appealChecks[appeal.id]?.[criterion.requirement] === true })) },
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mission-review-appeals/assigned"] });
      toast({ title: "Appeal resolution recorded", description: "The original review and this explicit resolution remain in the evidence history." });
    },
  });

  if (isLoading) return <div className="min-h-[100dvh] bg-background" />;
  if (!invitationLocator && isAuthenticated) return <ReviewShell>
    <div><p className="text-xs uppercase tracking-[0.12em] text-primary">Assigned reconsiderations</p><p className="mt-1 text-sm text-muted-foreground">Resolve only reviews you previously issued. The original decision remains preserved.</p></div>
    {assignedAppeals.isLoading ? <p className="text-sm text-muted-foreground">Loading assigned appeals…</p> : assignedAppeals.data?.appeals.length ? assignedAppeals.data.appeals.map((appeal) => {
      const checked = appealChecks[appeal.id] || {};
      const allRequiredMet = appeal.rubricDefinition.filter((criterion) => criterion.required).every((criterion) => checked[criterion.requirement]);
      const summaryValue = appealSummaries[appeal.id] || "";
      return <div key={appeal.id} className="rounded-lg border border-primary/15 bg-background/30 p-3 space-y-3">
        <div><p className="text-xs text-primary">{appeal.ownerDisplayName}</p><h2 className="font-orbitron text-lg">{appeal.missionTitle}</h2><p className="mt-1 text-xs text-muted-foreground">Expected output: {appeal.expectedOutput}</p></div>
        <p className="text-sm"><span className="text-muted-foreground">Appeal:</span> {appeal.reason}</p>
        <p className="text-xs text-muted-foreground">Original review: {appeal.reviewSummary}</p>
        <div className="space-y-1">{appeal.evidence.map((item) => <p key={item.id} className="rounded border border-primary/10 p-2 text-xs">{item.summary} <span className="text-muted-foreground">· {item.sourceType.replaceAll("_", " ")}</span></p>)}</div>
        <div className="space-y-2">{appeal.rubricDefinition.map((criterion) => <label key={criterion.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={checked[criterion.requirement] === true} onChange={(event) => setAppealChecks((current) => ({ ...current, [appeal.id]: { ...(current[appeal.id] || {}), [criterion.requirement]: event.target.checked } }))} /><span>{criterion.requirement}<span className="block text-[11px] text-muted-foreground">{criterion.guidance} · weight {criterion.weight}</span></span></label>)}</div>
        <Textarea value={summaryValue} onChange={(event) => setAppealSummaries((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="Explain why the original decision stands or why the evidence now meets the rubric." className="min-h-24" />
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={summaryValue.trim().length < 3 || resolveAppeal.isPending} onClick={() => resolveAppeal.mutate({ appeal, decision: "upheld" })}>Uphold revision</Button><Button disabled={summaryValue.trim().length < 3 || !allRequiredMet || resolveAppeal.isPending} onClick={() => resolveAppeal.mutate({ appeal, decision: "reconsidered" })}>Reconsider—evidence met</Button></div>
      </div>;
    }) : <p className="text-sm text-muted-foreground">No open review appeals are assigned to you.</p>}
    <Link href="/dashboard"><Button variant="outline">Return to LyfeOS</Button></Link>
  </ReviewShell>;
  if (!invitationLocator) return <ReviewShell><p className="text-sm text-muted-foreground">This review link is incomplete. Ask the mission owner to create a new link.</p></ReviewShell>;
  if (!isAuthenticated) return <ReviewShell>
    <p className="text-sm text-muted-foreground">Sign in to bind this private review invitation to your LyfeOS account. The mission owner cannot use their own link.</p>
    <Link href="/login"><Button onClick={() => sessionStorage.setItem("lyfeos-return-after-login", "/review-mission")}>Sign in to review</Button></Link>
  </ReviewShell>;
  if (reviewQuery.isLoading) return <ReviewShell><p className="text-sm text-muted-foreground">Loading the scoped proof plan…</p></ReviewShell>;
  if (reviewQuery.isError || !reviewQuery.data) return <ReviewShell><p className="text-sm text-destructive">{reviewQuery.error instanceof Error ? reviewQuery.error.message : "This review invitation is unavailable."}</p></ReviewShell>;

  const data = reviewQuery.data;
  if (submit.isSuccess) return <ReviewShell>
    <p className="text-sm">Review complete. You can close this page; no broader access to the mission owner’s LyfeOS account was granted.</p>
    <Link href="/dashboard"><Button variant="outline">Return to LyfeOS</Button></Link>
  </ReviewShell>;

  return <ReviewShell>
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.12em] text-primary">Evidence review for {data.owner.displayName}</p>
      <h2 className="font-orbitron text-xl">{data.mission.title}</h2>
      <p className="text-sm text-muted-foreground">{data.contract.purpose}</p>
    </div>
    <div className="rounded-lg border border-primary/15 bg-background/30 p-3 text-sm space-y-2">
      <p><span className="text-muted-foreground">Expected output:</span> {data.contract.expectedOutput}</p>
      <p><span className="text-muted-foreground">Risk:</span> {data.contract.riskLevel}</p>
      {!data.mission.completed && <p className="text-amber-400">The owner has not marked this mission complete. You can inspect the invitation, but review remains blocked.</p>}
    </div>
    {!data.invitation.accepted ? <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted-foreground">Accepting binds this one invitation to your account and reveals only the submitted evidence for this mission. It does not make you a coach, certifier, or account administrator.</p>
      <Button disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? "Accepting…" : "Accept scoped review"}</Button>
    </div> : <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-orbitron text-sm">SUBMITTED EVIDENCE</h3>
        {data.evidence.length ? data.evidence.map((item) => <div key={item.id} className="rounded-md border border-primary/15 p-3 text-sm">
          <p>{item.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.sourceType.replaceAll("_", " ")} · {item.confidence.replaceAll("_", " ")}{item.sourceReference ? " · source reference supplied" : ""}</p>
          {safeSourceUrl(item.sourceReference) && <a className="mt-1 block break-all text-xs text-primary underline" href={safeSourceUrl(item.sourceReference)!} target="_blank" rel="noreferrer">Open supplied reference</a>}
        </div>) : <p className="text-sm text-muted-foreground">No evidence has been submitted yet.</p>}
      </div>
      {data.contract.requiredEvidence.length > 0 && <div className="space-y-2">
        <h3 className="font-orbitron text-sm">DECLARED REQUIREMENTS</h3>
        {data.contract.rubricDefinition.map((criterion) => <label key={criterion.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={checks[criterion.requirement] === true} onChange={(event) => setChecks((current) => ({ ...current, [criterion.requirement]: event.target.checked }))} className="mt-1" />
          <span>{criterion.requirement}<span className="block text-[11px] text-muted-foreground">{criterion.guidance} · weight {criterion.weight}{criterion.required ? " · required" : ""}</span></span>
        </label>)}
      </div>}
      <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Explain what the evidence supports and what, if anything, must be revised." className="min-h-28" />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!data.mission.completed || !data.evidence.length || summary.trim().length < 3 || data.contract.requiredEvidence.some((requirement) => !checks[requirement]) || submit.isPending} onClick={() => submit.mutate("meets_evidence")}>Evidence meets requirements</Button>
        <Button variant="outline" disabled={!data.mission.completed || !data.evidence.length || summary.trim().length < 3 || submit.isPending} onClick={() => submit.mutate("revisions_needed")}>Request revision</Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">This review can advance in-app practice progression. It does not issue professional certification, legal authority, or a universal judgment of competence.</p>
    </div>}
  </ReviewShell>;
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-[100dvh] bg-background px-4 py-10 text-foreground">
    <div className="mx-auto max-w-2xl rounded-xl border border-primary/20 bg-card/40 p-5 shadow-lg space-y-5">
      <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="font-orbitron text-sm">LYFEOS SCOPED REVIEW</span></div>
      {children}
    </div>
  </main>;
}
