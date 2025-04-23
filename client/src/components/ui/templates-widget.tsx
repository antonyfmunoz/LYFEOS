import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, FilePlus, ChevronRight, Star, Search, FileCheck } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

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

interface TemplatesResponse {
  templates: Template[];
}

export default function TemplatesWidget() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch templates
  const { data: templatesData, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ['/api/users', user?.id, 'templates'],
    enabled: !!user,
  });
  
  const templates = templatesData?.templates || [];
  const recentTemplates = [...templates].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);
  
  const favoriteTemplates = templates.filter(template => template.favorite);
  
  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, Template[]>);
  
  const categories = Object.keys(templatesByCategory).sort();
  
  const filteredTemplates = searchQuery
    ? templates.filter(template => 
        template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        template.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];
  
  return (
    <Card className="w-full shadow-md border-slate-700/20 overflow-hidden">
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <FileCheck className="h-5 w-5 text-primary mr-2" />
            <CardTitle className="text-lg font-orbitron">Templates</CardTitle>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-xs h-7"
            onClick={() => navigate('/templates')}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Reusable document templates for quick creation
        </CardDescription>
      </CardHeader>
      
      <div className="px-4 pt-3 pb-2">
        <Input
          placeholder="Search templates..."
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
            <TabsTrigger value="categories" className="text-xs">Categories</TabsTrigger>
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
                  {filteredTemplates.length === 0 && (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      No results found
                    </div>
                  )}
                  
                  {filteredTemplates.slice(0, 4).map(template => (
                    <div 
                      key={template.id}
                      className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                      onClick={() => navigate(`/templates/${template.id}`)}
                    >
                      <FileText className="h-4 w-4 mr-2 text-primary/70" />
                      <div className="flex-1 truncate">{template.title}</div>
                      {template.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                  ))}
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
                ) : recentTemplates.length > 0 ? (
                  recentTemplates.map(template => (
                    <div 
                      key={template.id}
                      className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/templates/${template.id}`)}
                    >
                      <FileText className="h-4 w-4 mr-2 text-primary/70" />
                      <div className="flex-1 truncate">{template.title}</div>
                      <Badge variant="outline" className="text-[10px] h-5 ml-2">
                        {template.category}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <FileCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No recent templates</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="favorites" className="p-0 m-0">
              <CardContent className="p-4 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : favoriteTemplates.length > 0 ? (
                  favoriteTemplates.map(template => (
                    <div 
                      key={template.id}
                      className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/templates/${template.id}`)}
                    >
                      <FileText className="h-4 w-4 mr-2 text-primary/70" />
                      <div className="flex-1 truncate">{template.title}</div>
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Star className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No favorite templates</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="categories" className="p-0 m-0">
              <CardContent className="p-4 space-y-4">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : categories.length > 0 ? (
                  categories.slice(0, 3).map(category => (
                    <div key={category} className="space-y-1">
                      <h3 className="text-xs font-medium capitalize">{category}</h3>
                      {templatesByCategory[category].slice(0, 2).map(template => (
                        <div 
                          key={template.id}
                          className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate(`/templates/${template.id}`)}
                        >
                          <FileText className="h-4 w-4 mr-2 text-primary/70" />
                          <div className="flex-1 truncate">{template.title}</div>
                          {template.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <FileCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No templates available</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
          </>
        )}
      </Tabs>
      
      <Separator />
      
      <CardFooter className="p-3 flex items-center justify-between bg-muted/20">
        <Button 
          variant="outline" 
          size="sm"
          className="h-7 text-xs hover:text-black hover:bg-yellow-400 hover:border-yellow-500"
          onClick={() => navigate('/templates/new')}
        >
          <FilePlus className="h-3.5 w-3.5 mr-1" />
          New Template
        </Button>
        <div className="text-xs text-muted-foreground flex items-center">
          <FileCheck className="h-3 w-3 mr-1" />
          {templates.length} templates
        </div>
      </CardFooter>
    </Card>
  );
}