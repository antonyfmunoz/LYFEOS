import React, { useState, useEffect } from 'react';
import { CornerDownRight, X, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface TooltipGuide {
  id: string;
  title: string;
  content: string;
  characterName?: string;
  characterIcon?: React.ReactNode;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  dismissible?: boolean;
  showOnce?: boolean;
  delay?: number;
  forceShow?: boolean;
}

interface GuideTooltipProps {
  guide: TooltipGuide;
  children: React.ReactNode;
  onDismiss?: (id: string) => void;
  onComplete?: (id: string) => void;
}

export function GuideTooltip({
  guide,
  children,
  onDismiss,
  onComplete
}: GuideTooltipProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  // Get tooltip view state from localStorage
  useEffect(() => {
    if (guide.showOnce) {
      const viewedTooltips = JSON.parse(localStorage.getItem('viewed_tooltips') || '{}');
      if (viewedTooltips[guide.id]) {
        setCompleted(true);
      }
    }
  }, [guide.id, guide.showOnce]);
  
  // Show tooltip with delay if specified
  useEffect(() => {
    if (!dismissed && !completed && guide.delay && !guide.forceShow) {
      const timer = setTimeout(() => {
        setOpen(true);
      }, guide.delay);
      return () => clearTimeout(timer);
    }
    
    if (guide.forceShow && !dismissed && !completed) {
      setOpen(true);
    }
  }, [guide.delay, guide.forceShow, dismissed, completed]);
  
  const handleDismiss = () => {
    setOpen(false);
    setDismissed(true);
    
    if (onDismiss) {
      onDismiss(guide.id);
    }
  };
  
  const handleComplete = () => {
    setOpen(false);
    setCompleted(true);
    
    if (guide.showOnce) {
      // Store in localStorage that this tooltip has been viewed
      const viewedTooltips = JSON.parse(localStorage.getItem('viewed_tooltips') || '{}');
      viewedTooltips[guide.id] = true;
      localStorage.setItem('viewed_tooltips', JSON.stringify(viewedTooltips));
    }
    
    if (onComplete) {
      onComplete(guide.id);
    }
  };
  
  // Don't render anything if the tooltip has been completed and should only show once
  if (completed && guide.showOnce) {
    return <>{children}</>;
  }
  
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen} delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="relative group">
            {children}
            {!open && !dismissed && !completed && (
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-primary rounded-full animate-pulse z-10" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side={guide.placement || 'top'} 
          className="max-w-md p-0 bg-[#001E26] border border-[#36F1CD]/50 shadow-lg shadow-[#36F1CD]/20"
          sideOffset={8}
        >
          <div className="flex flex-col w-full">
            <div className="flex justify-between items-center p-3 bg-[#36F1CD]/10 border-b border-[#36F1CD]/20">
              <div className="flex items-center gap-2">
                {guide.characterIcon || <MessageCircleQuestion className="h-5 w-5 text-primary" />}
                <h4 className="text-sm font-medium">
                  {guide.characterName ? `${guide.characterName}: ${guide.title}` : guide.title}
                </h4>
              </div>
              {guide.dismissible && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5 rounded-full"
                  onClick={handleDismiss}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="p-3 text-sm text-slate-300 space-y-2">
              <p>{guide.content}</p>
              
              <div className="flex justify-end pt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-xs h-7 bg-[#36F1CD]/10 border-[#36F1CD]/30 text-[#36F1CD] hover:bg-[#36F1CD]/20"
                  onClick={handleComplete}
                >
                  <CornerDownRight className="h-3 w-3 mr-1" />
                  Got it
                </Button>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Character-specific tooltips
export function NovaGuideTooltip(props: Omit<GuideTooltipProps, 'guide'> & { guide: Omit<TooltipGuide, 'characterName' | 'characterIcon'> }) {
  const guideWithCharacter: TooltipGuide = {
    ...props.guide,
    characterName: 'Nova',
    characterIcon: <span className="text-[#36F1CD] text-sm font-bold">N</span>,
  };
  
  return <GuideTooltip {...props} guide={guideWithCharacter} />;
}

export function SystemGuideTooltip(props: Omit<GuideTooltipProps, 'guide'> & { guide: Omit<TooltipGuide, 'characterName' | 'characterIcon'> }) {
  const guideWithCharacter: TooltipGuide = {
    ...props.guide,
    characterName: 'System',
    characterIcon: <span className="text-indigo-400 text-sm font-bold">S</span>,
  };
  
  return <GuideTooltip {...props} guide={guideWithCharacter} />;
}