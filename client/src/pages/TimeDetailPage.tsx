import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Clock, Timer, Target, Calendar } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function TimeDetailPage() {
  usePageTitle("Time Tokens - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const eventCategoryHours = computedStats?.eventCategoryHours ?? {};
  const missionTimeCost = computedStats?.totalTimeCost ?? 0;
  const unallocatedHours = stats.timeTokens.current;
  
  const eventEntries = Object.entries(eventCategoryHours as Record<string, number>);
  
  const timeAllocation: Array<{ category: string; hours: number; icon: React.ElementType; description: string }> = [];
  
  eventEntries.forEach(([category, hours]) => {
    timeAllocation.push({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      hours: Math.round(hours * 10) / 10,
      icon: Calendar,
      description: `Calendar events (${category})`,
    });
  });
  
  if (missionTimeCost > 0) {
    timeAllocation.push({
      category: "Missions",
      hours: missionTimeCost,
      icon: Target,
      description: "Time allocated to missions",
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
      
      {/* Current Time Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Unallocated Time</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Available time tokens for today</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.timeTokens.current}</span>
              <span className="text-muted-foreground ml-3 text-lg">/ {stats.timeTokens.max}</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Allocation status</p>
            <div className="flex items-center">
              <Timer className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{Math.round((stats.timeTokens.current / stats.timeTokens.max) * 100)}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Remaining</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${(stats.timeTokens.current / stats.timeTokens.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.timeTokens.current} hours</span>
          <span className="text-xs text-muted-foreground">Total: {stats.timeTokens.max} hours</span>
        </div>
      </div>
      
      {/* Time Allocation */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Time Allocation</h2>
        </div>
        
        <div className="space-y-6">
          {timeAllocation.map((item) => (
            <div key={item.category} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-3">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-white">{item.category}</h3>
                  <p className="text-muted-foreground text-xs">{item.description}</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full" 
                    style={{ width: `${stats.timeTokens.max > 0 ? (item.hours / stats.timeTokens.max) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-primary">{item.hours}h</span>
              </div>
            </div>
          ))}
          
          <div className="border-t border-primary/20 mt-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center mr-3">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-white">Unallocated</h3>
                  <p className="text-muted-foreground text-xs">Available time tokens</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full" 
                    style={{ width: `${stats.timeTokens.max > 0 ? (unallocatedHours / stats.timeTokens.max) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-primary">{unallocatedHours}h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="time" />
    </div>
  );
}