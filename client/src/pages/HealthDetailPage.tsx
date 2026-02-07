import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Heart, Activity, Target, Flame, BarChart, Settings } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function HealthDetailPage() {
  usePageTitle("Health Points - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const completedMissions = computedStats?.completedMissions ?? 0;
  const categoryBreakdown = computedStats?.categoryBreakdown ?? {};
  const uniqueCategories = Object.keys(categoryBreakdown).length;
  
  const activityScore = Math.min(Math.round((completedMissions / 10) * 100), 100);
  const consistencyScore = Math.min(Math.round((stats.streakDays / 30) * 100), 100);
  const missionBalanceScore = Math.min(Math.round((uniqueCategories / 5) * 100), 100);
  const systemUsageScore = stats.efficiencyScore;
  
  const healthMetrics = [
    { 
      name: "Activity Level", 
      score: activityScore, 
      description: `${completedMissions} missions completed`, 
      icon: Target,
    },
    { 
      name: "Consistency", 
      score: consistencyScore, 
      description: `${stats.streakDays} day streak`, 
      icon: Flame,
    },
    { 
      name: "Mission Balance", 
      score: missionBalanceScore, 
      description: `${uniqueCategories} categories active`, 
      icon: BarChart,
    },
    { 
      name: "System Usage", 
      score: systemUsageScore, 
      description: `${systemUsageScore}% efficiency`, 
      icon: Settings,
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
        <Heart className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Health Points</h1>
      </div>
      
      {/* Current Health Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Health Status</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Physical and mental wellness</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.healthPoints.current}</span>
              <span className="text-muted-foreground ml-3 text-lg">/ {stats.healthPoints.max}</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Wellness target</p>
            <div className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">90+</span>
            </div>
            <p className="text-primary text-xs mt-1">Optimal health</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${(stats.healthPoints.current / stats.healthPoints.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.healthPoints.current}</span>
          <span className="text-xs text-muted-foreground">Target: {stats.healthPoints.max}</span>
        </div>
      </div>
      
      {/* Health Components */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Health Components</h2>
        </div>
        
        <div className="space-y-6">
          {healthMetrics.map((metric) => (
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
      
      <AIStatTip statType="health" />
    </div>
  );
}