import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";

const STAT_TITLES: Record<string, string> = {
  experience: "XP Growth Strategies",
  energy: "Energy Optimization Tips",
  health: "Wellness Recommendations",
  time: "Time Management Tips",
  attention: "Focus Enhancement Techniques",
  efficiency: "Efficiency Tips",
  streak: "Streak Tips",
};

interface AIStatTipProps {
  statType: "experience" | "energy" | "health" | "time" | "attention" | "efficiency" | "streak";
}

export default function AIStatTip({ statType }: AIStatTipProps) {
  const { statTips, statTipsLoading } = useLYFEOS();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localTips, setLocalTips] = useState<string[] | null>(null);

  const tips = localTips || statTips[statType] || [];
  const isLoading = statTipsLoading && tips.length === 0;
  const title = STAT_TITLES[statType] || "Tips";

  const refreshTips = async () => {
    setIsRefreshing(true);
    try {
      const result = await apiRequest<{ tip: string }>("/api/stat-tips", {
        method: "POST",
        body: JSON.stringify({ statType }),
      });
      const parsed = result.tip
        .split(/\n/)
        .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((line: string) => line.length > 0);
      setLocalTips(parsed);
    } catch (error) {
      console.error("Failed to refresh tips:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="glassmorphic rounded-xl p-6 border border-primary/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-orbitron text-xl text-primary">{title}</h2>
        {!isLoading && (
          <button
            onClick={refreshTips}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-primary transition-colors p-1 disabled:opacity-40"
            title="Refresh tips"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {isLoading || isRefreshing ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm">Generating personalized tips...</span>
        </div>
      ) : tips.length > 0 ? (
        <ul className="space-y-3">
          {tips.map((tip, index) => (
            <li key={index} className="flex">
              <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
              <span className="text-muted-foreground">{tip}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tips are being generated...
        </p>
      )}
    </div>
  );
}
