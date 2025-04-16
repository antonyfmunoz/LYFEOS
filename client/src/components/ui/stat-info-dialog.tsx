import React from "react";
import {
  Dialog as BaseDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
}

export function StatInfoDialog({
  children,
  trigger,
  title,
  titleColor = "text-primary",
  description,
  additionalInfo,
}: StatInfoDialogProps) {
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
              <p className="leading-relaxed">{description}</p>
              {additionalInfo && (
                <p className="text-sm text-[#7DAAB2] italic">{additionalInfo}</p>
              )}
              {children}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </BaseDialog>
  );
}