import { useState, ReactNode, useRef, useCallback, memo } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrag, useDrop } from 'react-dnd';
import type { Identifier } from 'dnd-core';

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
  acceptExternalDrop?: string;
  onExternalDrop?: (item: any) => void;
}

export const CollapsibleWidget = memo(function CollapsibleWidget({ 
  title, 
  icon, 
  children, 
  className = "",
  defaultOpen = true,
  isOpenProp,
  onOpenChange,
  id,
  index,
  moveWidget,
  acceptExternalDrop,
  onExternalDrop
}: CollapsibleWidgetProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp : localOpen;
  const setIsOpen = (val: boolean) => {
    if (!isControlled) setLocalOpen(val);
    onOpenChange?.(val);
  };
  const ref = useRef<HTMLDivElement>(null);

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

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyDropRef = useRef<HTMLDivElement>(null);
  const openedByDragRef = useRef(false);
  const [{ isOverHeader }, externalDrop] = useDrop({
    accept: acceptExternalDrop || '__none__',
    hover() {
      if (!isOpen && !openedByDragRef.current) {
        openedByDragRef.current = true;
        setIsOpen(true);
      }
    },
    drop(item: any, monitor) {
      openedByDragRef.current = false;
      if (monitor.didDrop()) return;
      onExternalDrop?.(item);
    },
    collect: (monitor) => ({
      isOverHeader: monitor.isOver({ shallow: true }),
    }),
  });
  const [{ isOverBody }, bodyExternalDrop] = useDrop({
    accept: acceptExternalDrop || '__none__',
    drop(item: any, monitor) {
      if (monitor.didDrop()) return;
      onExternalDrop?.(item);
    },
    collect: (monitor) => ({
      isOverBody: monitor.isOver({ shallow: true }),
    }),
  });
  if (!openedByDragRef.current && !isOpen) {
    openedByDragRef.current = false;
  }
  if (acceptExternalDrop) {
    externalDrop(headerRef);
    bodyExternalDrop(bodyDropRef);
  }

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
        ref={headerRef}
        className={cn(
          "p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors",
          isOverHeader && "bg-primary/10"
        )}
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
          <button className="text-primary/70 hover:text-primary transition-colors p-1 rounded-full hover:bg-primary/10">
            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>
      
      <div 
        ref={bodyDropRef}
        className={cn(
          `transition-all duration-300 ${isOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`,
          isOverBody && "bg-primary/5"
        )}
      >
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
});
