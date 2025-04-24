import { useState, useCallback } from "react";
import { Calendar, Clipboard, Contact2, FileSpreadsheet, Paintbrush, Network, FileText, FileCheck, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { KanbanWidget } from "@/components/ui/kanban-widget";
import { RolodexWidget } from "@/components/ui/rolodex-widget";
import { SpreadsheetWidget } from "@/components/ui/spreadsheet-widget";
import { CanvasWidget } from "@/components/ui/canvas-widget";
import { GraphWidget } from "@/components/ui/graph-widget";
import DocumentsWidget from "@/components/ui/documents-widget";
import TemplatesWidget from "@/components/ui/templates-widget";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import update from 'immutability-helper';
import { DraggableWidget } from "@/components/ui/draggable-widget";

// Define widget data structure
interface WidgetData {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen?: boolean;
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
