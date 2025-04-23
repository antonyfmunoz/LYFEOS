import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FileSpreadsheet,
  ArrowLeft,
  Save,
  Plus,
  Trash
} from "lucide-react";
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
  content: {
    cells: Record<string, string>;
  };
  favorite: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

// Cell coordinate type
type CellCoord = {
  row: number;
  col: number;
};

// Helper to convert row/column to cell id (A1, B2, etc)
const getCellId = (row: number, col: number): string => {
  const colLetter = String.fromCharCode(65 + col); // A, B, C, ...
  return `${colLetter}${row + 1}`;
};

// Helper to parse cell id into row/column
const parseCellId = (cellId: string): CellCoord => {
  const colLetter = cellId.charAt(0);
  const col = colLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, ...
  const row = parseInt(cellId.substring(1)) - 1;
  return { row, col };
};

export default function SpreadsheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const spreadsheetId = parseInt(id);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  // Spreadsheet metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  
  // Spreadsheet data
  const [cells, setCells] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<number[]>(Array.from({ length: 10 }, (_, i) => i));
  const [cols, setCols] = useState<number[]>(Array.from({ length: 10 }, (_, i) => i));
  const [isEditing, setIsEditing] = useState(false);
  
  // Fetch spreadsheet data
  const {
    data: spreadsheetData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['/api/spreadsheets', spreadsheetId],
    queryFn: async () => {
      if (!user || isNaN(spreadsheetId)) return null;
      
      const response = await fetch(`/api/spreadsheets/${spreadsheetId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch spreadsheet');
      }
      return response.json();
    },
    enabled: !!user && !isNaN(spreadsheetId),
  });

  // Set page title
  usePageTitle(spreadsheetData?.spreadsheet?.title || "Spreadsheet");
  
  // Update spreadsheet mutation
  const updateSpreadsheetMutation = useMutation({
    mutationFn: async (spreadsheetData: Partial<Spreadsheet>) => {
      const response = await fetch(`/api/spreadsheets/${spreadsheetId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(spreadsheetData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update spreadsheet');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spreadsheets', spreadsheetId] });
      toast({
        title: 'Success',
        description: 'Spreadsheet updated successfully',
      });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update spreadsheet',
        variant: 'destructive',
      });
    },
  });
  
  // Initialize data from spreadsheet
  useEffect(() => {
    if (spreadsheetData?.spreadsheet) {
      const spreadsheet = spreadsheetData.spreadsheet;
      setTitle(spreadsheet.title);
      setDescription(spreadsheet.description || '');
      setCategory(spreadsheet.category);
      
      // Initialize cells
      if (spreadsheet.content && spreadsheet.content.cells) {
        setCells(spreadsheet.content.cells);
        
        // Determine if we need to expand the grid based on existing data
        let maxRow = rows.length - 1;
        let maxCol = cols.length - 1;
        
        Object.keys(spreadsheet.content.cells).forEach(cellId => {
          const { row, col } = parseCellId(cellId);
          maxRow = Math.max(maxRow, row);
          maxCol = Math.max(maxCol, col);
        });
        
        // Expand grid if needed
        if (maxRow >= rows.length) {
          setRows(Array.from({ length: maxRow + 5 }, (_, i) => i));
        }
        
        if (maxCol >= cols.length) {
          setCols(Array.from({ length: maxCol + 5 }, (_, i) => i));
        }
      }
    }
  }, [spreadsheetData]);
  
  // Handle cell change
  const handleCellChange = (row: number, col: number, value: string) => {
    const cellId = getCellId(row, col);
    setCells(prev => ({
      ...prev,
      [cellId]: value,
    }));
  };
  
  // Save changes
  const handleSave = () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }
    
    updateSpreadsheetMutation.mutate({
      title,
      description,
      category,
      content: { cells },
    });
  };
  
  // Add row
  const addRow = () => {
    setRows(prev => [...prev, prev.length]);
  };
  
  // Add column
  const addColumn = () => {
    setCols(prev => [...prev, prev.length]);
  };
  
  if (isLoading) {
    return <div className="text-center py-8">Loading spreadsheet...</div>;
  }
  
  if (isError || !spreadsheetData?.spreadsheet) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Error loading spreadsheet</p>
        <Button 
          variant="outline" 
          onClick={() => navigate('/spreadsheets')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Spreadsheets
        </Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
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
        <div className="flex-1">
          {isEditing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-medium mb-1"
              placeholder="Spreadsheet Title"
            />
          ) : (
            <h1 className="text-2xl font-orbitron">{title}</h1>
          )}
          
          {isEditing ? (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description"
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="category" className="text-xs">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category"
                  className="mt-1"
                />
              </div>
            </div>
          ) : (
            description && <p className="text-[#7DAAB2] text-sm">{description}</p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button 
              variant="default"
              onClick={handleSave}
              disabled={updateSpreadsheetMutation.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          ) : (
            <Button 
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </div>
      
      <Card className="border border-slate-700/30 overflow-auto">
        <CardContent className="p-0">
          <div className="spreadsheet-container overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full border-collapse min-w-max">
              <thead>
                <tr>
                  <th className="w-10 h-10 bg-slate-800/20 border border-slate-700/30 sticky top-0 left-0 z-20"></th>
                  {cols.map(col => (
                    <th 
                      key={col} 
                      className="w-28 h-10 bg-slate-800/20 border border-slate-700/30 text-center text-sm font-medium text-muted-foreground sticky top-0 z-10"
                    >
                      {String.fromCharCode(65 + col)}
                    </th>
                  ))}
                  <th className="w-10 h-10 bg-slate-800/20 border border-slate-700/30 sticky top-0 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={addColumn}
                      title="Add column"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row}>
                    <td className="w-10 h-10 bg-slate-800/20 border border-slate-700/30 text-center text-sm font-medium text-muted-foreground sticky left-0 z-10">
                      {row + 1}
                    </td>
                    {cols.map(col => {
                      const cellId = getCellId(row, col);
                      return (
                        <td key={col} className="p-0 border border-slate-700/30">
                          <Input
                            className="border-0 h-10 w-full focus:ring-1 focus:ring-primary bg-transparent"
                            value={cells[cellId] || ''}
                            onChange={(e) => handleCellChange(row, col, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="w-10 border border-slate-700/30"></td>
                  </tr>
                ))}
                <tr>
                  <td className="w-10 h-10 bg-slate-800/20 border border-slate-700/30 sticky left-0 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={addRow}
                      title="Add row"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                  {cols.map(col => (
                    <td key={col} className="border border-slate-700/30"></td>
                  ))}
                  <td className="border border-slate-700/30"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}