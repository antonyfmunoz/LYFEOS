import { useState } from "react";
import { Award, Clock, Zap, Heart, Info, BrainCircuit, Calendar, BarChart } from "lucide-react";
import { UserStats } from "@/lib/types";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";
import { useLocation } from "wouter";

interface CompactStatsWidgetProps {
  stats: UserStats;
}

export default function CompactStatsWidget({ stats }: CompactStatsWidgetProps) {
  const [_, setLocation] = useLocation();
  
  // Calculate percentage for progress bars
  const xpPercentage = (stats.experience.current / stats.experience.max) * 100;
  const atPercentage = (stats.attentionTokens.current / stats.attentionTokens.max) * 100;
  const ttPercentage = (stats.timeTokens.current / stats.timeTokens.max) * 100;
  const epPercentage = (stats.energyPoints.current / stats.energyPoints.max) * 100;
  const hpPercentage = (stats.healthPoints.current / stats.healthPoints.max) * 100;
  
  // Calculate percentages for efficiency and streak
  const efficiencyPercentage = stats.efficiencyScore; // Already stored as a percentage (0-100)
  const streakPercentage = Math.min(100, (stats.streakDays / 30) * 100); // Assume 30 days is max
  
  return (
    <div className="p-0">
      {/* Level Row */}
      <div className="grid grid-cols-1 gap-2 mb-2">
        {/* Experience Level */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/experience");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Experience Points (XP)"
            titleColor="text-primary"
            description="XP tracks your overall progress and achievements in LYFEOS."
            additionalInfo="Higher levels unlock premium features and special abilities."
            statType="experience"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Award className="h-3 w-3 text-primary mr-1" />
              <h3 className="font-orbitron text-[#D6F4FF] text-xs">LEVEL</h3>
            </div>
          </div>
          <div className="progress-bar progress-xp h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${xpPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-sm">
              {stats.experience.level}
            </span>
            <span className="text-[#D6F4FF] font-mono text-xs">
              {stats.experience.current.toLocaleString()}/{stats.experience.max.toLocaleString()} XP
            </span>
          </div>
          {stats.experience.totalXP !== undefined && (
            <div className="text-xs text-right mt-1 text-primary/70">
              Total: {stats.experience.totalXP.toLocaleString()} XP
            </div>
          )}
        </div>
      </div>
      
      {/* All Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {/* Streak */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/streak");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Usage Streak"
            titleColor="text-primary"
            description="Days you've used LYFEOS consecutively."
            additionalInfo="Longer streaks unlock special rewards."
            statType="streak"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Calendar className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">STREAK</h3>
            </div>
          </div>
          <div className="progress-bar progress-streak h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${streakPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {stats.streakDays} <span className="text-[#7DAAB2] text-xs">days</span>
            </span>
          </div>
        </div>
        
        {/* Efficiency */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/efficiency");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="System Efficiency"
            titleColor="text-primary"
            description="How effectively you're using LYFEOS."
            additionalInfo="Higher efficiency scores correlate with improved productivity."
            statType="efficiency"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <BarChart className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">EFFICIENCY</h3>
            </div>
          </div>
          <div className="progress-bar progress-efficiency h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${efficiencyPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {efficiencyPercentage}<span className="text-[#7DAAB2] text-xs">%</span>
            </span>
          </div>
        </div>
        
        {/* Attention Tokens */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/attention");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Attention Tokens (AT)"
            titleColor="text-primary"
            description="AT represent your focus, concentration and mental clarity."
            additionalInfo="Higher attention tokens enable deeper focus on complex tasks."
            statType="attention"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <BrainCircuit className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">ATTENTION</h3>
            </div>
          </div>
          <div className="progress-bar progress-at h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${atPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {Math.round(atPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
            </span>
          </div>
        </div>
        
        {/* Time Tokens */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/time");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Time Tokens (TT)"
            titleColor="text-primary"
            description="TT represent your time allocation and management resources."
            additionalInfo="Spend tokens wisely to manage your schedule effectively."
            statType="time"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Clock className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">TIME</h3>
            </div>
          </div>
          <div className="progress-bar progress-tt h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${ttPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {Math.round(ttPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
            </span>
          </div>
        </div>
        
        {/* Energy Tokens */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/energy");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Energy Tokens (ET)"
            titleColor="text-primary"
            description="ET represents your creative energy and vitality resources."
            additionalInfo="Use ET to power creative tasks and maintain high productivity."
            statType="energy"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Zap className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">ENERGY</h3>
            </div>
          </div>
          <div className="progress-bar progress-ep h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${epPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {Math.round(epPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
            </span>
          </div>
        </div>
        
        {/* Health Points */}
        <div className="stat-block rounded-lg p-2 border border-primary/20 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation("/health");
                }}
              >
                <Info className="h-3 w-3" />
              </button>
            }
            title="Health Points (HP)"
            titleColor="text-primary"
            description="HP represents your physical well-being and resilience."
            additionalInfo="Maintain high HP to perform at your best and recover quickly."
            statType="health"
          />
          
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Heart className="h-3 w-3 text-primary mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">HEALTH</h3>
            </div>
          </div>
          <div className="progress-bar progress-hp h-1.5 mb-1">
            <div className="progress-fill" style={{ width: `${hpPercentage}%`, backgroundColor: "var(--primary)" }}></div>
          </div>
          <div className="flex justify-between">
            <span className="text-[#D6F4FF] font-mono text-xs">
              {Math.round(hpPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}