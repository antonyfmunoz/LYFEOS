import * as React from "react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";

interface DashboardWidgetProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
  className?: string;
  href: string;
  actionText?: string;
}

export function DashboardWidget({ 
  title,
  icon,
  description,
  className,
  href,
  actionText = "OPEN"
}: DashboardWidgetProps) {
  return (
    <Link href={href}>
      <div 
        className={cn(
          "glassmorphic rounded-xl p-6 border border-primary/30 relative cursor-pointer transition-all duration-300",
          "hover:border-primary/60 hover:shadow-[0_0_8px_var(--primary-glow-light,rgba(0,224,255,0.3))]", 
          className
        )}
      >
        <div className="flex items-start">
          {icon && (
            <div className="shrink-0 mr-4 p-2 bg-primary/10 rounded-full">
              {icon}
            </div>
          )}
          <div className="flex-grow">
            <h3 className="text-lg font-orbitron mb-1 dark:text-primary light:text-slate-700">{title}</h3>
            {description && (
              <p className="text-sm dark:text-primary/60 light:text-slate-500">{description}</p>
            )}
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center">
            <span className="text-xs font-bold tracking-wider text-primary mr-1">{actionText}</span>
            <ChevronRight className="h-4 w-4 text-primary" />
          </div>
        </div>
      </div>
    </Link>
  );
}