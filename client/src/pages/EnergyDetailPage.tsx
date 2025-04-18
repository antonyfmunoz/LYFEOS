import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Zap, Activity, ArrowUpRight, Battery, Flame, Coffee } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function EnergyDetailPage() {
  // Set page title
  usePageTitle("Energy Points - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Sample energy data across the day
  const energyTimeline = [
    { time: "6 AM", level: 75, label: "Morning" },
    { time: "12 PM", level: 65, label: "Midday" },
    { time: "6 PM", level: 45, label: "Evening" },
    { time: "Now", level: stats.energyPointsCurrent, label: "Current" },
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
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Zap className="h-8 w-8 mr-3 text-[#F97316]" /> {/* Orange (Sacral) */}
        <h1 className="text-3xl font-orbitron">Energy Points</h1>
      </div>
      
      {/* Current Energy Level */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#F97316]/30"> {/* Orange (Sacral) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#F97316]">Current Energy Level</h2> {/* Orange (Sacral) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">Cognitive and physical capacity</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.energyPointsCurrent}</span>
              <span className="text-[#7DAAB2] ml-3 text-lg">/ {stats.energyPointsMax}</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#F97316]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Optimal level</p>
            <div className="flex items-center">
              <Battery className="h-5 w-5 mr-2 text-[#F97316]" /> {/* Orange (Sacral) */}
              <span className="text-white">85+</span>
            </div>
            <p className="text-[#F97316] text-xs mt-1">Peak performance</p> {/* Orange (Sacral) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#F97316]/50 to-[#F97316] h-full rounded-full"
            style={{ width: `${(stats.energyPointsCurrent / stats.energyPointsMax) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {stats.energyPointsCurrent}</span>
          <span className="text-xs text-[#7DAAB2]">Target: {stats.energyPointsMax}</span>
        </div>
      </div>
      
      {/* Energy Timeline */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#F97316]/30"> {/* Orange (Sacral) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#F97316]">Energy Timeline</h2> {/* Orange (Sacral) */}
        </div>
        
        <div className="space-y-6">
          {energyTimeline.map((timepoint) => (
            <div key={timepoint.time} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="w-16 font-mono text-[#F97316]">{timepoint.time}</span> {/* Orange (Sacral) */}
                  <h3 className="text-white ml-2">{timepoint.label}</h3>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-md text-sm bg-[#F97316]/20 text-[#F97316]`}>
                    {timepoint.level}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full bg-[#F97316]`} /* Orange (Sacral) */
                  style={{ width: `${timepoint.level}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Energy Sources */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#F97316]/30"> {/* Orange (Sacral) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#F97316]">Energy Sources</h2> {/* Orange (Sacral) */}
        </div>
        
        <div className="space-y-6">
          {energySources.map((source) => (
            <div key={source.name} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              <div className="flex items-center col-span-1">
                <div className="w-10 h-10 rounded-full bg-[#F97316]/10 flex items-center justify-center mr-3"> {/* Orange (Sacral) */}
                  <source.icon className="h-5 w-5 text-[#F97316]" /> {/* Orange (Sacral) */}
                </div>
                <h3 className="text-white">{source.name}</h3>
              </div>
              <div className="col-span-2">
                <div className="w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#F97316] h-full rounded-full" 
                    style={{ width: `${source.score}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-between items-center">
                <span className="text-sm text-[#7DAAB2]">{source.description}</span>
                <span className="ml-2 font-mono text-[#F97316]">{source.score}%</span> {/* Orange (Sacral) */}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Optimization Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-[#F97316]/30"> {/* Orange (Sacral) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#F97316]">Energy Optimization Tips</h2> {/* Orange (Sacral) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#F97316] flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-[#7DAAB2]">Take short 5-minute movement breaks every hour during focused work periods.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#F97316] flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-[#7DAAB2]">Prioritize complex, high-energy tasks during your peak energy hours.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#F97316] flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-[#7DAAB2]">Stay hydrated - aim for at least 2 liters of water throughout your day.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#F97316] flex-shrink-0" /> {/* Orange (Sacral) */}
            <span className="text-[#7DAAB2]">Schedule a 20-minute power nap if your energy drops significantly in the afternoon.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}