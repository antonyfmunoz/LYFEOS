import { Link } from "wouter";
import { ArrowLeft, Zap, Activity, Battery, Target } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function EnergyDetailPage() {
  usePageTitle("Energy Tokens - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const DAY_CAPACITY = 24;
  const currentEnergy = stats.energyPoints.current;
  const usedEnergy = DAY_CAPACITY - currentEnergy;
  const energyPct = Math.round((currentEnergy / DAY_CAPACITY) * 100);
  const allocatedPct = Math.round((usedEnergy / DAY_CAPACITY) * 100);
  
  const categoryBreakdown = computedStats?.categoryBreakdown ?? {};
  const categoryEntries = Object.entries(categoryBreakdown as Record<string, { total: number; completed: number }>);
  
  const energyAllocation = [
    { name: "Missions (Allocated)", percentage: allocatedPct, icon: Target },
    { name: "Remaining", percentage: energyPct, icon: Battery },
  ];
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Zap className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Energy Tokens</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Energy Level</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Cognitive and physical capacity (24h day)</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{energyPct}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Allocated to missions</p>
            <div className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{allocatedPct}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Energy committed</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${energyPct}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Remaining: {energyPct}%</span>
          <span className="text-xs text-muted-foreground">Full capacity: 100%</span>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Energy Allocation</h2>
        </div>
        
        <div className="space-y-6">
          {energyAllocation.map((item) => (
            <div key={item.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-white">{item.name}</h3>
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
        </div>
      </div>
      
      {categoryEntries.length > 0 && (
        <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-orbitron text-xl text-primary">Energy by Mission Category</h2>
          </div>
          
          <div className="space-y-4">
            {categoryEntries.map(([category, data]) => {
              const catPct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white capitalize">{category}</h3>
                    <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                      {catPct}% complete
                    </span>
                  </div>
                  <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${catPct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <AIStatTip statType="energy" />
    </div>
  );
}
