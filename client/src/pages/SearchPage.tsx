import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, LayoutDashboard, Search, Target, Users } from "lucide-react";
import type { WorkspaceSearchResult, WorkspaceSearchResultKind } from "@shared/search";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { usePageTitle } from "@/hooks/use-page-title";

type SearchResponse = {
  query: string;
  results: WorkspaceSearchResult[];
  counts: Record<WorkspaceSearchResultKind, number>;
};

const kindMeta: Record<WorkspaceSearchResultKind, { label: string; icon: typeof Search }> = {
  mission: { label: "Missions", icon: Target },
  document: { label: "Documents", icon: FileText },
  spreadsheet: { label: "Sheets", icon: FileSpreadsheet },
  canvas: { label: "Canvas", icon: LayoutDashboard },
  database: { label: "Tables", icon: LayoutDashboard },
  relationship: { label: "Relationships", icon: Users },
};

export default function SearchPage() {
  usePageTitle("Search");
  const [, navigate] = useLocation();
  const initial = new URLSearchParams(window.location.search).get("q") || "";
  const [query, setQuery] = useState(initial);
  const [debouncedQuery, setDebouncedQuery] = useState(initial.trim());
  const [kind, setKind] = useState<WorkspaceSearchResultKind | "all">("all");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    const url = debouncedQuery.length >= 2 ? `/search?q=${encodeURIComponent(debouncedQuery)}` : "/search";
    window.history.replaceState({}, "", url);
  }, [debouncedQuery]);

  const search = useQuery<SearchResponse>({
    queryKey: ["/api/search", debouncedQuery],
    queryFn: () => apiRequest(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=12`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 15_000,
  });
  const results = useMemo(() => (search.data?.results || []).filter((result) => kind === "all" || result.kind === kind), [kind, search.data?.results]);

  return <div className="container max-w-5xl py-6 space-y-5">
    <div>
      <p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Private workspace</p>
      <h1 className="font-orbitron text-2xl">Search</h1>
      <p className="text-sm text-muted-foreground">Find your missions, documents, Sheets, Canvas workspaces, and relationships without changing their source of truth.</p>
    </div>
    <div className="relative">
      <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
      <Input autoFocus aria-label="Search LyfeOS" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your LyfeOS workspace" className="h-11 pl-11 text-base" />
    </div>
    {search.data && <div className="flex flex-wrap gap-2" aria-label="Search result filters">
      <button type="button" onClick={() => setKind("all")} className={`rounded-full border px-3 py-1 text-xs ${kind === "all" ? "border-primary bg-primary/20 text-primary" : "border-primary/15 text-muted-foreground"}`}>All {search.data.results.length}</button>
      {(Object.keys(kindMeta) as WorkspaceSearchResultKind[]).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-full border px-3 py-1 text-xs ${kind === value ? "border-primary bg-primary/20 text-primary" : "border-primary/15 text-muted-foreground"}`}>{kindMeta[value].label} {search.data.counts[value]}</button>)}
    </div>}
    {debouncedQuery.length < 2 ? <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">Enter at least two characters. Search results remain private to your authenticated account.</div>
      : search.isLoading ? <p className="text-sm text-muted-foreground">Searching…</p>
      : search.isError ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{search.error instanceof Error ? search.error.message : "Search is unavailable."}</div>
      : results.length ? <div className="space-y-2">
        {results.map((result) => {
          const meta = kindMeta[result.kind];
          const Icon = meta.icon;
          return <button key={`${result.kind}-${result.id}`} type="button" onClick={() => navigate(result.href)} className="flex w-full items-start gap-3 rounded-xl border border-primary/15 bg-card/35 p-4 text-left transition hover:border-primary/40 hover:bg-card/55">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><strong className="truncate font-medium">{result.title}</strong><span className="rounded border border-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</span></span>
              {result.summary && <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{result.summary}</span>}
              <span className="mt-2 block text-[11px] text-muted-foreground">{[result.category, result.updatedAt ? `updated ${new Date(result.updatedAt).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}</span>
            </span>
          </button>;
        })}
      </div> : <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">No results match “{debouncedQuery}” in this workspace.</div>}
  </div>;
}
