import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  FileText,
  ArrowLeft,
  MoreHorizontal,
  Trash2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from "@/hooks/use-page-title";

// Spreadsheet interface
interface Spreadsheet {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  content: any; // JSON data
  favorite: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export default function SpreadsheetsPage() {
  usePageTitle("Spreadsheets");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [spreadsheetToDelete, setSpreadsheetToDelete] = useState<number | null>(null);
  
  // New spreadsheet form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newType, setNewType] = useState('regular'); // regular, canvas, or graph
  
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
  
  // Create spreadsheet mutation
  const createSpreadsheetMutation = useMutation({
    mutationFn: async (spreadsheetData: { title: string; description: string; category: string; type: string }) => {
      // Prepare content based on type
      let content = {};
      
      if (spreadsheetData.type === 'regular') {
        content = { cells: {} }; // Regular spreadsheet with cells
      } else if (spreadsheetData.type === 'canvas') {
        content = { elements: [], connections: [] }; // Canvas with elements and connections
      } else if (spreadsheetData.type === 'graph') {
        content = { nodes: [], edges: [] }; // Graph with nodes and edges
      }
      
      const response = await fetch('/api/spreadsheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...spreadsheetData,
          content,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create spreadsheet');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'spreadsheets'] });
      toast({
        title: 'Success',
        description: 'Spreadsheet created successfully',
      });
      
      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewCategory('general');
      setNewType('regular');
      setIsNewDialogOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create spreadsheet',
        variant: 'destructive',
      });
    },
  });
  
  // Delete spreadsheet mutation
  const deleteSpreadsheetMutation = useMutation({
    mutationFn: async (spreadsheetId: number) => {
      const response = await fetch(`/api/spreadsheets/${spreadsheetId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete spreadsheet');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'spreadsheets'] });
      toast({
        title: 'Success',
        description: 'Spreadsheet deleted successfully',
      });
      setIsDeleteDialogOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete spreadsheet',
        variant: 'destructive',
      });
    },
  });
  
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
  
  // Toggle favorite status
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    toggleFavoriteMutation.mutate(id);
  };

  // Create a new spreadsheet
  const handleCreateSpreadsheet = () => {
    if (!newTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }
    
    createSpreadsheetMutation.mutate({
      title: newTitle,
      description: newDescription,
      category: newCategory,
      type: newType,
    });
  };
  
  // Initialize delete dialog
  const confirmDeleteSpreadsheet = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    setSpreadsheetToDelete(id);
    setIsDeleteDialogOpen(true);
  };
  
  // Execute delete
  const handleDeleteSpreadsheet = () => {
    if (spreadsheetToDelete !== null) {
      deleteSpreadsheetMutation.mutate(spreadsheetToDelete);
    }
  };
  
  // Get category count
  const getCategoryCount = (category: string) => {
    return spreadsheets.filter((spreadsheet: Spreadsheet) => spreadsheet.category === category).length;
  };
  
  // Get all unique categories
  const categories = Array.from(new Set(spreadsheets.map((s: Spreadsheet) => s.category))) as string[];
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 mr-1" 
          onClick={() => navigate('/systems')}
          aria-label="Back to systems"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-orbitron">Spreadsheets</h1>
      </div>
      
      {/* Search and Filter Controls */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search spreadsheets..."
              className="pl-9 md:w-[250px] border border-slate-700/30"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50">
                <Plus className="h-4 w-4 mr-1" />
                New Spreadsheet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Spreadsheet</DialogTitle>
                <DialogDescription>
                  Create a new spreadsheet to store and organize your data.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input 
                    id="title" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Enter spreadsheet title"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea 
                    id="description" 
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input 
                    id="category" 
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter category"
                  />
                  <p className="text-xs text-muted-foreground">Default is "general"</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleCreateSpreadsheet}
                  disabled={createSpreadsheetMutation.isPending}
                >
                  {createSpreadsheetMutation.isPending ? 'Creating...' : 'Create Spreadsheet'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Categories */}
      <div className="flex flex-wrap gap-2 mb-4">
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
      
      {/* Spreadsheets List */}
      {isLoading ? (
        <div className="text-center py-8">Loading spreadsheets...</div>
      ) : isError ? (
        <div className="text-center py-8 text-red-500">Error loading spreadsheets</div>
      ) : filteredSpreadsheets.length > 0 ? (
        <div className="grid gap-3">
          {filteredSpreadsheets.map((spreadsheet: Spreadsheet) => (
            <Card 
              key={spreadsheet.id} 
              className="border border-slate-700/30 hover:border-primary/50 transition-colors cursor-pointer hover:bg-primary/5"
              onClick={() => navigate(`/spreadsheets/${spreadsheet.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/20">
                      <FileSpreadsheet className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-1">
                        {spreadsheet.title}
                        {spreadsheet.favorite && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                      </div>
                      {spreadsheet.description && (
                        <p className="text-sm text-muted-foreground">{spreadsheet.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs font-normal">
                          {spreadsheet.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Updated {formatDate(spreadsheet.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => toggleFavorite(spreadsheet.id, e)}
                      title={spreadsheet.favorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className={`h-4 w-4 ${spreadsheet.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => confirmDeleteSpreadsheet(spreadsheet.id, e)}>
                          <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border rounded-lg border-dashed border-slate-700/50">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">No spreadsheets found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchTerm || selectedCategory 
              ? "Try changing your search or filter criteria" 
              : "Create your first spreadsheet to get started"}
          </p>
          <Button 
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
            onClick={() => setIsNewDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Spreadsheet
          </Button>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Spreadsheet</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this spreadsheet? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteSpreadsheet}
              disabled={deleteSpreadsheetMutation.isPending}
            >
              {deleteSpreadsheetMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}