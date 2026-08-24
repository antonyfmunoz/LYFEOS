import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clipboard, Plus, ChevronRight, Kanban, MoreHorizontal, Edit, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BoardItemProps {
  id: number;
  title: string;
  taskCount: number;
  onClick: (id: number) => void;
}

function BoardItem({ id, title, taskCount, onClick }: BoardItemProps) {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent onClick
    
    navigator.clipboard.writeText(JSON.stringify({ id, title }))
      .then(() => {
        toast({
          title: "Project copied",
          description: `Project “${title}” copied to clipboard`,
          className: "bg-background/80 border border-primary text-foreground",
          duration: 2000,
        });
      })
      .catch(err => {
        toast({
          title: "Failed to Copy",
          description: "Could not copy board to clipboard",
          variant: "destructive",
          duration: 2000,
        });
      });
  };
  
  return (
    <div 
      className="p-2 rounded cursor-pointer bg-card/30 backdrop-blur-sm hover:bg-card/50 transition-all border-l-2 border-l-primary/30 hover:border-l-primary/70 shadow-sm flex items-center justify-between mb-2"
      onClick={() => onClick(id)}
    >
      <div className="flex items-center gap-2">
        <Kanban className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-medium truncate">{title}</p>
      </div>
      <div className="flex items-center gap-1">
        <div className="bg-primary/10 text-primary text-[10px] rounded-full px-1.5 py-0.5 font-medium">
          {taskCount} missions
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 ml-1 hover:bg-primary hover:text-background"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onClick(id);
              }}
            >
              <Edit className="h-3 w-3 mr-2" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem
              className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background text-xs"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 mr-2" />
              Copy
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function KanbanWidget() {
  const [_, setLocation] = useLocation();
  const projects = useQuery<{ projects: Array<{ id: number; title: string; taskCount: number }> }>({ queryKey: ["/api/projects"], queryFn: () => apiRequest("/api/projects") });
  const handleBoardClick = (projectId: number) => setLocation(`/projects?project=${projectId}`);

  return (
    <Card className="w-full border-transparent shadow-md glassmorphic p-0 overflow-hidden">
      <CardHeader className="p-3 pb-1">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium flex items-center">
            <Clipboard className="h-4 w-4 mr-2 text-primary" />
            Projects
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs bg-primary/5 hover:bg-primary/10 text-primary hover:shadow-sm transition-shadow px-2"
            onClick={() => setLocation("/projects")}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex flex-col">
          {projects.data?.projects.length ? (
            projects.data.projects.slice(0, 4).map(board => (
              <BoardItem
                key={board.id}
                id={board.id}
                title={board.title}
                taskCount={board.taskCount}
                onClick={handleBoardClick}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-24 border border-dashed border-slate-700/30 rounded-md p-2">
              <p className="text-xs text-muted-foreground">No projects created yet</p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 h-6 text-xs bg-primary/5 hover:bg-primary/10 text-primary"
                onClick={() => setLocation("/projects")}
              >
                <Plus className="h-3 w-3 mr-1" />
                Create Project
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
