import { Link } from "wouter";
import { ArrowLeft, Clock, Timer, Target, Calendar } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function TimeDetailPage() {
  usePageTitle("Time Tokens - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const DAY_HOURS = 24;
  const maxTime = stats.timeTokens.max;
  const currentTime = stats.timeTokens.current;
  const timePct = maxTime > 0 ? Math.round((currentTime / maxTime) * 100) : 0;
  const allocatedPct = maxTime > 0 ? Math.round(((maxTime - currentTime) / maxTime) * 100) : 0;
  
  const eventCategoryHours = computedStats?.eventCategoryHours ?? {};
  const eventEntries = Object.entries(eventCategoryHours as Record<string, number>);
  
  const totalAllocatedHours = maxTime - currentTime;
  
  const timeAllocation: Array<{ category: string; percentage: number; icon: React.ElementType }> = [];
  
  eventEntries.forEach(([category, hours]) => {
    const pct = maxTime > 0 ? Math.round((hours / maxTime) * 100) : 0;
    timeAllocation.push({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      percentage: pct,
      icon: Calendar,
    });
  });
  
  const missionTimeCost = computedStats?.totalTimeCost ?? 0;
  if (missionTimeCost > 0) {
    const missionPct = maxTime > 0 ? Math.round((missionTimeCost / maxTime) * 100) : 0;
    timeAllocation.push({
      category: "Missions",
      percentage: missionPct,
      icon: Target,
    });
  }
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Clock className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Time Tokens</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Unallocated Time</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Available time capacity ({DAY_HOURS}h day)</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{timePct}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Allocation status</p>
            <div className="flex items-center">
              <Timer className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{allocatedPct}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Committed</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${timePct}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Remaining: {timePct}%</span>
          <span className="text-xs text-muted-foreground">Full capacity: 100%</span>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Time Allocation</h2>
        </div>
        
        <div className="space-y-6">
          {timeAllocation.map((item) => (
            <div key={item.category} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-white">{item.category}</h3>
                </div>
                <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                  {item.percentage}%
                </span>
              </div>
              <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full" 
                  style={{ width: `${item.percentage}%` }}
                ></div>
              </div>
            </div>
          ))}
          
          <div className="border-t border-primary/20 mt-6 pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center mr-3">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-white">Unallocated</h3>
                </div>
                <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                  {timePct}%
                </span>
              </div>
              <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full" 
                  style={{ width: `${timePct}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="time" />
    </div>
  );
}
