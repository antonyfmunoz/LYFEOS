import React, { useState } from 'react';
import { ArrowLeft, Plus, MoreHorizontal, Trash, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLYFEOS } from '@/lib/context';
import { KanbanTask, KanbanStatus } from '@/lib/types';
import { useLocation } from 'wouter';

// BoardCard component for displaying individual boards on the main Kanban page
function BoardCard({ board, onView, onEdit, onDelete }) {
  return (
    <Card className="w-full h-full hover:shadow-lg transition-all duration-200 hover:border-primary/50">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{board.title}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 hover:bg-primary hover:text-background"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => onEdit(board)}
                className="hover:bg-primary hover:text-background focus:bg-primary focus:text-background"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Board
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(board.id)} 
                className="text-destructive hover:bg-red-500 hover:text-white focus:bg-red-500 focus:text-white"
              >
                <Trash className="h-4 w-4 mr-2" />
                Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {board.isDefault && (
          <div className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full w-fit mt-1">
            Default
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {board.description ? (
          <p className="text-sm text-muted-foreground">{board.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description</p>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-end">
        <Button variant="default" onClick={() => onView(board.id)}>
          View Board
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function KanbanPage() {
  const [, navigate] = useLocation();
  const { 
    kanbanBoards, 
    createKanbanBoard, 
    updateKanbanBoard,
    deleteKanbanBoard
  } = useLYFEOS();

  const [isNewBoardDialogOpen, setIsNewBoardDialogOpen] = useState(false);
  const [isEditBoardDialogOpen, setIsEditBoardDialogOpen] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState('');
  
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  
  const [editBoardData, setEditBoardData] = useState({
    id: '',
    title: '',
    description: '',
    isDefault: false
  });

  const handleCreateBoard = () => {
    if (!newBoardTitle.trim()) return;
    
    const newBoard = {
      title: newBoardTitle,
      description: newBoardDescription,
      isDefault: kanbanBoards.length === 0 // Make default if it's the first board
    };
    
    createKanbanBoard(newBoard);
    setNewBoardTitle('');
    setNewBoardDescription('');
    setIsNewBoardDialogOpen(false);
  };

  const handleEditBoard = () => {
    updateKanbanBoard(editBoardData.id, {
      title: editBoardData.title,
      description: editBoardData.description,
      isDefault: editBoardData.isDefault
    });
    setIsEditBoardDialogOpen(false);
  };

  const openEditBoardDialog = (board) => {
    setEditBoardData({
      id: board.id,
      title: board.title,
      description: board.description || '',
      isDefault: board.isDefault
    });
    setIsEditBoardDialogOpen(true);
  };

  const handleDeleteBoard = (boardId) => {
    if (confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
      deleteKanbanBoard(boardId);
    }
  };

  const handleViewBoard = (boardId) => {
    navigate(`/kanban/board/${boardId}`);
  };

  return (
    <>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center w-full">
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <h1 className="text-2xl font-bold mx-auto pr-8">Boards</h1>
          </div>
          
          <Button 
            onClick={() => setIsNewBoardDialogOpen(true)}
            className="bg-primary/10 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow hover:bg-primary hover:text-background"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Board
          </Button>
        </div>
        
        {kanbanBoards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kanbanBoards.map(board => (
              <BoardCard
                key={board.id}
                board={board}
                onView={handleViewBoard}
                onEdit={openEditBoardDialog}
                onDelete={handleDeleteBoard}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-10 border border-dashed border-slate-700/30 rounded-lg">
            <p className="text-muted-foreground mb-4">You don't have any boards yet</p>
            <Button 
              onClick={() => setIsNewBoardDialogOpen(true)}
              className="bg-primary/10 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow hover:bg-primary hover:text-background"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create First Board
            </Button>
          </div>
        )}
      </div>
      
      {/* New Board Dialog */}
      <Dialog open={isNewBoardDialogOpen} onOpenChange={setIsNewBoardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
            <DialogDescription>
              Create a new board to organize your tasks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="board-title">Board Title</label>
              <Input
                id="board-title"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="e.g., Project X, Personal Tasks"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="board-description">Description (optional)</label>
              <Textarea
                id="board-description"
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                placeholder="Brief description of this board's purpose"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewBoardDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBoard}>Create Board</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Board Dialog */}
      <Dialog open={isEditBoardDialogOpen} onOpenChange={setIsEditBoardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Board</DialogTitle>
            <DialogDescription>
              Update your board details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="edit-board-title">Board Title</label>
              <Input
                id="edit-board-title"
                value={editBoardData.title}
                onChange={(e) => setEditBoardData({...editBoardData, title: e.target.value})}
                placeholder="e.g., Project X, Personal Tasks"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="edit-board-description">Description (optional)</label>
              <Textarea
                id="edit-board-description"
                value={editBoardData.description}
                onChange={(e) => setEditBoardData({...editBoardData, description: e.target.value})}
                placeholder="Brief description of this board's purpose"
                rows={3}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-default"
                checked={editBoardData.isDefault}
                onChange={(e) => setEditBoardData({...editBoardData, isDefault: e.target.checked})}
                className="rounded border-gray-300"
              />
              <label htmlFor="is-default">Set as default board</label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditBoardDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditBoard}>Update Board</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}