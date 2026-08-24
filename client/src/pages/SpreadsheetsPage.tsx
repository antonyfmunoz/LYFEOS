import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Search, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type SpreadsheetSummary = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  favorite: boolean;
  updatedAt: string;
};

export default function SpreadsheetsPage() {
  usePageTitle("Sheets");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const queryKey = ["/api/users", user?.id, "spreadsheets"];
  const sheets = useQuery<{ spreadsheets: SpreadsheetSummary[] }>({
    queryKey,
    queryFn: () => apiRequest(`/api/users/${user!.id}/spreadsheets`),
    enabled: !!user,
  });
  const toggleFavorite = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/spreadsheets/${id}/toggle-favorite`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/spreadsheets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Sheet deleted" });
    },
  });
  const all = sheets.data?.spreadsheets || [];
  const categories = Array.from(new Set(all.map((sheet) => sheet.category))).sort();
  const filtered = useMemo(() => all.filter((sheet) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || sheet.title.toLowerCase().includes(needle) || sheet.description?.toLowerCase().includes(needle);
    return matchesSearch && (category === "all" || sheet.category === category);
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [all, category, search]);

  return <div className="container max-w-6xl py-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Personal information system</p>
        <h1 className="font-orbitron text-2xl">Sheets</h1>
        <p className="text-sm text-muted-foreground">Private, structured calculations and trackers owned by your LyfeOS account.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/document-vault"><Button variant="outline">Data Vault</Button></Link>
        <Button onClick={() => navigate("/spreadsheets/new")}><Plus className="mr-1 h-4 w-4" />New sheet</Button>
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sheets" className="pl-9" /></div>
      <select aria-label="Sheet category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-md border border-primary/20 bg-background px-2 text-sm">
        <option value="all">All categories</option>
        {categories.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
    {sheets.isLoading ? <p className="text-sm text-muted-foreground">Loading sheets…</p> : filtered.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((sheet) => <article key={sheet.id} className="rounded-xl border border-primary/15 bg-card/35 p-4 transition hover:border-primary/35">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/spreadsheets/${sheet.id}`)}>
            <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /><h2 className="truncate font-medium">{sheet.title}</h2></div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{sheet.description || "No description"}</p>
            <p className="mt-3 text-[11px] text-muted-foreground">{sheet.category} · updated {new Date(sheet.updatedAt).toLocaleDateString()}</p>
          </button>
          <div className="flex">
            <Button size="icon" variant="ghost" aria-label={sheet.favorite ? "Remove favorite" : "Favorite sheet"} onClick={() => toggleFavorite.mutate(sheet.id)}><Star className={`h-4 w-4 ${sheet.favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} /></Button>
            <Button size="icon" variant="ghost" aria-label="Delete sheet" onClick={() => { if (window.confirm(`Delete “${sheet.title}”? This cannot be undone.`)) remove.mutate(sheet.id); }}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
          </div>
        </div>
      </article>)}
    </div> : <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center">
      <FileSpreadsheet className="mx-auto h-8 w-8 text-primary/70" />
      <p className="mt-3 text-sm text-muted-foreground">{all.length ? "No sheets match this view." : "No sheets yet. Create one for a tracker, calculation, or structured plan."}</p>
    </div>}
  </div>;
}
