import { Link } from "wouter";
import { ArrowLeft, Calendar, Trophy, CheckCircle2 } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";

export default function StreakDetailPage() {
  usePageTitle("Streak - LYFEOS");
  
  const { stats } = useLYFEOS();
  
  const streakMilestones = [
    { days: 7, title: "Weekly Warrior", reward: "+25 XP", completed: stats.streakDays >= 7 },
    { days: 14, title: "Fortnightly Focus", reward: "+50 XP", completed: stats.streakDays >= 14 },
    { days: 30, title: "Monthly Master", reward: "+100 XP", completed: stats.streakDays >= 30 },
    { days: 60, title: "Bi-Monthly Brilliance", reward: "+250 XP", completed: stats.streakDays >= 60 },
    { days: 100, title: "Century Club", reward: "+500 XP", completed: stats.streakDays >= 100 },
    { days: 365, title: "Annual Achiever", reward: "+2000 XP", completed: stats.streakDays >= 365 },
  ];
  
  const nextMilestone = streakMilestones.find(milestone => !milestone.completed) || streakMilestones[streakMilestones.length - 1];
  const streakProgressPct = Math.min(Math.round((stats.streakDays / nextMilestone.days) * 100), 100);
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Calendar className="h-8 w-8 mr-3 text-primary" />
        <h1 className="text-3xl font-orbitron">Streak Tracking</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Streak</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Progress to next milestone</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{streakProgressPct}</span>
              <span className="text-muted-foreground ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Next milestone</p>
            <div className="flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-primary" />
              <span className="text-white">{nextMilestone.title}</span>
            </div>
            <p className="text-primary text-xs mt-1">{100 - streakProgressPct}% remaining</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${streakProgressPct}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Progress: {streakProgressPct}%</span>
          <span className="text-xs text-muted-foreground">Target: 100%</span>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Streak Milestones</h2>
        </div>
        
        <div className="space-y-4">
          {streakMilestones.map((milestone) => {
            const milestonePct = Math.min(Math.round((stats.streakDays / milestone.days) * 100), 100);
            return (
              <div 
                key={milestone.days}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  milestone.completed 
                    ? "border-primary/30 bg-primary/5" 
                    : "border-muted/50 bg-muted/10"
                }`}
              >
                <div className="flex items-center">
                  {milestone.completed ? (
                    <CheckCircle2 className="h-5 w-5 mr-3 text-primary" />
                  ) : (
                    <div className="h-5 w-5 mr-3 rounded-full border border-muted-foreground/30"></div>
                  )}
                  <div>
                    <h3 className={milestone.completed ? "text-white" : "text-muted-foreground"}>
                      {milestone.title}
                    </h3>
                    <p className={`text-sm ${milestone.completed ? "text-primary" : "text-muted-foreground/70"}`}>
                      {milestonePct}% complete
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`bg-background/50 px-3 py-1 rounded ${
                    milestone.completed ? "text-primary" : "text-muted-foreground"
                  }`}>
                    {milestone.reward}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <AIStatTip statType="streak" />
    </div>
  );
}
