import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

// Define item types for drag and drop
export const ItemTypes = {
  WIDGET: 'widget',
};

export interface DraggableWidgetProps {
  id: string;
  index: number;
  moveWidget: (dragIndex: number, hoverIndex: number) => void;
  children: React.ReactNode;
  className?: string;
}

export function DraggableWidget({ 
  id, 
  index, 
  moveWidget, 
  children, 
  className 
}: DraggableWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  // Set up drop handling
  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.WIDGET,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: any, monitor) {
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
      const hoverClientY = clientOffset ? clientOffset.y - hoverBoundingRect.top : 0;
      
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
  
  // Set up drag handling
  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.WIDGET,
    item: () => {
      return { id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  drag(drop(ref));
  
  return (
    <div 
      ref={ref}
      className={cn(
        'relative transition-all duration-150 ease-in-out', 
        isDragging ? 'opacity-30' : 'opacity-100',
        className
      )}
      data-handler-id={handlerId}
    >
      <div className="absolute -left-4 top-1/2 transform -translate-y-1/2 cursor-move p-1 rounded-full hover:bg-primary/10 transition-colors opacity-50 hover:opacity-100 z-10">
        <GripVertical className="h-5 w-5 text-primary" />
      </div>
      {children}
    </div>
  );
}