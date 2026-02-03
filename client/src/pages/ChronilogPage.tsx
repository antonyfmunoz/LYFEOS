import { Link, useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { FileText, Clock, Tag, Calendar, Award, GripVertical } from "lucide-react";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useState, useCallback, useRef } from 'react';
import update from 'immutability-helper';
import { cn } from '@/lib/utils';
import { DropTargetMonitor } from 'react-dnd';
import TimelineWidget from '@/components/chronilog/TimelineWidget';

// Define DraggableCategoryItem component
interface CategoryItem {
  id: string;
  title: string;
  icon: string;
  description: string;
  color: string;
}

interface DraggableCategoryProps {
  id: string;
  index: number;
  item: CategoryItem;
  moveCategory: (dragIndex: number, hoverIndex: number) => void;
  navigate: (path: string) => void;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const DraggableCategoryCard = ({ id, index, item, moveCategory, navigate }: DraggableCategoryProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: string | symbol | null }>({
    accept: 'CATEGORY',
    collect(monitor: DropTargetMonitor) {
      return {
        handlerId: monitor.getHandlerId(),
      }
    },
    hover(item: DragItem, monitor: DropTargetMonitor) {
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
      moveCategory(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag<
    { id: string; index: number },
    void,
    { isDragging: boolean }
  >({
    type: 'CATEGORY',
    item: () => ({ id, index }),
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Connect drag preview to the entire category
  preview(drop(ref));
  
  // Connect drag handle to the grip icon
  if (dragHandleRef.current) {
    drag(dragHandleRef);
  }

  const navigateToArchive = () => {
    if (item.id === "journal") {
      navigate('/journal-archive');
    } else if (item.id === "missions") {
      navigate('/mission-archive');
    } else if (item.id === "rituals") {
      navigate('/rituals-archive');
    } else if (item.id === "knowledge") {
      navigate('/knowledge-archive');
    } else if (item.id === "goals") {
      navigate('/goals-archive');
    }
  };
  
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the parent div's onClick from firing
    navigateToArchive();
  };

  return (
    <div 
      ref={ref}
      className={cn(
        "glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer",
        isDragging && "opacity-50"
      )}
      onClick={navigateToArchive}
      data-handler-id={handlerId}
    >
      <div className="flex items-center mb-3">
        <div ref={dragHandleRef} className="cursor-move mr-2" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
          item.color === 'primary' ? 'bg-primary/20' : 
          item.color === 'secondary' ? 'bg-secondary/20' : 
          item.color === 'accent' ? 'bg-accent/20' : 
          'bg-emerald-400/20'
        }`}>
          <span className={`material-icons text-2xl ${
            item.color === 'primary' ? 'text-primary' : 
            item.color === 'secondary' ? 'text-secondary' : 
            item.color === 'accent' ? 'text-accent' : 
            'text-emerald-400'
          }`}>{item.icon}</span>
        </div>
        <div>
          <h3 className="text-lg font-orbitron text-[#D6F4FF]">{item.title}</h3>
          <p className="text-xs text-[#7DAAB2]">{item.description}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button 
          className={`text-xs font-medium px-3 py-1 rounded-md ${
            item.color === 'primary' ? 'bg-primary/10 text-primary' : 
            item.color === 'secondary' ? 'bg-secondary/10 text-secondary' : 
            item.color === 'accent' ? 'bg-accent/10 text-accent' : 
            'bg-emerald-400/10 text-emerald-400'
          } hover:bg-opacity-20 transition`}
          onClick={handleButtonClick}
        >
          OPEN
        </button>
      </div>
    </div>
  );
};

export default function ChronilogPage() {
  // Set the page title
  usePageTitle('Chronilog');
  
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();
  
  const [categories, setCategories] = useState<CategoryItem[]>([
    { 
      id: "missions", 
      title: "Mission Archive", 
      icon: "task_alt",
      description: "Documentation of your completed and active missions",
      color: "cyan-400"
    },
    { 
      id: "journal", 
      title: "Journal", 
      icon: "auto_stories",
      description: "Personal reflections and daily entries",
      color: "primary"
    },
    { 
      id: "rituals", 
      title: "Rituals", 
      icon: "repeat",
      description: "Daily and weekly practices to maintain balance",
      color: "secondary"
    },
    { 
      id: "knowledge", 
      title: "Knowledge Base", 
      icon: "school",
      description: "Notes and learnings from books and courses",
      color: "accent"
    },
    { 
      id: "goals", 
      title: "Goals & Vision", 
      icon: "track_changes",
      description: "Long-term objectives and aspirations",
      color: "emerald-400"
    }
  ]);

  // Callback for category card drag and drop reordering
  const moveCategory = useCallback((dragIndex: number, hoverIndex: number) => {
    setCategories((prevCategories) => 
      update(prevCategories, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevCategories[dragIndex]],
        ],
      })
    );
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Chronilog</h1>
        <p className="text-[#7DAAB2]">Your personal timeline of knowledge, reflections, and growth logs.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {categories.map((category, index) => (
          <DraggableCategoryCard
            key={category.id}
            id={category.id}
            index={index}
            item={category}
            moveCategory={moveCategory}
            navigate={navigate}
          />
        ))}
      </div>
      
      {/* Timeline widget */}
      <div className="mt-8">
        <TimelineWidget />
      </div>
    </DndProvider>
  );
}