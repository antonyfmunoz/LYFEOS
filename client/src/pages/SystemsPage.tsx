import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { Calendar, Clipboard, Contact2, FileSpreadsheet, Paintbrush, Network, FileText } from "lucide-react";
import { Link } from "wouter";
import { KanbanWidget } from "@/components/ui/kanban-widget";
import { RolodexWidget } from "@/components/ui/rolodex-widget";
import { SpreadsheetWidget } from "@/components/ui/spreadsheet-widget";
import { CanvasWidget } from "@/components/ui/canvas-widget";
import { GraphWidget } from "@/components/ui/graph-widget";
import DocumentsWidget from "@/components/ui/documents-widget";

export default function SystemsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Systems</h1>
        <p className="text-[#7DAAB2]">Manage your personal operating system settings and view analytics.</p>
      </div>
      
      {/* Calendar Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Calendar" 
          icon={<Calendar className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <div className="flex justify-start items-center mb-3">
            <Link to="/calendar" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md transition-colors duration-200 flex items-center hover:shadow-[0_0_5px_var(--primary-glow-light)] border border-primary/50">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Go to Calendar
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
        </CollapsibleWidget>
      </section>
      
      {/* Boards Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Boards" 
          icon={<Clipboard className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <KanbanWidget />
        </CollapsibleWidget>
      </section>
      
      {/* Rolodex Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Rolodex" 
          icon={<Contact2 className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <RolodexWidget />
        </CollapsibleWidget>
      </section>
      
      {/* Spreadsheets Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Spreadsheets" 
          icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <SpreadsheetWidget />
        </CollapsibleWidget>
      </section>
      
      {/* Canvas Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Canvas" 
          icon={<Paintbrush className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <CanvasWidget />
        </CollapsibleWidget>
      </section>
      
      {/* Graph Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Knowledge Graph" 
          icon={<Network className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <GraphWidget />
        </CollapsibleWidget>
      </section>
      
      {/* Documents Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Documents" 
          icon={<FileText className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <DocumentsWidget />
        </CollapsibleWidget>
      </section>
    </>
  );
}
