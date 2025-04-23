import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Save, Paintbrush } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function CanvasNewPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  
  // Create canvas mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/canvases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description || null,
          category,
          content: {}, // Empty content for new canvas
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create canvas');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: 'Canvas created successfully',
      });
      navigate(`/canvases/${data.canvas.id}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create canvas',
        variant: 'destructive',
      });
    },
  });
  
  // Create canvas
  const createCanvas = () => {
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
          <Button variant="ghost" size="icon" className="mr-2" onClick={() => navigate("/canvases")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-orbitron flex items-center">
              <Paintbrush className="mr-2 h-5 w-5 text-primary" />
              Create New Canvas
            </h1>
            <p className="text-[#7DAAB2]">Design, draw, and organize your thoughts visually</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-6 max-w-3xl">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter canvas title"
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
                <SelectItem value="ideas">Ideas</SelectItem>
                <SelectItem value="projects">Projects</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Canvas description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>
        
        {/* Canvas Preview Area (Placeholder) */}
        <div className="border border-slate-700/30 rounded-md h-[400px] flex items-center justify-center bg-black/10 relative">
          <div className="text-center p-4">
            <Paintbrush className="mx-auto h-10 w-10 text-primary mb-2" />
            <h3 className="text-lg font-medium mb-1">Your Canvas Awaits</h3>
            <p className="text-muted-foreground mb-4">
              Create your canvas to start drawing, designing, and organizing your thoughts visually.
            </p>
            <p className="text-xs text-muted-foreground">
              Once created, you'll be able to use the full canvas editor to design your content.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => navigate("/canvases")}>
            Cancel
          </Button>
          <Button onClick={createCanvas} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Canvas"}
          </Button>
        </div>
      </div>
    </div>
  );
}