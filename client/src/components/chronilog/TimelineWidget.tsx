import React from 'react';
import { Clock, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

const TimelineWidget = () => {
  const [, navigate] = useLocation();
  
  const navigateToFullTimeline = () => {
    navigate('/chronilog/timeline');
  };

  return (
    <div 
      className={cn(
        "glassmorphic rounded-xl neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer mb-6"
      )}
      onClick={navigateToFullTimeline}
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center">
          <div className="cursor-move">
            <GripVertical className="h-4 w-4 mr-2 text-muted-foreground" />
          </div>
          <div className="mr-2">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-orbitron text-foreground">Timeline</h3>
        </div>
        <button 
          className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            navigateToFullTimeline();
          }}
        >
          OPEN
        </button>
      </div>
    </div>
  );
};

export default TimelineWidget;