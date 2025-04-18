import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Heart, ArrowUpRight, MonitorHeart, Utensils, Dumbbell, Brain } from "lucide-react";
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
      icon: MonitorHeart,
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
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Heart className="h-8 w-8 mr-3 text-[#EF4444]" /> {/* Red (Root) */}
        <h1 className="text-3xl font-orbitron">Health Points</h1>
      </div>
      
      {/* Current Health Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#EF4444]/30"> {/* Red (Root) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#EF4444]">Current Health Status</h2> {/* Red (Root) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">Physical and mental wellness</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.healthPointsCurrent}</span>
              <span className="text-[#7DAAB2] ml-3 text-lg">/ {stats.healthPointsMax}</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#EF4444]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Wellness target</p>
            <div className="flex items-center">
              <MonitorHeart className="h-5 w-5 mr-2 text-[#EF4444]" /> {/* Red (Root) */}
              <span className="text-white">90+</span>
            </div>
            <p className="text-[#EF4444] text-xs mt-1">Optimal health</p> {/* Red (Root) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#EF4444]/50 to-[#EF4444] h-full rounded-full"
            style={{ width: `${(stats.healthPointsCurrent / stats.healthPointsMax) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {stats.healthPointsCurrent}</span>
          <span className="text-xs text-[#7DAAB2]">Target: {stats.healthPointsMax}</span>
        </div>
      </div>
      
      {/* Health Components */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#EF4444]/30"> {/* Red (Root) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#EF4444]">Health Components</h2> {/* Red (Root) */}
        </div>
        
        <div className="space-y-6">
          {healthMetrics.map((metric) => (
            <div key={metric.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <metric.icon className="h-5 w-5 mr-2 text-[#EF4444]" /> {/* Red (Root) */}
                  <h3 className="text-white">{metric.name}</h3>
                </div>
                <div>
                  <span className="px-3 py-1 rounded-md text-sm bg-[#EF4444]/20 text-[#EF4444]">
                    {metric.score}%
                  </span>
                </div>
              </div>
              <p className="text-[#7DAAB2] text-sm">{metric.description}</p>
              <div className="w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    metric.score >= 90 ? "bg-[#EF4444]" :
                    metric.score >= 75 ? "bg-[#EF4444]/80" :
                    "bg-[#EF4444]/60"
                  }`}
                  style={{ width: `${metric.score}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Wellness Recommendations */}
      <div className="glassmorphic rounded-xl p-6 border border-[#EF4444]/30"> {/* Red (Root) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#EF4444]">Wellness Recommendations</h2> {/* Red (Root) */}
        <ul className="space-y-3">
          {healthMetrics.map((metric) => (
            <li key={`tip-${metric.name}`} className="flex">
              <ArrowUpRight className="h-5 w-5 mr-2 text-[#EF4444] flex-shrink-0" /> {/* Red (Root) */}
              <span className="text-[#7DAAB2]">{metric.tips}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}