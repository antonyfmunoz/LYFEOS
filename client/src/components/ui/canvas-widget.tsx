import { useState } from 'react';
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Paintbrush,
  Plus, 
  Search, 
  Star,
  LayoutDashboard,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';

// Define canvas type to match the database schema
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

export function CanvasWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Fetch canvases from the database
  const { data: canvasesData, isLoading, isError } = useQuery({
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
  
  // Filter canvases based on search term and category
  const filteredCanvases = canvases.filter((canvas: Canvas) => {
    const matchesSearch = 
      canvas.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (canvas.description ? canvas.description.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? canvas.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Display only top 3 canvases for the widget view
  const displayedCanvases = filteredCanvases.slice(0, 3);
  
  // Toggle favorite status
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    toggleFavoriteMutation.mutate(id);
  };

  // Get category count
  const getCategoryCount = (category: string) => {
    return canvases.filter((canvas: Canvas) => canvas.category === category).length;
  };
  
  // Get all unique categories
  const categories = Array.from(new Set(canvases.map((c: Canvas) => c.category))) as string[];
  
  return (
    <Card className="w-full border border-slate-700/30 p-0 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search canvases..."
                className="pl-9 w-full max-w-[200px] border border-slate-700/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate("/canvases")}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex gap-2 mb-3 flex-wrap">
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
            .map((category: string) => (
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
        
        <div className="space-y-2">
          {displayedCanvases.length > 0 ? (
            displayedCanvases.map((canvas: Canvas) => (
              <div 
                key={canvas.id} 
                className="flex items-center justify-between p-2 rounded-md border border-slate-700/30 hover:border-primary/50 transition-colors cursor-pointer hover:bg-primary/5"
                onClick={() => navigate(`/canvases/${canvas.id}`)}>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-purple-500/20">
                    <Paintbrush className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {canvas.title}
                      {canvas.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <LayoutDashboard className="h-3 w-3" /> {canvas.description || 'No description'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => toggleFavorite(canvas.id, e)}
                  >
                    <Star className={`h-3.5 w-3.5 ${canvas.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No canvases found
            </div>
          )}
          
          {/* Add New Canvas Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full border-dashed border-slate-700/30 text-xs hover:text-background hover:bg-primary hover:border-primary"
            onClick={() => navigate("/canvases/new")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add New Canvas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}