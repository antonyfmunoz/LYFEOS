import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Clipboard, Plus, Trash2, PenLine, MoveRight, Search, GripVertical, ArrowLeft, MoreHorizontal } from "lucide-react";
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
        
        {(task.startDate || task.dueDate) && (
          <div className="flex justify-between mb-2 text-xs text-muted-foreground">
            {task.startDate && (
              <div>
                <span className="opacity-70">Start:</span> {task.startDate}
              </div>
            )}
            {task.dueDate && (
              <div>
                <span className="opacity-70">Due:</span> {task.dueDate}
              </div>
            )}
          </div>
        )}
        
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
  onAddTask: (status: KanbanStatus) => void;
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
  onDeleteColumn,
  onAddTask
}: KanbanColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [columnTitle, setColumnTitle] = useState(title);
  
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
      <div className="flex justify-between items-center mb-3 group">
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
            
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full hover:bg-destructive/20 hover:text-destructive"
                onClick={() => onDeleteColumn(columnId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
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
          className="w-full h-10 border border-dashed border-slate-700/30 text-muted-foreground text-sm hover:border-primary/50 hover:text-primary hover:bg-yellow-400 hover:text-black"
          onClick={() => onAddTask(status)}
        >
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add Task
        </Button>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { 
    kanbanTasks, 
    kanbanBoards,
    createKanbanTask, 
    updateKanbanTask, 
    deleteKanbanTask, 
    moveKanbanTask,
    createKanbanBoard,
    updateKanbanBoard,
    deleteKanbanBoard,
    addKanbanColumn,
    updateKanbanColumn,
    deleteKanbanColumn
  } = useLYFEOS();
  
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  
  // New state for active board
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  
  // Set active board when boards change
  useEffect(() => {
    // Set default active board if none is selected
    if (kanbanBoards.length > 0 && !activeBoardId) {
      // Find default board or use the first board
      const defaultBoard = kanbanBoards.find(board => board.isDefault) || kanbanBoards[0];
      setActiveBoardId(defaultBoard.id);
    }
  }, [kanbanBoards, activeBoardId]);
  
  // Get the active board
  const activeBoard = kanbanBoards.find(board => board.id === activeBoardId) || null;
  
  // Use board's columns or empty array if no active board
  const columns = activeBoard?.columns || [];
  
  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [newTaskStatus, setNewTaskStatus] = useState<KanbanStatus>("backlog");
  const [newTaskStartDate, setNewTaskStartDate] = useState<string>("");
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");
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
    if (!newTaskTitle.trim() || !activeBoardId) return;
    
    createKanbanTask({
      title: newTaskTitle,
      description: newTaskDescription,
      priority: newTaskPriority,
      status: newTaskStatus,
      startDate: newTaskStartDate || undefined,
      dueDate: newTaskDueDate || undefined,
      tags: newTaskTags.split(",").map(tag => tag.trim()).filter(tag => tag !== ""),
      boardId: activeBoardId
    });
    
    // Reset form
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("medium");
    setNewTaskStatus("backlog");
    setNewTaskStartDate("");
    setNewTaskDueDate("");
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
      startDate: editingTask.startDate,
      dueDate: editingTask.dueDate,
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
    if (!newColumnTitle.trim() || !activeBoardId) return;
    
    // Generate a new unique status ID (will be cast to KanbanStatus via type assertion)
    const newStatus = `custom_${Date.now()}` as KanbanStatus;
    
    // Add a new column to the active board
    addKanbanColumn(activeBoardId, {
      title: newColumnTitle,
      status: newStatus,
    });
    
    setNewColumnTitle("");
    setIsNewColumnDialogOpen(false);
  };
  
  // Delete a column
  const handleDeleteColumn = (columnId: string) => {
    if (!columnId) return;
    
    // Use the context function to delete the column
    deleteKanbanColumn(columnId);
  };
  
  // New state and handlers for board management
  const [isNewBoardDialogOpen, setIsNewBoardDialogOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardDescription, setNewBoardDescription] = useState("");
  
  // Create a new board
  const handleCreateBoard = () => {
    if (!newBoardTitle.trim()) return;
    
    const newBoard = createKanbanBoard({
      title: newBoardTitle,
      description: newBoardDescription,
      isDefault: kanbanBoards.length === 0, // Make default if it's the first board
    });
    
    // Set the new board as active
    setActiveBoardId(newBoard.id);
    
    // Reset form
    setNewBoardTitle("");
    setNewBoardDescription("");
    setIsNewBoardDialogOpen(false);
  };
  
  // Edit column title
  const handleEditColumnTitle = (columnId: string, newTitle: string) => {
    if (!columnId || !newTitle.trim()) return;
    
    // Use the context function to update the column
    updateKanbanColumn(columnId, { title: newTitle });
  };
  
  // Handle adding a task for a specific column
  const handleAddTask = (status: KanbanStatus) => {
    setNewTaskStatus(status);
    setIsNewTaskDialogOpen(true);
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 mr-1 hover:bg-yellow-400 hover:text-black" 
            onClick={() => navigate('/systems')}
            aria-label="Back to systems"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-orbitron">Boards</h1>
        </div>
        <p className="text-[#7DAAB2]">Visualize and manage your workflow</p>
      </div>
      
      {/* Board selector */}
      <div className="flex items-center gap-4 mb-4">
        <Label htmlFor="board-selector">Active Board:</Label>
        <Select 
          value={activeBoardId || ''}
          onValueChange={(value) => setActiveBoardId(value)}
          disabled={kanbanBoards.length === 0}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select a board" />
          </SelectTrigger>
          <SelectContent>
            {kanbanBoards.map(board => (
              <SelectItem key={board.id} value={board.id}>
                {board.title} {board.isDefault && "(Default)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Dialog open={isNewBoardDialogOpen} onOpenChange={setIsNewBoardDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="bg-primary/10 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow hover:bg-yellow-400 hover:text-black"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Board
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Board</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="board-title">Board Title</Label>
                <Input
                  id="board-title"
                  value={newBoardTitle}
                  onChange={e => setNewBoardTitle(e.target.value)}
                  placeholder="Enter board title"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="board-description">Description</Label>
                <Textarea
                  id="board-description"
                  value={newBoardDescription}
                  onChange={e => setNewBoardDescription(e.target.value)}
                  placeholder="Board description"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsNewBoardDialogOpen(false)}
                className="hover:bg-yellow-400 hover:text-black"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateBoard}
                className="hover:bg-yellow-400 hover:text-black"
              >
                Create Board
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {activeBoard && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Board Options</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => updateKanbanBoard(activeBoard.id, {isDefault: true})}>
                Set as Default
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => {
                  if (confirm("Are you sure you want to delete this board? All tasks in this board will be deleted.")) {
                    deleteKanbanBoard(activeBoard.id);
                  }
                }}
                className="text-red-500"
              >
                Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-9 w-[250px] border border-slate-700/30"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          {activeBoard && (
            <Dialog open={isNewColumnDialogOpen} onOpenChange={setIsNewColumnDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-primary/10 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow hover:bg-yellow-400 hover:text-black"
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
                  <Button 
                    variant="outline" 
                    onClick={() => setIsNewColumnDialogOpen(false)}
                    className="hover:bg-yellow-400 hover:text-black"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateColumn}
                    className="hover:bg-yellow-400 hover:text-black"
                  >
                    Create Column
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        <Dialog open={isNewTaskDialogOpen} onOpenChange={setIsNewTaskDialogOpen}>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="task-start-date">Start Date</Label>
                  <Input
                    id="task-start-date"
                    type="date"
                    value={newTaskStartDate}
                    onChange={e => setNewTaskStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-due-date">Due Date</Label>
                  <Input
                    id="task-due-date"
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                  />
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
              <Button 
                variant="outline" 
                onClick={() => setIsNewTaskDialogOpen(false)}
                className="hover:bg-yellow-400 hover:text-black"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateTask}
                className="hover:bg-yellow-400 hover:text-black"
              >
                Create Task
              </Button>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-task-start-date">Start Date</Label>
                    <Input
                      id="edit-task-start-date"
                      type="date"
                      value={editingTask.startDate || ""}
                      onChange={e => setEditingTask({
                        ...editingTask, 
                        startDate: e.target.value || undefined
                      })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-task-due-date">Due Date</Label>
                    <Input
                      id="edit-task-due-date"
                      type="date"
                      value={editingTask.dueDate || ""}
                      onChange={e => setEditingTask({
                        ...editingTask, 
                        dueDate: e.target.value || undefined
                      })}
                    />
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
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditTaskDialogOpen(false)}
                  className="hover:bg-yellow-400 hover:text-black"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditTask}
                  className="hover:bg-yellow-400 hover:text-black"
                >
                  Update Task
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      

      
      {activeBoard ? (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {columns.sort((a, b) => a.order - b.order).map(column => (
              <div 
                key={column.id}
                className="min-w-[280px] max-w-[320px] border border-slate-700/30 rounded-lg bg-card/30 p-3 group"
              >
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
                  onAddTask={handleAddTask}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-10 border border-dashed border-slate-700/30 rounded-lg">
          <p className="text-muted-foreground mb-4">Create a board to get started</p>
          <Button 
            onClick={() => setIsNewBoardDialogOpen(true)}
            className="bg-primary/10 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow hover:bg-yellow-400 hover:text-black"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create First Board
          </Button>
        </div>
      )}
    </>
  );
}