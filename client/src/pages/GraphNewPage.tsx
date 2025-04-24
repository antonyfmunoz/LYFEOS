import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Save, Network } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function GraphNewPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  
  // Create graph mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/graphs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description || null,
          category,
          content: {
            nodes: [],
            edges: []
          }, // Empty content for new graph
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create graph');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: 'Knowledge graph created successfully',
      });
      navigate(`/graphs/${data.graph.id}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create knowledge graph',
        variant: 'destructive',
      });
    },
  });
  
  // Create graph
  const createGraph = () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }
    
    createMutation.mutate();
  };
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2" onClick={() => navigate("/graphs")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-orbitron flex items-center">
              <Network className="mr-2 h-5 w-5 text-primary" />
              Create New Knowledge Graph
            </h1>
            <p className="text-[#7DAAB2]">Map connections between concepts, ideas, and information</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-6 max-w-3xl">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter graph title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
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
              placeholder="Graph description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>
        
        {/* Graph Preview Area (Placeholder) */}
        <div className="border border-slate-700/30 rounded-md h-[400px] flex items-center justify-center bg-black/10 relative">
          <div className="text-center p-4">
            <Network className="mx-auto h-10 w-10 text-primary mb-2" />
            <h3 className="text-lg font-medium mb-1">Your Knowledge Graph Awaits</h3>
            <p className="text-muted-foreground mb-4">
              Create your graph to start connecting ideas, concepts, and information in a visual network.
            </p>
            <p className="text-xs text-muted-foreground">
              Once created, you'll be able to add nodes and edges to represent your knowledge network.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => navigate("/graphs")}>
            Cancel
          </Button>
          <Button 
            onClick={createGraph} 
            disabled={createMutation.isPending}
            className="hover:bg-primary hover:text-background"
          >
            {createMutation.isPending ? "Creating..." : "Create Graph"}
          </Button>
        </div>
      </div>
    </div>
  );
}