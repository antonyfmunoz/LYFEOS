import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  FilePlus, 
  Search, 
  Star, 
  Calendar, 
  Folder,
  Filter,
  ArrowLeft
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';

// Define interfaces for our data types
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

interface FoldersResponse {
  folders: Folder[];
}

interface DocumentsResponse {
  documents: Document[];
}

export default function DocumentsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // Fetch folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery<FoldersResponse>({
    queryKey: ['/api/users', user?.id, 'folders'],
    enabled: !!user,
  });
  
  // Fetch documents
  const { data: documentsData, isLoading: documentsLoading } = useQuery<DocumentsResponse>({
    queryKey: ['/api/users', user?.id, 'documents'],
    enabled: !!user,
  });
  
  const folders = foldersData?.folders || [];
  const documents = documentsData?.documents || [];
  
  // Filter documents based on search, folder, and tab
  const filteredDocuments = documents.filter(document => {
    const matchesSearch = searchQuery 
      ? document.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (document.description && document.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        document.content.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    
    const matchesFolder = activeFolder 
      ? document.folderId === activeFolder
      : true;
    
    const matchesTab = activeTab === 'favorites' 
      ? document.favorite 
      : true;
    
    return matchesSearch && matchesFolder && matchesTab;
  });
  
  // Sort documents by updatedAt date, most recent first
  const sortedDocuments = [...filteredDocuments].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  
  const isLoading = foldersLoading || documentsLoading;
  
  return (
    <div className="container py-6 max-w-6xl">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/systems')} 
        className="mb-6 hover:bg-primary hover:text-background"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Systems
      </Button>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Documents</h1>
          <p className="text-[#7DAAB2]">Organized document management system</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => navigate('/folders/new')}
            className="hover:bg-primary hover:text-background"
          >
            <Folder className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <Button 
            onClick={() => navigate('/documents/new')}
            className="hover:bg-primary hover:text-background"
          >
            <FilePlus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1">
          <Card className="shadow-md border-slate-700/20">
            <CardHeader className="py-4">
              <CardTitle className="text-lg font-medium">Folders</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4 space-y-4">
              <div className="space-y-2">
                <div 
                  className={`px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted ${activeFolder === null ? 'bg-muted' : ''}`}
                  onClick={() => setActiveFolder(null)}
                >
                  All Documents
                </div>
                {isLoading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-6 bg-muted rounded w-full"></div>
                    <div className="h-6 bg-muted rounded w-full"></div>
                    <div className="h-6 bg-muted rounded w-3/4"></div>
                  </div>
                ) : folders.length > 0 ? (
                  folders.map((folder) => (
                    <div 
                      key={folder.id} 
                      className={`px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted flex justify-between items-center ${activeFolder === folder.id ? 'bg-muted' : ''}`}
                      onClick={() => setActiveFolder(folder.id)}
                    >
                      <div className="flex items-center">
                        <Folder className="h-3.5 w-3.5 mr-2 text-primary" />
                        {folder.name}
                      </div>
                      {folder.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No folders created
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2 text-xs hover:bg-primary hover:text-background"
                  onClick={() => navigate('/folders/new')}
                >
                  New Folder
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content */}
        <div className="md:col-span-3">
          <Card className="shadow-md border-slate-700/20">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-primary" />
                  Documents
                  {activeFolder !== null && (
                    <Badge variant="outline" className="ml-2">
                      {folders.find(f => f.id === activeFolder)?.name || 'Folder'}
                    </Badge>
                  )}
                </CardTitle>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 hover:bg-primary hover:text-background">
                      <Filter className="h-3.5 w-3.5 mr-1.5" />
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Sort Documents</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem>
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>Most Recent</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>Oldest First</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <span className="mr-2">A-Z</span>
                        <span>Alphabetical</span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <div className="mb-2">
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                  prefix={<Search className="h-4 w-4 text-muted-foreground" />}
                />
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all">All Documents</TabsTrigger>
                  <TabsTrigger value="favorites">Favorites</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded-md animate-pulse" />
                  ))}
                </div>
              ) : sortedDocuments.length > 0 ? (
                <div className="space-y-3">
                  {sortedDocuments.map((document) => (
                    <div 
                      key={document.id}
                      className="p-3 border border-border hover:border-primary/50 rounded-md flex items-start cursor-pointer transition-colors group hover:bg-muted/30"
                      onClick={() => navigate(`/documents/${document.id}`)}
                    >
                      <div className="h-10 w-10 bg-primary/10 flex items-center justify-center rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <h3 className="font-medium text-foreground truncate mr-2">{document.title}</h3>
                          {document.favorite && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                        </div>
                        
                        {document.description && (
                          <p className="text-muted-foreground text-sm line-clamp-1 mt-0.5">
                            {document.description}
                          </p>
                        )}
                        
                        <div className="flex items-center mt-1.5 text-xs">
                          <Badge variant="outline" className="rounded-sm px-1.5 h-5 mr-2 text-[10px]">
                            {document.format}
                          </Badge>
                          
                          {document.folderId && (
                            <Badge variant="secondary" className="rounded-sm px-1.5 h-5 mr-2 text-[10px] flex items-center">
                              <Folder className="h-2.5 w-2.5 mr-1" />
                              {folders.find(f => f.id === document.folderId)?.name || 'Folder'}
                            </Badge>
                          )}
                          
                          <span className="text-muted-foreground">
                            Updated {format(new Date(document.updatedAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No documents found</h3>
                  <p className="text-muted-foreground mb-6">
                    {searchQuery || activeFolder
                      ? "Try adjusting your search or filters"
                      : "Create your first document to get started"}
                  </p>
                  <Button 
                    onClick={() => navigate('/documents/new')}
                    className="hover:bg-primary hover:text-background"
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    Create Document
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}