import { HeartHandshake, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type Commitment = { id: number; title: string; dueDate: string; contactId: number; contactName: string };

const localDate = () => new Date().toLocaleDateString("en-CA");

/** Shows only the actionable relationship commitment, never the private relationship context. */
export function RelationshipCommitmentsPanel() {
  const { data } = useQuery<{ commitments: Commitment[] }>({ queryKey: ["/api/relationship-commitments"], queryFn: () => apiRequest("/api/relationship-commitments") });
  const commitments = data?.commitments || [];
  if (!commitments.length) return null;
  const today = localDate();
  return (
    <section className="mb-6">
      <div className="glassmorphic rounded-xl border border-primary/15 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-primary"><HeartHandshake className="h-4 w-4" /> Relationship follow-through</div>
            <p className="mt-1 text-xs text-muted-foreground">Only commitments appear here. Private relationship notes remain in Rolodex.</p>
          </div>
          <Link href="/rolodex" className="inline-flex items-center text-xs text-primary hover:underline">Rolodex <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
        </div>
        <div className="mt-3 space-y-2">
          {commitments.slice(0, 4).map((commitment) => {
            const status = commitment.dueDate < today ? "Overdue" : commitment.dueDate === today ? "Due today" : `Due ${commitment.dueDate}`;
            return <Link key={commitment.id} href="/rolodex" className="flex items-center justify-between gap-3 rounded-md border border-primary/10 bg-background/25 px-3 py-2 transition-colors hover:bg-primary/5">
              <span className="min-w-0"><span className="block truncate text-sm text-foreground">{commitment.title}</span><span className="block truncate text-xs text-muted-foreground">{commitment.contactName}</span></span>
              <span className={`shrink-0 text-[10px] font-mono uppercase ${commitment.dueDate < today ? "text-amber-300" : "text-primary/80"}`}>{status}</span>
            </Link>;
          })}
        </div>
      </div>
    </section>
  );
}
