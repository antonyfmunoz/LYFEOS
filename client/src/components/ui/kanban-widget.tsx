import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLYFEOS } from "@/lib/context";
import { KanbanTask, KanbanStatus } from "@/lib/types";
import { Clipboard, ArrowRight, CheckSquare, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

interface KanbanColumnProps {
  title: string;
  status: KanbanStatus;
  tasks: KanbanTask[];
  onTaskClick: (task: KanbanTask) => void;
}

function KanbanColumn({ title, status, tasks, onTaskClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[120px] gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title} ({tasks.length})</h3>
      </div>
      <div className="h-[120px] overflow-y-auto space-y-1 pr-1">
        {tasks.map((task) => (
          <div 
            key={task.id} 
            className="p-1.5 rounded cursor-pointer bg-card/30 backdrop-blur-sm hover:bg-card/50 transition-all border-l-2 border-l-primary/30 hover:border-l-primary/70 shadow-sm"
            onClick={() => onTaskClick(task)}
          >
            <p className="text-xs font-medium truncate">{task.title}</p>
            {task.priority === "high" && 
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1"></div>
            }
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="h-full border-l-2 border-l-slate-700/30 rounded flex items-center justify-center p-1">
            <p className="text-[10px] text-muted-foreground">Empty</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanWidget() {
  const { kanbanTasks } = useLYFEOS();
  const [_, setLocation] = useLocation();

  const getTasks = (status: KanbanStatus) => {
    return kanbanTasks.filter(task => task.status === status).slice(0, 3);
  };

  const handleTaskClick = (task: KanbanTask) => {
    setLocation("/kanban");
  };

  return (
    <Card className="w-full border-transparent shadow-md glassmorphic p-0 overflow-hidden">
      <CardHeader className="p-3 pb-1">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium flex items-center">
            <Clipboard className="h-4 w-4 mr-2 text-primary" />
            Boards
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs bg-primary/5 hover:bg-primary/10 text-primary hover:shadow-sm transition-shadow px-2"
            onClick={() => setLocation("/kanban")}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-4 gap-2">
          <KanbanColumn
            title="Backlog"
            status="backlog"
            tasks={getTasks("backlog")}
            onTaskClick={handleTaskClick}
          />
          <KanbanColumn
            title="In Progress"
            status="inProgress"
            tasks={getTasks("inProgress")}
            onTaskClick={handleTaskClick}
          />
          <KanbanColumn
            title="Review"
            status="review"
            tasks={getTasks("review")}
            onTaskClick={handleTaskClick}
          />
          <KanbanColumn
            title="Done"
            status="done"
            tasks={getTasks("done")}
            onTaskClick={handleTaskClick}
          />
        </div>
      </CardContent>
    </Card>
  );
}