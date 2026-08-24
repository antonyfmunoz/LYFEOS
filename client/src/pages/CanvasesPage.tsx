import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Plus, Search, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type CanvasSummary = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  favorite: boolean;
  updatedAt: string;
};

export default function CanvasesPage() {
  usePageTitle("Canvas");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const queryKey = ["/api/users", user?.id, "canvases"];
  const canvases = useQuery<{ canvases: CanvasSummary[] }>({
    queryKey,
    queryFn: () => apiRequest(`/api/users/${user!.id}/canvases`),
    enabled: !!user,
  });
  const toggleFavorite = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/canvases/${id}/toggle-favorite`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/canvases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Canvas deleted" });
    },
  });
  const all = canvases.data?.canvases || [];
  const categories = Array.from(new Set(all.map((canvas) => canvas.category))).sort();
  const filtered = useMemo(() => all.filter((canvas) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || canvas.title.toLowerCase().includes(needle) || canvas.description?.toLowerCase().includes(needle);
    return matchesSearch && (category === "all" || canvas.category === category);
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [all, category, search]);

  return <div className="container max-w-6xl py-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Personal information system</p>
        <h1 className="font-orbitron text-2xl">Canvas</h1>
        <p className="text-sm text-muted-foreground">Private visual thinking spaces for ideas, plans, links, and tasks.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/document-vault"><Button variant="outline">Data Vault</Button></Link>
        <Button onClick={() => navigate("/canvases/new")}><Plus className="mr-1 h-4 w-4" />New canvas</Button>
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search canvases" className="pl-9" /></div>
      <select aria-label="Canvas category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-md border border-primary/20 bg-background px-2 text-sm">
        <option value="all">All categories</option>
        {categories.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
    {canvases.isLoading ? <p className="text-sm text-muted-foreground">Loading canvases…</p> : filtered.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((canvas) => <article key={canvas.id} className="rounded-xl border border-primary/15 bg-card/35 p-4 transition hover:border-primary/35">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/canvases/${canvas.id}`)}>
            <div className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-primary" /><h2 className="truncate font-medium">{canvas.title}</h2></div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{canvas.description || "No description"}</p>
            <p className="mt-3 text-[11px] text-muted-foreground">{canvas.category} · updated {new Date(canvas.updatedAt).toLocaleDateString()}</p>
          </button>
          <div className="flex">
            <Button size="icon" variant="ghost" aria-label={canvas.favorite ? "Remove favorite" : "Favorite canvas"} onClick={() => toggleFavorite.mutate(canvas.id)}><Star className={`h-4 w-4 ${canvas.favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} /></Button>
            <Button size="icon" variant="ghost" aria-label="Delete canvas" onClick={() => { if (window.confirm(`Delete “${canvas.title}”? This cannot be undone.`)) remove.mutate(canvas.id); }}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
          </div>
        </div>
      </article>)}
    </div> : <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center">
      <LayoutDashboard className="mx-auto h-8 w-8 text-primary/70" />
      <p className="mt-3 text-sm text-muted-foreground">{all.length ? "No canvases match this view." : "No canvases yet. Create one to map an idea, plan, or connected set of actions."}</p>
    </div>}
  </div>;
}
