import React, { createContext, useContext, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Sparkles } from 'lucide-react';
import { useTheme } from '@/lib/themeContext';

// Define the types for XP
interface XpAnimation {
  amount: number;
  fromValue: number;
  toValue: number;
  maxValue: number;
  levelUp?: boolean;
  reason?: string;
}

interface XpContextType {
  awardXp: (xpData: XpAnimation) => void;
}

// Create the context
const XpContext = createContext<XpContextType | undefined>(undefined);

// Create a provider component
export const XpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const { primaryColor } = useTheme();

  const awardXp = useCallback((xpData: XpAnimation) => {
    // Show a toast notification with the XP animation
    toast({
      title: `${xpData.levelUp ? 'Level Up!' : `+${xpData.amount} XP`}`,
      description: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {xpData.reason || 'Experience points awarded'}
          </p>
          
          <div className="relative pt-2">
            <div className="flex justify-between text-xs mb-1">
              <span>{xpData.fromValue} XP</span>
              <span>{xpData.maxValue} XP</span>
            </div>
            <XpProgressBar 
              fromValue={xpData.fromValue} 
              toValue={xpData.toValue} 
              maxValue={xpData.maxValue} 
            />
            {xpData.levelUp && (
              <div className="mt-2 text-xs font-semibold text-primary animate-pulse">
                Congratulations on reaching a new level!
              </div>
            )}
          </div>
        </div>
      ),
      duration: 5000, // Show for 5 seconds
    });
  }, [toast]);

  return (
    <XpContext.Provider value={{ awardXp }}>
      {children}
    </XpContext.Provider>
  );
};

// Animation component for XP progress
const XpProgressBar: React.FC<{ 
  fromValue: number;
  toValue: number;
  maxValue: number;
}> = ({ fromValue, toValue, maxValue }) => {
  const [progress, setProgress] = useState(Math.floor((fromValue / maxValue) * 100));
  const targetProgress = Math.floor((toValue / maxValue) * 100);
  
  // Animate the progress bar
  React.useEffect(() => {
    let startValue = progress;
    const endValue = targetProgress;
    let startTime: number | null = null;
    const duration = 2000; // 2 seconds
    
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Calculate the new value using easeOutQuad
      const easeOutQuad = (t: number) => t * (2 - t);
      const newProgress = startValue + (endValue - startValue) * easeOutQuad(progress);
      
      setProgress(Math.floor(newProgress));
      
      if (elapsed < duration) {
        requestAnimationFrame(step);
      }
    };
    
    const animationId = requestAnimationFrame(step);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [targetProgress]);
  
  return (
    <Progress 
      value={progress} 
      className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-primary/50 [&>div]:to-primary"
    />
  );
};

// Custom hook to use XP context
export function useXp() {
  const context = useContext(XpContext);
  
  if (context === undefined) {
    throw new Error('useXp must be used within an XpProvider');
  }
  
  return context;
}