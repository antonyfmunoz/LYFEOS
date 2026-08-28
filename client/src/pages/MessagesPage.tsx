import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Check, CheckCheck, Clock3, FileText, Inbox, LockKeyhole, MessageCircle, Paperclip, Pencil, Plus, Reply, Search, Send, ShieldBan, StickyNote, Trash2, UserRound, Users, X } from "lucide-react";
import { messageConversationStatuses, nativeMessageReactions, type MessageConversationStatus } from "@shared/messages";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Person = { id: number; participantId?: string; userId?: number; displayName: string | null; avatarUrl?: string | null; avatarColor?: string | null; status?: string; role?: string };
type Attachment = { id: string; attachmentKind: string; filename: string | null; mimeType: string | null; sizeBytes: number | null };
type MessageReaction = { id: string; messageId: string; userId: number; reaction: string };
type Message = { id: string; senderUserId: number | null; direction: "inbound" | "outbound"; body: string; status: string; version: number; replyToMessageId?: string | null; createdAt: string; editedAt?: string | null; deletedAt?: string | null; extension?: { kind?: string; invitationId?: number; reviewPath?: string }; attachments?: Attachment[]; reactions?: MessageReaction[] };
type Note = { id: string; body: string; createdAt: string };
type DocumentOption = { id: number; title: string; fileType: string | null; mimeType: string | null; fileSize: number | null; format: string };
type Conversation = {
  id: string;
  title: string;
  kind: "direct" | "group";
  status: MessageConversationStatus;
  version: number;
  participantStatus: "active" | "blocked";
  snoozedUntil?: string | null;
  lastMessageAt?: string | null;
  participants: Person[];
  unreadCount: number;
  latestMessage?: { id: string; body: string; direction: "inbound" | "outbound"; createdAt: string } | null;
  messages?: Message[];
  notes?: Note[];
  bindings?: Array<{ id: string; provider: string; status: string }>;
};

const labels: Record<MessageConversationStatus, string> = { open: "Open", pending: "Waiting", snoozed: "Snoozed", closed: "Closed", spam: "Spam" };

function initials(name: string | null) {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function conversationLabel(conversation: Conversation, currentUserId?: number) {
  if (conversation.kind === "group") return conversation.title;
  return conversation.participants.find((participant) => participant.id !== currentUserId)?.displayName || conversation.title;
}

export default function MessagesPage() {
  usePageTitle("Messages");
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<MessageConversationStatus>("open");
  const [search, setSearch] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentOption[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");

  const list = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/message-hub/conversations", status],
    queryFn: () => apiRequest(`/api/message-hub/conversations?status=${status}`),
    refetchInterval: 8_000,
  });
  const detail = useQuery<{ conversation: Conversation }>({
    queryKey: ["/api/message-hub/conversations", selectedId],
    queryFn: () => apiRequest(`/api/message-hub/conversations/${selectedId}`),
    enabled: Boolean(selectedId),
    refetchInterval: 5_000,
  });
  const people = useQuery<{ users: Person[] }>({
    queryKey: ["/api/message-hub/users", search],
    queryFn: () => apiRequest(`/api/message-hub/users?q=${encodeURIComponent(search.trim())}`),
    enabled: search.trim().length >= 2,
  });
  const attachmentOptions = useQuery<{ documents: DocumentOption[] }>({
    queryKey: ["/api/message-hub/attachment-options", attachmentSearch],
    queryFn: () => apiRequest(`/api/message-hub/attachment-options${attachmentSearch.trim() ? `?q=${encodeURIComponent(attachmentSearch.trim())}` : ""}`),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (selectedId && list.data?.conversations.some((conversation) => conversation.id === selectedId)) return;
    setSelectedId(list.data?.conversations[0]?.id ?? null);
  }, [list.data, selectedId]);

  const invalidate = async (conversationId = selectedId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/message-hub/conversations"] }),
      conversationId ? queryClient.invalidateQueries({ queryKey: ["/api/message-hub/conversations", conversationId] }) : Promise.resolve(),
    ]);
  };

  const createConversation = useMutation({
    mutationFn: () => apiRequest<{ conversation: Conversation }>("/api/message-hub/conversations", { method: "POST", body: JSON.stringify({ participantUserIds: selectedPeople.map((person) => person.id), title: selectedPeople.length > 1 ? groupTitle || null : null }) }),
    onSuccess: async ({ conversation }) => {
      setSelectedPeople([]); setSearch(""); setGroupTitle(""); setStatus("open");
      await invalidate(conversation.id); setSelectedId(conversation.id);
      toast({ title: "Conversation ready" });
    },
    onError: (error) => toast({ title: "Conversation was not created", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  const send = useMutation({
    mutationFn: () => noteMode
      ? apiRequest(`/api/message-hub/conversations/${selectedId}/notes`, { method: "POST", body: JSON.stringify({ body: composer }) })
      : apiRequest(`/api/message-hub/conversations/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ body: composer, idempotencyKey: crypto.randomUUID(), replyToMessageId: replyTo?.id || null, documentIds: selectedDocuments.map((document) => document.id) }) }),
    onSuccess: async () => { setComposer(""); setReplyTo(null); setSelectedDocuments([]); setAttachmentSearch(""); await invalidate(); },
    onError: (error) => toast({ title: noteMode ? "Private note was not saved" : "Message was not sent", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  const markRead = useMutation({ mutationFn: (conversationId: string) => apiRequest(`/api/message-hub/conversations/${conversationId}/read`, { method: "POST" }), onSuccess: () => invalidate() });
  useEffect(() => {
    if (selectedId && detail.data?.conversation.unreadCount && !markRead.isPending) markRead.mutate(selectedId);
  }, [selectedId, detail.data?.conversation.unreadCount]);

  const changeState = useMutation({
    mutationFn: ({ next, snoozedUntil = null }: { next: MessageConversationStatus; snoozedUntil?: string | null }) => apiRequest(`/api/message-hub/conversations/${selectedId}/state`, { method: "POST", body: JSON.stringify({ status: next, expectedVersion: detail.data!.conversation.version, snoozedUntil }) }),
    onSuccess: async (_result, variables) => { setStatus(variables.next); await invalidate(); toast({ title: `Conversation ${labels[variables.next].toLowerCase()}` }); },
    onError: (error) => toast({ title: "Conversation was not updated", description: error instanceof Error ? error.message : "Refresh and try again.", variant: "destructive" }),
  });
  const changeBlock = useMutation({
    mutationFn: (blocked: boolean) => apiRequest(`/api/message-hub/conversations/${selectedId}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),
    onSuccess: async (_result, blocked) => { setStatus(blocked ? "spam" : "open"); await invalidate(); toast({ title: blocked ? "Conversation blocked" : "Conversation unblocked" }); },
    onError: (error) => toast({ title: "Block setting was not changed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const editMessage = useMutation({
    mutationFn: ({ messageId, body, expectedVersion }: { messageId: string; body: string; expectedVersion: number }) => apiRequest(`/api/message-hub/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ body, expectedVersion }) }),
    onSuccess: async () => { setEditingMessageId(null); setEditBody(""); await invalidate(); toast({ title: "Message updated" }); },
    onError: (error) => toast({ title: "Message was not updated", description: error instanceof Error ? error.message : "Refresh and try again.", variant: "destructive" }),
  });
  const deleteMessage = useMutation({
    mutationFn: ({ messageId, expectedVersion }: { messageId: string; expectedVersion: number }) => apiRequest(`/api/message-hub/messages/${messageId}?expectedVersion=${expectedVersion}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); toast({ title: "Message deleted" }); },
    onError: (error) => toast({ title: "Message was not deleted", description: error instanceof Error ? error.message : "Refresh and try again.", variant: "destructive" }),
  });
  const reactToMessage = useMutation({
    mutationFn: ({ messageId, reaction }: { messageId: string; reaction: string }) => apiRequest(`/api/message-hub/messages/${messageId}/reaction`, { method: "POST", body: JSON.stringify({ reaction }) }),
    onSuccess: () => invalidate(),
    onError: (error) => toast({ title: "Reaction was not changed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  const conversation = detail.data?.conversation;
  const participantNames = useMemo(() => new Map((conversation?.participants || []).map((participant) => [participant.id, participant.displayName || "LyfeOS user"])), [conversation?.participants]);
  const visiblePeople = (people.data?.users || []).filter((person) => !selectedPeople.some((selected) => selected.id === person.id));
  const canCompose = conversation && conversation.participantStatus === "active" && ["open", "pending"].includes(conversation.status);
  const currentParticipant = conversation?.participants.find((participant) => participant.id === user?.id);
  const canManageGroup = conversation?.kind === "group" && currentParticipant?.role === "admin" && conversation.participantStatus === "active";
  const groupPeople = useQuery<{ users: Person[] }>({
    queryKey: ["/api/message-hub/users", "group", groupMemberSearch],
    queryFn: () => apiRequest(`/api/message-hub/users?q=${encodeURIComponent(groupMemberSearch.trim())}`),
    enabled: Boolean(canManageGroup && groupMemberSearch.trim().length >= 2),
  });
  const addGroupParticipant = useMutation({
    mutationFn: (participantUserId: number) => apiRequest(`/api/message-hub/conversations/${selectedId}/participants`, { method: "POST", body: JSON.stringify({ userIds: [participantUserId] }) }),
    onSuccess: async () => { setGroupMemberSearch(""); await invalidate(); toast({ title: "Participant added" }); },
    onError: (error) => toast({ title: "Participant was not added", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const changeParticipantRole = useMutation({
    mutationFn: ({ participantUserId, role }: { participantUserId: number; role: "admin" | "member" }) => apiRequest(`/api/message-hub/conversations/${selectedId}/participants/${participantUserId}/role`, { method: "POST", body: JSON.stringify({ role }) }),
    onSuccess: async () => { await invalidate(); toast({ title: "Participant role updated" }); },
    onError: (error) => toast({ title: "Role was not changed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const removeGroupParticipant = useMutation({
    mutationFn: (participantUserId: number) => apiRequest(`/api/message-hub/conversations/${selectedId}/participants/${participantUserId}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); toast({ title: "Participant removed" }); },
    onError: (error) => toast({ title: "Participant was not removed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const leaveGroup = useMutation({
    mutationFn: () => apiRequest(`/api/message-hub/conversations/${selectedId}/leave`, { method: "POST" }),
    onSuccess: async () => { setSelectedId(null); await invalidate(); toast({ title: "You left the group" }); },
    onError: (error) => toast({ title: "Group was not left", description: error instanceof Error ? error.message : "Promote another admin first.", variant: "destructive" }),
  });

  return (
    <div className="container max-w-7xl space-y-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Native private communication</p>
          <h1 className="font-orbitron text-2xl">Messages</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">A LyfeOS inbox with delivery and read evidence. Health, missions, memories, AI history, and private Rolodex context are never inserted into a message automatically.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-card/35 px-3 py-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4 text-primary" />Native channel only</div>
      </header>

      <section className="rounded-xl border border-primary/15 bg-card/35 p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Find a LyfeOS user" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a LyfeOS username…" className="pl-9" /></div>
          <Input aria-label="Conversation name" value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder={selectedPeople.length > 1 ? "Group name" : "Select people for a new conversation"} disabled={selectedPeople.length < 2} />
          <Button onClick={() => createConversation.mutate()} disabled={!selectedPeople.length || (selectedPeople.length > 1 && !groupTitle.trim()) || createConversation.isPending}><Plus className="mr-1 h-4 w-4" />New</Button>
        </div>
        {selectedPeople.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedPeople.map((person) => <button key={person.id} onClick={() => setSelectedPeople((current) => current.filter((item) => item.id !== person.id))} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">{person.displayName}<X className="h-3 w-3" /></button>)}</div>}
        {search.trim().length >= 2 && visiblePeople.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{visiblePeople.map((person) => <button key={person.id} onClick={() => setSelectedPeople((current) => [...current, person])} className="rounded-lg border border-primary/15 px-3 py-1.5 text-xs hover:bg-primary/10">+ {person.displayName}</button>)}</div>}
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">{messageConversationStatuses.map((item) => <button key={item} onClick={() => { setStatus(item); setSelectedId(null); }} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${status === item ? "border-primary bg-primary/15 text-primary" : "border-primary/15 text-muted-foreground hover:bg-primary/5"}`}>{labels[item]}</button>)}</div>

      <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-primary/15 bg-card/25 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-primary/15 p-2 lg:border-b-0 lg:border-r">
          {list.data?.conversations.length ? list.data.conversations.map((item) => {
            const others = item.participants.filter((participant) => participant.id !== user?.id);
            return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`mb-1 w-full rounded-lg border p-3 text-left ${selectedId === item.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-primary/5"}`}>
              <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs text-primary">{item.kind === "group" ? <Users className="h-4 w-4" /> : initials(others[0]?.displayName || item.title)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{conversationLabel(item, user?.id)}</strong><span className="text-[10px] text-muted-foreground">{relativeTime(item.latestMessage?.createdAt || item.lastMessageAt)}</span></div><p className="truncate text-xs text-muted-foreground">{item.latestMessage ? `${item.latestMessage.direction === "outbound" ? "You: " : ""}${item.latestMessage.body}` : others.map((person) => person.displayName).join(", ")}</p></div>{item.unreadCount > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{item.unreadCount}</span>}</div>
            </button>;
          }) : <div className="p-8 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-2 h-7 w-7 text-primary/60" />No {labels[status].toLowerCase()} conversations.</div>}
        </aside>

        {conversation ? <main className="flex min-h-[560px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 p-4"><div><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /><strong>{conversationLabel(conversation, user?.id)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{conversation.participants.map((person) => person.displayName).join(", ")} · {labels[conversation.status]} · revision {conversation.version}</p></div><div className="flex flex-wrap gap-1">
            {conversation.participantStatus === "blocked" ? <Button size="sm" variant="outline" onClick={() => changeBlock.mutate(false)}>Unblock</Button> : <>
              {conversation.status !== "open" && <Button size="sm" variant="outline" onClick={() => changeState.mutate({ next: "open" })}>Reopen</Button>}
              {conversation.status === "open" && <><Button size="sm" variant="outline" onClick={() => changeState.mutate({ next: "pending" })}><Clock3 className="mr-1 h-3.5 w-3.5" />Wait</Button><Button size="sm" variant="outline" onClick={() => changeState.mutate({ next: "snoozed", snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() })}>Snooze 1h</Button><Button size="sm" variant="outline" onClick={() => changeState.mutate({ next: "closed" })}>Close</Button><Button size="sm" variant="ghost" onClick={() => changeState.mutate({ next: "spam" })}>Spam</Button></>}
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => changeBlock.mutate(true)}><ShieldBan className="mr-1 h-3.5 w-3.5" />Block</Button>
            </>}
          </div></div>
          {conversation.kind === "group" && conversation.participantStatus === "active" && <details className="border-b border-primary/15 bg-background/20 px-4 py-2">
            <summary className="cursor-pointer list-none text-xs text-primary"><Users className="mr-1 inline h-3.5 w-3.5" />Group participants ({conversation.participants.length})</summary>
            <div className="mt-3 space-y-2">
              {canManageGroup && <div><Input value={groupMemberSearch} onChange={(event) => setGroupMemberSearch(event.target.value)} placeholder="Add a LyfeOS username…" />{groupMemberSearch.trim().length >= 2 && <div className="mt-1 flex flex-wrap gap-1">{(groupPeople.data?.users || []).filter((person) => !conversation.participants.some((participant) => participant.id === person.id)).map((person) => <Button key={person.id} size="sm" variant="outline" onClick={() => addGroupParticipant.mutate(person.id)}>+ {person.displayName}</Button>)}</div>}</div>}
              <div className="flex flex-wrap gap-2">{conversation.participants.map((participant) => <div key={participant.id} className="flex items-center gap-1 rounded-full border border-primary/15 bg-background/35 px-2 py-1 text-[10px]"><span>{participant.displayName || "LyfeOS user"}</span><span className="text-muted-foreground">· {participant.role}</span>{canManageGroup && participant.id !== user?.id && <><button className="text-primary hover:underline" onClick={() => changeParticipantRole.mutate({ participantUserId: participant.id, role: participant.role === "admin" ? "member" : "admin" })}>{participant.role === "admin" ? "make member" : "make admin"}</button><button aria-label={`Remove ${participant.displayName || "participant"}`} className="text-destructive" onClick={() => removeGroupParticipant.mutate(participant.id)}><X className="h-3 w-3" /></button></>}</div>)}</div>
              <div className="flex justify-end"><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm("Leave this group? You will stop receiving new messages.")) leaveGroup.mutate(); }}>Leave group</Button></div>
            </div>
          </details>}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {(conversation.messages || []).map((message) => {
              const outbound = message.direction === "outbound";
              const deleted = Boolean(message.deletedAt);
              const editing = editingMessageId === message.id;
              const groupedReactions = Array.from(new Set((message.reactions || []).map((reaction) => reaction.reaction))).map((reaction) => ({
                reaction,
                count: (message.reactions || []).filter((item) => item.reaction === reaction).length,
                mine: (message.reactions || []).some((item) => item.reaction === reaction && item.userId === user?.id),
              }));
              return <div key={message.id} className={`group flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-2xl border px-3 py-2 ${outbound ? "border-primary/30 bg-primary/12" : "border-primary/15 bg-background/55"}`}>
                  <div className="mb-1 flex items-center justify-between gap-4 text-[10px] text-muted-foreground"><span>{outbound ? "You" : participantNames.get(message.senderUserId || -1) || "Former user"}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div>
                  {message.replyToMessageId && <p className="mb-1 border-l border-primary/40 pl-2 text-[10px] text-muted-foreground">Reply</p>}
                  {editing ? <div className="space-y-2"><Textarea value={editBody} maxLength={10_000} onChange={(event) => setEditBody(event.target.value)} className="min-h-20 resize-none bg-background" /><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditingMessageId(null); setEditBody(""); }}><X className="mr-1 h-3 w-3" />Cancel</Button><Button size="sm" disabled={!editBody.trim() || editMessage.isPending} onClick={() => editMessage.mutate({ messageId: message.id, body: editBody, expectedVersion: message.version })}><Check className="mr-1 h-3 w-3" />Save</Button></div></div> : <p className={`whitespace-pre-wrap break-words text-sm ${deleted ? "italic text-muted-foreground" : ""}`}>{message.body}</p>}
                  {!deleted && !outbound && message.extension?.kind === "mission_review_invitation" && message.extension.reviewPath?.startsWith("/review-mission#invitation=") ? <Link href={message.extension.reviewPath}><Button size="sm" variant="outline" className="mt-2">Open scoped review</Button></Link> : null}
                  {message.editedAt && !deleted && <p className="mt-1 text-[9px] text-muted-foreground">edited</p>}
                  {!deleted && message.attachments?.length ? <div className="mt-2 space-y-1">{message.attachments.map((attachment) => <a key={attachment.id} href={`/api/message-hub/attachments/${attachment.id}/file`} className="flex items-center gap-2 rounded-md border border-primary/20 bg-background/30 px-2 py-1.5 text-xs text-primary hover:bg-primary/10"><FileText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{attachment.filename || "Attachment"}</span>{attachment.sizeBytes != null && <span className="text-[10px] text-muted-foreground">{Math.max(1, Math.ceil(attachment.sizeBytes / 1024))} KB</span>}</a>)}</div> : null}
                  {!deleted && groupedReactions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{groupedReactions.map((item) => <button key={item.reaction} type="button" aria-label={`${item.reaction} reaction, ${item.count}`} onClick={() => reactToMessage.mutate({ messageId: message.id, reaction: item.reaction })} className={`rounded-full border px-1.5 py-0.5 text-[10px] ${item.mine ? "border-primary/50 bg-primary/15" : "border-primary/15 bg-background/30"}`}>{item.reaction} {item.count}</button>)}</div>}
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {!deleted && canCompose && <><div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">{nativeMessageReactions.map((reaction) => <button key={reaction} type="button" aria-label={`React ${reaction}`} className="rounded px-1 text-xs hover:bg-primary/10" onClick={() => reactToMessage.mutate({ messageId: message.id, reaction })}>{reaction}</button>)}</div><button className="text-[10px] text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100" onClick={() => { setReplyTo(message); setNoteMode(false); }}><Reply className="inline h-3 w-3" /> reply</button></>}
                    {!deleted && outbound && canCompose && <><button aria-label="Edit message" className="text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100" onClick={() => { setEditingMessageId(message.id); setEditBody(message.body); }}><Pencil className="h-3 w-3" /></button><button aria-label="Delete message" className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" onClick={() => { if (window.confirm("Delete this message? Its attachments will no longer be shared.")) deleteMessage.mutate({ messageId: message.id, expectedVersion: message.version }); }}><Trash2 className="h-3 w-3" /></button></>}
                    {outbound && <span className="text-[10px] text-muted-foreground"><CheckCheck className="mr-0.5 inline h-3 w-3" />{message.status}</span>}
                  </div>
                </div>
              </div>;
            })}
            {(conversation.notes || []).map((note) => <div key={note.id} className="mx-auto max-w-[86%] rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs"><div className="mb-1 flex items-center gap-1 font-mono uppercase text-amber-400"><StickyNote className="h-3 w-3" />Private note · only you</div><p className="whitespace-pre-wrap">{note.body}</p></div>)}
            {!conversation.messages?.length && !conversation.notes?.length && <div className="p-10 text-center text-sm text-muted-foreground"><UserRound className="mx-auto mb-2 h-7 w-7 text-primary/60" />Start the conversation. Only what you type here is sent.</div>}
          </div>
          <div className="border-t border-primary/15 p-3">
            {replyTo && <div className="mb-2 flex items-center justify-between rounded-md bg-primary/5 px-2 py-1 text-xs text-muted-foreground"><span className="truncate">Replying to: {replyTo.body}</span><button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button></div>}
            {!noteMode && canCompose && <details className="mb-2 rounded-md border border-primary/15 bg-background/25 px-2 py-1.5"><summary className="cursor-pointer list-none text-xs text-primary"><Paperclip className="mr-1 inline h-3.5 w-3.5" />Attach from Data Vault ({selectedDocuments.length}/5)</summary><div className="mt-2 space-y-2"><Input value={attachmentSearch} onChange={(event) => setAttachmentSearch(event.target.value)} placeholder="Find an owned document…" /><div className="max-h-32 overflow-y-auto">{(attachmentOptions.data?.documents || []).filter((document) => !selectedDocuments.some((selected) => selected.id === document.id)).map((document) => <button key={document.id} type="button" onClick={() => selectedDocuments.length < 5 && setSelectedDocuments((current) => [...current, document])} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-primary/10"><FileText className="h-3.5 w-3.5 text-primary" /><span className="truncate">{document.title}</span></button>)}</div>{selectedDocuments.length > 0 && <div className="flex flex-wrap gap-1">{selectedDocuments.map((document) => <button key={document.id} type="button" onClick={() => setSelectedDocuments((current) => current.filter((item) => item.id !== document.id))} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">{document.title}<X className="h-3 w-3" /></button>)}</div>}<p className="text-[10px] text-muted-foreground">Sending explicitly grants this conversation access to the selected document or file. Private context outside the selected file is not shared.</p></div></details>}
            <div className="mb-2 flex items-center gap-2"><button onClick={() => { setNoteMode(false); }} className={`rounded-full border px-2 py-1 text-[10px] ${!noteMode ? "border-primary/40 bg-primary/10 text-primary" : "border-primary/15 text-muted-foreground"}`}>Message</button><button onClick={() => { setNoteMode(true); setReplyTo(null); }} className={`rounded-full border px-2 py-1 text-[10px] ${noteMode ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-primary/15 text-muted-foreground"}`}>Private note</button>{noteMode && <span className="text-[10px] text-muted-foreground">Never delivered to participants.</span>}</div>
            <div className="flex items-end gap-2"><Textarea value={composer} onChange={(event) => setComposer(event.target.value)} disabled={!canCompose && !noteMode} maxLength={noteMode ? 4_000 : 10_000} placeholder={noteMode ? "Write a note only you can see…" : canCompose ? "Type a message…" : "Reopen this conversation before replying"} className="min-h-12 resize-none" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if ((composer.trim() || (!noteMode && selectedDocuments.length)) && !send.isPending) send.mutate(); } }} /><Button size="icon" aria-label={noteMode ? "Save private note" : "Send message"} onClick={() => send.mutate()} disabled={(!composer.trim() && (noteMode || !selectedDocuments.length)) || send.isPending || (!canCompose && !noteMode)}><Send className="h-4 w-4" /></Button></div>
          </div>
        </main> : <div className="flex min-h-[560px] items-center justify-center p-10 text-center text-sm text-muted-foreground"><div><MessageCircle className="mx-auto mb-3 h-9 w-9 text-primary/50" />Choose or create a conversation.</div></div>}
      </div>
    </div>
  );
}
