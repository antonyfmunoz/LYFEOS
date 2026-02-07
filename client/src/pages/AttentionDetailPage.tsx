import React from "react";
import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, Focus, Target, Clock } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function AttentionDetailPage() {
  usePageTitle("Attention Tokens - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const totalAttentionCost = computedStats?.totalAttentionCost ?? 0;
  const unallocatedAttention = stats.attentionTokens.current;
  const totalMax = stats.attentionTokens.max;
  const categoryBreakdown = computedStats?.categoryBreakdown ?? {};
  
  const totalUsed = totalMax - unallocatedAttention;
  const missionsPct = totalMax > 0 ? Math.round((totalAttentionCost / totalMax) * 100) : 0;
  const unallocatedPct = totalMax > 0 ? Math.round((unallocatedAttention / totalMax) * 100) : 0;
  
  const categoryEntries = Object.entries(categoryBreakdown as Record<string, { total: number; completed: number }>);
  
  const attentionAllocation = [
    { category: "Missions", percentage: missionsPct, value: totalAttentionCost, icon: Target },
    { category: "Unallocated", percentage: unallocatedPct, value: unallocatedAttention, icon: Clock },
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
      
      {/* Current Attention Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Attention Capacity</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Focus and cognitive allocation</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.attentionTokens.current}</span>
              <span className="text-muted-foreground ml-3 text-lg">/ {stats.attentionTokens.max}</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Focus state</p>
            <div className="flex items-center">
              <Focus className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{totalMax > 0 ? Math.round((stats.attentionTokens.current / totalMax) * 100) : 0}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Mental clarity</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${totalMax > 0 ? (stats.attentionTokens.current / totalMax) * 100 : 0}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.attentionTokens.current}</span>
          <span className="text-xs text-muted-foreground">Maximum: {stats.attentionTokens.max}</span>
        </div>
      </div>
      
      {/* Attention Allocation */}
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
                {categoryEntries.map(([category, data]) => (
                  <div key={category} className="flex items-center justify-between py-2">
                    <span className="text-white capitalize">{category}</span>
                    <span className="text-primary text-sm">{data.total} missions</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="bg-background/50 border border-primary/20 rounded-xl p-4">
            <h3 className="text-primary font-orbitron mb-3">Focus Insights</h3>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {totalAttentionCost > 0 
                  ? `You have ${totalAttentionCost} attention tokens committed to active missions.`
                  : "No attention tokens are currently allocated to missions."
                }
              </p>
              <p className="text-muted-foreground text-sm">
                {unallocatedPct > 50
                  ? `${unallocatedPct}% of your attention capacity is available, giving you flexibility for new tasks.`
                  : unallocatedPct > 20
                  ? `${unallocatedPct}% attention reserve remaining. Consider prioritizing before taking on new tasks.`
                  : `Only ${unallocatedPct}% attention remaining. Focus on completing current missions before adding new ones.`
                }
              </p>
              <p className="text-muted-foreground text-sm">
                Total attention capacity: <span className="text-primary font-semibold">{totalMax}</span> tokens
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="attention" />
    </div>
  );
}