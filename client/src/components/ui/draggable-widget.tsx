import { useState, useRef, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { Identifier } from 'dnd-core';
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
  headerActions?: React.ReactNode;
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
  infoDescription,
  headerActions
}: DraggableWidgetProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp : localOpen;
  const setIsOpen = (val: boolean) => {
    if (!isControlled) setLocalOpen(val);
    onOpenChange?.(val);
  };
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: 'WIDGET',
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveWidget(dragIndex, hoverIndex);
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

  const dragHandleRef = useCallback((node: HTMLDivElement | null) => {
    drag(node);
  }, [drag]);

  preview(drop(ref));

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
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title={infoTitle || title}
                description={infoDescription}
                hideMoreDetails
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {headerActions && (
            <div onClick={(e) => e.stopPropagation()}>
              {headerActions}
            </div>
          )}
          <div className="text-primary">
            {isOpen ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </div>
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
