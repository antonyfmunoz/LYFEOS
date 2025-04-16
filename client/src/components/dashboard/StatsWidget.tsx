import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Award, Clock, Zap, Heart, ArrowRight } from "lucide-react";
import { UserStats } from "@/lib/types";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface StatsWidgetProps {
  stats: UserStats;
}

export default function StatsWidget({ stats }: StatsWidgetProps) {
  // Calculate percentage for progress bars
  const xpPercentage = (stats.experience.current / stats.experience.max) * 100;
  const ttPercentage = (stats.timeTokens.current / stats.timeTokens.max) * 100;
  const epPercentage = (stats.energyPoints.current / stats.energyPoints.max) * 100;
  const hpPercentage = (stats.healthPoints.current / stats.healthPoints.max) * 100;
  
  return (
    <TooltipProvider>
      <div className="glassmorphic rounded-xl p-4 neon-border">
        {/* Experience Bar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <Award className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <h3 className="font-orbitron text-[#D6F4FF] text-sm">LEVEL PROGRESS</h3>
                </div>
                <div className="flex items-center">
                  <span className="bg-[#36F1CD] bg-opacity-20 text-[#36F1CD] px-2 py-1 rounded-md text-xs font-orbitron mr-2">
                    LEVEL {stats.experience.level}
                  </span>
                  <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="progress-bar progress-xp mb-2">
                <div className="progress-fill" style={{ width: `${xpPercentage}%` }}></div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#7DAAB2]">{stats.experience.current.toLocaleString()} XP</span>
                <span className="text-[#7DAAB2]">{stats.experience.max.toLocaleString()} XP</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-2">
              <p className="font-bold text-primary">Experience Points (XP)</p>
              <p>XP tracks your overall progress and achievements in LYFEOS. Complete quests, log activities, and maintain streaks to increase your level.</p>
              <p className="text-xs text-muted-foreground">Higher levels unlock premium features and special abilities.</p>
            </div>
          </TooltipContent>
        </Tooltip>
        
        {/* Divider */}
        <div className="border-t border-primary/10 mb-4"></div>
        
        {/* Other Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Time Tokens */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-primary mr-2" />
                    <h3 className="text-sm font-orbitron text-[#D6F4FF]">TIME TOKENS</h3>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="progress-bar progress-tt mb-2">
                  <div className="progress-fill" style={{ width: `${ttPercentage}%` }}></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#D6F4FF] font-mono text-base">
                    {stats.timeTokens.current}<span className="text-[#7DAAB2] text-xs">/{stats.timeTokens.max}</span>
                  </span>
                  <span className="text-xs text-[#7DAAB2] self-end">remaining today</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-bold text-primary">Time Tokens</p>
                <p>Represents your available productive time for the day. Completing tasks consumes tokens, which replenish daily.</p>
                <p className="text-xs text-muted-foreground">Managing your Time Tokens helps balance productivity and prevents burnout.</p>
              </div>
            </TooltipContent>
          </Tooltip>
          
          {/* Energy Points */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Zap className="h-4 w-4 text-[#FCD34D] mr-2" />
                    <h3 className="text-sm font-orbitron text-[#D6F4FF]">ENERGY POINTS</h3>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="progress-bar progress-ep mb-2">
                  <div className="progress-fill" style={{ width: `${epPercentage}%` }}></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#D6F4FF] font-mono text-base">
                    {Math.round(epPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
                  </span>
                  <span className="text-xs text-[#7DAAB2] self-end">capacity</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-bold text-[#FCD34D]">Energy Points</p>
                <p>Measures your mental and physical energy levels. Rest, nutrition, and wellness activities increase your Energy Points.</p>
                <p className="text-xs text-muted-foreground">Higher energy enables you to tackle more challenging tasks effectively.</p>
              </div>
            </TooltipContent>
          </Tooltip>
          
          {/* Health Points */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Heart className="h-4 w-4 text-[#EC4899] mr-2" />
                    <h3 className="text-sm font-orbitron text-[#D6F4FF]">HEALTH POINTS</h3>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="progress-bar progress-hp mb-2">
                  <div className="progress-fill" style={{ width: `${hpPercentage}%` }}></div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#D6F4FF] font-mono text-base">
                    {Math.round(hpPercentage)}<span className="text-[#7DAAB2] text-xs">%</span>
                  </span>
                  <span className="text-xs text-[#7DAAB2] self-end">wellness</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-bold text-[#EC4899]">Health Points</p>
                <p>Indicates your overall physical wellbeing. Exercise, sleep, and self-care activities contribute to higher Health Points.</p>
                <p className="text-xs text-muted-foreground">Maintaining high Health Points improves resilience and prevents illness.</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}