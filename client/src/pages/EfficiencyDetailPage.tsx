import React from "react";
import { Link } from "wouter";
import { ArrowLeft, BarChart, ArrowUpRight, BarChart2, CheckCircle, FileCog, Brain, Calendar } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function EfficiencyDetailPage() {
  // Set page title
  usePageTitle("System Efficiency - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Define efficiency metrics
  const efficiencyMetrics = [
    { 
      name: "Task Completion", 
      score: 85, 
      icon: CheckCircle, 
      description: "Percentage of scheduled tasks that were completed on time.",
      tips: "Create smaller, achievable tasks to maintain momentum and increase completion rates."
    },
    { 
      name: "Data Quality", 
      score: 72, 
      icon: FileCog, 
      description: "Measures how comprehensive and consistent your logging and note-taking is.",
      tips: "Set up templates for common entries to ensure consistency in your data logging."
    },
    { 
      name: "Feature Utilization", 
      score: 80, 
      icon: BarChart2, 
      description: "Your usage of LYFEOS features compared to optimal patterns.",
      tips: "Experiment with all available features to find which ones provide the most value for you."
    },
    { 
      name: "Cognitive Balance", 
      score: 77, 
      icon: Brain, 
      description: "Balance between focus sessions, rest periods, and learning activities.",
      tips: "Try the Pomodoro technique (25 min work, 5 min rest) to improve cognitive balance."
    },
    { 
      name: "Consistency", 
      score: 92, 
      icon: Calendar, 
      description: "How regularly you interact with the system and maintain your data.",
      tips: "Build LYFEOS check-ins into your daily routine at consistent times for best results."
    },
  ];
  
  // Calculate the average efficiency score
  const calculatedEfficiency = Math.round(
    efficiencyMetrics.reduce((total, metric) => total + metric.score, 0) / efficiencyMetrics.length
  );
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <BarChart className="h-8 w-8 mr-3 text-[#FBBF24]" /> {/* Yellow (Solar Plexus) */}
        <h1 className="text-3xl font-orbitron">System Efficiency</h1>
      </div>
      
      {/* Current Efficiency */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#10B981]/30">
        <h2 className="font-orbitron text-xl mb-4 text-[#FBBF24]">Overall Efficiency</h2> {/* Yellow (Solar Plexus) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">System optimization score</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.efficiencyScore}</span>
              <span className="text-[#7DAAB2] ml-2 text-2xl">%</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#10B981]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Target</p>
            <div className="flex items-center">
              <BarChart className="h-5 w-5 mr-2 text-[#10B981]" />
              <span className="text-white">95%</span>
            </div>
            <p className="text-[#10B981] text-xs mt-1">Optimal performance</p>
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#10B981]/50 to-[#10B981] h-full rounded-full"
            style={{ width: `${stats.efficiencyScore}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {stats.efficiencyScore}%</span>
          <span className="text-xs text-[#7DAAB2]">Target: 95%</span>
        </div>
      </div>
      
      {/* Efficiency Components */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#10B981]/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#FBBF24]">Efficiency Components</h2> {/* Yellow (Solar Plexus) */}
        </div>
        
        <div className="space-y-6">
          {efficiencyMetrics.map((metric) => (
            <div key={metric.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <metric.icon className="h-5 w-5 mr-2 text-[#10B981]" />
                  <h3 className="text-white">{metric.name}</h3>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-md text-sm ${
                    metric.score >= 90 ? "bg-[#10B981]/20 text-[#10B981]" :
                    metric.score >= 75 ? "bg-[#60A5FA]/20 text-[#60A5FA]" :
                    "bg-[#FCD34D]/20 text-[#FCD34D]"
                  }`}>
                    {metric.score}%
                  </span>
                </div>
              </div>
              <p className="text-[#7DAAB2] text-sm">{metric.description}</p>
              <div className="w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    metric.score >= 90 ? "bg-[#10B981]" :
                    metric.score >= 75 ? "bg-[#60A5FA]" :
                    "bg-[#FCD34D]"
                  }`}
                  style={{ width: `${metric.score}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Improvement Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-[#10B981]/30">
        <h2 className="font-orbitron text-xl mb-4 text-[#FBBF24]">Efficiency Tips</h2> {/* Yellow (Solar Plexus) */}
        <ul className="space-y-3">
          {efficiencyMetrics.map((metric) => (
            <li key={`tip-${metric.name}`} className="flex">
              <ArrowUpRight className="h-5 w-5 mr-2 text-[#10B981] flex-shrink-0" />
              <span className="text-[#7DAAB2]">{metric.tips}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}