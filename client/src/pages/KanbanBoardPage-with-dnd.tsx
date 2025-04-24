import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
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
import { KanbanStatus, KanbanTask, KanbanColumn as KanbanColumnType } from '@/lib/types';

// Define item types for drag and drop
const ItemTypes = {
  TASK: 'task',
  COLUMN: 'column',
};

// Task Card Component Props
interface TaskCardProps {
  task: KanbanTask;
  index: number;
  onEdit: (task: KanbanTask) => void;
  onDelete: (id: string) => void;
  onMoveRight: (id: string, currentStatus: KanbanStatus) => void;
  onDragEnd: (result: any) => void;
}

// Task Card Component with Drag and Drop
function TaskCard({ task, index, onEdit, onDelete, onMoveRight }: TaskCardProps) {
  const priorityColors = {
    high: 'bg-red-500/10 text-red-500 border-red-500/20',
    medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    low: 'bg-green-500/10 text-green-500 border-green-500/20',
  };
  const priorityColor = priorityColors[task.priority] || priorityColors.medium;

  // Set up drag functionality
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: ItemTypes.TASK,
    item: { id: task.id, index, status: task.status },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging()
    })
  }));

  // Copy task to clipboard function
  const copyTask = () => {
    // Create a simplified version of the task to copy
    const taskCopy = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      tags: task.tags,
      startDate: task.startDate,
      dueDate: task.dueDate
    };
    
    navigator.clipboard.writeText(JSON.stringify(taskCopy, null, 2))
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

  return (
    <div 
      ref={dragPreview}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="mb-2"
    >
      <Card className="shadow-sm">
        <CardHeader className="p-3 pb-0 flex flex-row justify-between items-start">
          <div className="flex items-center gap-2">
            <div ref={drag} className="cursor-move">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-sm font-medium">{task.title}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 hover:bg-primary hover:text-background"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onEdit(task)}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={copyTask}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
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
                className="h-6 px-2 text-xs hover:bg-primary hover:text-background"
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

// Kanban Column Component Props
interface KanbanColumnProps {
  columnId: string;
  title: string;
  status: KanbanStatus;
  index: number;
  tasks: KanbanTask[];
  onEditTask: (task: KanbanTask) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (id: string, currentStatus: KanbanStatus) => void;
  onEditTitle: (columnId: string, newTitle: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onAddTask: (status: KanbanStatus) => void;
  onDropTask: (taskId: string, sourceStatus: KanbanStatus, targetStatus: KanbanStatus) => void;
  onMoveColumn: (fromIndex: number, toIndex: number) => void;
}

// Kanban Column Component with Drag and Drop
function KanbanColumn({ 
  columnId,
  title, 
  status,
  index,
  tasks,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  onEditTitle,
  onDeleteColumn,
  onAddTask,
  onDropTask,
  onMoveColumn
}: KanbanColumnProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [columnTitle, setColumnTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set up drag for the column
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: ItemTypes.COLUMN,
    item: { columnId, index },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging()
    })
  }));

  // Set up drop for tasks
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ItemTypes.TASK,
    drop: (item: { id: string, status: KanbanStatus }) => {
      if (item.status !== status) {
        onDropTask(item.id, item.status, status);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver()
    })
  }));

  // Set up drop for columns
  const [, columnDrop] = useDrop(() => ({
    accept: ItemTypes.COLUMN,
    hover: (item: { columnId: string, index: number }, monitor) => {
      if (item.index !== index) {
        onMoveColumn(item.index, index);
        item.index = index; // Update the item's index
      }
    }
  }));

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

  // Function to copy column configuration to clipboard
  const copyColumn = () => {
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
          title: "Failed to copy",
          description: "Could not copy column to clipboard",
          variant: "destructive",
          duration: 2000,
        });
        console.error('Failed to copy column:', err);
      });
  };

  // Combine refs
  const columnRef = (element: HTMLDivElement) => {
    drag(element);
    columnDrop(element);
  };

  return (
    <div 
      ref={dragPreview} 
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="min-w-[250px] w-[250px] flex-shrink-0"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div ref={columnRef} className="cursor-move">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-6 w-6 hover:bg-primary hover:text-background"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onAddTask(status)}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Task
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={copyColumn}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 mr-2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy Column
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the "${title}" column? All tasks in this column will be lost.`)) {
                    onDeleteColumn(columnId);
                  }
                }}
                className="text-red-500 hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
              >
                <X className="h-3 w-3 mr-2" />
                Delete Column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div 
        ref={drop} 
        className={`space-y-2 p-1 rounded-md transition-colors min-h-[200px] ${isOver ? 'bg-primary/10' : ''}`}
      >
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onMoveRight={onMoveTask}
            onDragEnd={() => {}}
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

  // Get ordered columns if available, or default status order
  const [columnsOrder, setColumnsOrder] = useState<KanbanColumnType[]>([]);

  // Find the active board
  const activeBoard = boardId ? kanbanBoards.find(board => board.id === boardId) : undefined;
  
  useEffect(() => {
    if (!activeBoard && kanbanBoards.length > 0) {
      // Redirect to the first board if the requested one doesn't exist
      navigate(`/kanban/board/${kanbanBoards[0].id}`);
    }
    
    // Initialize columns order
    if (activeBoard) {
      setColumnsOrder(activeBoard.columns || []);
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
            className="h-8 w-8 hover:bg-primary hover:text-background" 
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
              className="mt-4 flex items-center gap-2 text-primary border border-primary/50 px-4 py-2 rounded-md hover:bg-primary hover:text-background transition-all"
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
        duration: 3000,
      });
    }
  };

  // Handle drag and drop for tasks
  const handleTaskDrop = (taskId: string, sourceStatus: KanbanStatus, targetStatus: KanbanStatus) => {
    if (sourceStatus !== targetStatus) {
      moveKanbanTask(taskId, targetStatus);
    }
  };

  // Handle drag and drop for columns
  const handleMoveColumn = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    const newOrder = [...columnsOrder];
    const [movedColumn] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedColumn);
    
    // Update the column order in the state
    setColumnsOrder(newOrder);
    
    // Update the order property on all columns
    const updatedColumns = newOrder.map((column, index) => ({
      ...column,
      order: index
    }));
    
    // Update the board with the new column order
    if (boardId) {
      updateKanbanBoard(boardId, { columns: updatedColumns });
    }
  };

  // Function to paste tasks or columns from clipboard
  const handlePasteFromClipboard = () => {
    navigator.clipboard.readText()
      .then(text => {
        try {
          const data = JSON.parse(text);
          
          // Determine if this is a task or a column based on the data structure
          if (data.title && data.status && Array.isArray(data.tasks)) {
            // This is a column with tasks
            if (!boardId) return;
            
            // First add the column
            addKanbanColumn(boardId, {
              title: data.title,
              status: data.status
            });
            
            // Then add all the tasks
            if (data.tasks && data.tasks.length > 0) {
              data.tasks.forEach((taskData: any) => {
                createKanbanTask({
                  ...taskData,
                  status: data.status,
                  boardId: boardId
                });
              });
            }
            
            toast({
              title: "Column Pasted",
              description: `Column "${data.title}" with ${data.tasks.length} tasks was pasted`,
              className: "bg-background/80 border border-primary text-foreground",
              duration: 2000,
            });
          } else if (data.title) {
            // This is a single task
            if (!boardId) return;
            
            createKanbanTask({
              ...data,
              status: taskStatus, // Use the current active status
              boardId: boardId
            });
            
            toast({
              title: "Task Pasted",
              description: `Task "${data.title}" was pasted`,
              className: "bg-background/80 border border-primary text-foreground",
              duration: 2000,
            });
          } else {
            throw new Error("Invalid data format");
          }
        } catch (error) {
          toast({
            title: "Paste Failed",
            description: "Could not paste from clipboard. Invalid data format.",
            variant: "destructive",
            duration: 2000,
          });
          console.error('Failed to paste from clipboard:', error);
        }
      })
      .catch(err => {
        toast({
          title: "Paste Failed",
          description: "Could not read from clipboard",
          variant: "destructive",
          duration: 2000,
        });
        console.error('Failed to read clipboard:', err);
      });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container mx-auto p-6">
        <div className="flex items-center w-full mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary hover:text-background" 
            onClick={() => navigate('/kanban')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold mx-auto pr-8">{activeBoard.title}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-primary hover:text-background"
              >
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem 
                onClick={() => setIsEditDialogOpen(true)}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Board
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setIsAddColumnDialogOpen(true)}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handlePasteFromClipboard}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-2">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                </svg>
                Paste from Clipboard
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the "${activeBoard.title}" board? All tasks and columns will be lost.`)) {
                    handleDeleteBoard();
                  }
                }}
                className="text-red-500 hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Descriptive guide for users */}
        <Card className="mb-4">
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p><strong>Tip:</strong> Drag and drop tasks between columns. Use the grip handle to drag tasks or columns. Tasks and columns can be copied and pasted with the Copy button.</p>
          </CardContent>
        </Card>
        
        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columnsOrder.map((column, index) => (
            <KanbanColumn
              key={column.id}
              columnId={column.id}
              title={column.title}
              status={column.status}
              index={index}
              tasks={getTasksByStatus(column.status)}
              onEditTask={openEditDialog}
              onDeleteTask={deleteKanbanTask}
              onMoveTask={handleMoveTask}
              onEditTitle={(id, newTitle) => updateKanbanColumn(id, { title: newTitle })}
              onDeleteColumn={deleteKanbanColumn}
              onAddTask={handleAddTask}
              onDropTask={handleTaskDrop}
              onMoveColumn={handleMoveColumn}
            />
          ))}

          {!columnsOrder.length && (
            <Card className="w-full p-6 text-center">
              <p className="text-muted-foreground mb-4">This board doesn't have any columns yet.</p>
              <Button 
                onClick={() => setIsAddColumnDialogOpen(true)}
                className="hover:bg-primary hover:text-background"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </Card>
          )}
        </div>

        {/* Edit Board Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Board</DialogTitle>
              <DialogDescription>
                Update the details of your board.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="boardTitle" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="boardTitle"
                  placeholder="Board Title"
                  value={activeBoard.title}
                  onChange={(e) => updateKanbanBoard(boardId, { title: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="boardDescription" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="boardDescription"
                  placeholder="Board Description"
                  rows={3}
                  value={activeBoard.description}
                  onChange={(e) => updateKanbanBoard(boardId, { description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditBoard}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Task Dialog */}
        <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
              <DialogDescription>
                Create a new task in your board.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="taskTitle" className="text-sm font-medium">
                  Title *
                </label>
                <Input
                  id="taskTitle"
                  placeholder="Task Title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="taskDescription" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="taskDescription"
                  placeholder="Task Description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="taskPriority" className="text-sm font-medium">
                  Priority
                </label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value) => setFormData({...formData, priority: value})}
                >
                  <SelectTrigger id="taskPriority" className="hover:bg-primary hover:text-background">
                    <SelectValue placeholder="Select Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="taskTags" className="text-sm font-medium">
                  Tags (comma separated)
                </label>
                <Input
                  id="taskTags"
                  placeholder="e.g. frontend, bug, feature"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label htmlFor="taskStartDate" className="text-sm font-medium">
                    Start Date
                  </label>
                  <Input
                    id="taskStartDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="taskDueDate" className="text-sm font-medium">
                    Due Date
                  </label>
                  <Input
                    id="taskDueDate"
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
              <Button 
                onClick={handleCreateTask}
                disabled={!formData.title}
              >
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Task Dialog */}
        <Dialog open={isEditTaskDialogOpen} onOpenChange={setIsEditTaskDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Task</DialogTitle>
              <DialogDescription>
                Update the details of your task.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="editTaskTitle" className="text-sm font-medium">
                  Title *
                </label>
                <Input
                  id="editTaskTitle"
                  placeholder="Task Title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="editTaskDescription" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="editTaskDescription"
                  placeholder="Task Description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="editTaskPriority" className="text-sm font-medium">
                  Priority
                </label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value) => setFormData({...formData, priority: value})}
                >
                  <SelectTrigger id="editTaskPriority" className="hover:bg-primary hover:text-background">
                    <SelectValue placeholder="Select Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="editTaskTags" className="text-sm font-medium">
                  Tags (comma separated)
                </label>
                <Input
                  id="editTaskTags"
                  placeholder="e.g. frontend, bug, feature"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label htmlFor="editTaskStartDate" className="text-sm font-medium">
                    Start Date
                  </label>
                  <Input
                    id="editTaskStartDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="editTaskDueDate" className="text-sm font-medium">
                    Due Date
                  </label>
                  <Input
                    id="editTaskDueDate"
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
              <Button 
                onClick={handleUpdateTask}
                disabled={!formData.title}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Column Dialog */}
        <Dialog open={isAddColumnDialogOpen} onOpenChange={setIsAddColumnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Column</DialogTitle>
              <DialogDescription>
                Create a new column for your kanban board.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="columnTitle" className="text-sm font-medium">
                  Title *
                </label>
                <Input
                  id="columnTitle"
                  placeholder="Column Title"
                  value={columnFormData.title}
                  onChange={(e) => setColumnFormData({...columnFormData, title: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="columnStatus" className="text-sm font-medium">
                  Status Key *
                </label>
                <Input
                  id="columnStatus"
                  placeholder="Unique status key (e.g. planning, testing)"
                  value={columnFormData.status}
                  onChange={(e) => setColumnFormData({...columnFormData, status: e.target.value.toLowerCase().replace(/\s+/g, '')})}
                />
                <p className="text-xs text-muted-foreground">
                  This is a unique identifier for the column. Use lowercase without spaces.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddColumnDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddColumn}
                disabled={!columnFormData.title || !columnFormData.status}
              >
                Add Column
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DndProvider>
  );
}