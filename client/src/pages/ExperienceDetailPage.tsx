import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Award, ArrowUpRight, Star, Target, BookMarked, FileText } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function ExperienceDetailPage() {
  // Set page title
  usePageTitle("Experience - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Experience sources
  const experienceSources = [
    { source: "Completed Missions", percentage: 60, icon: Target },
    { source: "Daily Logs", percentage: 20, icon: FileText },
    { source: "Streaks", percentage: 15, icon: Star },
    { source: "Chronilog", percentage: 5, icon: BookMarked },
  ];
  
  // Level up requirements calculations
  const currentXP = stats.experience.current;
  const maxXP = stats.experience.max;
  const currentLevel = stats.experience.level;
  const xpProgress = (currentXP / maxXP) * 100;
  const xpToNextLevel = maxXP - currentXP;
  
  // Calculate estimated missions to level up (assuming average 25 XP per mission)
  const estimatedMissions = Math.ceil(xpToNextLevel / 25);
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Award className="h-8 w-8 mr-3 text-[#8B5CF6]" /> {/* Violet (Crown) */}
        <h1 className="text-3xl font-orbitron">Experience</h1>
      </div>
      
      {/* Current Experience Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#8B5CF6]/30"> {/* Violet (Crown) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#8B5CF6]">Current Level Progress</h2> {/* Violet (Crown) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">Level {currentLevel} progression</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{currentXP}</span>
              <span className="text-[#7DAAB2] ml-3 text-lg">/ {maxXP} XP</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#8B5CF6]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Next level</p>
            <div className="flex items-center">
              <Star className="h-5 w-5 mr-2 text-[#8B5CF6]" /> {/* Violet (Crown) */}
              <span className="text-white">Level {currentLevel + 1}</span>
            </div>
            <p className="text-[#8B5CF6] text-xs mt-1">{xpToNextLevel} XP needed</p> {/* Violet (Crown) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#8B5CF6]/50 to-[#8B5CF6] h-full rounded-full"
            style={{ width: `${xpProgress}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {currentXP} XP</span>
          <span className="text-xs text-[#7DAAB2]">Target: {maxXP} XP</span>
        </div>
      </div>
      
      {/* Experience Sources */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#8B5CF6]/30"> {/* Violet (Crown) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#8B5CF6]">Experience Sources</h2> {/* Violet (Crown) */}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {experienceSources.map((source) => (
              <div key={source.source} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <source.icon className="h-5 w-5 mr-2 text-[#8B5CF6]" /> {/* Violet (Crown) */}
                    <h3 className="text-white">{source.source}</h3>
                  </div>
                  <div>
                    <span className="px-3 py-1 rounded-md text-sm bg-[#8B5CF6]/20 text-[#8B5CF6]">
                      {source.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-[#8B5CF6]" /* Violet (Crown) */
                    style={{ width: `${source.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-[#001E26] border border-[#8B5CF6]/20 rounded-xl p-4">
            <h3 className="text-[#8B5CF6] font-orbitron mb-3">Level Up Forecast</h3> {/* Violet (Crown) */}
            <div className="space-y-4">
              <p className="text-[#7DAAB2] text-sm">
                You need approximately <span className="text-[#8B5CF6] font-semibold">{estimatedMissions} missions</span> to reach Level {currentLevel + 1}.
              </p>
              <p className="text-[#7DAAB2] text-sm">
                Maintaining a daily streak provides a 15% XP bonus to all completed activities.
              </p>
              <p className="text-[#7DAAB2] text-sm">
                Completing the daily log consistently adds 20 XP per day, which can significantly accelerate your progress.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* XP Growth Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-[#8B5CF6]/30"> {/* Violet (Crown) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#8B5CF6]">XP Growth Strategies</h2> {/* Violet (Crown) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#8B5CF6] flex-shrink-0" /> {/* Violet (Crown) */}
            <span className="text-[#7DAAB2]">Complete at least 3 missions per day for optimal XP accumulation.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#8B5CF6] flex-shrink-0" /> {/* Violet (Crown) */}
            <span className="text-[#7DAAB2]">Maintain a streak of at least 7 days to increase the XP bonus multiplier.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#8B5CF6] flex-shrink-0" /> {/* Violet (Crown) */}
            <span className="text-[#7DAAB2]">Create detailed Chronilog entries to earn additional experience points.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#8B5CF6] flex-shrink-0" /> {/* Violet (Crown) */}
            <span className="text-[#7DAAB2]">Log your daily activities consistently to maintain a steady XP growth rate.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}