import React from 'react';
import { CalendarClock, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

const TimelineWidget = () => {
  const [, navigate] = useLocation();
  
  const navigateToFullTimeline = () => {
    // Navigate to the timeline view page with correct path (with an 'i')
    navigate('/chronilog/timeline');
  };

  return (
    <div 
      className={cn(
        "glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer"
      )}
      onClick={navigateToFullTimeline}
    >
      <div className="flex items-center mb-3">
        <div className="cursor-move mr-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mr-4">
          <span className="material-icons text-2xl text-primary">history</span>
        </div>
        <div>
          <h3 className="text-lg font-orbitron text-[#D6F4FF]">Timeline</h3>
          <p className="text-xs text-[#7DAAB2]">Your journey through time</p>
        </div>
      </div>
      
      <div className="flex justify-end mt-4">
        <button 
          className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-opacity-20 transition"
          onClick={(e) => {
            e.stopPropagation(); // Prevent the parent div's onClick from firing
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