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
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#8B5CF6]"
                  onClick={(e) => e.stopPropagation()} 
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Experience Points (XP)"
              titleColor="text-[#8B5CF6]"
              description="XP tracks your overall progress and achievements in LYFEOS."
              additionalInfo="Higher levels unlock premium features and special abilities."
              statType="experience"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Award className="h-3 w-3 text-[#8B5CF6] mr-1" />
                <h3 className="font-orbitron text-[#D6F4FF] text-xs">LEVEL</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-xp h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${xpPercentage}%`, backgroundColor: "#8B5CF6" }}></div>
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
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#60A5FA]"
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
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#FBBF24]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="System Efficiency"
              titleColor="text-[#FBBF24]"
              description="How effectively you're using LYFEOS."
              additionalInfo="Higher efficiency scores correlate with improved productivity."
              statType="efficiency"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <BarChart className="h-3 w-3 text-[#FBBF24] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">EFFICIENCY</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-efficiency h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${efficiencyPercentage}%`, backgroundColor: "#FBBF24" }}></div>
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
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#6366F1]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Attention Tokens (AT)"
              titleColor="text-[#6366F1]"
              description="AT represent your focus, concentration and mental clarity."
              additionalInfo="Higher attention tokens enable deeper focus on complex tasks."
              statType="attention"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <BrainCircuit className="h-3 w-3 text-[#6366F1] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">ATTENTION</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-at h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${atPercentage}%`, backgroundColor: "#6366F1" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-xs">
                {stats.attentionTokens.current}/{stats.attentionTokens.max}
              </span>
            </div>
          </div>
        </Link>
        
        {/* Time Tokens */}
        <Link href="/time">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#22D3EE]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Time Tokens (TT)"
              titleColor="text-[#22D3EE]"
              description="TT represent your time allocation and management resources."
              additionalInfo="Spend tokens wisely to manage your schedule effectively."
              statType="time"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Clock className="h-3 w-3 text-[#22D3EE] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">TIME</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-tt h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${ttPercentage}%`, backgroundColor: "#22D3EE" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-xs">
                {stats.timeTokens.current}/{stats.timeTokens.max}
              </span>
            </div>
          </div>
        </Link>
        
        {/* Energy Points */}
        <Link href="/energy">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#F97316]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Energy Points (EP)"
              titleColor="text-[#F97316]"
              description="EP represents your creative energy and vitality resources."
              additionalInfo="Use EP to power creative tasks and maintain high productivity."
              statType="energy"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Zap className="h-3 w-3 text-[#F97316] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">ENERGY</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-ep h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${epPercentage}%`, backgroundColor: "#F97316" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-xs">
                {stats.energyPoints.current}/{stats.energyPoints.max}
              </span>
            </div>
          </div>
        </Link>
        
        {/* Health Points */}
        <Link href="/health">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-2 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-[#EF4444]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3" />
                </button>
              }
              title="Health Points (HP)"
              titleColor="text-[#EF4444]"
              description="HP represents your physical well-being and resilience."
              additionalInfo="Maintain high HP to perform at your best and recover quickly."
              statType="health"
            />
            
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center">
                <Heart className="h-3 w-3 text-[#EF4444] mr-1" />
                <h3 className="text-xs font-orbitron text-[#D6F4FF]">HEALTH</h3>
              </div>
              <ArrowRight className="h-3 w-3 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="progress-bar progress-hp h-1.5 mb-1">
              <div className="progress-fill" style={{ width: `${hpPercentage}%`, backgroundColor: "#EF4444" }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-[#D6F4FF] font-mono text-xs">
                {stats.healthPoints.current}/{stats.healthPoints.max}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}