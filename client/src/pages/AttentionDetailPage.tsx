import React from "react";
import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, Focus, BookOpen, Palette, Clock } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function AttentionDetailPage() {
  // Set page title
  usePageTitle("Attention Tokens - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Attention allocation
  const attentionAllocation = [
    { category: "Deep Work", percentage: 40, icon: Focus },
    { category: "Learning", percentage: 25, icon: BookOpen },
    { category: "Creative", percentage: 20, icon: Palette },
    { category: "Unallocated", percentage: 15, icon: Clock },
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
        <BrainCircuit className="h-8 w-8 mr-3 text-primary" /> {/* Indigo (Third Eye) */}
        <h1 className="text-3xl font-orbitron">Attention Tokens</h1>
      </div>
      
      {/* Current Attention Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Indigo (Third Eye) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Attention Capacity</h2> {/* Indigo (Third Eye) */}
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
              <Focus className="h-5 w-5 mr-2 text-primary" /> {/* Indigo (Third Eye) */}
              <span className="text-white">{Math.round((stats.attentionTokens.current / stats.attentionTokens.max) * 100)}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Mental clarity</p> {/* Indigo (Third Eye) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${(stats.attentionTokens.current / stats.attentionTokens.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.attentionTokens.current}</span>
          <span className="text-xs text-muted-foreground">Maximum: {stats.attentionTokens.max}</span>
        </div>
      </div>
      
      {/* Attention Allocation */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Indigo (Third Eye) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Attention Allocation</h2> {/* Indigo (Third Eye) */}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {attentionAllocation.map((item) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <item.icon className="h-5 w-5 mr-2 text-primary" /> {/* Indigo (Third Eye) */}
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
                    className="h-full rounded-full bg-primary" /* Indigo (Third Eye) */
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-background/50 border border-primary/20 rounded-xl p-4">
            <h3 className="text-primary font-orbitron mb-3">Focus Insights</h3> {/* Indigo (Third Eye) */}
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Your attention is primarily allocated to deep work activities, which is ideal for productivity.
              </p>
              <p className="text-muted-foreground text-sm">
                Consider increasing your learning allocation to 30% to maximize knowledge acquisition during your peak focus hours.
              </p>
              <p className="text-muted-foreground text-sm">
                Your unallocated attention reserve is at 15%, which provides flexibility for unexpected tasks.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="attention" />
    </div>
  );
}