import { useState } from "react";
import { Brain, RefreshCw, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AIStatTipProps {
  statType: "experience" | "energy" | "health" | "time" | "attention" | "efficiency" | "streak";
  primaryColor?: string;
}

export default function AIStatTip({ statType, primaryColor = "#00e0ff" }: AIStatTipProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchTip = async () => {
    setIsLoading(true);
    try {
      const result = await apiRequest<{ tip: string }>("/api/stat-tips", {
        method: "POST",
        body: JSON.stringify({ statType }),
      });
      setTip(result.tip);
      setHasLoaded(true);
    } catch (error) {
      console.error("Failed to fetch stat tip:", error);
      setTip("Unable to generate tips right now. Please try again later.");
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6 p-4 bg-card/30 border border-primary/20 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" style={{ color: primaryColor }} />
          <h3 className="text-sm font-orbitron text-foreground">NOVA AI Tips</h3>
        </div>
        <button
          onClick={fetchTip}
          disabled={isLoading}
          className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </>
          ) : hasLoaded ? (
            <>
              <RefreshCw className="h-3 w-3" />
              Refresh
            </>
          ) : (
            <>
              <Brain className="h-3 w-3" />
              Get Tips
            </>
          )}
        </button>
      </div>
      
      {tip ? (
        <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {tip}
        </div>
      ) : !isLoading ? (
        <p className="text-xs text-muted-foreground/60">
          Click "Get Tips" for personalized AI-powered recommendations based on your stats.
        </p>
      ) : null}
    </div>
  );
}
