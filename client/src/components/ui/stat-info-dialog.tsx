import React, { useState } from "react";
import { Link } from "wouter";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Create a custom styled dialog specifically for stat information
interface StatInfoDialogProps {
  children?: React.ReactNode;
  trigger: React.ReactNode;
  title: string;
  description: string;
  additionalInfo?: string;
  statType?: "attention" | "time" | "energy" | "health" | "experience" | "streak" | "efficiency";
  hideMoreDetails?: boolean;
}

export function StatInfoDialog({
  children,
  trigger,
  title,
  description,
  additionalInfo,
  statType = "time",
  hideMoreDetails = false,
}: StatInfoDialogProps) {
  const [open, setOpen] = useState(false);
  
  // Map statType to the correct URL
  const getDetailUrl = () => {
    switch (statType) {
      case "attention":
        return "/attention";
      case "time":
        return "/time";
      case "energy":
        return "/energy";
      case "health":
        return "/health";
      case "experience":
        return "/experience";
      case "streak":
        return "/streak";
      case "efficiency":
        return "/efficiency";
      default:
        return "/dashboard";
    }
  };
  
  if (!open) {
    return (
      <div onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {trigger}
      </div>
    );
  }
  
  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99]"
        onClick={() => setOpen(false)}
      />
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-title-${statType}`}
        aria-describedby={`dialog-desc-${statType}`}
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[500px] w-[90%] z-[100]",
          "glassmorphic border border-primary/30 text-white shadow-lg rounded-xl p-6 pr-8",
          "animate-in fade-in-0 zoom-in-90 duration-100"
        )}
      >
        <button 
          onClick={() => setOpen(false)}
          className="absolute right-2 top-2 rounded-md p-1 text-primary/70 transition-opacity hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="grid gap-1">
          <h3 
            id={`dialog-title-${statType}`}
            className="text-lg font-bold text-primary tracking-wide font-orbitron"
          >
            {title}
          </h3>
          
          <div 
            id={`dialog-desc-${statType}`}
            className="text-sm opacity-90 text-foreground mt-2"
          >
            <p className="leading-relaxed">{description}</p>
            {additionalInfo && (
              <p className="text-sm text-primary/70 italic mt-3">{additionalInfo}</p>
            )}
            {children}
          </div>
        </div>
        
        {!hideMoreDetails && (
          <div className="mt-6 flex justify-end">
            <Link href={getDetailUrl()} className={cn(
                "inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
                "ring-offset-background transition-colors text-primary",
                "border border-primary/30 hover:bg-primary/5",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              )}>
                <ExternalLink size={14} className="mr-2" /> More Details
            </Link>
          </div>
        )}
      </div>
    </>
  );
}