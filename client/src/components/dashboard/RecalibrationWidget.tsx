import React, { useState, useEffect } from 'react';
import { Zap, Coffee, Star, BatteryMedium, Brain, HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useLYFEOS } from '@/lib/context';
import { DynamicColorButton } from '@/components/ui/dynamic-color-button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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

  // Handle token updates
  const handleTokenChange = (type: 'attention' | 'time' | 'energy' | 'health', value: number[]) => {
    const newValue = value[0];
    
    switch (type) {
      case 'attention':
        setLocalStats(prev => ({
          ...prev,
          attentionTokens: {
            ...prev.attentionTokens,
            current: newValue
          }
        }));
        break;
      case 'time':
        setLocalStats(prev => ({
          ...prev,
          timeTokens: {
            ...prev.timeTokens,
            current: newValue
          }
        }));
        break;
      case 'energy':
        setLocalStats(prev => ({
          ...prev,
          energyPoints: {
            ...prev.energyPoints,
            current: newValue
          }
        }));
        break;
      case 'health':
        setLocalStats(prev => ({
          ...prev,
          healthPoints: {
            ...prev.healthPoints,
            current: newValue
          }
        }));
        break;
    }
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
      <div className="text-sm text-muted-foreground mb-1">
        Recalibrate your daily metrics to reflect your current state
      </div>

      {/* Attention tokens */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Brain className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-medium">Focus</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {localStats.attentionTokens.current}/{localStats.attentionTokens.max}
          </span>
        </div>
        <Slider 
          value={[localStats.attentionTokens.current]}
          max={localStats.attentionTokens.max}
          step={1}
          onValueChange={(value) => handleTokenChange('attention', value)}
          className="focus-visible:ring-primary/50"
        />
      </div>

      {/* Time tokens */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Coffee className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-medium">Time</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {localStats.timeTokens.current}/{localStats.timeTokens.max}
          </span>
        </div>
        <Slider 
          value={[localStats.timeTokens.current]}
          max={localStats.timeTokens.max}
          step={1}
          onValueChange={(value) => handleTokenChange('time', value)}
          className="focus-visible:ring-primary/50"
        />
      </div>

      {/* Energy points */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Zap className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-medium">Energy</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {localStats.energyPoints.current}/{localStats.energyPoints.max}
          </span>
        </div>
        <Slider 
          value={[localStats.energyPoints.current]}
          max={localStats.energyPoints.max}
          step={1}
          onValueChange={(value) => handleTokenChange('energy', value)}
          className="focus-visible:ring-primary/50"
        />
      </div>

      {/* Health points */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <HeartPulse className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-medium">Health</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {localStats.healthPoints.current}/{localStats.healthPoints.max}
          </span>
        </div>
        <Slider 
          value={[localStats.healthPoints.current]}
          max={localStats.healthPoints.max}
          step={1}
          onValueChange={(value) => handleTokenChange('health', value)}
          className="focus-visible:ring-primary/50"
        />
      </div>

      <DynamicColorButton
        onClick={handleResetTokens}
        variant="outline"
        size="sm"
        className="w-full flex items-center justify-center gap-2 border-primary/50"
      >
        <BatteryMedium className="h-4 w-4" />
        <span>Reset All Metrics</span>
      </DynamicColorButton>
    </div>
  );
};

export default RecalibrationWidget;