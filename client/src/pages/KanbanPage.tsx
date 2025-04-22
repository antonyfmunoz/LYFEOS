import { useState, useEffect } from "react";
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
import { Clipboard, Plus, Trash2, PenLine, MoveRight, Search, GripVertical } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { KanbanTask, KanbanStatus } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

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
  columnId: string;
  title: string;
  status: KanbanStatus;
  tasks: KanbanTask[];
  onEditTask: (task: KanbanTask) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (id: string, currentStatus: KanbanStatus) => void;
  onEditTitle: (columnId: string, newTitle: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

function KanbanColumn({ 
  columnId,
  title, 
  status,
  tasks, 
  onEditTask, 
  onDeleteTask, 
  onMoveTask, 
  onEditTitle,
  onDeleteColumn
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [columnTitle, setColumnTitle] = useState(title);
  const [showControls, setShowControls] = useState(false);
  
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setColumnTitle(e.target.value);
  };
  
  const handleTitleBlur = () => {
    if (columnTitle.trim() !== "") {
      onEditTitle(columnId, columnTitle);
    } else {
      setColumnTitle(title);
    }
    setIsEditingTitle(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleBlur();
    } else if (e.key === "Escape") {
      setColumnTitle(title);
      setIsEditingTitle(false);
    }
  };

  // Update the column title if it changes from props
  useEffect(() => {
    setColumnTitle(title);
  }, [title]);
  
  return (
    <div className="w-full h-full">
      <div 
        className="flex justify-between items-center mb-3 group"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {isEditingTitle ? (
          <input
            className="text-lg font-medium bg-background border-b border-primary/50 outline-none focus:border-primary w-full px-1"
            value={columnTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <div className="flex items-center justify-between w-full">
            <h2 
              className="text-lg font-medium cursor-pointer hover:text-primary transition-colors"
              onClick={() => setIsEditingTitle(true)}
            >
              {title} <span className="text-sm text-muted-foreground">({tasks.length})</span>
            </h2>
            
            {showControls && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-full hover:bg-destructive/20 hover:text-destructive"
                  onClick={() => onDeleteColumn(columnId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-3">
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
        
        <Button
          variant="ghost"
          className="w-full h-10 border border-dashed border-slate-700/30 text-muted-foreground text-sm hover:border-primary/50 hover:text-primary"
          onClick={() => {
            // Open add task dialog with this column preselected
            // We'll implement this feature later
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add Task
        </Button>
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
  
  // Define a column type to store more information
  interface KanbanColumn {
    id: string;
    title: string;
    status: KanbanStatus;
    order: number;
  }
  
  // Board columns state
  const [columns, setColumns] = useState<KanbanColumn[]>([
    { id: "col-backlog", title: "Backlog", status: "backlog", order: 0 },
    { id: "col-inProgress", title: "In Progress", status: "inProgress", order: 1 },
    { id: "col-review", title: "Review", status: "review", order: 2 },
    { id: "col-done", title: "Done", status: "done", order: 3 }
  ]);
  
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
    // Get ordered column statuses
    const columnStatuses = columns.sort((a, b) => a.order - b.order).map(col => col.status);
    const currentIndex = columnStatuses.indexOf(currentStatus);
    
    if (currentIndex < columnStatuses.length - 1) {
      moveKanbanTask(id, columnStatuses[currentIndex + 1]);
    }
  };

  const openEditDialog = (task: KanbanTask) => {
    setEditingTask({
      ...task
    });
    setIsEditTaskDialogOpen(true);
  };

  // Create a new column
  const [isNewColumnDialogOpen, setIsNewColumnDialogOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  
  const handleCreateColumn = () => {
    if (!newColumnTitle.trim()) return;
    
    // Generate a new unique status ID (will be cast to KanbanStatus via type assertion)
    const newStatus = `custom_${Date.now()}` as KanbanStatus;
    
    // Create the new column
    const newColumn: KanbanColumn = {
      id: `col-${newStatus}`,
      title: newColumnTitle,
      status: newStatus,
      order: columns.length, // Place at the end
    };
    
    setColumns(prev => [...prev, newColumn]);
    setNewColumnTitle("");
    setIsNewColumnDialogOpen(false);
    
    toast({
      title: "Column Created",
      description: `New column "${newColumnTitle}" has been added`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  // Delete a column
  const handleDeleteColumn = (columnId: string) => {
    const columnToDelete = columns.find(col => col.id === columnId);
    if (!columnToDelete) return;
    
    // Move tasks from this column to the first column (or you could have a "delete tasks too" option)
    const firstAvailableColumn = columns.find(col => col.id !== columnId);
    if (firstAvailableColumn) {
      kanbanTasks
        .filter(task => task.status === columnToDelete.status)
        .forEach(task => {
          updateKanbanTask(task.id, { status: firstAvailableColumn.status });
        });
    }
    
    // Remove the column
    setColumns(prev => prev.filter(col => col.id !== columnId));
    
    toast({
      title: "Column Deleted",
      description: `Column "${columnToDelete.title}" has been removed`,
      variant: "destructive",
      className: "bg-background/80 border border-destructive text-foreground",
      duration: 3000,
    });
  };
  
  // Handle column reordering with drag and drop
  const handleColumnReorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    
    setColumns(prev => {
      const newColumns = [...prev];
      const draggedIndex = newColumns.findIndex(col => col.id === draggedId);
      const targetIndex = newColumns.findIndex(col => col.id === targetId);
      
      // Move the dragged column to the target position
      const [draggedColumn] = newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, draggedColumn);
      
      // Update order values
      return newColumns.map((col, index) => ({
        ...col,
        order: index
      }));
    });
    
    toast({
      title: "Columns Reordered",
      description: "The board columns have been rearranged",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  // Edit column title
  const handleEditColumnTitle = (columnId: string, newTitle: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId 
        ? { ...col, title: newTitle } 
        : col
    ));
    
    // Show toast notification
    toast({
      title: "Column Updated",
      description: `Column title has been updated to "${newTitle}"`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
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
                      {columns.sort((a, b) => a.order - b.order).map(column => (
                        <SelectItem key={column.id} value={column.status}>
                          {column.title}
                        </SelectItem>
                      ))}
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
                        {columns.sort((a, b) => a.order - b.order).map(column => (
                          <SelectItem key={column.id} value={column.status}>
                            {column.title}
                          </SelectItem>
                        ))}
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
      
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Dialog open={isNewColumnDialogOpen} onOpenChange={setIsNewColumnDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Column
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Column</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="column-title">Column Title</Label>
                  <Input
                    id="column-title"
                    value={newColumnTitle}
                    onChange={e => setNewColumnTitle(e.target.value)}
                    placeholder="Enter column title"
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewColumnDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateColumn}>Create Column</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {columns.sort((a, b) => a.order - b.order).map(column => (
            <div 
              key={column.id}
              className="min-w-[280px] max-w-[320px] border border-slate-700/30 rounded-lg bg-card/30 p-3 group"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('columnId', column.id);
                e.currentTarget.classList.add('opacity-50');
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('opacity-50');
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-primary');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-primary');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-primary');
                const draggedId = e.dataTransfer.getData('columnId');
                if (draggedId && draggedId !== column.id) {
                  handleColumnReorder(draggedId, column.id);
                }
              }}
            >
              <div className="flex items-center gap-1 mb-2 cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Drag to reorder</span>
              </div>
              
              <KanbanColumn
                columnId={column.id}
                title={column.title}
                status={column.status}
                tasks={getTasksByStatus(column.status)}
                onEditTask={openEditDialog}
                onDeleteTask={deleteKanbanTask}
                onMoveTask={handleMoveTask}
                onEditTitle={handleEditColumnTitle}
                onDeleteColumn={handleDeleteColumn}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}