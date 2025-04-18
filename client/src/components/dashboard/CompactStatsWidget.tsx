import React from 'react';
import { Heart, Battery, Clock, BrainCircuit, Award, Gauge, Calendar } from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { useLocation } from 'wouter';
import { UserStats } from '@/lib/types';

interface CompactStatsWidgetProps {
  stats?: UserStats;
}

/**
 * CompactStatsWidget - A more space-efficient version of the StatsWidget
 * that displays all stats in a compact grid layout with their specific
 * chakra color glows
 */
export default function CompactStatsWidget({ stats: statsFromProps }: CompactStatsWidgetProps) {
  const contextData = useLYFEOS();
  const stats = statsFromProps || contextData.stats;
  const [, navigate] = useLocation();

  const handleStatClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="glassmorphic p-4 rounded-xl">
      <h2 className="text-xl font-orbitron mb-4 text-white">Statistics</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Health Points - Red (Root) Chakra */}
        <div 
          onClick={() => handleStatClick('/health-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#EF4444]/30 hover:border-[#EF4444]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Heart className="h-5 w-5 mr-2 text-[#EF4444]" />
            <span className="text-white text-sm">HP</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#EF4444] text-2xl font-mono">{stats.healthPoints.current}</span>
            <span className="text-gray-400 text-xs ml-1">/{stats.healthPoints.max}</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#EF4444]/50 to-[#EF4444] h-full rounded-full" 
              style={{ 
                width: `${(stats.healthPoints.current / stats.healthPoints.max) * 100}%`,
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Energy Points - Orange (Sacral) Chakra */}
        <div 
          onClick={() => handleStatClick('/energy-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#F97316]/30 hover:border-[#F97316]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Battery className="h-5 w-5 mr-2 text-[#F97316]" />
            <span className="text-white text-sm">EP</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#F97316] text-2xl font-mono">{stats.energyPoints.current}</span>
            <span className="text-gray-400 text-xs ml-1">/{stats.energyPoints.max}</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#F97316]/50 to-[#F97316] h-full rounded-full" 
              style={{ 
                width: `${(stats.energyPoints.current / stats.energyPoints.max) * 100}%`,
                boxShadow: '0 0 8px rgba(249, 115, 22, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Efficiency - Yellow (Solar Plexus) Chakra */}
        <div 
          onClick={() => handleStatClick('/efficiency-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#FACC15]/30 hover:border-[#FACC15]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Gauge className="h-5 w-5 mr-2 text-[#FACC15]" />
            <span className="text-white text-sm">Efficiency</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#FACC15] text-2xl font-mono">{stats.efficiencyScore}</span>
            <span className="text-gray-400 text-xs ml-1">/100</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#FACC15]/50 to-[#FACC15] h-full rounded-full" 
              style={{ 
                width: `${stats.efficiencyScore}%`,
                boxShadow: '0 0 8px rgba(250, 204, 21, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Streak - Green (Heart) Chakra */}
        <div 
          onClick={() => handleStatClick('/streak-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#10B981]/30 hover:border-[#10B981]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Calendar className="h-5 w-5 mr-2 text-[#10B981]" />
            <span className="text-white text-sm">Streak</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#10B981] text-2xl font-mono">{stats.streakDays}</span>
            <span className="text-gray-400 text-xs ml-1">days</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#10B981]/50 to-[#10B981] h-full rounded-full" 
              style={{ 
                width: `${Math.min((stats.streakDays / 30) * 100, 100)}%`, // Assuming 30 days is the goal
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Time Tokens - Cyan (Throat) Chakra */}
        <div 
          onClick={() => handleStatClick('/time-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#22D3EE]/30 hover:border-[#22D3EE]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Clock className="h-5 w-5 mr-2 text-[#22D3EE]" />
            <span className="text-white text-sm">Time</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#22D3EE] text-2xl font-mono">{stats.timeTokens.current}</span>
            <span className="text-gray-400 text-xs ml-1">/{stats.timeTokens.max}</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#22D3EE]/50 to-[#22D3EE] h-full rounded-full" 
              style={{ 
                width: `${(stats.timeTokens.current / stats.timeTokens.max) * 100}%`,
                boxShadow: '0 0 8px rgba(34, 211, 238, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Attention Tokens - Indigo (Third Eye) Chakra */}
        <div 
          onClick={() => handleStatClick('/attention-detail')}
          className="bg-[#001E26] rounded-lg p-3 border border-[#6366F1]/30 hover:border-[#6366F1]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <BrainCircuit className="h-5 w-5 mr-2 text-[#6366F1]" />
            <span className="text-white text-sm">Attention</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#6366F1] text-2xl font-mono">{stats.attentionTokens.current}</span>
            <span className="text-gray-400 text-xs ml-1">/{stats.attentionTokens.max}</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#6366F1]/50 to-[#6366F1] h-full rounded-full" 
              style={{ 
                width: `${(stats.attentionTokens.current / stats.attentionTokens.max) * 100}%`,
                boxShadow: '0 0 8px rgba(99, 102, 241, 0.5)' 
              }}
            ></div>
          </div>
        </div>
        
        {/* Experience - Violet (Crown) Chakra */}
        <div 
          onClick={() => handleStatClick('/experience-detail')}
          className="md:col-span-3 bg-[#001E26] rounded-lg p-3 border border-[#8B5CF6]/30 hover:border-[#8B5CF6]/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center mb-2">
            <Award className="h-5 w-5 mr-2 text-[#8B5CF6]" />
            <span className="text-white text-sm">Level {stats.experience.level} - XP</span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[#8B5CF6] text-2xl font-mono">{stats.experience.current}</span>
            <span className="text-gray-400 text-xs ml-1">/{stats.experience.max}</span>
          </div>
          <div className="mt-2 w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#8B5CF6]/50 to-[#8B5CF6] h-full rounded-full" 
              style={{ 
                width: `${(stats.experience.current / stats.experience.max) * 100}%`,
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)' 
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}