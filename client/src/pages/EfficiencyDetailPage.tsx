import React from "react";
import { Link } from "wouter";
import { ArrowLeft, BarChart, CheckCircle, Target, Calendar, Layers, Settings } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function EfficiencyDetailPage() {
  usePageTitle("System Efficiency - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const completionRate = computedStats?.completionRate ?? 0;
  const activeMissions = computedStats?.activeMissions ?? 0;
  const categoryBreakdown = computedStats?.categoryBreakdown ?? {};
  const uniqueCategories = Object.keys(categoryBreakdown).length;
  const totalPossibleCategories = 5;
  
  const taskCompletionScore = Math.round(completionRate);
  const activeMissionsScore = Math.min(Math.round((activeMissions / 10) * 100), 100);
  const consistencyScore = Math.min(Math.round((stats.streakDays / 30) * 100), 100);
  const missionBalanceScore = Math.min(Math.round((uniqueCategories / totalPossibleCategories) * 100), 100);
  const systemUsageScore = stats.efficiencyScore;
  
  const efficiencyMetrics = [
    { 
      name: "Task Completion", 
      score: taskCompletionScore, 
      icon: CheckCircle, 
      description: `${computedStats?.completedMissions ?? 0} of ${computedStats?.totalMissions ?? 0} missions completed`,
    },
    { 
      name: "Active Missions", 
      score: activeMissionsScore, 
      icon: Target, 
      description: `${activeMissions} missions currently in progress`,
    },
    { 
      name: "Consistency", 
      score: consistencyScore, 
      icon: Calendar, 
      description: `${stats.streakDays} day streak (target: 30 days)`,
    },
    { 
      name: "Mission Balance", 
      score: missionBalanceScore, 
      icon: Layers, 
      description: `${uniqueCategories} of ${totalPossibleCategories} categories used`,
    },
    { 
      name: "System Usage", 
      score: systemUsageScore, 
      icon: Settings, 
      description: `Overall system efficiency score`,
    },
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
        <BarChart className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">System Efficiency</h1>
      </div>
      
      {/* Current Efficiency */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Overall Efficiency</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">System optimization score</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.efficiencyScore}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Target</p>
            <div className="flex items-center">
              <BarChart className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">95%</span>
            </div>
            <p className="text-primary text-xs mt-1">Optimal performance</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${stats.efficiencyScore}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.efficiencyScore}%</span>
          <span className="text-xs text-muted-foreground">Target: 95%</span>
        </div>
      </div>
      
      {/* Efficiency Components */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Efficiency Components</h2>
        </div>
        
        <div className="space-y-6">
          {efficiencyMetrics.map((metric) => (
            <div key={metric.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <metric.icon className="h-5 w-5 mr-2 text-primary" />
                  <h3 className="text-white">{metric.name}</h3>
                </div>
                <div>
                  <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                    {metric.score}%
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">{metric.description}</p>
              <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${metric.score}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <AIStatTip statType="efficiency" />
    </div>
  );
}