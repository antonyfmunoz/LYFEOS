import React, { useState } from "react";
import { Clock, X, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { CalendarEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface MissionInfoDialogProps {
  children?: React.ReactNode;
  trigger: React.ReactNode;
  mission: CalendarEvent;
}

export function MissionInfoDialog({
  children,
  trigger,
  mission,
}: MissionInfoDialogProps) {
  const [open, setOpen] = useState(false);
  
  // Map category to border color
  const getBorderColor = () => {
    switch (mission.category) {
      case "work":
        return "border-blue-500";
      case "health":
        return "border-red-500";
      case "personal":
        return "border-purple-500";
      default:
        return "border-primary";
    }
  };
  
  const getCategoryText = () => {
    switch (mission.category) {
      case "work":
        return "Work Mission";
      case "health":
        return "Health Mission";
      case "personal":
        return "Personal Mission";
      default:
        return "Mission";
    }
  };
  
  const getCategoryColor = () => {
    switch (mission.category) {
      case "work":
        return "text-blue-400";
      case "health":
        return "text-red-400";
      case "personal":
        return "text-purple-400";
      default:
        return "text-primary";
    }
  };
  
  const getLocationName = () => {
    switch (mission.category) {
      case "work":
        return "Conference Room 3";
      case "health":
        return "Gym";
      case "personal":
        return "Virtual";
      default:
        return "Unknown";
    }
  };
  
  // If not open, show the trigger that will open the dialog
  if (!open) {
    return (
      <div onClick={(e) => { 
        e.stopPropagation();
        setOpen(true);
      }}>
        {trigger}
      </div>
    );
  }
  
  // When open, render the dialog
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99]"
        onClick={() => setOpen(false)}
      />
      
      {/* Dialog content */}
      <div 
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]",
          "max-w-[500px] w-[90%] p-6 pr-8 rounded-md",
          "border bg-[#001E26]/80 text-white shadow-lg backdrop-blur-lg",
          getBorderColor()
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Close button */}
        <button 
          onClick={() => setOpen(false)}
          className="absolute right-2 top-2 rounded-md p-1 text-white/70 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        
        {/* Title and content */}
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-white tracking-wide font-orbitron">
            {mission.title}
          </h3>
          
          <p className={cn("text-sm opacity-90", getCategoryColor())}>
            {getCategoryText()}
          </p>
          
          <div className="mt-4 space-y-4">
            {/* Time info */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono">{mission.startTime}</span>
              </div>
              <span className="text-sm text-muted-foreground">Duration: {mission.duration}</span>
            </div>
            
            {/* Description */}
            <div className="bg-primary/5 p-4 rounded-md">
              <h4 className="text-sm font-semibold mb-2">Description</h4>
              <p className="text-sm leading-relaxed text-gray-200">
                {mission.description || "Complete this mission to earn XP and progress through your daily goals."}
              </p>
            </div>
            
            {/* Location */}
            <div className="bg-primary/5 p-4 rounded-md">
              <h4 className="text-sm font-semibold mb-2">Location</h4>
              <p className="text-sm leading-relaxed text-gray-200">
                {getLocationName()}
              </p>
            </div>
            
            {/* Rewards section */}
            <div className="flex justify-between bg-primary/5 p-4 rounded-md">
              <div>
                <h4 className="text-sm font-semibold mb-2">Energy Cost</h4>
                <p className="text-sm leading-relaxed text-primary font-mono">-5 ET</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">XP Reward</h4>
                <p className="text-sm leading-relaxed text-primary font-mono">+15 XP</p>
              </div>
            </div>
            
            {children}
          </div>
        </div>
        
        {/* Action button */}
        <div className="mt-6 flex justify-end">
          <Link href={`/mission/${mission.id}`} onClick={() => setOpen(false)}>
            <Button
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
                "ring-offset-background transition-colors",
                "border border-white/10 hover:bg-white/5",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2",
                mission.category === "work" ? "text-blue-400" : 
                mission.category === "health" ? "text-red-400" : 
                mission.category === "personal" ? "text-purple-400" : 
                "text-primary"
              )}
            >
              <ExternalLink size={14} className="mr-2" /> More Details
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}