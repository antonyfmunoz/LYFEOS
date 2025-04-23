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
    <div className="flex flex-col min-w-[120px] gap-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-muted-foreground">{title} ({tasks.length})</h3>
      </div>
      <div className="h-[130px] overflow-y-auto space-y-1.5 pr-1">
        {tasks.map((task) => (
          <Card 
            key={task.id} 
            className="p-2 cursor-pointer hover:bg-card/50 transition-all border border-slate-700/30 hover:border-primary/30 hover:shadow-[0_0_5px_var(--primary-glow-light)]"
            onClick={() => onTaskClick(task)}
          >
            <p className="text-xs font-medium truncate">{task.title}</p>
            <div className="flex items-center mt-1.5 gap-1">
              {task.priority === "high" && <Badge variant="destructive" className="text-[0.6rem] px-1 py-0">High</Badge>}
              {task.tags.slice(0, 1).map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[0.6rem] px-1 py-0">{tag}</Badge>
              ))}
            </div>
          </Card>
        ))}
        {tasks.length === 0 && (
          <div className="h-full border border-dashed border-slate-700/30 rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No tasks</p>
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
    <Card className="w-full border border-slate-700/30 p-0 overflow-hidden">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium flex items-center">
            <Clipboard className="h-4 w-4 mr-2 text-primary" />
            Boards
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => setLocation("/kanban")}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-4 gap-3">
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