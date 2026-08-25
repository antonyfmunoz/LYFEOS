import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, Plus, Trash2 } from "lucide-react";
import { createWorkspaceColumn } from "@shared/tables";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type DatabaseSummary = { id: number; title: string; description: string | null; category: string; favorite: boolean; updatedAt: string };

export default function TablesPage() {
  usePageTitle("Tables");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const tables = useQuery<{ databases: DatabaseSummary[] }>({ queryKey: ["/api/databases"], queryFn: () => apiRequest("/api/databases") });
  const create = useMutation({
    mutationFn: () => apiRequest<{ database: DatabaseSummary }>("/api/databases", { method: "POST", body: JSON.stringify({ title: "Untitled Table", description: null, category: "general", favorite: false, definition: { version: 1, columns: [createWorkspaceColumn()] } }) }),
    onSuccess: ({ database }) => { queryClient.invalidateQueries({ queryKey: ["/api/databases"] }); navigate(`/databases/${database.id}`); },
  });
  const remove = useMutation({ mutationFn: (id: number) => apiRequest(`/api/databases/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/databases"] }); toast({ title: "Table deleted" }); }, onError: (error) => toast({ title: "Table not deleted", description: error instanceof Error ? error.message : "Remove dependent relations first", variant: "destructive" }) });
  return <div className="container max-w-6xl py-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Personal information system</p><h1 className="font-orbitron text-2xl">Tables</h1><p className="text-sm text-muted-foreground">Typed private databases whose rows can also be captured through Forms.</p></div><div className="flex gap-2"><Link href="/document-vault"><Button variant="outline">Data Vault</Button></Link><Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 h-4 w-4" />New table</Button></div></div>
    {tables.isLoading ? <p className="text-sm text-muted-foreground">Loading tables…</p> : tables.data?.databases.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{tables.data.databases.map((table) => <article key={table.id} className="flex items-start gap-2 rounded-xl border border-primary/15 bg-card/35 p-4"><button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/databases/${table.id}`)}><span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><strong className="truncate font-medium">{table.title}</strong></span><span className="mt-2 block line-clamp-2 text-xs text-muted-foreground">{table.description || "No description"}</span><span className="mt-3 block text-[11px] text-muted-foreground">{table.category} · updated {new Date(table.updatedAt).toLocaleDateString()}</span></button><Button size="icon" variant="ghost" aria-label="Delete table" onClick={() => { if (window.confirm(`Delete “${table.title}”, all rows, forms, and history? Tables referenced by relations must be unlinked first.`)) remove.mutate(table.id); }}><Trash2 className="h-4 w-4" /></Button></article>)}</div> : <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">No tables yet. Create one for structured records that do not belong in a Sheet.</div>}
  </div>;
}
