import React, { useState } from "react";
import { Link } from "wouter";
import { ExternalLink, X } from "lucide-react";
import {
  Dialog as BaseDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose,
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
  const [open, setOpen] = useState(false);
  
  // Map statType to the correct URL
  const getDetailUrl = () => {
    switch (statType) {
      case "time":
        return "/time";
      case "energy":
        return "/energy";
      case "health":
        return "/health";
      case "experience":
        return "/experience";
      default:
        return "/dashboard";
    }
  };
  
  // Map statType to border color
  const getBorderColor = () => {
    switch (statType) {
      case "time":
        return "border-primary";
      case "energy":
        return "border-[#FCD34D]";
      case "health":
        return "border-[#EC4899]";
      case "experience":
        return "border-[#36F1CD]";
      default:
        return "border-primary";
    }
  };
  
  return (
    <BaseDialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99]" />
      )}
      <DialogContent 
        className={cn(
          "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[500px] w-[90%] z-[100]",
          "border bg-[#001E26]/80 text-white shadow-lg rounded-md p-6 pr-8",
          "backdrop-blur-lg data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:duration-100 data-[state=closed]:duration-100",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90",
          getBorderColor()
        )}
      >
        <DialogClose className="absolute right-2 top-2 rounded-md p-1 text-white/70 transition-opacity hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 group-hover:opacity-100">
          <X className="h-4 w-4" />
        </DialogClose>
        
        <div className="grid gap-1">
          <DialogTitle className={cn("text-lg font-bold text-white tracking-wide font-orbitron", titleColor)}>
            {title}
          </DialogTitle>
          
          <div className="text-sm opacity-90 text-gray-200 mt-2">
            <p className="leading-relaxed">{description}</p>
            {additionalInfo && (
              <p className="text-sm text-[#7DAAB2] italic mt-3">{additionalInfo}</p>
            )}
            {children}
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <Link href={getDetailUrl()}>
            <button className={cn(
              "inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
              "ring-offset-background transition-colors",
              "border border-white/10 hover:bg-white/5",
              "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2",
              statType === "time" ? "text-primary" : 
              statType === "energy" ? "text-[#FCD34D]" : 
              statType === "health" ? "text-[#EC4899]" : 
              "text-[#36F1CD]"
            )}>
              <ExternalLink size={14} className="mr-2" /> More Details
            </button>
          </Link>
        </div>
      </DialogContent>
    </BaseDialog>
  );
}