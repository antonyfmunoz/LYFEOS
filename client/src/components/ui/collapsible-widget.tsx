import { useState, ReactNode, useRef } from "react";
import { ChevronRight, GripVertical, MoreHorizontal, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

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
  id?: string;
  index?: number;
  moveWidget?: (dragIndex: number, hoverIndex: number) => void;
}

const ItemTypes = {
  WIDGET: 'widget',
};

function DraggableCollapsibleWidget({ 
  title, 
  icon, 
  children, 
  className = "",
  defaultOpen = true,
  id,
  index,
  moveWidget
}: CollapsibleWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  
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

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.WIDGET,
    item: { id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.WIDGET,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: any, monitor) {
      if (!ref.current || !moveWidget) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index || 0;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      if (
        (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) ||
        (dragIndex > hoverIndex && hoverClientY > hoverMiddleY)
      ) {
        return;
      }

      // Time to actually perform the action
      moveWidget(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      item.index = hoverIndex;
    },
  });

  // Set up refs for dragging
  if (dragHandleRef.current) {
    drag(dragHandleRef);
  }
  
  // Connect drop to the whole widget and set it as the preview
  drop(ref);
  preview(ref);

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
          <div ref={dragHandleRef} onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
          </div>
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
          <button 
            className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? <ChevronRight className="h-5 w-5 rotate-90" /> : <ChevronRight className="h-5 w-5" />}
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

function StaticCollapsibleWidget({ 
  title, 
  icon, 
  children, 
  className = "",
  defaultOpen = true
}: Omit<CollapsibleWidgetProps, 'id' | 'index' | 'moveWidget'>) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
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
    <div 
      ref={ref}
      className={cn(
        "glassmorphic rounded-xl neon-border overflow-hidden", 
        className
      )}
    >
      <div 
        className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <div onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
          </div>
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
          <button 
            className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? <ChevronRight className="h-5 w-5 rotate-90" /> : <ChevronRight className="h-5 w-5" />}
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

export function CollapsibleWidget(props: CollapsibleWidgetProps) {
  // If the component has drag and drop props, use the draggable version within a DndProvider
  if (props.moveWidget && props.id !== undefined && props.index !== undefined) {
    // Check if we're already in a DndProvider context
    let alreadyHasDndContext = false;
    try {
      // This will throw if we're not in a DndProvider
      if ((window as any).__REACT_DND_CONTEXT_INSTANCE__) {
        alreadyHasDndContext = true;
      }
    } catch (e) {
      alreadyHasDndContext = false;
    }

    if (alreadyHasDndContext) {
      return <DraggableCollapsibleWidget {...props} />;
    } else {
      return (
        <DndProvider backend={HTML5Backend}>
          <DraggableCollapsibleWidget {...props} />
        </DndProvider>
      );
    }
  }
  
  // Otherwise, use the static version
  return <StaticCollapsibleWidget {...props} />;
}