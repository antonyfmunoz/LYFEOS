import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Folder, FolderPlus, FilePlus, ChevronRight, Star, Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function DocumentsWidget() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
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
  const rootFolders = folders.filter(folder => !folder.parentId);
  const documents = documentsData?.documents || [];
  const recentDocuments = [...documents].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);
  
  const favoriteFolders = folders.filter(folder => folder.favorite);
  const favoriteDocuments = documents.filter(doc => doc.favorite);
  
  const filteredFolders = searchQuery 
    ? folders.filter(folder => 
        folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (folder.description && folder.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];
    
  const filteredDocuments = searchQuery
    ? documents.filter(doc => 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        doc.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];
  
  const isLoading = foldersLoading || documentsLoading;
  
  return (
    <Card className="w-full shadow-md border-slate-700/20 overflow-hidden">
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <FileText className="h-5 w-5 text-primary mr-2" />
            <CardTitle className="text-lg font-orbitron">Documents</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate('/documents')}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Organized file storage and document management
        </CardDescription>
      </CardHeader>
      
      <div className="px-4 pt-3 pb-2">
        <Input
          placeholder="Search documents & folders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-background/50 text-sm h-8"
          prefix={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
        />
      </div>
      
      <Tabs defaultValue="recent" className="w-full">
        <div className="px-4">
          <TabsList className="w-full grid grid-cols-3 mb-2">
            <TabsTrigger value="recent" className="text-xs">Recent</TabsTrigger>
            <TabsTrigger value="favorites" className="text-xs">Favorites</TabsTrigger>
            <TabsTrigger value="folders" className="text-xs">Folders</TabsTrigger>
          </TabsList>
        </div>
        
        {searchQuery ? (
          <CardContent className="p-0">
            <div className="p-4 space-y-2">
              <h3 className="text-xs font-medium">Search Results</h3>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <>
                  {filteredFolders.length === 0 && filteredDocuments.length === 0 && (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      No results found
                    </div>
                  )}
                  
                  {filteredFolders.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Folders</p>
                      {filteredFolders.slice(0, 3).map(folder => (
                        <div 
                          key={folder.id}
                          className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                          onClick={() => navigate(`/folders/${folder.id}`)}
                        >
                          <Folder className="h-4 w-4 mr-2 text-primary/70" />
                          <div className="flex-1 truncate">{folder.name}</div>
                          {folder.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {filteredDocuments.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs text-muted-foreground">Documents</p>
                      {filteredDocuments.slice(0, 3).map(doc => (
                        <div 
                          key={doc.id}
                          className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                        >
                          <FileText className="h-4 w-4 mr-2 text-primary/70" />
                          <div className="flex-1 truncate">{doc.title}</div>
                          {doc.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        ) : (
          <>
            <TabsContent value="recent" className="p-0 m-0">
              <CardContent className="p-4 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : recentDocuments.length > 0 ? (
                  recentDocuments.map(doc => (
                    <div 
                      key={doc.id}
                      className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <FileText className="h-4 w-4 mr-2 text-primary/70" />
                      <div className="flex-1 truncate">{doc.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No recent documents</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="favorites" className="p-0 m-0">
              <CardContent className="p-4 space-y-3">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <>
                    {favoriteFolders.length > 0 && (
                      <div>
                        <h3 className="text-xs font-medium mb-1.5">Folders</h3>
                        <div className="space-y-1">
                          {favoriteFolders.slice(0, 2).map(folder => (
                            <div 
                              key={folder.id}
                              className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/folders/${folder.id}`)}
                            >
                              <Folder className="h-4 w-4 mr-2 text-primary/70" />
                              <div className="flex-1 truncate">{folder.name}</div>
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {favoriteDocuments.length > 0 && (
                      <div>
                        <h3 className="text-xs font-medium mb-1.5">Documents</h3>
                        <div className="space-y-1">
                          {favoriteDocuments.slice(0, 2).map(doc => (
                            <div 
                              key={doc.id}
                              className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/documents/${doc.id}`)}
                            >
                              <FileText className="h-4 w-4 mr-2 text-primary/70" />
                              <div className="flex-1 truncate">{doc.title}</div>
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {favoriteFolders.length === 0 && favoriteDocuments.length === 0 && (
                      <div className="text-center py-4">
                        <Star className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">No favorites yet</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="folders" className="p-0 m-0">
              <CardContent className="p-4 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : rootFolders.length > 0 ? (
                  rootFolders.slice(0, 4).map(folder => (
                    <div 
                      key={folder.id}
                      className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/folders/${folder.id}`)}
                    >
                      <Folder className="h-4 w-4 mr-2 text-primary/70" />
                      <div className="flex-1 truncate">{folder.name}</div>
                      {folder.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Folder className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No folders created</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
          </>
        )}
      </Tabs>
      
      <Separator />
      
      <CardFooter className="p-3 flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm"
            className="h-7 text-xs bg-primary/10 hover:bg-primary hover:text-background text-primary border border-primary/50"
            onClick={() => navigate('/folders/new')}
          >
            <FolderPlus className="h-3.5 w-3.5 mr-1" />
            New Folder
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className="h-7 text-xs bg-primary/10 hover:bg-primary hover:text-background text-primary border border-primary/50"
            onClick={() => navigate('/documents/new')}
          >
            <FilePlus className="h-3.5 w-3.5 mr-1" />
            New Doc
          </Button>
        </div>
        <div className="text-xs text-muted-foreground flex items-center">
          <FileText className="h-3 w-3 mr-1" />
          {documents.length} docs
        </div>
      </CardFooter>
    </Card>
  );
}