import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Calendar, Trophy, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function StreakDetailPage() {
  // Set page title
  usePageTitle("Streak - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Calculate streak milestones
  const streakMilestones = [
    { days: 7, title: "Weekly Warrior", reward: "+25 XP", completed: stats.streakDays >= 7 },
    { days: 14, title: "Fortnightly Focus", reward: "+50 XP", completed: stats.streakDays >= 14 },
    { days: 30, title: "Monthly Master", reward: "+100 XP", completed: stats.streakDays >= 30 },
    { days: 60, title: "Bi-Monthly Brilliance", reward: "+250 XP", completed: stats.streakDays >= 60 },
    { days: 100, title: "Century Club", reward: "+500 XP", completed: stats.streakDays >= 100 },
    { days: 365, title: "Annual Achiever", reward: "+2000 XP", completed: stats.streakDays >= 365 },
  ];
  
  // Calculate next milestone
  const nextMilestone = streakMilestones.find(milestone => !milestone.completed) || streakMilestones[streakMilestones.length - 1];
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-2 py-1">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Calendar className="h-8 w-8 mr-3 text-primary" /> {/* Green (Heart) */}
        <h1 className="text-3xl font-orbitron">Streak Tracking</h1>
      </div>
      
      {/* Current Streak */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Green (Heart) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Streak</h2> {/* Green (Heart) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Consecutive days using LYFEOS</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.streakDays}</span>
              <span className="text-muted-foreground ml-3 text-lg">days</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Next milestone</p>
            <div className="flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-primary" /> {/* Green (Heart) */}
              <span className="text-white">{nextMilestone.days} days</span>
            </div>
            <p className="text-primary text-xs mt-1">{nextMilestone.title}</p> {/* Green (Heart) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${Math.min(100, (stats.streakDays / nextMilestone.days) * 100)}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.streakDays}</span>
          <span className="text-xs text-muted-foreground">Target: {nextMilestone.days}</span>
        </div>
      </div>
      
      {/* Streak Milestones */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Green (Heart) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Streak Milestones</h2> {/* Green (Heart) */}
        </div>
        
        <div className="space-y-4">
          {streakMilestones.map((milestone) => (
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
                    {milestone.days} Day Streak
                  </h3>
                  <p className={`text-sm ${milestone.completed ? "text-primary" : "text-muted-foreground/70"}`}>
                    {milestone.title}
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
          ))}
        </div>
      </div>
      
      {/* Usage Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-primary/30"> {/* Green (Heart) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Streak Tips</h2> {/* Green (Heart) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">Log in at least once every 24 hours to maintain your streak.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">Complete at least one mission per day to maximize streak benefits.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">Longer streaks contribute to your overall efficiency score.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">Set a daily reminder to check in with LYFEOS and maintain your streak.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}