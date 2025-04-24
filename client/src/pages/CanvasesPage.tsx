import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Plus, Paintbrush, Search, Star, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ToastAction } from '@/components/ui/toast';

// Interface matching the Canvas type defined in schema.ts
interface Canvas {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  content: any; // JSON data for canvas elements
  favorite: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export default function CanvasesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [canvasToDelete, setCanvasToDelete] = useState<number | null>(null);
  
  // Fetch canvases
  const { data: canvasesData, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/users', user?.id, 'canvases'],
    queryFn: async () => {
      if (!user) return { canvases: [] };
      const response = await fetch(`/api/users/${user.id}/canvases`);
      if (!response.ok) {
        throw new Error('Failed to fetch canvases');
      }
      return response.json();
    },
    enabled: !!user,
  });
  
  const canvases = canvasesData?.canvases || [];
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (canvasId: number) => {
      const response = await fetch(`/api/canvases/${canvasId}/toggle-favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to toggle favorite status');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'canvases'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (canvasId: number) => {
      const response = await fetch(`/api/canvases/${canvasId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete canvas');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'canvases'] });
      setDeleteDialogOpen(false);
      toast({
        title: 'Success',
        description: 'Canvas deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete canvas',
        variant: 'destructive',
      });
    },
  });
  
  // Toggle favorite handler
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate(id);
  };
  
  // Delete handler
  const deleteCanvas = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCanvasToDelete(id);
    setDeleteDialogOpen(true);
  };
  
  // Confirm delete
  const confirmDelete = () => {
    if (canvasToDelete !== null) {
      deleteMutation.mutate(canvasToDelete);
    }
  };

  // Filter canvases based on search term and category
  const filteredCanvases = canvases.filter((canvas: Canvas) => {
    const matchesSearch = 
      canvas.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (canvas.description ? canvas.description.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? canvas.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Get category count
  const getCategoryCount = (category: string) => {
    return canvases.filter((canvas: Canvas) => canvas.category === category).length;
  };
  
  // Get all unique categories
  const categories = Array.from(new Set(canvases.map((c: Canvas) => c.category))) as string[];
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          size="icon" 
          className="mr-2 hover:bg-primary hover:text-background" 
          onClick={() => navigate("/systems")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Canvases</h1>
          <p className="text-[#7DAAB2]">Create and manage your canvas drawings and diagrams</p>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search canvases..."
            className="pl-9 w-full border border-slate-700/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Button 
          variant="default" 
          onClick={() => navigate("/canvases/new")}
          className="hover:bg-primary hover:text-background"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Canvas
        </Button>
      </div>
      
      <div className="flex gap-2 mb-6 flex-wrap">
        <Badge 
          variant={selectedCategory === null ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSelectedCategory(null)}
        >
          All ({canvases.length})
        </Badge>
        
        <Badge 
          variant={selectedCategory === "general" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSelectedCategory("general")}
        >
          General ({getCategoryCount("general")})
        </Badge>
        
        {categories
          .filter(c => c !== "general")
          .map((category) => (
            <Badge 
              key={category}
              variant={selectedCategory === category ? "default" : "outline"} 
              className="cursor-pointer"
              onClick={() => setSelectedCategory(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)} ({getCategoryCount(category)})
            </Badge>
          ))
        }
      </div>
      
      {isLoading ? (
        <div className="text-center py-10">
          <div className="animate-pulse text-muted-foreground">Loading canvases...</div>
        </div>
      ) : isError ? (
        <div className="text-center py-10">
          <div className="text-destructive">Error loading canvases</div>
          <Button 
            variant="outline" 
            className="mt-2 hover:bg-primary hover:text-background" 
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      ) : filteredCanvases.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-md border-slate-700/30">
          <Paintbrush className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <h3 className="text-lg font-medium mb-1">No canvases found</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || selectedCategory
              ? "Try changing your search or filter criteria"
              : "Create your first canvas to get started"
            }
          </p>
          <Button 
            variant="default" 
            onClick={() => navigate("/canvases/new")}
            className="hover:bg-primary hover:text-background"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Canvas
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCanvases.map((canvas: Canvas) => (
            <div
              key={canvas.id}
              className="border border-slate-700/30 rounded-lg overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => navigate(`/canvases/${canvas.id}`)}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center bg-purple-500/20 mr-3">
                      <Paintbrush className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="font-medium text-base flex items-center gap-1">
                        {canvas.title}
                        {canvas.favorite && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                      </h3>
                      <div className="text-xs text-muted-foreground">
                        {canvas.category.charAt(0).toUpperCase() + canvas.category.slice(1)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-primary hover:text-background"
                      onClick={(e) => toggleFavorite(canvas.id, e)}
                    >
                      <Star className={`h-4 w-4 ${canvas.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-primary hover:text-background"
                      onClick={(e) => deleteCanvas(canvas.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <p className="text-sm line-clamp-2 text-muted-foreground">
                  {canvas.description || "No description"}
                </p>
              </div>
              <div className="bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                Updated {new Date(canvas.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this canvas? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              className="hover:bg-primary hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              className="hover:bg-primary hover:text-background"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}