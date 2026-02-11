import { useState, ReactNode, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useDrag, useDrop } from 'react-dnd';
import type { Identifier } from 'dnd-core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type DragItem = {
  index: number;
  id: string;
  type: string;
};

interface CollapsibleWidgetProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  isOpenProp?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
  index?: number;
  moveWidget?: (dragIndex: number, hoverIndex: number) => void;
}

export function CollapsibleWidget({ 
  title, 
  icon, 
  children, 
  className = "",
  defaultOpen = true,
  isOpenProp,
  onOpenChange,
  id,
  index,
  moveWidget
}: CollapsibleWidgetProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp : localOpen;
  const setIsOpen = (val: boolean) => {
    if (!isControlled) setLocalOpen(val);
    onOpenChange?.(val);
  };
  const ref = useRef<HTMLDivElement>(null);
  
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
      .catch(() => {
        toast({
          title: "Failed to Copy",
          description: "Could not copy widget name to clipboard",
          variant: "destructive",
          duration: 2000,
        });
      });
  };

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'WIDGET',
    item: () => ({ id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: !!moveWidget,
  });

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: 'WIDGET',
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current || !moveWidget) {
        return;
      }

      const dragIndex = item.index;
      const hoverIndex = index ?? 0;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = (clientOffset?.y ?? 0) - hoverBoundingRect.top;

      if (
        (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) ||
        (dragIndex > hoverIndex && hoverClientY > hoverMiddleY)
      ) {
        return;
      }

      moveWidget(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const dragHandleRef = useCallback((node: HTMLDivElement | null) => {
    drag(node);
  }, [drag]);

  dragPreview(drop(ref));

  return (
    <div 
      ref={ref}
      className={cn(
        "glassmorphic rounded-xl neon-border overflow-hidden", 
        className,
        isDragging && "opacity-50"
      )}
      data-handler-id={handlerId}
    >
      <div 
        className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          {moveWidget && (
            <div ref={dragHandleRef} onClick={(e) => e.stopPropagation()}>
              <GripVertical className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
            </div>
          )}
          {icon && <div className="mr-2">{icon}</div>}
          <h2 className="text-lg font-orbitron text-foreground">{title}</h2>
        </div>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 hover:bg-primary hover:text-background mr-1"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background text-xs"
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
