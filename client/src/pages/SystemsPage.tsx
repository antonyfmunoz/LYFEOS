import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { DraggableWidget } from "@/components/ui/draggable-widget";
import { Calendar, Clipboard, Contact2, FileSpreadsheet, Paintbrush, Network, FileText, FileCheck, ChevronRight, Settings, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import { KanbanWidget } from "@/components/ui/kanban-widget";
import { RolodexWidget } from "@/components/ui/rolodex-widget";
import { SpreadsheetWidget } from "@/components/ui/spreadsheet-widget";
import { CanvasWidget } from "@/components/ui/canvas-widget";
import { GraphWidget } from "@/components/ui/graph-widget";
import DocumentsWidget from "@/components/ui/documents-widget";
import TemplatesWidget from "@/components/ui/templates-widget";
import { useWidgets } from "@/hooks/use-widgets";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Map widget types to their components
const widgetComponents: Record<string, {
  component: React.ReactNode;
  icon: React.ReactNode;
}> = {
  calendar: {
    icon: <Calendar className="h-5 w-5 text-primary" />,
    component: (
      <div className="space-y-3">
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
    )
  },
  kanban: {
    icon: <Clipboard className="h-5 w-5 text-primary" />,
    component: <KanbanWidget />
  },
  rolodex: {
    icon: <Contact2 className="h-5 w-5 text-primary" />,
    component: <RolodexWidget />
  },
  spreadsheets: {
    icon: <FileSpreadsheet className="h-5 w-5 text-primary" />,
    component: <SpreadsheetWidget />
  },
  canvas: {
    icon: <Paintbrush className="h-5 w-5 text-primary" />,
    component: <CanvasWidget />
  },
  graph: {
    icon: <Network className="h-5 w-5 text-primary" />,
    component: <GraphWidget />
  },
  documents: {
    icon: <FileText className="h-5 w-5 text-primary" />,
    component: <DocumentsWidget />
  },
  templates: {
    icon: <FileCheck className="h-5 w-5 text-primary" />,
    component: <TemplatesWidget />
  }
};

export default function SystemsPage() {
  const { widgets, moveWidget, resetWidgets } = useWidgets('system');
  const { toast } = useToast();

  const handleReset = () => {
    resetWidgets();
    toast({
      title: "Widgets Reset",
      description: "The widget layout has been reset to the default order.",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-orbitron mb-1">Systems</h1>
            <p className="text-[#7DAAB2]">Manage your personal operating system settings and view analytics.</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="hover:bg-yellow-400 hover:text-black transition-colors"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Layout
          </Button>
        </div>
      </div>
      
      {widgets.map((widget, index) => {
        if (!widget.enabled) return null;
        
        // Get widget icon and component from the map
        const widgetInfo = widgetComponents[widget.type];
        
        return (
          <DraggableWidget 
            key={widget.id} 
            id={widget.id}
            index={index}
            moveWidget={moveWidget}
            className="mb-6 pl-5"
          >
            <CollapsibleWidget 
              title={widget.title} 
              icon={widgetInfo.icon}
              defaultOpen={true}
            >
              {widgetInfo.component}
            </CollapsibleWidget>
          </DraggableWidget>
        );
      })}
    </DndProvider>
  );
}
