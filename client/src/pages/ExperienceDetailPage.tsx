import { Link } from "wouter";
import { ArrowLeft, Award, Star, Target, Flame, Zap } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function ExperienceDetailPage() {
  usePageTitle("Experience - LYFEOS");
  
  const { stats, computedStats } = useLYFEOS();
  
  const completedMissions = computedStats?.completedMissions ?? 0;
  const activeMissions = computedStats?.activeMissions ?? 0;
  const totalXpFromCompleted = computedStats?.totalXpFromCompleted ?? 0;
  const streakDays = stats.streakDays;
  
  const totalActivity = completedMissions + activeMissions + (streakDays > 0 ? 1 : 0);
  const completedPct = totalActivity > 0 ? Math.round((completedMissions / totalActivity) * 100) : 0;
  const activePct = totalActivity > 0 ? Math.round((activeMissions / totalActivity) * 100) : 0;
  const streakPct = totalActivity > 0 && streakDays > 0 ? Math.max(100 - completedPct - activePct, 0) : 0;
  
  const experienceSources = [
    { source: "Completed Missions", percentage: completedPct, icon: Target },
    { source: "Active Missions", percentage: activePct, icon: Zap },
    { source: "Streak Bonus", percentage: streakPct, icon: Flame },
  ];
  
  const currentXP = stats.experience.current;
  const maxXP = stats.experience.max;
  const currentLevel = stats.experience.level;
  const xpProgress = maxXP > 0 ? Math.round((currentXP / maxXP) * 100) : 0;
  
  const avgXpPerMission = completedMissions > 0 ? totalXpFromCompleted / completedMissions : 25;
  const xpToNextLevel = maxXP - currentXP;
  const estimatedMissionsToLevel = avgXpPerMission > 0 ? Math.ceil(xpToNextLevel / avgXpPerMission) : 0;
  const forecastPct = estimatedMissionsToLevel > 0 ? Math.min(Math.round((1 / estimatedMissionsToLevel) * 100), 100) : 0;
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Award className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Experience</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Level Progress</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Level {currentLevel} progression</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{xpProgress}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Next level</p>
            <div className="flex items-center">
              <Star className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">Level {currentLevel + 1}</span>
            </div>
            <p className="text-primary text-xs mt-1">{100 - xpProgress}% remaining</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${xpProgress}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Progress: {xpProgress}%</span>
          <span className="text-xs text-muted-foreground">Target: 100%</span>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Experience Sources</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {experienceSources.map((source) => (
              <div key={source.source} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <source.icon className="h-5 w-5 mr-2 text-primary" />
                    <h3 className="text-white">{source.source}</h3>
                  </div>
                  <div>
                    <span className="px-3 py-1 rounded-md text-sm bg-primary/20 text-primary">
                      {source.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${source.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-background/50 border border-primary/20 rounded-xl p-4">
            <h3 className="text-primary font-orbitron mb-3">Level Up Forecast</h3>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Each mission contributes approximately <span className="text-primary font-semibold">{forecastPct}%</span> toward your next level.
              </p>
              <p className="text-muted-foreground text-sm">
                Completion rate: <span className="text-primary font-semibold">{Math.round(computedStats?.completionRate ?? 0)}%</span> of all missions
              </p>
              <p className="text-muted-foreground text-sm">
                Overall XP progress: <span className="text-primary font-semibold">{xpProgress}%</span> to Level {currentLevel + 1}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <AIStatTip statType="experience" />
    </div>
  );
}
