import React from "react";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import {
  Dialog as BaseDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Create a custom styled dialog specifically for stat information
interface StatInfoDialogProps {
  children?: React.ReactNode;
  trigger: React.ReactNode;
  title: string;
  titleColor?: string;
  description: string;
  additionalInfo?: string;
  statType?: "time" | "energy" | "health" | "experience";
}

export function StatInfoDialog({
  children,
  trigger,
  title,
  titleColor = "text-primary",
  description,
  additionalInfo,
  statType = "time",
}: StatInfoDialogProps) {
  // Map statType to the correct URL
  const getDetailUrl = () => {
    switch (statType) {
      case "time":
        return "/stat/time";
      case "energy":
        return "/stat/energy";
      case "health":
        return "/stat/health";
      case "experience":
        return "/stat/experience";
      default:
        return "/stats";
    }
  };
  
  return (
    <BaseDialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="backdrop-blur-lg bg-black/80 border border-primary/30 text-white shadow-lg shadow-primary/20 max-w-md">
        <DialogHeader>
          <DialogTitle className={cn("font-orbitron text-lg", titleColor)}>
            {title}
          </DialogTitle>
          <DialogDescription className="text-[#D6F4FF] pt-4">
            <div className="space-y-4">
              <div className="leading-relaxed">{description}</div>
              {additionalInfo && (
                <div className="text-sm text-[#7DAAB2] italic">{additionalInfo}</div>
              )}
              {children}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Link href={getDetailUrl()}>
            <button className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary font-medium transition-colors px-3 py-2 rounded-md text-sm">
              <ExternalLink size={14} /> More Details
            </button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </BaseDialog>
  );
}