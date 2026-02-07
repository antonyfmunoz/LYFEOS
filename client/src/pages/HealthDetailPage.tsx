import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Heart, ArrowUpRight, Activity, Utensils, Dumbbell, Brain } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function HealthDetailPage() {
  // Set page title
  usePageTitle("Health Points - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Health metrics
  const healthMetrics = [
    { 
      name: "Sleep", 
      score: 78, 
      description: "Sleep quality and duration", 
      icon: Activity,
      tips: "Create a consistent sleep schedule and avoid screens 1 hour before bedtime."
    },
    { 
      name: "Nutrition", 
      score: 82, 
      description: "Dietary balance and hydration", 
      icon: Utensils,
      tips: "Focus on whole foods and maintain consistent meal timing."
    },
    { 
      name: "Physical", 
      score: 70, 
      description: "Exercise and movement", 
      icon: Dumbbell,
      tips: "Aim for 30 minutes of moderate activity daily with 2-3 strength sessions weekly."
    },
    { 
      name: "Mental", 
      score: 85, 
      description: "Stress and cognitive health", 
      icon: Brain,
      tips: "Practice 10 minutes of mindfulness daily and take regular mental breaks."
    },
  ];
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/profile" className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-2 py-1">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Heart className="h-8 w-8 mr-3 text-primary" /> {/* Red (Root) */}
        <h1 className="text-3xl font-orbitron">Health Points</h1>
      </div>
      
      {/* Current Health Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Red (Root) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Health Status</h2> {/* Red (Root) */}
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
              <Activity className="h-5 w-5 mr-2 text-primary" /> {/* Red (Root) */}
              <span className="text-white">90+</span>
            </div>
            <p className="text-primary text-xs mt-1">Optimal health</p> {/* Red (Root) */}
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
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Red (Root) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Health Components</h2> {/* Red (Root) */}
        </div>
        
        <div className="space-y-6">
          {healthMetrics.map((metric) => (
            <div key={metric.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <metric.icon className="h-5 w-5 mr-2 text-primary" /> {/* Red (Root) */}
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
      
      {/* Wellness Recommendations */}
      <div className="glassmorphic rounded-xl p-6 border border-primary/30"> {/* Red (Root) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Wellness Recommendations</h2> {/* Red (Root) */}
        <ul className="space-y-3">
          {healthMetrics.map((metric) => (
            <li key={`tip-${metric.name}`} className="flex">
              <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Red (Root) */}
              <span className="text-muted-foreground">{metric.tips}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}