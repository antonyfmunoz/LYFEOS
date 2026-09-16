import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/use-page-title";
import { apiRequest, queryClient } from "@/lib/queryClient";

const kinds = [
  ["bible_study", "Bible study"],
  ["prayer", "Prayer"],
  ["reflection", "Reflection"],
  ["sermon", "Sermon"],
  ["other", "Other"],
] as const;

type SpiritKind = typeof kinds[number][0];
type SpiritEntry = { id: number; entryDate: string; kind: SpiritKind; title: string; scripture: string | null; content: string; createdAt: string; updatedAt: string };
type SpiritLogResponse = { entries: SpiritEntry[]; disclosure: string };
type EntryDraft = { entryDate: string; kind: SpiritKind; title: string; scripture: string; content: string };

const fieldClass = "border-primary/25 bg-background/60";
const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): EntryDraft => ({ entryDate: today(), kind: "bible_study", title: "", scripture: "", content: "" });
const labelFor = (kind: SpiritKind) => kinds.find(([value]) => value === kind)?.[1] || "Other";
const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/^\d+:\s*/, "") : "Please try again.";

export default function SpiritLogPage() {
  usePageTitle("Spirit Log");
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft);
  const [editing, setEditing] = useState<SpiritEntry | null>(null);
  const [editDraft, setEditDraft] = useState<EntryDraft>(emptyDraft);
  const [kindFilter, setKindFilter] = useState<"all" | SpiritKind>("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const entriesQuery = useQuery<SpiritLogResponse>({
    queryKey: ["/api/spirit-entries"],
    queryFn: () => apiRequest<SpiritLogResponse>("/api/spirit-entries"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/spirit-entries"] });

  const createEntry = useMutation({
    mutationFn: (entry: EntryDraft) => apiRequest<SpiritEntry>("/api/spirit-entries", { method: "POST", body: JSON.stringify({ ...entry, scripture: entry.scripture || null }) }),
    onSuccess: () => { setDraft(emptyDraft()); setNotice("Entry saved privately in Spirit Log."); refresh(); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const saveEntry = useMutation({
    mutationFn: ({ id, entry }: { id: number; entry: EntryDraft }) => apiRequest<SpiritEntry>(`/api/spirit-entries/${id}`, { method: "PATCH", body: JSON.stringify({ ...entry, scripture: entry.scripture || null }) }),
    onSuccess: () => { setEditing(null); setNotice("Spirit Log entry updated."); refresh(); },
    onError: (error) => setNotice(errorMessage(error)),
  });
  const deleteEntry = useMutation({
    mutationFn: (id: number) => apiRequest<{ deleted: boolean }>(`/api/spirit-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => { setNotice("Spirit Log entry deleted."); refresh(); },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (entriesQuery.data?.entries || []).filter((entry) => {
      const matchesKind = kindFilter === "all" || entry.kind === kindFilter;
      const matchesSearch = !needle || [entry.title, entry.scripture || "", entry.content, labelFor(entry.kind)].some((value) => value.toLowerCase().includes(needle));
      return matchesKind && matchesSearch;
    });
  }, [entriesQuery.data?.entries, kindFilter, search]);

  const submitCreate = (event: FormEvent) => { event.preventDefault(); setNotice(null); createEntry.mutate(draft); };
  const beginEdit = (entry: SpiritEntry) => { setEditing(entry); setEditDraft({ entryDate: entry.entryDate.slice(0, 10), kind: entry.kind, title: entry.title, scripture: entry.scripture || "", content: entry.content }); setNotice(null); };
  const submitEdit = (event: FormEvent) => { event.preventDefault(); if (editing) saveEntry.mutate({ id: editing.id, entry: editDraft }); };
  const remove = (entry: SpiritEntry) => { if (window.confirm(`Delete “${entry.title}”? This removes this private Spirit Log entry.`)) deleteEntry.mutate(entry.id); };

  return <main className="mx-auto max-w-5xl px-4 py-8" aria-labelledby="spirit-log-title" data-testid="spirit-log-page">
    <Link href="/chronilog" className="mb-6 inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/20 px-3 py-2 font-mono text-xs text-primary hover:bg-primary/30"><ArrowLeft className="h-4 w-4" />Back</Link>
    <header className="mb-6"><h1 id="spirit-log-title" className="flex items-center gap-3 font-orbitron text-3xl text-primary"><BookOpen className="h-8 w-8" />Spirit Log</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">A private place for Bible study, prayers, reflections, sermons, and the records that support your spiritual practice.</p></header>
    {notice ? <div role="status" className="mb-5 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-foreground">{notice}</div> : null}

    <section className="mb-6 rounded-xl border border-primary/25 bg-card/35 p-5" aria-labelledby="new-spirit-entry"><div className="mb-4"><h2 id="new-spirit-entry" className="font-orbitron text-lg text-primary">New entry</h2><p className="mt-1 text-xs text-muted-foreground">Write the record in your own words. Scripture reference is optional.</p></div><form onSubmit={submitCreate} className="grid gap-3 md:grid-cols-2" data-testid="spirit-log-create-form"><label className="space-y-1 text-sm"><span>Type</span><select aria-label="Spirit Log entry type" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as SpiritKind })} className={`h-10 w-full rounded-md px-3 text-sm ${fieldClass}`}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-1 text-sm"><span>Date</span><Input required aria-label="Spirit Log entry date" type="date" value={draft.entryDate} onChange={(event) => setDraft({ ...draft, entryDate: event.target.value })} className={fieldClass} /></label><label className="space-y-1 text-sm md:col-span-2"><span>Title</span><Input required aria-label="Spirit Log entry title" maxLength={180} placeholder="What is this entry about?" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={fieldClass} /></label><label className="space-y-1 text-sm md:col-span-2"><span>Scripture or reference <span className="text-muted-foreground">(optional)</span></span><Input aria-label="Scripture or reference" maxLength={300} placeholder="For example: John 15:1–8" value={draft.scripture} onChange={(event) => setDraft({ ...draft, scripture: event.target.value })} className={fieldClass} /></label><label className="space-y-1 text-sm md:col-span-2"><span>Entry</span><Textarea required aria-label="Spirit Log entry content" maxLength={20_000} placeholder="Record your study notes, prayer, reflection, or sermon takeaways…" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} className={`min-h-32 resize-y ${fieldClass}`} /></label><div className="md:col-span-2"><Button disabled={createEntry.isPending || !draft.title.trim() || !draft.content.trim()} data-testid="spirit-log-save-entry">{createEntry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Save entry</Button></div></form></section>

    <section aria-labelledby="spirit-log-records"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="spirit-log-records" className="font-orbitron text-lg text-primary">Your records</h2><p className="mt-1 text-xs text-muted-foreground">Search and filter only your own entries.</p></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="spirit-search">Search Spirit Log</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="spirit-search" aria-label="Search Spirit Log" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search entries" className={`${fieldClass} w-52 pl-9`} /></div><select aria-label="Filter Spirit Log by type" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | SpiritKind)} className={`h-10 rounded-md px-3 text-sm ${fieldClass}`}><option value="all">All types</option>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {entriesQuery.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : entriesQuery.isError ? <div className="rounded-xl border border-destructive/40 p-5"><p>Spirit Log could not load.</p><Button variant="outline" className="mt-3" onClick={() => entriesQuery.refetch()}>Retry</Button></div> : filteredEntries.length ? <div className="space-y-3">{filteredEntries.map((entry) => editing?.id === entry.id ? <form key={entry.id} onSubmit={submitEdit} className="rounded-xl border border-primary/40 bg-card/45 p-5"><div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>Type</span><select aria-label="Edit Spirit Log entry type" value={editDraft.kind} onChange={(event) => setEditDraft({ ...editDraft, kind: event.target.value as SpiritKind })} className={`h-10 w-full rounded-md px-3 text-sm ${fieldClass}`}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-1 text-sm"><span>Date</span><Input required type="date" aria-label="Edit Spirit Log entry date" value={editDraft.entryDate} onChange={(event) => setEditDraft({ ...editDraft, entryDate: event.target.value })} className={fieldClass} /></label><Input required aria-label="Edit Spirit Log entry title" maxLength={180} value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className={`md:col-span-2 ${fieldClass}`} /><Input aria-label="Edit scripture or reference" maxLength={300} value={editDraft.scripture} onChange={(event) => setEditDraft({ ...editDraft, scripture: event.target.value })} className={`md:col-span-2 ${fieldClass}`} /><Textarea required aria-label="Edit Spirit Log entry content" maxLength={20_000} value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} className={`min-h-32 resize-y md:col-span-2 ${fieldClass}`} /></div><div className="mt-3 flex gap-2"><Button size="sm" disabled={saveEntry.isPending || !editDraft.title.trim() || !editDraft.content.trim()}>{saveEntry.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="mr-1 h-4 w-4" />Cancel</Button></div></form> : <article key={entry.id} className="rounded-xl border border-primary/20 bg-card/30 p-5" data-testid={`spirit-log-entry-${entry.id}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">{labelFor(entry.kind)}</span><time className="text-xs text-muted-foreground">{new Date(`${entry.entryDate.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></div><h3 className="mt-2 text-lg font-medium">{entry.title}</h3>{entry.scripture ? <p className="mt-1 text-sm text-primary">{entry.scripture}</p> : null}</div><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${entry.title}`} onClick={() => beginEdit(entry)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${entry.title}`} disabled={deleteEntry.isPending} onClick={() => remove(entry)}><Trash2 className="h-4 w-4" /></Button></div></div><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{entry.content}</p></article>)}</div> : <div className="rounded-xl border border-dashed border-primary/25 bg-card/20 p-8 text-center"><BookOpen className="mx-auto h-7 w-7 text-primary" /><h3 className="mt-3 font-medium">No Spirit Log entries yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Start with a Bible study, prayer, reflection, sermon, or another record that matters to you.</p></div>}
      {entriesQuery.data?.disclosure ? <p className="mt-5 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground" data-testid="spirit-log-disclosure">{entriesQuery.data.disclosure}</p> : null}
    </section>
  </main>;
}
