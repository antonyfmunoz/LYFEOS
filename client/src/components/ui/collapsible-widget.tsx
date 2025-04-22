import { useState, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleWidgetProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

export function CollapsibleWidget({ 
  title, 
  icon, 
  children, 
  className = "",
  defaultOpen = true
}: CollapsibleWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("glassmorphic rounded-xl neon-border overflow-hidden", className)}>
      <div 
        className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          {icon && <div className="mr-2">{icon}</div>}
          <h2 className="text-lg font-orbitron text-foreground">{title}</h2>
        </div>
        <button className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      </div>
      
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className={`p-4 ${isOpen ? '' : 'hidden'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}