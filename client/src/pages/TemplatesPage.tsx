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
  Tag, 
  FileCheck,
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

export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // Fetch templates
  const { data: templatesData, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ['/api/users', user?.id, 'templates'],
    enabled: !!user,
  });
  
  const templates = templatesData?.templates || [];
  
  // Filter templates based on search, category, and tab
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchQuery 
      ? template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        template.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    
    const matchesCategory = activeCategory 
      ? template.category === activeCategory
      : true;
    
    const matchesTab = activeTab === 'favorites' 
      ? template.favorite 
      : true;
    
    return matchesSearch && matchesCategory && matchesTab;
  });
  
  // Sort templates by updatedAt date, most recent first
  const sortedTemplates = [...filteredTemplates].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  
  // Get all unique categories
  const categoriesSet = new Set<string>();
  templates.forEach(template => {
    if (template.category) categoriesSet.add(template.category);
  });
  const categories = Array.from(categoriesSet);
  
  // Tags from all templates
  const tagsSet = new Set<string>();
  templates.forEach(template => {
    template.tags.forEach(tag => tagsSet.add(tag));
  });
  const allTags = Array.from(tagsSet);
  
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
          <h1 className="text-2xl font-orbitron mb-1">Document Templates</h1>
          <p className="text-[#7DAAB2]">Create, manage, and use document templates</p>
        </div>
        <Button 
          onClick={() => navigate('/templates/new')}
          className="hover:bg-primary hover:text-background"
        >
          <FilePlus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1">
          <Card className="shadow-md border-slate-700/20">
            <CardHeader className="py-4">
              <CardTitle className="text-lg font-medium">Filters</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4 space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium mb-1">Categories</div>
                <div className="space-y-1">
                  <div 
                    className={`px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted ${activeCategory === null ? 'bg-muted' : ''}`}
                    onClick={() => setActiveCategory(null)}
                  >
                    All Categories
                  </div>
                  {categories.map((category) => (
                    <div 
                      key={category} 
                      className={`px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-muted ${activeCategory === category ? 'bg-muted' : ''}`}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium mb-1">Popular Tags</div>
                <div className="flex flex-wrap gap-1">
                  {allTags.slice(0, 10).map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => setSearchQuery(tag)}>
                      {tag}
                    </Badge>
                  ))}
                </div>
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
                  <FileCheck className="mr-2 h-5 w-5 text-primary" />
                  Templates
                  {activeCategory && <Badge variant="outline" className="ml-2">{activeCategory}</Badge>}
                </CardTitle>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 hover:bg-primary hover:text-background">
                      <Filter className="h-3.5 w-3.5 mr-1.5" />
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Sort Templates</DropdownMenuLabel>
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
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                  prefix={<Search className="h-4 w-4 text-muted-foreground" />}
                />
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all">All Templates</TabsTrigger>
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
              ) : sortedTemplates.length > 0 ? (
                <div className="space-y-3">
                  {sortedTemplates.map((template) => (
                    <div 
                      key={template.id}
                      className="p-3 border border-border hover:border-primary/50 rounded-md flex items-start cursor-pointer transition-colors group hover:bg-muted/30"
                      onClick={() => navigate(`/templates/${template.id}`)}
                    >
                      <div className="h-10 w-10 bg-primary/10 flex items-center justify-center rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <h3 className="font-medium text-foreground truncate mr-2">{template.title}</h3>
                          {template.favorite && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                        </div>
                        
                        {template.description && (
                          <p className="text-muted-foreground text-sm line-clamp-1 mt-0.5">
                            {template.description}
                          </p>
                        )}
                        
                        <div className="flex items-center mt-1.5 text-xs">
                          <Badge variant="outline" className="rounded-sm px-1.5 h-5 mr-2 text-[10px]">
                            {template.format}
                          </Badge>
                          
                          {template.category && (
                            <Badge variant="secondary" className="rounded-sm px-1.5 h-5 mr-2 text-[10px]">
                              {template.category}
                            </Badge>
                          )}
                          
                          <span className="text-muted-foreground mr-3">
                            Updated {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                          </span>
                          
                          {template.tags.length > 0 && (
                            <div className="flex items-center">
                              <Tag className="h-3 w-3 mr-1 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {template.tags.slice(0, 2).join(', ')}
                                {template.tags.length > 2 && ` +${template.tags.length - 2}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <FileCheck className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No templates found</h3>
                  <p className="text-muted-foreground mb-6">
                    {searchQuery || activeCategory
                      ? "Try adjusting your search or filters"
                      : "Create your first template to get started"}
                  </p>
                  <Button 
                    onClick={() => navigate('/templates/new')}
                    className="hover:bg-primary hover:text-background"
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    Create Template
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