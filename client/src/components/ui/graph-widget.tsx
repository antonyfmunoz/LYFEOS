import { useState } from 'react';
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Network,
  Plus, 
  Search, 
  Star,
  GitBranch
} from "lucide-react";
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';

// Define graph type to match the database schema
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

export function GraphWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Fetch graphs from the database
  const { data: graphsData, isLoading, isError } = useQuery({
    queryKey: ['/api/users', user?.id, 'graphs'],
    queryFn: async () => {
      if (!user) return { graphs: [] };
      const response = await fetch(`/api/users/${user.id}/graphs`);
      if (!response.ok) {
        throw new Error('Failed to fetch graphs');
      }
      return response.json();
    },
    enabled: !!user,
  });
  
  const graphs = graphsData?.graphs || [];
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (graphId: number) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'graphs'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });
  
  // Filter graphs based on search term and category
  const filteredGraphs = graphs.filter((graph: Graph) => {
    const matchesSearch = 
      graph.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (graph.description ? graph.description.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? graph.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Display only top 3 graphs for the widget view
  const displayedGraphs = filteredGraphs.slice(0, 3);
  
  // Toggle favorite status
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    toggleFavoriteMutation.mutate(id);
  };

  // Get category count
  const getCategoryCount = (category: string) => {
    return graphs.filter((graph: Graph) => graph.category === category).length;
  };
  
  // Get all unique categories
  const categories = Array.from(new Set(graphs.map((g: Graph) => g.category))) as string[];
  
  return (
    <Card className="w-full border border-slate-700/30 p-0 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search graphs..."
                className="pl-9 w-full max-w-[200px] border border-slate-700/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <Link to="/graphs" className="text-xs text-primary hover:underline">
            View All
          </Link>
        </div>
        
        <div className="flex gap-2 mb-3 flex-wrap">
          <Badge 
            variant={selectedCategory === null ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            All ({graphs.length})
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
          {displayedGraphs.length > 0 ? (
            displayedGraphs.map((graph: Graph) => (
              <div 
                key={graph.id} 
                className="flex items-center justify-between p-2 rounded-md border border-slate-700/30 hover:border-primary/50 transition-colors cursor-pointer hover:bg-primary/5"
                onClick={() => navigate(`/graphs/${graph.id}`)}>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-500/20">
                    <Network className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {graph.title}
                      {graph.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> {graph.description || 'No description'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => toggleFavorite(graph.id, e)}
                  >
                    <Star className={`h-3.5 w-3.5 ${graph.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No graphs found
            </div>
          )}
          
          {/* Add New Graph Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full border-dashed border-slate-700/30 text-xs hover:text-primary hover:border-primary/50"
            onClick={() => navigate("/graphs/new")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add New Graph
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}