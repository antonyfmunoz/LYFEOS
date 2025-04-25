import { useState, useCallback, useRef } from "react";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { Calendar, Clipboard, Contact2, FileSpreadsheet, Paintbrush, Network, FileText, FileCheck, ChevronRight, GripVertical, MoreHorizontal, Copy, BarChart4 } from "lucide-react";
import { Link } from "wouter";
import { KanbanWidget } from "@/components/ui/kanban-widget";
import { RolodexWidget } from "@/components/ui/rolodex-widget";
import { SpreadsheetWidget } from "@/components/ui/spreadsheet-widget";
import { CanvasWidget } from "@/components/ui/canvas-widget";
import { GraphWidget } from "@/components/ui/graph-widget";
import DocumentsWidget from "@/components/ui/documents-widget";
import TemplatesWidget from "@/components/ui/templates-widget";
import ProgressTrackersWidget from "@/components/ui/progress-trackers-widget";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import update from 'immutability-helper';
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ItemTypes = {
  WIDGET: 'widget',
};

// Define widget data structure
interface WidgetData {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen?: boolean;
}

interface DraggableWidgetProps {
  id: string;
  index: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  moveWidget: (dragIndex: number, hoverIndex: number) => void;
}

function DraggableWidget({ 
  id, 
  index,
  title, 
  icon, 
  children, 
  defaultOpen = true,
  moveWidget
}: DraggableWidgetProps) {
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
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;

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
        "glassmorphic rounded-xl neon-border overflow-hidden", 
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

export default function SystemsPage() {
  // Define initial widgets with unique IDs
  const [widgets, setWidgets] = useState<WidgetData[]>([
    {
      id: uuidv4(),
      title: "Calendar",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      content: (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-primary" />
              Calendar
            </div>
            <Link to="/calendar" className="h-7 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md flex items-center hover:shadow-[0_0_5px_var(--primary-glow-light)] border border-primary/50 transition-shadow">
              View Calendar
              <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-xs text-center text-muted-foreground font-medium">
                  {day}
                </div>
              ))}
              
              {Array.from({ length: 31 }, (_, i) => {
                const isToday = i + 1 === new Date().getDate();
                const hasEvent = [3, 8, 12, 15, 23, 27].includes(i + 1);
                
                return (
                  <div 
                    key={i} 
                    className={`text-xs rounded-full aspect-square flex items-center justify-center 
                      ${isToday ? 'bg-primary text-background' : hasEvent ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
            
            <div className="border-t border-primary/20 pt-3">
              <p className="text-xs text-muted-foreground mb-2">UPCOMING</p>
              <div className="space-y-2">
                <div className="flex items-center">
                  <div className="w-1 h-6 bg-primary rounded-full mr-2"></div>
                  <p className="text-sm">Strategy Meeting <span className="text-xs text-muted-foreground">• Today, 9:00 AM</span></p>
                </div>
                <div className="flex items-center">
                  <div className="w-1 h-6 bg-secondary rounded-full mr-2"></div>
                  <p className="text-sm">Project Review <span className="text-xs text-muted-foreground">• Today, 11:30 AM</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Boards",
      icon: <Clipboard className="h-5 w-5 text-primary" />,
      content: <KanbanWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Rolodex",
      icon: <Contact2 className="h-5 w-5 text-primary" />,
      content: <RolodexWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Spreadsheets",
      icon: <FileSpreadsheet className="h-5 w-5 text-primary" />,
      content: <SpreadsheetWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Canvas",
      icon: <Paintbrush className="h-5 w-5 text-primary" />,
      content: <CanvasWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Knowledge Graph",
      icon: <Network className="h-5 w-5 text-primary" />,
      content: <GraphWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Documents",
      icon: <FileText className="h-5 w-5 text-primary" />,
      content: <DocumentsWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Templates",
      icon: <FileCheck className="h-5 w-5 text-primary" />,
      content: <TemplatesWidget />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Progress Trackers",
      icon: <BarChart4 className="h-5 w-5 text-primary" />,
      content: <ProgressTrackersWidget />,
      defaultOpen: true
    },
  ]);

  // Callback for widget drag and drop reordering
  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgets((prevWidgets) => 
      update(prevWidgets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevWidgets[dragIndex]],
        ],
      })
    );
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Systems</h1>
        <p className="text-[#7DAAB2]">Manage your personal operating system settings and view analytics.</p>
      </div>
      
      {widgets.map((widget, index) => (
        <section key={widget.id} className="mb-6">
          <DraggableWidget
            id={widget.id}
            index={index}
            title={widget.title}
            icon={widget.icon}
            defaultOpen={widget.defaultOpen}
            moveWidget={moveWidget}
          >
            {widget.content}
          </DraggableWidget>
        </section>
      ))}
    </DndProvider>
  );
}
