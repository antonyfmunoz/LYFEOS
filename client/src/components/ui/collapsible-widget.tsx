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
    <div className={cn("rounded-md overflow-hidden", className)}>
      <div 
        className="p-3 flex items-center justify-between cursor-pointer bg-[#001a25] text-white border-b border-[#36F1CD]/20 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          {icon && <div className="mr-2 text-[#36F1CD]">{icon}</div>}
          <h2 className="text-lg font-orbitron text-white">{title}</h2>
        </div>
        <button className="text-[#36F1CD] transition-colors p-1 rounded-full">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      </div>
      
      <div className={`transition-all duration-300 ${isOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}