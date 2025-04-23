import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Save, Network, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// Interface matching the Graph type defined in schema.ts
interface Graph {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  content: any; // JSON data for nodes and edges
  favorite: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export default function GraphDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const graphId = parseInt(params.id);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState<any>({});
  const [favorite, setFavorite] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Fetch graph
  const { data: graphData, isLoading, isError } = useQuery({
    queryKey: ['/api/graphs', graphId],
    queryFn: async () => {
      if (!user || isNaN(graphId)) return null;
      const response = await fetch(`/api/graphs/${graphId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch graph');
      }
      return response.json();
    },
    enabled: !!user && !isNaN(graphId),
  });
  
  // Update form state when graph data is loaded
  useEffect(() => {
    if (graphData?.graph) {
      setTitle(graphData.graph.title);
      setDescription(graphData.graph.description || '');
      setCategory(graphData.graph.category);
      setContent(graphData.graph.content);
      setFavorite(graphData.graph.favorite);
    }
  }, [graphData]);
  
  const graph = graphData?.graph;
  
  // Update graph mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedGraph: Partial<Graph>) => {
      const response = await fetch(`/api/graphs/${graphId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedGraph),
      });
      if (!response.ok) {
        throw new Error('Failed to update graph');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/graphs', graphId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'graphs'] });
      setIsEditing(false);
      toast({
        title: 'Success',
        description: 'Graph updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update graph',
        variant: 'destructive',
      });
    },
  });
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/graphs/${graphId}/toggle-favorite`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/graphs', graphId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'graphs'] });
      setFavorite(data.graph.favorite);
      toast({
        title: 'Success',
        description: `Graph ${data.graph.favorite ? 'added to' : 'removed from'} favorites`,
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
  
  if (isNaN(graphId)) {
    return (
      <div className="container mx-auto py-6 text-center">
        <h1 className="text-2xl font-medium mb-4">Invalid Graph ID</h1>
        <Button variant="default" onClick={() => navigate("/graphs")}>
          Back to Graphs
        </Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2" onClick={() => navigate("/graphs")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {isLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <div>
              <h1 className="text-2xl font-orbitron flex items-center">
                <Network className="mr-2 h-5 w-5 text-primary" />
                {isEditing ? (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="ml-1 font-orbitron text-xl py-0 h-8"
                    placeholder="Graph Title"
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
                  {category.charAt(0).toUpperCase() + category.slice(1)} Knowledge Graph
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
                    Edit Graph
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
          <h3 className="text-lg font-medium mb-1">Failed to load graph</h3>
          <p className="text-muted-foreground mb-4">There was an error loading this graph</p>
          <Button variant="default" onClick={() => navigate("/graphs")}>
            Back to Graphs
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
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="concepts">Concepts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Graph description"
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
          
          {/* Graph Visualization Area (Placeholder) */}
          <div className="border border-slate-700/30 rounded-md h-[600px] flex items-center justify-center bg-black/10 relative">
            <div className="text-center p-4">
              <Network className="mx-auto h-10 w-10 text-primary mb-2" />
              <h3 className="text-lg font-medium mb-1">Knowledge Graph Visualization</h3>
              <p className="text-muted-foreground mb-4">
                This is a placeholder for the graph visualization area. In a real implementation, 
                you would integrate a graph visualization library here.
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