import { useState } from "react";
import { Link } from "wouter";
import { Award, Clock, Zap, Heart, ArrowRight, Info, BrainCircuit, Calendar, BarChart } from "lucide-react";
import { UserStats } from "@/lib/types";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";

interface StatsWidgetProps {
  stats: UserStats;
}

export default function StatsWidget({ stats }: StatsWidgetProps) {
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
      {/* Experience Bar */}
      <Link href="/experience">
        <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 mb-5 relative">
          <StatInfoDialog
            trigger={
              <button 
                className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                onClick={(e) => e.stopPropagation()} // Prevent navigation when clicking info button
              >
                <Info className="h-4 w-4" />
              </button>
            }
            title="Experience Points (XP)"
            // Violet (Crown)
            titleColor="text-primary"
            description="XP tracks your overall progress and achievements in LYFEOS. Complete quests, log activities, and maintain streaks to increase your level."
            additionalInfo="Higher levels unlock premium features and special abilities within the LYFEOS system."
            statType="experience"
          />
          
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Award className="h-4 w-4 text-primary mr-2" /> {/* Using primary theme color */}
              <h3 className="font-orbitron text-primary text-sm">LEVEL PROGRESS</h3>
            </div>
            <div className="flex items-center mr-6">
              <span className="bg-primary/20 text-primary px-2 py-1 rounded-md text-xs font-orbitron mr-2">
                LEVEL {stats.experience.level}
              </span>
              <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="progress-bar progress-xp mb-2">
            <div className="progress-fill" style={{ width: `${xpPercentage}%`, background: 'linear-gradient(to right, var(--primary-70), var(--primary))' }}></div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{stats.experience.current.toLocaleString()} XP</span>
            <span className="text-muted-foreground">{stats.experience.max.toLocaleString()} XP</span>
          </div>
          {stats.experience.totalXP !== undefined && (
            <div className="text-xs text-right mt-1 text-primary/70">
              Total Career XP: {stats.experience.totalXP.toLocaleString()} XP
            </div>
          )}
        </div>
      </Link>
      
      {/* System Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Streak */}
        <Link href="/streak">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="Usage Streak"
              titleColor="text-primary"
              description="Tracks the number of consecutive days you've used LYFEOS. Login daily to maintain and increase your streak."
              additionalInfo="Longer streaks contribute to your overall consistency score and unlock special rewards."
              statType="streak"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">STREAK</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-streak mb-2">
              <div 
                className="progress-fill" 
                style={{ width: `${streakPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {stats.streakDays}<span className="text-muted-foreground text-xs"> days</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">consecutive</span>
            </div>
          </div>
        </Link>
        
        {/* Efficiency */}
        <Link href="/efficiency">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="System Efficiency"
              titleColor="text-primary"
              description="Measures how optimally you're using LYFEOS features. Balanced task completion, regular reflections, and consistent data entry improve your score."
              additionalInfo="Higher efficiency scores indicate better life operating system utilization and typically correlate with improved productivity and wellbeing."
              statType="efficiency"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <BarChart className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">EFFICIENCY</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-efficiency mb-2">
              <div 
                className="progress-fill" 
                style={{ width: `${efficiencyPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {efficiencyPercentage}<span className="text-muted-foreground text-xs">%</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">optimization</span>
            </div>
          </div>
        </Link>
      </div>
      
      {/* Divider */}
      <div className="border-t border-primary/10 mb-4"></div>
      
      {/* Resource Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Attention Tokens */}
        <Link href="/attention">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="Attention Tokens"
              titleColor="text-primary"
              description="Measures your focus capacity and attention allocation. High-quality focus time and mental clarity increase your Attention Tokens."
              additionalInfo="Managing your Attention Tokens helps maintain deep focus on important tasks and prevent mental fatigue."
              statType="attention"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <BrainCircuit className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">ATTENTION TOKENS</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-at mb-2">
              <div className="progress-fill" style={{ width: `${atPercentage}%` }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {Math.round(atPercentage)}<span className="text-muted-foreground text-xs">%</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">focus</span>
            </div>
          </div>
        </Link>
        
        {/* Time Tokens */}
        <Link href="/time">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="Time Tokens"
              titleColor="text-primary"
              description="Represents your available productive time for the day. Completing tasks consumes tokens, which replenish daily."
              additionalInfo="Managing your Time Tokens helps balance productivity and prevents burnout by encouraging appropriate work limits."
              statType="time"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">TIME TOKENS</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-tt mb-2">
              <div className="progress-fill" style={{ width: `${ttPercentage}%` }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {stats.timeTokens.current}<span className="text-muted-foreground text-xs">/{stats.timeTokens.max}</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">remaining today</span>
            </div>
          </div>
        </Link>
        
        {/* Energy Points */}
        <Link href="/energy">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="Energy Points"
              titleColor="text-primary"
              description="Measures your mental and physical energy levels. Rest, nutrition, and wellness activities increase your Energy Points."
              additionalInfo="Higher energy enables you to tackle more challenging tasks effectively and sustain focus throughout the day."
              statType="energy"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Zap className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">ENERGY TOKENS</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-ep mb-2">
              <div className="progress-fill" style={{ width: `${epPercentage}%` }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {Math.round(epPercentage)}<span className="text-muted-foreground text-xs">%</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">capacity</span>
            </div>
          </div>
        </Link>
        
        {/* Health Points */}
        <Link href="/health">
          <div className="stat-block group hover:bg-primary/10 hover:border-primary/40 rounded-lg p-3 transition-all cursor-pointer border border-primary/20 relative">
            <StatInfoDialog
              trigger={
                <button 
                  className="absolute top-3 right-3 h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              }
              title="Health Points"
              titleColor="text-primary"
              description="Indicates your overall physical wellbeing. Exercise, sleep, and self-care activities contribute to higher Health Points."
              additionalInfo="Maintaining high Health Points improves resilience, prevents illness, and enhances long-term performance."
              statType="health"
            />
            
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Heart className="h-4 w-4 text-primary mr-2" />
                <h3 className="text-sm font-orbitron text-primary">HEALTH POINTS</h3>
              </div>
              <div className="mr-6">
                <ArrowRight className="h-4 w-4 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="progress-bar progress-hp mb-2">
              <div className="progress-fill" style={{ width: `${hpPercentage}%` }}></div>
            </div>
            <div className="flex justify-between">
              <span className="text-primary font-mono text-base">
                {Math.round(hpPercentage)}<span className="text-muted-foreground text-xs">%</span>
              </span>
              <span className="text-xs text-muted-foreground self-end">wellness</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}