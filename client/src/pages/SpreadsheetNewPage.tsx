import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FileSpreadsheet,
  ArrowLeft,
  Save
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from "@/hooks/use-page-title";

export default function SpreadsheetNewPage() {
  usePageTitle("New Spreadsheet");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  // Spreadsheet metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  
  // Create spreadsheet mutation
  const createSpreadsheetMutation = useMutation({
    mutationFn: async (spreadsheetData: { title: string; description: string; category: string }) => {
      const response = await fetch('/api/spreadsheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...spreadsheetData,
          content: { cells: {} }, // Empty spreadsheet content
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create spreadsheet');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'spreadsheets'] });
      toast({
        title: 'Success',
        description: 'Spreadsheet created successfully',
      });
      
      // Navigate to the new spreadsheet
      navigate(`/spreadsheets/${data.spreadsheet.id}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create spreadsheet',
        variant: 'destructive',
      });
    },
  });
  
  // Handle create spreadsheet
  const handleCreateSpreadsheet = () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }
    
    createSpreadsheetMutation.mutate({
      title,
      description,
      category,
    });
  };
  
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 mr-1" 
          onClick={() => navigate('/spreadsheets')}
          aria-label="Back to spreadsheets"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-orbitron">New Spreadsheet</h1>
      </div>
      
      <Card className="border border-slate-700/30 mb-6">
        <CardContent className="p-6">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="title" className="text-sm mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter spreadsheet title"
                className="w-full"
              />
            </div>
            
            <div>
              <Label htmlFor="description" className="text-sm mb-1.5 block">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter optional description"
                className="w-full resize-none"
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="category" className="text-sm mb-1.5 block">
                Category
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Enter category (default: general)"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Categories help organize your spreadsheets (e.g., finance, personal, work)
              </p>
            </div>
            
            <div className="flex justify-end mt-4">
              <Button
                variant="outline"
                className="mr-2"
                onClick={() => navigate('/spreadsheets')}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSpreadsheet}
                disabled={createSpreadsheetMutation.isPending}
              >
                {createSpreadsheetMutation.isPending ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Create Spreadsheet
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="text-center p-6 rounded-lg border border-dashed border-slate-700/30 bg-slate-800/10">
        <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-primary/70" />
        <h3 className="text-lg font-medium mb-2">Your new spreadsheet will appear here</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Create your spreadsheet using the form above. Once created, you'll be able to add 
          and edit cells, organize data, and save your work.
        </p>
      </div>
    </div>
  );
}