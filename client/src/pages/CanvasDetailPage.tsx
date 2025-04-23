import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Save, Paintbrush, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function CanvasDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const canvasId = parseInt(params.id);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState<any>({});
  const [favorite, setFavorite] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Fetch canvas
  const { data: canvasData, isLoading, isError } = useQuery({
    queryKey: ['/api/canvases', canvasId],
    queryFn: async () => {
      if (!user || isNaN(canvasId)) return null;
      const response = await fetch(`/api/canvases/${canvasId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch canvas');
      }
      return response.json();
    },
    enabled: !!user && !isNaN(canvasId),
  });
  
  // Update form state when canvas data is loaded
  useEffect(() => {
    if (canvasData?.canvas) {
      setTitle(canvasData.canvas.title);
      setDescription(canvasData.canvas.description || '');
      setCategory(canvasData.canvas.category);
      setContent(canvasData.canvas.content);
      setFavorite(canvasData.canvas.favorite);
    }
  }, [canvasData]);
  
  const canvas = canvasData?.canvas;
  
  // Update canvas mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedCanvas: Partial<Canvas>) => {
      const response = await fetch(`/api/canvases/${canvasId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedCanvas),
      });
      if (!response.ok) {
        throw new Error('Failed to update canvas');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/canvases', canvasId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'canvases'] });
      setIsEditing(false);
      toast({
        title: 'Success',
        description: 'Canvas updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update canvas',
        variant: 'destructive',
      });
    },
  });
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/canvases', canvasId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'canvases'] });
      setFavorite(data.canvas.favorite);
      toast({
        title: 'Success',
        description: `Canvas ${data.canvas.favorite ? 'added to' : 'removed from'} favorites`,
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });
  
  // Save changes
  const saveChanges = () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }
    
    updateMutation.mutate({
      title,
      description: description || null,
      category,
    });
  };
  
  // Toggle favorite
  const toggleFavorite = () => {
    toggleFavoriteMutation.mutate();
  };
  
  if (isNaN(canvasId)) {
    return (
      <div className="container mx-auto py-6 text-center">
        <h1 className="text-2xl font-medium mb-4">Invalid Canvas ID</h1>
        <Button variant="default" onClick={() => navigate("/canvases")}>
          Back to Canvases
        </Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2" onClick={() => navigate("/canvases")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {isLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <div>
              <h1 className="text-2xl font-orbitron flex items-center">
                <Paintbrush className="mr-2 h-5 w-5 text-primary" />
                {isEditing ? (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="ml-1 font-orbitron text-xl py-0 h-8"
                    placeholder="Canvas Title"
                  />
                ) : (
                  <span className="flex items-center">
                    {title}
                    {favorite && <Star className="ml-2 h-4 w-4 text-yellow-500 fill-yellow-500" />}
                  </span>
                )}
              </h1>
              {!isEditing && (
                <p className="text-[#7DAAB2]">
                  {category.charAt(0).toUpperCase() + category.slice(1)} Canvas
                </p>
              )}
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          {!isLoading && (
            <>
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveChanges} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={toggleFavorite}
                    disabled={toggleFavoriteMutation.isPending}
                    className="flex items-center gap-1"
                  >
                    <Star className={`h-4 w-4 ${favorite ? "text-yellow-500 fill-yellow-500" : ""}`} />
                    {favorite ? "Unfavorite" : "Favorite"}
                  </Button>
                  <Button variant="default" onClick={() => setIsEditing(true)}>
                    Edit Canvas
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : isError ? (
        <div className="text-center py-10 border border-dashed rounded-md border-slate-700/30">
          <h3 className="text-lg font-medium mb-1">Failed to load canvas</h3>
          <p className="text-muted-foreground mb-4">There was an error loading this canvas</p>
          <Button variant="default" onClick={() => navigate("/canvases")}>
            Back to Canvases
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {isEditing && (
            <div className="grid grid-cols-1 gap-4 mb-6">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={category}
                  onValueChange={setCategory}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="ideas">Ideas</SelectItem>
                    <SelectItem value="projects">Projects</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Canvas description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          
          {!isEditing && description && (
            <div className="bg-muted/20 p-4 rounded-md border border-slate-700/30">
              <h3 className="font-medium mb-1">Description</h3>
              <p className="text-muted-foreground">{description}</p>
            </div>
          )}
          
          {/* Canvas Drawing Area (Placeholder) */}
          <div className="border border-slate-700/30 rounded-md h-[600px] flex items-center justify-center bg-black/10 relative">
            <div className="text-center p-4">
              <Paintbrush className="mx-auto h-10 w-10 text-primary mb-2" />
              <h3 className="text-lg font-medium mb-1">Canvas Drawing Area</h3>
              <p className="text-muted-foreground mb-4">
                This is a placeholder for the canvas drawing area. In a real implementation, 
                you would integrate a drawing library here.
              </p>
              <p className="text-xs text-muted-foreground">
                Content will be stored as JSON in the database and rendered here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}