import { useState } from "react";
import { Link } from "wouter";
import { Award, Clock, Zap, Heart, ArrowRight, Info, BrainCircuit, Calendar, BarChart } from "lucide-react";
import { UserStats } from "@/lib/types";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";

interface CompactStatsWidgetProps {
  stats: UserStats;
}

export default function CompactStatsWidget({ stats }: CompactStatsWidgetProps) {
  // Calculate percentage for progress bars
  const xpPercentage = (stats.experience.current / stats.experience.max) * 100;
  const atPercentage = (stats.attentionTokens.current / stats.attentionTokens.max) * 100;
  const ttPercentage = (stats.timeTokens.current / stats.timeTokens.max) * 100;
  const epPercentage = (stats.energyPoints.current / stats.energyPoints.max) * 100;
  const hpPercentage = (stats.healthPoints.current / stats.healthPoints.max) * 100;
  
  // Calculate percentages for efficiency and streak
  const efficiencyPercentage = stats.efficiencyScore;
  const streakPercentage = Math.min(100, (stats.streakDays / 30) * 100); // Assume 30 days is max
  
  return (
    <div className="p-0">
      {/* First row: Level & System Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        {/* Experience Level */}
        <Link href="/experience">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-2 right-2 p-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#36F1CD]"
                  onClick={(e) => e.stopPropagation()} 
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Experience Points (XP)"
              titleColor="text-[#36F1CD]"
              description="XP tracks your overall progress and achievements in LYFEOS."
              additionalInfo="Higher levels unlock premium features and special abilities."
              statType="experience"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Award className="h-3 w-3 text-[#36F1CD] mr-1" />
                <h3 className="font-orbitron text-[#D6F4FF] text-xs">LEVEL</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-xp h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${xpPercentage}%` }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-sm">
                {stats.experience.level}
              </span>
            </div>
          </div>
        </Link>
        
        {/* Streak */}
        <Link href="/streak">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-2 right-2 p-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#60A5FA]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Usage Streak"
              titleColor="text-[#60A5FA]"
              description="Days you've used LYFEOS consecutively."
              additionalInfo="Longer streaks unlock special rewards."
              statType="streak"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Calendar className="h-3 w-3 text-[#60A5FA] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">STREAK</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-streak h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${streakPercentage}%`, backgroundColor: "#60A5FA" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-sm">
                {stats.streakDays}<span className="text-[#7DAAB2] text-xs"> days</span>
              </span>
            </div>
          </div>
        </Link>
        
        {/* Efficiency */}
        <Link href="/efficiency">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-2 right-2 p-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#10B981]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="System Efficiency"
              titleColor="text-[#10B981]"
              description="How effectively you're using LYFEOS."
              additionalInfo="Higher efficiency scores correlate with improved productivity."
              statType="efficiency"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <BarChart className="h-3 w-3 text-[#10B981] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">EFFICIENCY</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-efficiency h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${efficiencyPercentage}%`, backgroundColor: "#10B981" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-sm">
                {efficiencyPercentage}<span className="text-[#7DAAB2] text-xs">%</span>
              </span>
            </div>
          </div>
        </Link>
      </div>
      
      {/* Resource Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Attention Tokens */}
        <Link href="/attention">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <BrainCircuit className="h-3 w-3 text-[#9C6ADE] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">ATTENTION</h3>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono text-xs mr-1">
                  {stats.attentionTokens.current}/{stats.attentionTokens.max}
                </span>
                <Info 
                  className="h-3 w-3 text-[#9C6ADE] cursor-pointer opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </div>
            </div>
            <div className="progress-bar progress-at h-1.5">
              <div className="progress-fill" style={{ width: `${atPercentage}%` }}></div>
            </div>
          </div>
        </Link>
        
        {/* Time Tokens */}
        <Link href="/time">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Clock className="h-3 w-3 text-primary mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">TIME</h3>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono text-xs mr-1">
                  {stats.timeTokens.current}/{stats.timeTokens.max}
                </span>
                <Info 
                  className="h-3 w-3 text-primary cursor-pointer opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </div>
            </div>
            <div className="progress-bar progress-tt h-1.5">
              <div className="progress-fill" style={{ width: `${ttPercentage}%` }}></div>
            </div>
          </div>
        </Link>
        
        {/* Energy Points */}
        <Link href="/energy">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Zap className="h-3 w-3 text-[#FCD34D] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">ENERGY</h3>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono text-xs mr-1">
                  {stats.energyPoints.current}/{stats.energyPoints.max}
                </span>
                <Info 
                  className="h-3 w-3 text-[#FCD34D] cursor-pointer opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </div>
            </div>
            <div className="progress-bar progress-ep h-1.5">
              <div className="progress-fill" style={{ width: `${epPercentage}%` }}></div>
            </div>
          </div>
        </Link>
        
        {/* Health Points */}
        <Link href="/health">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Heart className="h-3 w-3 text-[#EC4899] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">HEALTH</h3>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono text-xs mr-1">
                  {stats.healthPoints.current}/{stats.healthPoints.max}
                </span>
                <Info 
                  className="h-3 w-3 text-[#EC4899] cursor-pointer opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              </div>
            </div>
            <div className="progress-bar progress-hp h-1.5">
              <div className="progress-fill" style={{ width: `${hpPercentage}%` }}></div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}