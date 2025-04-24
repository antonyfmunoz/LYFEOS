import React, { useState, useEffect } from 'react';
import { Zap, Coffee, Brain, HeartPulse, RefreshCw } from 'lucide-react';
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

  // Function to render a progress bar
  const renderProgressBar = (current: number, max: number, color: string) => {
    const percentage = (current / max) * 100;
    return (
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm text-muted-foreground mb-3">
        Recalibrate your current state metrics
      </div>

      {/* Attention tokens */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Brain className="h-4 w-4 text-blue-400 mr-2" />
            <span className="text-sm font-medium text-slate-300">Focus</span>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => handleAdjustToken('attention', -10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 mr-1"
            >
              -
            </button>
            <span className="text-sm text-slate-300 w-16 text-center">
              {localStats.attentionTokens.current}/{localStats.attentionTokens.max}
            </span>
            <button 
              onClick={() => handleAdjustToken('attention', 10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 ml-1"
            >
              +
            </button>
          </div>
        </div>
        {renderProgressBar(
          localStats.attentionTokens.current, 
          localStats.attentionTokens.max,
          'bg-blue-600'
        )}
      </div>

      {/* Time tokens */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Coffee className="h-4 w-4 text-amber-400 mr-2" />
            <span className="text-sm font-medium text-slate-300">Time</span>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => handleAdjustToken('time', -10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 mr-1"
            >
              -
            </button>
            <span className="text-sm text-slate-300 w-16 text-center">
              {localStats.timeTokens.current}/{localStats.timeTokens.max}
            </span>
            <button 
              onClick={() => handleAdjustToken('time', 10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 ml-1"
            >
              +
            </button>
          </div>
        </div>
        {renderProgressBar(
          localStats.timeTokens.current, 
          localStats.timeTokens.max,
          'bg-amber-600'
        )}
      </div>

      {/* Energy points */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Zap className="h-4 w-4 text-yellow-400 mr-2" />
            <span className="text-sm font-medium text-slate-300">Energy</span>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => handleAdjustToken('energy', -10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 mr-1"
            >
              -
            </button>
            <span className="text-sm text-slate-300 w-16 text-center">
              {localStats.energyPoints.current}/{localStats.energyPoints.max}
            </span>
            <button 
              onClick={() => handleAdjustToken('energy', 10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 ml-1"
            >
              +
            </button>
          </div>
        </div>
        {renderProgressBar(
          localStats.energyPoints.current, 
          localStats.energyPoints.max,
          'bg-yellow-600'
        )}
      </div>

      {/* Health points */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <HeartPulse className="h-4 w-4 text-rose-400 mr-2" />
            <span className="text-sm font-medium text-slate-300">Health</span>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => handleAdjustToken('health', -10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 mr-1"
            >
              -
            </button>
            <span className="text-sm text-slate-300 w-16 text-center">
              {localStats.healthPoints.current}/{localStats.healthPoints.max}
            </span>
            <button 
              onClick={() => handleAdjustToken('health', 10)}
              className="h-6 w-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 ml-1"
            >
              +
            </button>
          </div>
        </div>
        {renderProgressBar(
          localStats.healthPoints.current, 
          localStats.healthPoints.max,
          'bg-rose-600'
        )}
      </div>

      <DynamicColorButton
        onClick={handleResetTokens}
        variant="outline"
        size="sm"
        className="w-full flex items-center justify-center gap-2 border-primary/50 mt-2"
      >
        <RefreshCw className="h-4 w-4" />
        <span>Reset All Metrics</span>
      </DynamicColorButton>
    </div>
  );
};

export default RecalibrationWidget;