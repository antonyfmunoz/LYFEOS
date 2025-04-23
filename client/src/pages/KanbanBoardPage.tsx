import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { MultiBackend, TouchTransition, MouseTransition } from 'react-dnd-multi-backend';
import { 
  ArrowLeft, 
  Plus, 
  MoreHorizontal, 
  X,
  Edit,
  Trash,
  ChevronRight,
  GripVertical
} from 'lucide-react';

// Define a custom backend for both mouse and touch interfaces
const CustomHTML5toTouch = {
  backends: [
    {
      id: 'html5',
      backend: HTML5Backend,
      transition: MouseTransition,
    },
    {
      id: 'touch',
      backend: TouchBackend,
      options: { enableMouseEvents: true },
      preview: true,
      transition: TouchTransition,
    },
  ],
};
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLYFEOS } from '@/lib/context';
import { KanbanStatus, KanbanTask } from '@/lib/types';

// Define item types for drag and drop
// These constants are used by react-dnd to identify draggable item types
const ItemTypes = {
  TASK: 'kanban-task',
  COLUMN: 'kanban-column'
};

// Interface for dragged task item
interface DragItem {
  id: string;
  status: KanbanStatus;
  boardId?: string;
  type?: string;
}

// Task Card Component
interface TaskCardProps {
  task: KanbanTask;
  onEdit: (task: KanbanTask) => void;
  onDelete: (id: string) => void;
  onMoveRight: (id: string, currentStatus: KanbanStatus) => void;
}

function TaskCard({ task, onEdit, onDelete, onMoveRight }: TaskCardProps) {
  const priorityColors = {
    high: 'bg-red-500/10 text-red-500 border-red-500/20',
    medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    low: 'bg-green-500/10 text-green-500 border-green-500/20',
  };
  const priorityColor = priorityColors[task.priority] || priorityColors.medium;

  // Copy task to clipboard function
  const duplicateTask = () => {
    // Create a simplified version of the task to copy
    const taskDuplicate = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      tags: task.tags,
      startDate: task.startDate,
      dueDate: task.dueDate
    };
    
    navigator.clipboard.writeText(JSON.stringify(taskDuplicate, null, 2))
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: `Task "${task.title}" copied to clipboard`,
          className: "bg-background/80 border border-primary text-foreground",
          duration: 2000,
        });
      })
      .catch(err => {
        toast({
          title: "Failed to copy",
          description: "Could not copy task to clipboard",
          variant: "destructive",
          duration: 2000,
        });
        console.error('Failed to copy task:', err);
      });
  };

  // Set up drag source with dependencies to handle re-renders
  // This configuration enables the TaskCard to be dragged between columns
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.TASK,
    item: { 
      id: task.id, 
      status: task.status,
      boardId: task.boardId
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      console.log('Drag ended, was dropped:', didDrop);
      
      if (didDrop) {
        const dropResult = monitor.getDropResult() as { status: KanbanStatus } | null;
        console.log('Drop result:', dropResult);
        
        // After successful drop, we can perform additional actions if needed
        if (dropResult && dropResult.status !== item.status) {
          console.log(`Task moved from ${item.status} to ${dropResult.status}`);
        }
      }
    }
  });

  // Create a dragging element with ref attached that's optimized for touch and mouse interactions
  return (
    <div 
      ref={drag} 
      className={`${isDragging ? 'opacity-50 ring-2 ring-primary' : 'opacity-100'} cursor-move w-full hover:ring-1 hover:ring-yellow-400 transition-all active:ring-2 active:ring-primary`}
      style={{ touchAction: 'none' }}
      data-handler-id={task.id}
    >
      <Card className="mb-2 shadow-sm glassmorphic rounded-lg border-l-4 border-l-yellow-400 border-t-0 border-r-0 border-b-0">
        <CardHeader className="p-3 pb-0 flex flex-row justify-between items-start">
          <div className="flex items-center">
            <GripVertical className="h-4 w-4 mr-2 cursor-move text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 hover:bg-yellow-400 hover:text-black"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onEdit(task)}
                className="hover:bg-yellow-400 hover:text-black focus:bg-yellow-400 focus:text-black"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={duplicateTask}
                className="hover:bg-yellow-400 hover:text-black focus:bg-yellow-400 focus:text-black"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(task.id)} 
                className="text-red-500 hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {task.description && (
            <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
          )}
          
          {/* Date display section */}
          {(task.startDate || task.dueDate) && (
            <div className="flex flex-wrap gap-2 mb-2 text-xs text-muted-foreground">
              {task.startDate && (
                <div className="flex items-center">
                  <span className="font-medium mr-1">Start:</span> 
                  {new Date(task.startDate).toLocaleDateString()}
                </div>
              )}
              {task.dueDate && (
                <div className="flex items-center">
                  <span className="font-medium mr-1">Due:</span> 
                  {new Date(task.dueDate).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 border ${priorityColor}`}>
              {task.priority}
            </span>
            {task.status !== 'done' && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-6 px-2 text-xs hover:bg-yellow-400 hover:text-black"
                onClick={() => onMoveRight(task.id, task.status)}
              >
                Move <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Kanban Column Component
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
  const [isEditing, setIsEditing] = useState(false);
  const [columnTitle, setColumnTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const { moveKanbanTask } = useLYFEOS();

  // Set up drop target with direct object syntax for better reactivity
  // This configuration allows the column to receive tasks when they're dropped
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.TASK,
    drop: (item: DragItem) => {
      // Handle the drop, update task status
      console.log('Dropping item:', item, 'into status:', status);
      
      // Check if the task is being moved to a different column
      if (item.status !== status) {
        // Call the context function to update the task status
        moveKanbanTask(item.id, status);
        
        // Make sure to return the new status so the drag source knows where the item was dropped
        return { status };
      }
      
      // Return the current status even if no change is made to complete the drop interaction
      return { status };
    },
    // Allow drops from any column, including self (we'll handle the logic in the drop function)
    canDrop: () => true,
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  });

  // Function to copy column configuration to clipboard
  const duplicateColumn = () => {
    const columnConfig = {
      title: title,
      status: status,
      tasks: tasks.map(task => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        tags: task.tags,
        startDate: task.startDate,
        dueDate: task.dueDate
      }))
    };
    
    navigator.clipboard.writeText(JSON.stringify(columnConfig, null, 2))
      .then(() => {
        toast({
          title: "Column Copied",
          description: `Column "${title}" with ${tasks.length} tasks copied to clipboard`,
          className: "bg-background/80 border border-primary text-foreground",
          duration: 2000,
        });
      })
      .catch(err => {
        toast({
          title: "Failed to Copy",
          description: "Could not copy column to clipboard",
          variant: "destructive",
          duration: 2000,
        });
        console.error('Failed to copy column:', err);
      });
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSaveTitle = () => {
    onEditTitle(columnId, columnTitle);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setColumnTitle(title);
      setIsEditing(false);
    }
  };

  // Set column drag with direct object syntax for better reactivity
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.COLUMN,
    item: { 
      id: columnId,
      status
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  });

  return (
    <div 
      ref={drop} 
      className={`glassmorphic rounded-xl p-4 w-72 flex-shrink-0 flex flex-col h-full transition-all
        ${isOver && canDrop ? 'ring-4 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/10 shadow-lg' : ''}
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
        ${isOver ? 'scale-105' : ''}
      `}
      data-column-id={columnId}
    >
      <div 
        ref={drag}
        className="flex items-center justify-between mb-3 cursor-move rounded-md p-1 hover:bg-yellow-400/10 transition-colors"
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center">
          <GripVertical className="h-4 w-4 mr-2 text-muted-foreground" />
          {isEditing ? (
            <Input
              ref={inputRef}
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={handleKeyPress}
              className="text-sm h-7 py-1 px-2"
            />
          ) : (
            <h3 
              className="font-medium text-sm cursor-pointer hover:text-primary transition-colors"
              onClick={handleStartEditing}
            >
              {title} ({tasks.length})
            </h3>
          )}
        </div>
        <div className="flex gap-1">
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6 hover:bg-yellow-400 hover:text-black" 
            onClick={() => onAddTask(status)}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6 hover:bg-yellow-400 hover:text-black"
            onClick={duplicateColumn}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6 text-red-500 hover:bg-red-500 hover:text-white"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete the "${title}" column? All tasks in this column will be lost.`)) {
                onDeleteColumn(columnId);
              }
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-2 flex-grow overflow-y-auto pr-1 max-h-[calc(100%-40px)]">
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
          <div className="h-20 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Component
export default function KanbanBoardPage() {
  // Get the boardId from URL parameters
  const params = useParams<{ boardId: string }>();
  const boardId = params?.boardId;
  
  const [, navigate] = useLocation();
  const { 
    kanbanBoards, 
    kanbanTasks, 
    createKanbanTask, 
    updateKanbanTask,
    deleteKanbanTask,
    moveKanbanTask,
    updateKanbanBoard,
    deleteKanbanBoard,
    addKanbanColumn,
    updateKanbanColumn,
    deleteKanbanColumn
  } = useLYFEOS();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [isAddColumnDialogOpen, setIsAddColumnDialogOpen] = useState(false);
  
  const [activeTaskId, setActiveTaskId] = useState('');
  const [taskStatus, setTaskStatus] = useState<KanbanStatus>('backlog');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    tags: '',
    startDate: '',
    dueDate: '',
  });
  
  const [columnFormData, setColumnFormData] = useState({
    title: '',
    status: '',
  });

  // Find the active board
  const activeBoard = boardId ? kanbanBoards.find(board => board.id === boardId) : undefined;
  
  useEffect(() => {
    if (!activeBoard && kanbanBoards.length > 0) {
      // Redirect to the first board if the requested one doesn't exist
      navigate(`/kanban/board/${kanbanBoards[0].id}`);
    }
  }, [activeBoard, kanbanBoards, navigate]);

  // If board not found, show a message or redirect
  if (!activeBoard) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center w-full mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-yellow-400 hover:text-black" 
            onClick={() => navigate('/kanban')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold mx-auto pr-8">Board not found</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <p>The requested board was not found. Please select another board.</p>
            <button 
              onClick={() => navigate('/kanban')} 
              className="mt-4 flex items-center gap-2 text-primary border border-primary/50 px-4 py-2 rounded-md hover:bg-yellow-400 hover:text-black transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Boards
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter tasks for the current board
  const boardTasks = boardId ? kanbanTasks.filter(task => task.boardId === boardId) : [];

  const getTasksByStatus = (status: KanbanStatus) => {
    return boardTasks.filter(task => task.status === status);
  };

  const handleMoveTask = (id: string, currentStatus: KanbanStatus) => {
    let nextStatus: KanbanStatus;
    
    switch (currentStatus) {
      case 'backlog':
        nextStatus = 'inProgress';
        break;
      case 'inProgress':
        nextStatus = 'review';
        break;
      case 'review':
        nextStatus = 'done';
        break;
      default:
        return; // Don't move tasks in "done" status
    }
    
    moveKanbanTask(id, nextStatus);
  };

  const openEditDialog = (task: KanbanTask) => {
    setActiveTaskId(task.id);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      tags: task.tags ? task.tags.join(', ') : '',
      startDate: task.startDate || '',
      dueDate: task.dueDate || '',
    });
    setIsEditTaskDialogOpen(true);
  };

  const handleAddTask = (status: KanbanStatus) => {
    setTaskStatus(status);
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      tags: '',
      startDate: '',
      dueDate: '',
    });
    setIsAddTaskDialogOpen(true);
  };

  const handleCreateTask = () => {
    if (!boardId) return;
    
    const newTask = {
      title: formData.title,
      description: formData.description,
      status: taskStatus,
      priority: formData.priority as "low" | "medium" | "high",
      tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
      startDate: formData.startDate,
      dueDate: formData.dueDate,
      boardId: boardId
    };
    
    createKanbanTask(newTask);
    setIsAddTaskDialogOpen(false);
  };

  const handleUpdateTask = () => {
    const taskData = {
      title: formData.title,
      description: formData.description,
      priority: formData.priority as "low" | "medium" | "high",
      tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
      startDate: formData.startDate,
      dueDate: formData.dueDate,
    };
    
    updateKanbanTask(activeTaskId, taskData);
    setIsEditTaskDialogOpen(false);
  };

  const handleEditBoard = () => {
    if (!boardId) return;
    
    const boardData = {
      title: activeBoard.title,
      description: activeBoard.description,
    };
    
    updateKanbanBoard(boardId, boardData);
    setIsEditDialogOpen(false);
  };

  const handleDeleteBoard = () => {
    if (!boardId) return;
    deleteKanbanBoard(boardId);
    navigate('/kanban');
  };

  const handleAddColumn = () => {
    if (!boardId) return;
    
    // Validate inputs
    if (!columnFormData.title || !columnFormData.status) {
      toast({
        title: "Validation Error",
        description: "Column title and status are required",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    // Add the new column
    try {
      addKanbanColumn(boardId, {
        title: columnFormData.title,
        status: columnFormData.status as KanbanStatus
      });
      
      // Reset form and close dialog
      setColumnFormData({ title: '', status: '' });
      setIsAddColumnDialogOpen(false);
      
      toast({
        title: "Column Added",
        description: `"${columnFormData.title}" column has been added`,
        className: "bg-background/80 border border-primary text-foreground",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add column. " + (error instanceof Error ? error.message : "Unknown error"),
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleEditColumnTitle = (columnId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast({
        title: "Validation Error",
        description: "Column title cannot be empty",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    updateKanbanColumn(columnId, { title: newTitle });
  };

  const handleDeleteColumn = (columnId: string) => {
    deleteKanbanColumn(columnId);
  };

  return (
    <DndProvider backend={MultiBackend} options={CustomHTML5toTouch}>
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center w-full">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-yellow-400 hover:text-black" 
              onClick={() => navigate('/kanban')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold mx-auto pr-8">{activeBoard.title}</h1>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="hover:bg-yellow-400 hover:text-black"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem 
                onClick={() => setIsEditDialogOpen(true)}
                className="hover:bg-yellow-400 hover:text-black focus:bg-yellow-400 focus:text-black"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Board
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleDeleteBoard}
                className="text-destructive hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {activeBoard.description && (
          <p className="text-muted-foreground mb-6">{activeBoard.description}</p>
        )}

        <div className="overflow-x-auto pb-4" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="flex gap-6 min-w-max h-full">
            {activeBoard && activeBoard.columns.map(column => (
              <KanbanColumn
                key={column.id}
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
            ))}
            
            {/* Add new column button */}
            <div className="min-w-[100px] h-full flex items-center">
              <Button 
                variant="outline"
                className="border-dashed border-slate-700/50 p-6 h-[100px] hover:bg-yellow-400 hover:text-black transition-colors"
                onClick={() => setIsAddColumnDialogOpen(true)}
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Column
              </Button>
            </div>
          </div>
        </div>
      
      {/* Add Task Dialog */}
      <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>
              Create a new task for the {taskStatus} column.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="title">Title</label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Task title"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="description">Description</label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Task description"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="priority">Priority</label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => setFormData({...formData, priority: value})}
              >
                <SelectTrigger 
                  id="priority"
                  className="w-full hover:bg-yellow-400 hover:text-black focus:ring-yellow-400"
                >
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="select-content-custom">
                  <SelectItem value="low" className="select-item-hover">Low</SelectItem>
                  <SelectItem value="medium" className="select-item-hover">Medium</SelectItem>
                  <SelectItem value="high" className="select-item-hover">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="tags">Tags (comma separated)</label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({...formData, tags: e.target.value})}
                placeholder="work, personal, etc."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="startDate">Start Date</label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="dueDate">Due Date</label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Task Dialog */}
      <Dialog open={isEditTaskDialogOpen} onOpenChange={setIsEditTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Make changes to your task.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-title">Title</label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="Task title"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="edit-description">Description</label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Task description"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="edit-priority">Priority</label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => setFormData({...formData, priority: value})}
              >
                <SelectTrigger 
                  id="edit-priority"
                  className="w-full hover:bg-yellow-400 hover:text-black focus:ring-yellow-400"
                >
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="select-content-custom">
                  <SelectItem value="low" className="select-item-hover">Low</SelectItem>
                  <SelectItem value="medium" className="select-item-hover">Medium</SelectItem>
                  <SelectItem value="high" className="select-item-hover">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="edit-tags">Tags (comma separated)</label>
              <Input
                id="edit-tags"
                value={formData.tags}
                onChange={(e) => setFormData({...formData, tags: e.target.value})}
                placeholder="work, personal, etc."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-startDate">Start Date</label>
                <Input
                  id="edit-startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="edit-dueDate">Due Date</label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTask}>Update Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Board Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Board</DialogTitle>
            <DialogDescription>
              Make changes to your board.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="board-title">Title</label>
              <Input
                id="board-title"
                value={activeBoard.title}
                onChange={(e) => 
                  boardId && updateKanbanBoard(boardId, { ...activeBoard, title: e.target.value })
                }
                placeholder="Board title"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="board-description">Description</label>
              <Textarea
                id="board-description"
                value={activeBoard.description || ''}
                onChange={(e) => 
                  boardId && updateKanbanBoard(boardId, { ...activeBoard, description: e.target.value })
                }
                placeholder="Board description"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditBoard}>Update Board</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Column Dialog */}
      <Dialog open={isAddColumnDialogOpen} onOpenChange={setIsAddColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>
              Create a new column for your board.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="column-title">Title</label>
              <Input
                id="column-title"
                value={columnFormData.title}
                onChange={(e) => setColumnFormData({...columnFormData, title: e.target.value})}
                placeholder="Column title"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="column-status">Status ID</label>
              <Input
                id="column-status"
                value={columnFormData.status}
                onChange={(e) => setColumnFormData({...columnFormData, status: e.target.value.toLowerCase().replace(/\s+/g, '')})}
                placeholder="E.g. todo, inreview, inprogress"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be used as the column's unique identifier. Use lowercase letters without spaces.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddColumnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DndProvider>
  );
}