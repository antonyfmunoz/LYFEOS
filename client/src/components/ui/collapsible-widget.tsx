import { useState, ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    navigator.clipboard.writeText(title)
      .then(() => {
        toast({
          title: "Widget Name Copied",
          description: `"${title}" copied to clipboard`,
          className: "bg-background/80 border border-primary text-foreground",
          duration: 2000,
        });
      })
      .catch(err => {
        toast({
          title: "Failed to Copy",
          description: "Could not copy widget name to clipboard",
          variant: "destructive",
          duration: 2000,
        });
      });
  };

  return (
    <div className={cn("glassmorphic rounded-xl neon-border overflow-hidden", className)}>
      <div 
        className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <GripVertical className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
          {icon && <div className="mr-2">{icon}</div>}
          <h2 className="text-lg font-orbitron text-foreground">{title}</h2>
        </div>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 hover:bg-yellow-400 hover:text-black mr-1"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="hover:bg-yellow-400 hover:text-black focus:bg-yellow-400 focus:text-black text-xs"
                onClick={handleCopy}
              >
                <Copy className="h-3 w-3 mr-2" />
                Copy Widget Name
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10">
            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>
      
      <div className={`transition-all duration-300 ${isOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}