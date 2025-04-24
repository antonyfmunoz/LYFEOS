import React, { useState, useEffect } from 'react';
import { BrainCircuit, Clock, Zap, Heart, RefreshCw } from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { useToast } from '@/hooks/use-toast';
import { DynamicColorButton } from '@/components/ui/dynamic-color-button';
import { cn } from '@/lib/utils';

interface RecalibrationWidgetProps {
  className?: string;
}

interface LocalStats {
  attentionTokens: { current: number; max: number };
  timeTokens: { current: number; max: number };
  energyPoints: { current: number; max: number };
  healthPoints: { current: number; max: number };
}

const RecalibrationWidget: React.FC<RecalibrationWidgetProps> = ({ className }) => {
  const { stats } = useLYFEOS();
  const { toast } = useToast();
  
  // Setup local state for the stats
  const [localStats, setLocalStats] = useState<LocalStats>({
    attentionTokens: { current: 10, max: 100 },
    timeTokens: { current: 10, max: 100 },
    energyPoints: { current: 10, max: 100 },
    healthPoints: { current: 10, max: 100 }
  });
  
  // Initialize local stats from context stats
  useEffect(() => {
    if (stats) {
      setLocalStats({
        attentionTokens: { 
          current: stats.attentionTokens?.current || 10, 
          max: stats.attentionTokens?.max || 100 
        },
        timeTokens: { 
          current: stats.timeTokens?.current || 10, 
          max: stats.timeTokens?.max || 100 
        },
        energyPoints: { 
          current: stats.energyPoints?.current || 10, 
          max: stats.energyPoints?.max || 100 
        },
        healthPoints: { 
          current: stats.healthPoints?.current || 10, 
          max: stats.healthPoints?.max || 100 
        }
      });
    }
  }, [stats]);

  // Handle adjusting a token value
  const handleAdjustToken = (type: 'attention' | 'time' | 'energy' | 'health', amount: number) => {
    setLocalStats(prev => {
      const tokenKey = 
        type === 'attention' ? 'attentionTokens' :
        type === 'time' ? 'timeTokens' :
        type === 'energy' ? 'energyPoints' :
        'healthPoints';
      
      const currentValue = prev[tokenKey].current;
      const maxValue = prev[tokenKey].max;
      
      // Calculate new value, ensuring it stays within bounds
      const newValue = Math.max(0, Math.min(maxValue, currentValue + amount));
      
      return {
        ...prev,
        [tokenKey]: {
          ...prev[tokenKey],
          current: newValue
        }
      };
    });
  };

  // Reset all tokens to maximum
  const handleResetTokens = () => {
    setLocalStats(prev => ({
      ...prev,
      attentionTokens: {
        ...prev.attentionTokens,
        current: prev.attentionTokens.max
      },
      timeTokens: {
        ...prev.timeTokens,
        current: prev.timeTokens.max
      },
      energyPoints: {
        ...prev.energyPoints,
        current: prev.energyPoints.max
      },
      healthPoints: {
        ...prev.healthPoints,
        current: prev.healthPoints.max
      }
    }));
    
    toast({
      title: "Metrics Reset",
      description: "All metrics have been reset to their maximum values.",
      variant: "default",
      className: "border border-primary text-foreground",
      duration: 3000,
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm text-[#7DAAB2] mb-3">
        Recalibrate your current state metrics
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Attention tokens */}
        <div className="stat-block rounded-lg p-3 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <BrainCircuit className="h-4 w-4 text-[#6366F1] mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">ATTENTION</h3>
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => handleAdjustToken('attention', -10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                -
              </button>
              <span className="text-[#D6F4FF] font-mono text-xs mx-1">
                {localStats.attentionTokens.current}/{localStats.attentionTokens.max}
              </span>
              <button 
                onClick={() => handleAdjustToken('attention', 10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                +
              </button>
            </div>
          </div>
          <div className="progress-bar progress-at h-1.5">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${(localStats.attentionTokens.current / localStats.attentionTokens.max) * 100}%`,
                backgroundColor: "#6366F1"
              }}
            />
          </div>
        </div>

        {/* Time tokens */}
        <div className="stat-block rounded-lg p-3 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-[#22D3EE] mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">TIME</h3>
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => handleAdjustToken('time', -10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                -
              </button>
              <span className="text-[#D6F4FF] font-mono text-xs mx-1">
                {localStats.timeTokens.current}/{localStats.timeTokens.max}
              </span>
              <button 
                onClick={() => handleAdjustToken('time', 10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                +
              </button>
            </div>
          </div>
          <div className="progress-bar progress-tt h-1.5">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${(localStats.timeTokens.current / localStats.timeTokens.max) * 100}%`,
                backgroundColor: "#22D3EE"
              }}
            />
          </div>
        </div>

        {/* Energy points */}
        <div className="stat-block rounded-lg p-3 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Zap className="h-4 w-4 text-[#F97316] mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">ENERGY</h3>
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => handleAdjustToken('energy', -10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                -
              </button>
              <span className="text-[#D6F4FF] font-mono text-xs mx-1">
                {localStats.energyPoints.current}/{localStats.energyPoints.max}
              </span>
              <button 
                onClick={() => handleAdjustToken('energy', 10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                +
              </button>
            </div>
          </div>
          <div className="progress-bar progress-ep h-1.5">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${(localStats.energyPoints.current / localStats.energyPoints.max) * 100}%`,
                backgroundColor: "#F97316"
              }}
            />
          </div>
        </div>

        {/* Health points */}
        <div className="stat-block rounded-lg p-3 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Heart className="h-4 w-4 text-[#EF4444] mr-1" />
              <h3 className="text-xs font-orbitron text-[#D6F4FF]">HEALTH</h3>
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => handleAdjustToken('health', -10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                -
              </button>
              <span className="text-[#D6F4FF] font-mono text-xs mx-1">
                {localStats.healthPoints.current}/{localStats.healthPoints.max}
              </span>
              <button 
                onClick={() => handleAdjustToken('health', 10)}
                className="h-5 w-5 rounded-full bg-[#1A2C35] hover:bg-[#2A3C45] flex items-center justify-center text-[#D6F4FF] mx-0.5"
              >
                +
              </button>
            </div>
          </div>
          <div className="progress-bar progress-hp h-1.5">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${(localStats.healthPoints.current / localStats.healthPoints.max) * 100}%`,
                backgroundColor: "#EF4444"
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <button
          onClick={handleResetTokens}
          className="w-full py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded text-xs text-[#D6F4FF] font-medium flex items-center justify-center transition-colors"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          <span>RESET ALL METRICS</span>
        </button>
      </div>
    </div>
  );
};

export default RecalibrationWidget;