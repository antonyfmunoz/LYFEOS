import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, Focus, Target, Clock } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function AttentionDetailPage() {
  usePageTitle("Attention Tokens - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const totalMax = stats.attentionTokens.max;
  const currentAttention = stats.attentionTokens.current;
  const attentionPct = totalMax > 0 ? Math.round((currentAttention / totalMax) * 100) : 0;
  const allocatedPct = totalMax > 0 ? Math.round(((totalMax - currentAttention) / totalMax) * 100) : 0;
  
  const categoryBreakdown = computedStats?.categoryBreakdown ?? {};
  const categoryEntries = Object.entries(categoryBreakdown as Record<string, { total: number; completed: number }>);
  
  const attentionAllocation = [
    { category: "Missions", percentage: allocatedPct, icon: Target },
    { category: "Unallocated", percentage: attentionPct, icon: Clock },
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
        <BrainCircuit className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Attention Tokens</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Attention Capacity</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Focus and cognitive allocation</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{attentionPct}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Focus state</p>
            <div className="flex items-center">
              <Focus className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{attentionPct}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Mental clarity</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${attentionPct}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Remaining: {attentionPct}%</span>
          <span className="text-xs text-muted-foreground">Full capacity: 100%</span>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Attention Allocation</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {attentionAllocation.map((item) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <item.icon className="h-5 w-5 mr-2 text-primary" />
                    <h3 className="text-white">{item.category}</h3>
                  </div>
                  <div>
                    <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
            
            {categoryEntries.length > 0 && (
              <div className="border-t border-primary/20 pt-4 mt-4">
                <h4 className="text-muted-foreground text-sm mb-3">By Mission Category</h4>
                {categoryEntries.map(([category, data]) => {
                  const catPct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
                  return (
                    <div key={category} className="flex items-center justify-between py-2">
                      <span className="text-white capitalize">{category}</span>
                      <span className="text-primary text-sm">{catPct}% complete</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="bg-background/50 border border-primary/20 rounded-xl p-4">
            <h3 className="text-primary font-orbitron mb-3">Focus Insights</h3>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {allocatedPct > 0 
                  ? `${allocatedPct}% of your attention is committed to active missions.`
                  : "No attention is currently allocated to missions."
                }
              </p>
              <p className="text-muted-foreground text-sm">
                {attentionPct > 50
                  ? `${attentionPct}% of your attention capacity is available, giving you flexibility for new tasks.`
                  : attentionPct > 20
                  ? `${attentionPct}% attention reserve remaining. Consider prioritizing before taking on new tasks.`
                  : `Only ${attentionPct}% attention remaining. Focus on completing current missions before adding new ones.`
                }
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="attention" />
    </div>
  );
}
