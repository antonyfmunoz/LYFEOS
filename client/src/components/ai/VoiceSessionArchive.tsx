import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ListChecks, Mic } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VoiceSession {
  id: string;
  title: string;
  purpose: string;
  status: "active" | "completed" | "cancelled";
  summary: string | null;
  summaryMethod: string | null;
  keyPoints: string[];
  actionItems: Array<{ text: string; owner: string; status: string }>;
  createdAt: string;
}

export default function VoiceSessionArchive() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery<{ sessions: VoiceSession[] }>({
    queryKey: ["/api/ai/voice-sessions"],
    queryFn: () => apiRequest("/api/ai/voice-sessions"),
  });
  const sessions = (query.data?.sessions || []).filter((session) => session.status === "completed").slice(0, 5);

  return (
    <section data-testid="voice-session-archive" className="border-t border-primary/20 py-3" aria-labelledby="voice-session-history-heading">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="h-3.5 w-3.5 text-primary" />
        <h3 id="voice-session-history-heading" className="text-xs font-semibold text-foreground">Voice records</h3>
      </div>
      {query.isLoading ? (
        <p className="text-[11px] text-muted-foreground">Loading records…</p>
      ) : sessions.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">Completed voice sessions will keep their transcript summary and action items here.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {sessions.map((session) => {
            const isOpen = expanded === session.id;
            return (
              <div key={session.id} className="rounded border border-primary/15 bg-card/30">
                <button data-testid={`voice-session-record-${session.id}`} type="button" onClick={() => setExpanded(isOpen ? null : session.id)} className="w-full flex items-start gap-1.5 p-2 text-left hover:bg-primary/5" aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown className="h-3 w-3 mt-0.5 text-primary shrink-0" /> : <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[11px] text-foreground truncate">{session.title}</span>
                    <span className="block text-[10px] text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-2 pb-2 text-[10px] leading-relaxed text-muted-foreground space-y-2">
                    <p>{session.summary || "No summary was produced."}</p>
                    {session.actionItems.length > 0 && (
                      <div>
                        <p className="flex items-center gap-1 text-foreground font-medium"><ListChecks className="h-3 w-3 text-primary" /> Action items</p>
                        <ul className="mt-1 space-y-1 list-disc pl-4">
                          {session.actionItems.slice(0, 5).map((item, index) => <li key={`${session.id}-${index}`}>{item.text}</li>)}
                        </ul>
                      </div>
                    )}
                    <p className="text-[9px]">Extractive summary from your transcript; review before acting.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
