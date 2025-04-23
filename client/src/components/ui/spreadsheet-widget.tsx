import { useState } from 'react';
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  FileSpreadsheet,
  Plus, 
  Search, 
  Star,
  FileText
} from "lucide-react";
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';

// Define spreadsheet type to match the database schema
interface Spreadsheet {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  content: any; // Use any for JSON data
  favorite: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export function SpreadsheetWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Fetch spreadsheets from the database
  const { data: spreadsheetsData, isLoading, isError } = useQuery({
    queryKey: ['/api/users', user?.id, 'spreadsheets'],
    queryFn: async () => {
      if (!user) return { spreadsheets: [] };
      const response = await fetch(`/api/users/${user.id}/spreadsheets`);
      if (!response.ok) {
        throw new Error('Failed to fetch spreadsheets');
      }
      return response.json();
    },
    enabled: !!user,
  });
  
  const spreadsheets = spreadsheetsData?.spreadsheets || [];
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (spreadsheetId: number) => {
      const response = await fetch(`/api/spreadsheets/${spreadsheetId}/toggle-favorite`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'spreadsheets'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });
  
  // Filter spreadsheets based on search term and category
  const filteredSpreadsheets = spreadsheets.filter((spreadsheet: Spreadsheet) => {
    const matchesSearch = 
      spreadsheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (spreadsheet.description ? spreadsheet.description.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? spreadsheet.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Display only top 3 spreadsheets for the widget view
  const displayedSpreadsheets = filteredSpreadsheets.slice(0, 3);
  
  // Toggle favorite status
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    toggleFavoriteMutation.mutate(id);
  };

  // Get category count
  const getCategoryCount = (category: string) => {
    return spreadsheets.filter((spreadsheet: Spreadsheet) => spreadsheet.category === category).length;
  };
  
  // Get all unique categories
  const categories = Array.from(new Set(spreadsheets.map((s: Spreadsheet) => s.category)));
  
  return (
    <Card className="w-full border border-slate-700/30 p-0 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search spreadsheets..."
                className="pl-9 w-full max-w-[200px] border border-slate-700/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <Link to="/spreadsheets" className="text-xs text-primary hover:underline">
            View All
          </Link>
        </div>
        
        <div className="flex gap-2 mb-3 flex-wrap">
          <Badge 
            variant={selectedCategory === null ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            All ({spreadsheets.length})
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
            .map(category => (
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
          {displayedSpreadsheets.length > 0 ? (
            displayedSpreadsheets.map((spreadsheet: Spreadsheet) => (
              <div 
                key={spreadsheet.id} 
                className="flex items-center justify-between p-2 rounded-md border border-slate-700/30 hover:border-primary/50 transition-colors cursor-pointer hover:bg-primary/5"
                onClick={() => navigate(`/spreadsheets/${spreadsheet.id}`)}>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-green-500/20">
                    <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {spreadsheet.title}
                      {spreadsheet.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> {spreadsheet.description || 'No description'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => toggleFavorite(spreadsheet.id, e)}
                  >
                    <Star className={`h-3.5 w-3.5 ${spreadsheet.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No spreadsheets found
            </div>
          )}
          
          {/* Add New Spreadsheet Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full border-dashed border-slate-700/30 text-xs hover:text-primary hover:border-primary/50"
            onClick={() => navigate("/spreadsheets/new")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add New Spreadsheet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}