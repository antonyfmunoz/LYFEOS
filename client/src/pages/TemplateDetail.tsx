import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Save, 
  Star, 
  Trash2, 
  Plus, 
  FilePlus,
  Folder,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Define interfaces for our data types
interface Template {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  content: string;
  format: string;
  category: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Folder {
  id: number;
  userId: number;
  parentId: number | null;
  name: string;
  description: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateResponse {
  template: Template;
}

interface FoldersResponse {
  folders: Folder[];
}

export default function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('markdown');
  const [category, setCategory] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isCreateDocumentOpen, setIsCreateDocumentOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  
  const isNewTemplate = id === 'new';
  
  // Fetch template data
  const { data: templateData, isLoading, error } = useQuery<TemplateResponse>({
    queryKey: ['/api/templates', id],
    enabled: !!user && !isNewTemplate,
  });
  
  // Fetch folders for document creation
  const { data: foldersData } = useQuery<FoldersResponse>({
    queryKey: ['/api/users', user?.id, 'folders'],
    enabled: !!user,
  });
  
  const folders = foldersData?.folders || [];
  
  // Update form with template data
  useEffect(() => {
    if (templateData?.template) {
      const template = templateData.template;
      setTitle(template.title);
      setDescription(template.description || '');
      setContent(template.content);
      setFormat(template.format);
      setCategory(template.category);
      setTags(template.tags || []);
    }
  }, [templateData]);
  
  // Create new template
  const createMutation = useMutation({
    mutationFn: async (newTemplate: Partial<Template>) => {
      return apiRequest('/api/templates', {
        method: 'POST',
        body: JSON.stringify(newTemplate),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Template created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'templates'] });
      navigate(`/templates/${data.template.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      });
      console.error("Error creating template:", error);
    },
  });
  
  // Update existing template
  const updateMutation = useMutation({
    mutationFn: async (updatedTemplate: Partial<Template>) => {
      return apiRequest(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updatedTemplate),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/templates', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'templates'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update template",
        variant: "destructive",
      });
      console.error("Error updating template:", error);
    },
  });
  
  // Delete template
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'templates'] });
      navigate('/templates');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
      console.error("Error deleting template:", error);
    },
  });
  
  // Toggle favorite status
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/templates/${id}/toggle-favorite`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Favorite status updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/templates', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'templates'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
      console.error("Error toggling favorite status:", error);
    },
  });
  
  // Create document from template
  const createDocumentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/templates/${id}/create-document`, {
        method: 'POST',
        body: JSON.stringify({
          title: newDocTitle || `${title} (Copy)`,
          folderId: selectedFolderId,
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Document created from template",
      });
      setIsCreateDocumentOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'documents'] });
      navigate(`/documents/${data.document.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create document from template",
        variant: "destructive",
      });
      console.error("Error creating document from template:", error);
    },
  });
  
  const handleSaveTemplate = () => {
    const templateData = {
      title,
      description,
      content,
      format,
      category,
      tags,
    };
    
    if (isNewTemplate) {
      createMutation.mutate(templateData);
    } else {
      updateMutation.mutate(templateData);
    }
  };
  
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const handleCreateDocument = () => {
    createDocumentMutation.mutate();
  };
  
  if (isLoading && !isNewTemplate) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
          <div className="h-4 bg-muted rounded mb-6 w-2/3"></div>
          <div className="h-64 bg-muted rounded mb-6"></div>
        </div>
      </div>
    );
  }
  
  if (error && !isNewTemplate) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <h1 className="text-2xl font-medium mb-4">Error Loading Template</h1>
        <p className="text-muted-foreground mb-6">Unable to load template details.</p>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Templates
        </Button>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate('/templates')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>
      
      <Card className="border-slate-700/20 shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30">
          <div className="flex justify-between items-center">
            <CardTitle className="font-orbitron">
              {isNewTemplate ? 'New Template' : 'Edit Template'}
            </CardTitle>
            
            {!isNewTemplate && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-8 w-8 ${templateData?.template.favorite ? 'text-yellow-500' : ''}`}
                  onClick={() => toggleFavoriteMutation.mutate()}
                >
                  <Star
                    className={`h-4 w-4 ${
                      templateData?.template.favorite ? 'fill-yellow-500' : ''
                    }`}
                  />
                </Button>
                
                <Dialog open={isCreateDocumentOpen} onOpenChange={setIsCreateDocumentOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="h-8 text-xs">
                      <FilePlus className="h-3.5 w-3.5 mr-1.5" />
                      Create Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Document from Template</DialogTitle>
                      <DialogDescription>
                        Use this template to create a new document. You can customize the document title and location.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-doc-title">Document Title</Label>
                        <Input
                          id="new-doc-title"
                          placeholder="Enter document title"
                          value={newDocTitle}
                          onChange={(e) => setNewDocTitle(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="folder">Folder (Optional)</Label>
                        <Select
                          value={selectedFolderId?.toString() || ''}
                          onValueChange={(value) => setSelectedFolderId(value ? parseInt(value) : null)}
                        >
                          <SelectTrigger id="folder">
                            <SelectValue placeholder="Select a folder (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No folder</SelectItem>
                            {folders.map((folder) => (
                              <SelectItem key={folder.id} value={folder.id.toString()}>
                                {folder.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button variant="secondary" onClick={() => setIsCreateDocumentOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateDocument}>
                        Create Document
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Template</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this template? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate()}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
          <CardDescription>
            {isNewTemplate 
              ? 'Create a reusable document template'
              : 'Edit this template or create documents from it'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title*</Label>
            <Input
              id="title"
              placeholder="Template title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Template description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="plain">Plain Text</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="Template category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2 flex-wrap mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 items-center">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Add a tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button variant="outline" onClick={handleAddTag} className="shrink-0">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Template content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[200px] font-mono"
            />
          </div>
        </CardContent>
        
        <Separator />
        
        <CardFooter className="p-4 bg-muted/20 flex justify-between">
          <Button variant="outline" onClick={() => navigate('/templates')}>Cancel</Button>
          <Button 
            onClick={handleSaveTemplate} 
            disabled={!title.trim() || createMutation.isPending || updateMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}