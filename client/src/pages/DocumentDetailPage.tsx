import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Folder,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from 'lucide-react';

// Define interfaces for our data types
interface Document {
  id: number;
  userId: number;
  folderId: number | null;
  title: string;
  content: string;
  description: string | null;
  format: string;
  favorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface Folder {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  parentId: number | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocumentResponse {
  document: Document;
}

interface FoldersResponse {
  folders: Folder[];
}

export default function DocumentDetailPage() {
  const [, params] = useRoute<{ id: string }>('/documents/:id');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const isNewDocument = params?.id === 'new';
  const documentId = isNewDocument ? null : parseInt(params?.id || '0');
  
  // State for form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('markdown');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Fetch document if editing existing one
  const { data: documentData, isLoading: documentLoading } = useQuery<DocumentResponse>({
    queryKey: ['/api/documents', documentId],
    enabled: !!documentId && !!user,
  });
  
  // Fetch folders for the folder selection dropdown
  const { data: foldersData, isLoading: foldersLoading } = useQuery<FoldersResponse>({
    queryKey: ['/api/users', user?.id, 'folders'],
    enabled: !!user,
  });
  
  const folders = foldersData?.folders || [];
  
  // Fill form fields when document data is available
  useEffect(() => {
    if (documentData?.document) {
      const { document } = documentData;
      setTitle(document.title);
      setDescription(document.description || '');
      setContent(document.content);
      setFormat(document.format);
      setFolderId(document.folderId);
      setTags(document.tags);
    }
  }, [documentData]);
  
  // Mutations for CRUD operations
  const createMutation = useMutation({
    mutationFn: async (newDocument: any) => {
      return apiRequest('/api/documents', {
        method: 'POST',
        body: JSON.stringify(newDocument),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'documents'] });
      navigate('/documents');
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async (updatedDocument: any) => {
      return apiRequest(`/api/documents/${documentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updatedDocument),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'documents'] });
      navigate('/documents');
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'documents'] });
      navigate('/documents');
    },
  });
  
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/documents/${documentId}/toggle-favorite`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'documents'] });
    },
  });
  
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const handleSaveDocument = () => {
    const documentData = {
      title,
      description: description || null,
      content,
      format,
      folderId: folderId || null,
      tags,
    };
    
    if (isNewDocument) {
      createMutation.mutate(documentData);
    } else {
      updateMutation.mutate(documentData);
    }
  };
  
  const isLoading = documentLoading || foldersLoading;
  
  if (isLoading && !isNewDocument) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading document...</p>
      </div>
    );
  }
  
  if (!isNewDocument && !documentData && !isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <h1 className="text-2xl font-medium mb-4">Error Loading Document</h1>
        <p className="text-muted-foreground mb-6">Unable to load document details.</p>
        <Button 
          onClick={() => navigate('/documents')}
          className="hover:bg-yellow-400 hover:text-black"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Documents
        </Button>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/documents')} 
        className="mb-6 hover:bg-yellow-400 hover:text-black"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Documents
      </Button>
      
      <Card className="border-slate-700/20 shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30">
          <div className="flex justify-between items-center">
            <CardTitle className="font-orbitron">
              {isNewDocument ? 'New Document' : 'Edit Document'}
            </CardTitle>
            
            {!isNewDocument && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-8 w-8 ${documentData?.document.favorite ? 'text-yellow-500' : ''} hover:bg-yellow-400 hover:text-black`}
                  onClick={() => toggleFavoriteMutation.mutate()}
                >
                  <Star
                    className={`h-4 w-4 ${
                      documentData?.document.favorite ? 'fill-yellow-500' : ''
                    }`}
                  />
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Document</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this document? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="hover:bg-yellow-400 hover:text-black">Cancel</AlertDialogCancel>
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
            {isNewDocument 
              ? 'Create a new document'
              : 'Edit document details'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title*</Label>
            <Input
              id="title"
              placeholder="Document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Document description"
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
              <Label htmlFor="folder">Folder</Label>
              <Select 
                value={folderId?.toString() || ''} 
                onValueChange={(value) => setFolderId(value ? parseInt(value) : null)}
              >
                <SelectTrigger id="folder">
                  <SelectValue placeholder="Select folder (optional)" />
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
              <Button 
                variant="outline" 
                onClick={handleAddTag} 
                className="shrink-0 hover:bg-yellow-400 hover:text-black"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Document content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[200px] font-mono"
            />
          </div>
        </CardContent>
        
        <Separator />
        
        <CardFooter className="p-4 bg-muted/20 flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => navigate('/documents')}
            className="hover:bg-yellow-400 hover:text-black"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSaveDocument} 
            disabled={!title.trim() || createMutation.isPending || updateMutation.isPending}
            className="hover:bg-yellow-400 hover:text-black"
          >
            <Save className="mr-2 h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Document'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}