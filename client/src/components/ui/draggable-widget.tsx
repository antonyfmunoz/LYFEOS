import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, GripVertical, Info } from 'lucide-react';
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";

export interface DraggableWidgetProps {
  id: string;
  index: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isOpenProp?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  moveWidget: (dragIndex: number, hoverIndex: number) => void;
  infoTitle?: string;
  infoDescription?: string;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

export function DraggableWidget({ 
  id, 
  index, 
  title, 
  icon, 
  children, 
  defaultOpen = true,
  isOpenProp,
  onOpenChange,
  className,
  moveWidget,
  infoTitle,
  infoDescription
}: DraggableWidgetProps) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp : localOpen;
  const setIsOpen = (val: boolean) => {
    if (!isControlled) setLocalOpen(val);
    onOpenChange?.(val);
  };
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop({
    accept: 'WIDGET',
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

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

      // Get pixels to the top
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // Time to actually perform the action
      moveWidget(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: 'WIDGET',
    item: () => ({ id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Connect drag preview to the entire widget
  preview(drop(ref));
  
  // Connect drag handle to the grip icon
  if (dragHandleRef.current) {
    drag(dragHandleRef);
  }

  return (
    <div 
      ref={ref}
      className={cn(
        "glassmorphic rounded-xl neon-border overflow-hidden mb-6", 
        isDragging && "opacity-50",
        className
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
          {infoDescription && (
            <div onClick={(e) => e.stopPropagation()} className="ml-2">
              <StatInfoDialog
                trigger={
                  <button className="h-5 w-5 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors">
                    <Info className="h-3 w-3 text-primary" />
                  </button>
                }
                title={infoTitle || title}
                description={infoDescription}
                hideMoreDetails
              />
            </div>
          )}
        </div>
        <div className="text-primary">
          {isOpen ? (
            <ChevronUp size={20} />
          ) : (
            <ChevronDown size={20} />
          )}
        </div>
      </div>
      
      {isOpen && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}