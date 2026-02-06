import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Zap, Activity, ArrowUpRight, Battery, Flame, Coffee } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function EnergyDetailPage() {
  // Set page title
  usePageTitle("Energy Tokens - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Sample energy data across the day
  const energyTimeline = [
    { time: "6 AM", level: 75, label: "Morning" },
    { time: "12 PM", level: 65, label: "Midday" },
    { time: "6 PM", level: 45, label: "Evening" },
    { time: "Now", level: stats.energyPoints.current, label: "Current" },
  ];
  
  // Sample energy sources
  const energySources = [
    { name: "Sleep Quality", score: 80, description: "7.5 hours at 92% efficiency", icon: Battery },
    { name: "Nutrition", score: 75, description: "3 balanced meals, good hydration", icon: Flame },
    { name: "Movement", score: 65, description: "Light activity throughout the day", icon: Activity },
    { name: "Mental Rest", score: 60, description: "Meditation and breaks", icon: Coffee },
  ];
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Zap className="h-8 w-8 mr-3 text-primary" /> {/* Orange (Sacral) */}
        <h1 className="text-3xl font-orbitron">Energy Tokens</h1>
      </div>
      
      {/* Current Energy Level */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Orange (Sacral) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Current Energy Level</h2> {/* Orange (Sacral) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Cognitive and physical capacity</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.energyPoints.current}</span>
              <span className="text-muted-foreground ml-3 text-lg">/ {stats.energyPoints.max}</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Optimal level</p>
            <div className="flex items-center">
              <Battery className="h-5 w-5 mr-2 text-primary" /> {/* Orange (Sacral) */}
              <span className="text-white">85+</span>
            </div>
            <p className="text-primary text-xs mt-1">Peak performance</p> {/* Orange (Sacral) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${(stats.energyPoints.current / stats.energyPoints.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.energyPoints.current}</span>
          <span className="text-xs text-muted-foreground">Target: {stats.energyPoints.max}</span>
        </div>
      </div>
      
      {/* Energy Timeline */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Orange (Sacral) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Energy Timeline</h2> {/* Orange (Sacral) */}
        </div>
        
        <div className="space-y-6">
          {energyTimeline.map((timepoint) => (
            <div key={timepoint.time} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-16 font-mono text-primary">{timepoint.time}</span> {/* Orange (Sacral) */}
                  <h3 className="text-white ml-2">{timepoint.label}</h3>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-md text-sm bg-primary/20 text-primary`}>
                    {timepoint.level}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full bg-primary`} /* Orange (Sacral) */
                  style={{ width: `${timepoint.level}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Energy Sources */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Orange (Sacral) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Energy Sources</h2> {/* Orange (Sacral) */}
        </div>
        
        <div className="space-y-6">
          {energySources.map((source) => (
            <div key={source.name} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              <div className="flex items-center col-span-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-3"> {/* Orange (Sacral) */}
                  <source.icon className="h-5 w-5 text-primary" /> {/* Orange (Sacral) */}
                </div>
                <h3 className="text-white">{source.name}</h3>
              </div>
              <div className="col-span-2">
                <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full" 
                    style={{ width: `${source.score}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{source.description}</span>
                <span className="ml-2 font-mono text-primary">{source.score}%</span> {/* Orange (Sacral) */}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Optimization Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-primary/30"> {/* Orange (Sacral) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Energy Optimization Tips</h2> {/* Orange (Sacral) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-muted-foreground">Take short 5-minute movement breaks every hour during focused work periods.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-muted-foreground">Prioritize complex, high-energy tasks during your peak energy hours.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-muted-foreground">Stay hydrated - aim for at least 2 liters of water throughout your day.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-muted-foreground">Schedule a 20-minute power nap if your energy drops significantly in the afternoon.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}