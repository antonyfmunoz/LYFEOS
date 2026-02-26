import { Link, useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { FileText, Clock, Tag, Calendar, Award, GripVertical, CheckSquare, BookOpen, GraduationCap, Target, Info, BarChart3, Users, FolderOpen } from "lucide-react";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";
import { useDrag, useDrop } from 'react-dnd';
import { useState, useCallback, useRef, useEffect } from 'react';
import PageTutorial, { TutorialStep } from '@/components/ui/PageTutorial';
import { useTutorialStatus } from '@/hooks/use-tutorial';
import update from 'immutability-helper';
import { cn } from '@/lib/utils';
import { DropTargetMonitor } from 'react-dnd';
import TimelineWidget from '@/components/chronilog/TimelineWidget';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

// Define DraggableCategoryItem component
interface CategoryItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
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
      navigate('/journal-log');
    } else if (item.id === "missions") {
      navigate('/mission-log');
    } else if (item.id === "knowledge") {
      navigate('/knowledge-vault');
    } else if (item.id === "goals") {
      navigate('/goals-archive');
    } else if (item.id === "analytics") {
      navigate('/tracker');
    } else if (item.id === "rolodex") {
      navigate('/rolodex');
    } else if (item.id === "document-vault") {
      navigate('/document-vault');
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
        "glassmorphic rounded-xl neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer",
        isDragging && "opacity-50"
      )}
      onClick={navigateToArchive}
      data-handler-id={handlerId}
      data-tour={`chronilog-${id}`}
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center">
          <div ref={dragHandleRef} className="cursor-move" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4 mr-2 text-muted-foreground" />
          </div>
          <div className="mr-2">{item.icon}</div>
          <h3 className="text-lg font-orbitron text-foreground">{item.title}</h3>
          <div onClick={(e) => e.stopPropagation()} className="ml-2">
            <StatInfoDialog
              trigger={
                <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              }
              title={item.title}
              description={item.description}
              hideMoreDetails
            />
          </div>
        </div>
        <button 
          className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          onClick={handleButtonClick}
        >
          OPEN
        </button>
      </div>
    </div>
  );
};

interface DraggableTimelineProps {
  id: string;
  index: number;
  moveCategory: (dragIndex: number, hoverIndex: number) => void;
}

const DraggableTimelineWrapper = ({ id, index, moveCategory }: DraggableTimelineProps) => {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: string | symbol | null }>({
    accept: 'CATEGORY',
    collect(monitor: DropTargetMonitor) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item: DragItem, monitor: DropTargetMonitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      moveCategory(dragIndex, hoverIndex);
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

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={cn("relative", isDragging && "opacity-50")}
      data-handler-id={handlerId}
      data-tour="chronilog-timeline"
    >
      <TimelineWidget />
    </div>
  );
};

export default function ChronilogPage() {
  usePageTitle('Chronilog');
  
  const { missionPages } = useLYFEOS();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  const [categories, setCategories] = useState<CategoryItem[]>([
    { 
      id: "missions", 
      title: "Missions Log", 
      icon: <CheckSquare className="h-5 w-5 text-primary" />,
      description: "A detailed history of all your completed and active missions. Track your progress and revisit past achievements."
    },
    { 
      id: "journal", 
      title: "Journal", 
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      description: "Your daily reflections, thoughts, and personal entries. Review past journal logs to track your growth over time."
    },
    { 
      id: "knowledge", 
      title: "Knowledge Base", 
      icon: <GraduationCap className="h-5 w-5 text-primary" />,
      description: "Your personal library of notes, documents, and saved knowledge. Store and organize information for easy retrieval."
    },
    { 
      id: "goals", 
      title: "Vision", 
      icon: <Target className="h-5 w-5 text-primary" />,
      description: "Long-term goals and vision board. Set objectives, track mission objectives, and align your daily actions with your bigger picture."
    },
    { 
      id: "timeline", 
      title: "Timeline", 
      icon: <Clock className="h-5 w-5 text-primary" />,
      description: "Your recent activity timeline showing missions, journal entries, and mission objectives."
    },
    { 
      id: "analytics", 
      title: "Tracker", 
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      description: "Visualize your progress with mood trends, XP progression, mission completion rates, and performance insights over time."
    },
    { 
      id: "rolodex", 
      title: "Rolodex", 
      icon: <Users className="h-5 w-5 text-primary" />,
      description: "Flip through your contacts like a classic rolodex. Favorites are pinned to the front with search and filter."
    },
    { 
      id: "document-vault", 
      title: "Document Vault", 
      icon: <FolderOpen className="h-5 w-5 text-primary" />,
      description: "Create, edit, and organize documents in folders. Your personal doc editor and file organizer."
    }
  ]);

  const { data: widgetLayouts } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/widget-layouts'],
    enabled: !!user,
  });

  useEffect(() => {
    if (!widgetLayouts?.chronilog) return;
    const savedOrder = widgetLayouts.chronilog;
    setCategories(prev => {
      const ordered: CategoryItem[] = [];
      for (const id of savedOrder) {
        const cat = prev.find(c => c.id === id);
        if (cat) ordered.push(cat);
      }
      for (const cat of prev) {
        if (!ordered.find(c => c.id === cat.id)) ordered.push(cat);
      }
      if (ordered.every((c, i) => c.id === prev[i]?.id)) return prev;
      return ordered;
    });
  }, [widgetLayouts]);

  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const moveCategory = useCallback((dragIndex: number, hoverIndex: number) => {
    const prevCategories = categoriesRef.current;
    const newCategories = update(prevCategories, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, prevCategories[dragIndex]],
      ],
    });
    setCategories(newCategories);
    categoriesRef.current = newCategories;
    const newOrder = newCategories.map(c => c.id);
    apiRequest('/api/widget-layouts', {
      method: 'PUT',
      body: JSON.stringify({ page: 'chronilog', order: newOrder }),
    }).catch(() => {});
    queryClient.setQueryData<Record<string, string[]>>(['/api/widget-layouts'], (old) => ({
      ...old,
      chronilog: newOrder,
    }));
  }, []);

  const CHRONILOG_TOUR_STEPS: TutorialStep[] = [
    {
      target: "[data-tour='chronilog-header']",
      title: "Your Chronilog",
      description: "The Chronilog is your personal journal and knowledge hub. It stores everything you log on the Dashboard — thoughts, research, reflections, and more.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-missions']",
      title: "Missions Log",
      description: "A detailed history of all your completed and active missions. Track your progress and revisit past achievements.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-journal']",
      title: "Journal",
      description: "Your daily reflections, thoughts, and personal entries. Review past journal logs to track your growth over time.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-knowledge']",
      title: "Knowledge Base",
      description: "Your personal library of notes, documents, and saved knowledge. Store and organize information for easy retrieval.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-goals']",
      title: "Vision",
      description: "Long-term goals and vision board. Set objectives, track mission objectives, and align your daily actions with your bigger picture.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-analytics']",
      title: "Tracker",
      description: "Visualize your progress with mood trends, XP progression, mission completion rates, and performance insights over time.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-timeline']",
      title: "Timeline",
      description: "Your recent activity feed showing missions completed, journal entries, and mission objectives — all in chronological order.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-rolodex']",
      title: "Rolodex",
      description: "Flip through your contacts like a classic rolodex. Favorites are pinned to the front for quick access.",
      position: "bottom",
    },
    {
      target: "[data-tour='chronilog-document-vault']",
      title: "Document Vault",
      description: "Create, edit, and organize documents in folders. Your personal doc editor and file organizer — link documents to missions for quick access.",
      position: "bottom",
    },
  ];

  const { showTutorial, markComplete: handleTutorialComplete, skipAll: handleSkipAllTutorials, isLoading: isTutorialLoading } = useTutorialStatus("chronilog");

  return (
      <div className="pb-20">
        <PageTutorial steps={CHRONILOG_TOUR_STEPS} storageKey="chronilog" isOpen={showTutorial} onComplete={handleTutorialComplete} onSkipAll={handleSkipAllTutorials} userId={user?.id} isLoading={isTutorialLoading} />
        <div className={cn("mb-6", isTutorialLoading && "invisible")} data-tour="chronilog-header">
          <h1 className="text-2xl font-orbitron mb-1">Chronilog</h1>
          <p className="text-muted-foreground">Your personal timeline of knowledge, reflections, and growth logs.</p>
        </div>
        
        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6", isTutorialLoading && "invisible")} data-tour="chronilog-categories">
          {categories.map((category, index) => (
            category.id === 'timeline' ? (
              <DraggableTimelineWrapper
                key="timeline"
                id="timeline"
                index={index}
                moveCategory={moveCategory}
              />
            ) : (
              <DraggableCategoryCard
                key={category.id}
                id={category.id}
                index={index}
                item={category}
                moveCategory={moveCategory}
                navigate={navigate}
              />
            )
          ))}
        </div>
      </div>
  );
}