import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Handshake, Plus, ShieldCheck, UserPlus, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Member = { id: number; workspaceId: string; userId: number; displayName: string | null; role: string; status: string; invitationPurpose: string };
type Workspace = { id: string; ownerUserId: number; name: string; purpose: string; ownerDisplayName: string | null; myMembership: Member; members: Member[] };
type Grant = { id: string; workspaceId: string; granteeUserId: number; subjectType: "mission" | "thread"; subjectId: number; scopes: string[]; purpose: string; status: string; expiresAt: string };
type CollaborationState = { authorityBoundary: string; prohibitedDomains: string[]; workspaces: Workspace[]; issuedGrants: Grant[] };
type ShareOptions = { missions: Array<{ id: number; title: string; completed: boolean }>; threads: Array<{ id: number; title: string; status: string }> };
type SharedItem = { grant: { id: string; subjectType: string; scopes: string[]; purpose: string; expiresAt: string }; workspaceName: string; ownerDisplayName: string | null; projection: Record<string, unknown> };

const fieldClass = "border-primary/20 bg-background/60";
const inThirtyDays = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

export default function CollaborationSettings() {
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePurpose, setWorkspacePurpose] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [inviteeId, setInviteeId] = useState<number | null>(null);
  const [inviteRole, setInviteRole] = useState<"coach" | "collaborator">("coach");
  const [invitePurpose, setInvitePurpose] = useState("");
  const [subjectType, setSubjectType] = useState<"mission" | "thread">("mission");
  const [subjectId, setSubjectId] = useState("");
  const [granteeId, setGranteeId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiry, setGrantExpiry] = useState(inThirtyDays());

  const state = useQuery<CollaborationState>({ queryKey: ["/api/collaboration"] });
  const shared = useQuery<{ items: SharedItem[] }>({ queryKey: ["/api/collaboration/shared-with-me"] });
  const options = useQuery<ShareOptions>({ queryKey: ["/api/collaboration/share-options"] });
  const search = useQuery<{ users: Array<{ id: number; displayName: string }> }>({
    queryKey: [`/api/message-hub/users?q=${encodeURIComponent(userQuery.trim())}`],
    enabled: userQuery.trim().length >= 2,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/shared-with-me"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/share-options"] }),
    ]);
  };
  const mutate = useMutation({
    mutationFn: ({ url, method, body }: { url: string; method: string; body?: unknown }) => apiRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: async () => { await refresh(); toast({ title: "Collaboration updated" }); },
    onError: (error: Error) => toast({ title: "Collaboration update failed", description: error.message, variant: "destructive" }),
  });

  const activeWorkspaces = state.data?.workspaces.filter((workspace) => workspace.myMembership.status === "active") || [];
  const pendingInvites = state.data?.workspaces.filter((workspace) => workspace.myMembership.status === "invited") || [];
  const selectedWorkspace = activeWorkspaces.find((workspace) => workspace.id === workspaceId) || activeWorkspaces[0];
  const shareSubjects = subjectType === "mission" ? options.data?.missions || [] : options.data?.threads || [];
  const shareableMembers = useMemo(() => selectedWorkspace?.members.filter((member) => member.status === "active" && member.userId !== selectedWorkspace.myMembership.userId) || [], [selectedWorkspace]);

  return (
    <div className="mb-4 rounded-lg border border-primary/10 bg-background/40 p-4">
      <div className="mb-2 flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /><Label className="text-sm text-foreground">Teams & coaches</Label></div>
      <p className="text-xs text-muted-foreground">Membership is coordination only. Nothing from Health, finance, relationships, journal, messages, AI memory, or evidence is shared. You choose one Mission or Thread, the visible fields, recipient, purpose, and expiry.</p>

      {pendingInvites.map((workspace) => <div key={workspace.id} className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/5 p-3 text-xs">
        <p className="font-medium text-foreground">Invitation to {workspace.name}</p><p className="mt-1 text-muted-foreground">{workspace.purpose} · role: {workspace.myMembership.role}</p>
        <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => mutate.mutate({ url: `/api/collaboration/memberships/${workspace.myMembership.id}/decision`, method: "POST", body: { decision: "accept" } })}>Accept</Button><Button size="sm" variant="outline" onClick={() => mutate.mutate({ url: `/api/collaboration/memberships/${workspace.myMembership.id}/decision`, method: "POST", body: { decision: "decline" } })}>Decline</Button></div>
      </div>)}

      <details className="mt-4" open={!activeWorkspaces.length}>
        <summary className="cursor-pointer text-xs font-medium text-primary">Create a private collaboration workspace</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input className={fieldClass} maxLength={80} placeholder="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /><Input className={fieldClass} maxLength={280} placeholder="Purpose of working together" value={workspacePurpose} onChange={(event) => setWorkspacePurpose(event.target.value)} /><Button className="sm:col-span-2" variant="outline" disabled={workspaceName.trim().length < 2 || workspacePurpose.trim().length < 3 || mutate.isPending} onClick={() => mutate.mutate({ url: "/api/collaboration/workspaces", method: "POST", body: { name: workspaceName, purpose: workspacePurpose } })}><Plus className="mr-2 h-4 w-4" />Create workspace</Button></div>
      </details>

      {activeWorkspaces.length > 0 && <>
        <div className="mt-4"><Label className="text-xs">Active workspace</Label><select className={`mt-1 h-10 w-full rounded-md border px-3 text-sm ${fieldClass}`} value={selectedWorkspace?.id || ""} onChange={(event) => { setWorkspaceId(event.target.value); setGranteeId(""); }}><option value="" disabled>Choose workspace</option>{activeWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.myMembership.role}</option>)}</select></div>
        {selectedWorkspace && <div className="mt-3 rounded-md border border-primary/15 p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{selectedWorkspace.name}</p><p className="text-xs text-muted-foreground">{selectedWorkspace.purpose}</p></div><ShieldCheck className="h-4 w-4 text-primary" /></div>
          <div className="mt-2 flex flex-wrap gap-1">{selectedWorkspace.members.map((member) => <span key={member.id} className="rounded border border-muted/25 px-2 py-1 text-[10px] text-muted-foreground">{member.displayName || "LyfeOS user"} · {member.role} · {member.status}</span>)}</div>
        </div>}

        {selectedWorkspace?.myMembership.role === "owner" && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-primary">Invite a coach or collaborator</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input className={fieldClass} placeholder="Search LyfeOS username" value={userQuery} onChange={(event) => { setUserQuery(event.target.value); setInviteeId(null); }} />
          <select className={`h-10 rounded-md border px-3 text-sm ${fieldClass}`} value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}><option value="coach">Coach</option><option value="collaborator">Collaborator</option></select>
          {userQuery.trim().length >= 2 && <div className="sm:col-span-2 flex flex-wrap gap-1">{(search.data?.users || []).map((user) => <Button key={user.id} type="button" size="sm" variant={inviteeId === user.id ? "default" : "outline"} onClick={() => setInviteeId(user.id)}>{user.displayName}</Button>)}</div>}
          <Input className={`sm:col-span-2 ${fieldClass}`} maxLength={280} placeholder="Why you are inviting this person" value={invitePurpose} onChange={(event) => setInvitePurpose(event.target.value)} />
          <Button className="sm:col-span-2" variant="outline" disabled={!inviteeId || invitePurpose.trim().length < 3 || mutate.isPending} onClick={() => mutate.mutate({ url: `/api/collaboration/workspaces/${selectedWorkspace.id}/invitations`, method: "POST", body: { userId: inviteeId, role: inviteRole, purpose: invitePurpose } })}><UserPlus className="mr-2 h-4 w-4" />Send in-app invitation</Button>
        </div></details>}

        {selectedWorkspace && shareableMembers.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-primary">Share a bounded Mission or Thread view</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select className={`h-10 rounded-md border px-3 text-sm ${fieldClass}`} value={subjectType} onChange={(event) => { setSubjectType(event.target.value as typeof subjectType); setSubjectId(""); }}><option value="mission">Mission</option><option value="thread">Thread</option></select>
          <select className={`h-10 rounded-md border px-3 text-sm ${fieldClass}`} value={granteeId} onChange={(event) => setGranteeId(event.target.value)}><option value="">Choose recipient</option>{shareableMembers.map((member) => <option key={member.id} value={member.userId}>{member.displayName || "LyfeOS user"} · {member.role}</option>)}</select>
          <select className={`h-10 rounded-md border px-3 text-sm ${fieldClass}`} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Choose {subjectType}</option>{shareSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select>
          <Input className={fieldClass} type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={grantExpiry} onChange={(event) => setGrantExpiry(event.target.value)} />
          <Input className={`sm:col-span-2 ${fieldClass}`} maxLength={280} placeholder="Purpose for this specific view" value={grantPurpose} onChange={(event) => setGrantPurpose(event.target.value)} />
          <p className="sm:col-span-2 text-[11px] text-muted-foreground">This shares summary and status fields only. Descriptions, evidence, notes, progression internals, linked records, and every other domain remain private.</p>
          <Button className="sm:col-span-2" variant="outline" disabled={!granteeId || !subjectId || grantPurpose.trim().length < 3 || !grantExpiry || mutate.isPending} onClick={() => mutate.mutate({ url: `/api/collaboration/workspaces/${selectedWorkspace.id}/grants`, method: "POST", body: { granteeUserId: Number(granteeId), subjectType, subjectId: Number(subjectId), scopes: ["summary", "status"], purpose: grantPurpose, expiresAt: new Date(`${grantExpiry}T23:59:59.000Z`).toISOString() } })}>Share until {grantExpiry}</Button>
        </div></details>}
      </>}

      {(state.data?.issuedGrants || []).filter((grant) => grant.status === "active").length > 0 && <div className="mt-4"><p className="text-xs font-medium text-foreground">Views you shared</p><div className="mt-2 space-y-1">{state.data!.issuedGrants.filter((grant) => grant.status === "active").map((grant) => <div key={grant.id} className="flex items-center justify-between gap-2 rounded border border-muted/20 p-2 text-[11px]"><span className="text-muted-foreground">{grant.subjectType} #{grant.subjectId} · {grant.scopes.join(" + ")} · expires {new Date(grant.expiresAt).toLocaleDateString()}</span><Button size="icon" variant="ghost" aria-label="Revoke shared view" onClick={() => mutate.mutate({ url: `/api/collaboration/grants/${grant.id}`, method: "DELETE" })}><X className="h-4 w-4" /></Button></div>)}</div></div>}

      {(shared.data?.items || []).length > 0 && <div className="mt-4"><p className="text-xs font-medium text-foreground">Shared with you</p><div className="mt-2 space-y-2">{shared.data!.items.map((item) => <div key={item.grant.id} className="rounded border border-primary/15 p-2 text-xs"><p className="font-medium">{String(item.projection.title || `${item.grant.subjectType} update`)}</p><p className="mt-1 text-muted-foreground">{item.ownerDisplayName || "A LyfeOS member"} · {item.workspaceName} · {item.grant.purpose}</p><p className="mt-1 text-[10px] text-muted-foreground">Expires {new Date(item.grant.expiresAt).toLocaleDateString()} · {Object.entries(item.projection).filter(([key]) => !["id", "title"].includes(key)).map(([key, value]) => `${key}: ${String(value ?? "—")}`).join(" · ")}</p></div>)}</div></div>}
    </div>
  );
}
