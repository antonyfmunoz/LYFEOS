import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clipboard, Plus, Trash2, PenLine, MoveRight, Search } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { KanbanTask, KanbanStatus } from "@/lib/types";

const priorityColors = {
  low: "bg-gray-500",
  medium: "bg-yellow-600",
  high: "bg-red-600"
};

interface TaskCardProps {
  task: KanbanTask;
  onEdit: (task: KanbanTask) => void;
  onDelete: (id: string) => void;
  onMoveRight: (id: string, currentStatus: KanbanStatus) => void;
}

function TaskCard({ task, onEdit, onDelete, onMoveRight }: TaskCardProps) {
  return (
    <Card className="mb-3 border border-slate-700/30 p-0 overflow-hidden hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow">
      <CardContent className="p-3">
        <div className="flex justify-between items-start">
          <h3 className="text-sm font-medium">{task.title}</h3>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0" 
              onClick={() => onEdit(task)}
            >
              <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0" 
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-2 mb-3 line-clamp-2">{task.description}</p>
        
        <div className="flex justify-between items-center mt-1">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${priorityColors[task.priority]}`} />
            <span className="text-xs text-muted-foreground capitalize">
              {task.priority}
            </span>
          </div>
          
          {task.status !== "done" && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-1 text-xs" 
              onClick={() => onMoveRight(task.id, task.status)}
            >
              <MoveRight className="h-3.5 w-3.5 mr-1 text-primary" />
              Move
            </Button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-1.5 mt-3">
          {task.tags.map((tag, idx) => (
            <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  title: string;
  status: KanbanStatus;
  tasks: KanbanTask[];
  onEditTask: (task: KanbanTask) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (id: string, currentStatus: KanbanStatus) => void;
}

function KanbanColumn({ title, status, tasks, onEditTask, onDeleteTask, onMoveTask }: KanbanColumnProps) {
  return (
    <div className="min-w-[280px] max-w-[320px]">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">{title} <span className="text-sm text-muted-foreground">({tasks.length})</span></h2>
      </div>
      
      <div className="min-h-[70vh] p-3 rounded-lg bg-card/30">
        {tasks.map(task => (
          <TaskCard 
            key={task.id} 
            task={task} 
            onEdit={onEditTask} 
            onDelete={onDeleteTask}
            onMoveRight={onMoveTask}
          />
        ))}
        {tasks.length === 0 && (
          <div className="h-24 border border-dashed border-slate-700/30 rounded-lg flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { kanbanTasks, createKanbanTask, updateKanbanTask, deleteKanbanTask, moveKanbanTask } = useLYFEOS();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  
  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [newTaskStatus, setNewTaskStatus] = useState<KanbanStatus>("backlog");
  const [newTaskTags, setNewTaskTags] = useState("");

  const filteredTasks = kanbanTasks.filter(task => 
    task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getTasksByStatus = (status: KanbanStatus) => {
    return filteredTasks.filter(task => task.status === status);
  };

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;
    
    createKanbanTask({
      title: newTaskTitle,
      description: newTaskDescription,
      priority: newTaskPriority,
      status: newTaskStatus,
      tags: newTaskTags.split(",").map(tag => tag.trim()).filter(tag => tag !== "")
    });
    
    // Reset form
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("medium");
    setNewTaskStatus("backlog");
    setNewTaskTags("");
    setIsNewTaskDialogOpen(false);
  };

  const handleEditTask = () => {
    if (!editingTask || !editingTask.title.trim()) return;
    
    updateKanbanTask(editingTask.id, {
      title: editingTask.title,
      description: editingTask.description,
      priority: editingTask.priority,
      status: editingTask.status,
      tags: Array.isArray(editingTask.tags) 
        ? editingTask.tags 
        : (editingTask.tags as string).split(",").map(tag => tag.trim()).filter(tag => tag !== "")
    });
    
    setEditingTask(null);
    setIsEditTaskDialogOpen(false);
  };

  const handleMoveTask = (id: string, currentStatus: KanbanStatus) => {
    const statusOrder: KanbanStatus[] = ["backlog", "inProgress", "review", "done"];
    const currentIndex = statusOrder.indexOf(currentStatus);
    if (currentIndex < statusOrder.length - 1) {
      moveKanbanTask(id, statusOrder[currentIndex + 1]);
    }
  };

  const openEditDialog = (task: KanbanTask) => {
    setEditingTask({
      ...task
    });
    setIsEditTaskDialogOpen(true);
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Kanban Board</h1>
        <p className="text-[#7DAAB2]">Visualize and manage your workflow</p>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9 w-[250px] border border-slate-700/30"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Dialog open={isNewTaskDialogOpen} onOpenChange={setIsNewTaskDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow">
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Task title"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={newTaskDescription}
                  onChange={e => setNewTaskDescription(e.target.value)}
                  placeholder="Task description"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="task-priority">Priority</Label>
                  <Select 
                    value={newTaskPriority}
                    onValueChange={(value) => setNewTaskPriority(value as "low" | "medium" | "high")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-status">Status</Label>
                  <Select 
                    value={newTaskStatus}
                    onValueChange={(value) => setNewTaskStatus(value as KanbanStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="inProgress">In Progress</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-tags">Tags (comma-separated)</Label>
                <Input
                  id="task-tags"
                  value={newTaskTags}
                  onChange={e => setNewTaskTags(e.target.value)}
                  placeholder="design, frontend, etc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewTaskDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTask}>Create Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Edit Task Dialog */}
        {editingTask && (
          <Dialog open={isEditTaskDialogOpen} onOpenChange={setIsEditTaskDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-task-title">Title</Label>
                  <Input
                    id="edit-task-title"
                    value={editingTask.title}
                    onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                    placeholder="Task title"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-task-description">Description</Label>
                  <Textarea
                    id="edit-task-description"
                    value={editingTask.description}
                    onChange={e => setEditingTask({...editingTask, description: e.target.value})}
                    placeholder="Task description"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-task-priority">Priority</Label>
                    <Select 
                      value={editingTask.priority}
                      onValueChange={(value) => setEditingTask({...editingTask, priority: value as "low" | "medium" | "high"})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-task-status">Status</Label>
                    <Select 
                      value={editingTask.status}
                      onValueChange={(value) => setEditingTask({...editingTask, status: value as KanbanStatus})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Backlog</SelectItem>
                        <SelectItem value="inProgress">In Progress</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-task-tags">Tags (comma-separated)</Label>
                  <Input
                    id="edit-task-tags"
                    value={editingTask.tags.join(", ")}
                    onChange={e => setEditingTask({
                      ...editingTask, 
                      tags: e.target.value.split(",").map(tag => tag.trim()).filter(tag => tag !== "")
                    })}
                    placeholder="design, frontend, etc."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditTaskDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEditTask}>Update Task</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          <KanbanColumn
            title="Backlog"
            status="backlog"
            tasks={getTasksByStatus("backlog")}
            onEditTask={openEditDialog}
            onDeleteTask={deleteKanbanTask}
            onMoveTask={handleMoveTask}
          />
          <KanbanColumn
            title="In Progress"
            status="inProgress"
            tasks={getTasksByStatus("inProgress")}
            onEditTask={openEditDialog}
            onDeleteTask={deleteKanbanTask}
            onMoveTask={handleMoveTask}
          />
          <KanbanColumn
            title="Review"
            status="review"
            tasks={getTasksByStatus("review")}
            onEditTask={openEditDialog}
            onDeleteTask={deleteKanbanTask}
            onMoveTask={handleMoveTask}
          />
          <KanbanColumn
            title="Done"
            status="done"
            tasks={getTasksByStatus("done")}
            onEditTask={openEditDialog}
            onDeleteTask={deleteKanbanTask}
            onMoveTask={handleMoveTask}
          />
        </div>
      </div>
    </>
  );
}