import { Inbox, Send } from "lucide-react";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/** A compact, always-available capture point; the full mission remains editable in Missions. */
export function UniversalInboxCapture() {
  const [text, setText] = useState("");
  const mutationIdRef = useRef(crypto.randomUUID());
  const { toast } = useToast();
  const capture = useMutation({
    mutationFn: () => apiRequest("/api/inbox/captures", { method: "POST", body: JSON.stringify({ text, mutationId: mutationIdRef.current }) }),
    onSuccess: () => {
      setText("");
      mutationIdRef.current = crypto.randomUUID();
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      toast({ title: "Captured to inbox", description: "It is ready for you to review and prioritize in Missions." });
    },
    onError: (error: Error) => toast({ title: "Capture could not be saved", description: error.message, variant: "destructive" }),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text.trim().length >= 2 && !capture.isPending) capture.mutate();
  };
  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-lg border border-primary/15 bg-card/25 px-2 py-1.5">
      <Inbox className="ml-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <Input
        value={text}
        onChange={(event) => { setText(event.target.value); if (capture.isError) mutationIdRef.current = crypto.randomUUID(); }}
        placeholder="Capture an idea, task, or follow-up…"
        aria-label="Universal inbox capture"
        maxLength={2000}
        className="h-8 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
      />
      <Button size="sm" type="submit" variant="ghost" className="h-8 px-2 text-primary hover:bg-primary/10" disabled={text.trim().length < 2 || capture.isPending}>
        <Send className="h-3.5 w-3.5" />
        <span className="sr-only">Capture</span>
      </Button>
    </form>
  );
}
