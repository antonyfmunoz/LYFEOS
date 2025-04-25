import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Search, BarChart4, PlusCircle, Activity, Star } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

// Define interfaces for our data types
interface ProgressTracker {
  id: number;
  userId: number;
  title: string;
  description?: string;
  category: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  startDate: string;
  endDate?: string;
  color: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProgressTrackersResponse {
  progressTrackers: ProgressTracker[];
}

export default function ProgressTrackersPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // Fetch progress trackers
  const { data: trackersData, isLoading } = useQuery<ProgressTrackersResponse>({
    queryKey: ['/api/users', user?.id, 'progress-trackers'],
    enabled: !!user,
  });
  
  const progressTrackers = trackersData?.progressTrackers || [];
  
  // Filter trackers based on search, category, and tab
  const filteredTrackers = progressTrackers.filter(tracker => {
    const matchesSearch = searchQuery 
      ? tracker.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tracker.description && tracker.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tracker.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tracker.unit.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    
    const matchesCategory = activeCategory 
      ? tracker.category === activeCategory
      : true;
    
    const matchesTab = activeTab === 'favorites' 
      ? tracker.favorite 
      : true;
    
    return matchesSearch && matchesCategory && matchesTab;
  });
  
  // Sort trackers by updatedAt date, most recent first
  const sortedTrackers = [...filteredTrackers].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  
  // Get all unique categories
  const categoriesSet = new Set<string>();
  progressTrackers.forEach(tracker => {
    if (tracker.category) categoriesSet.add(tracker.category);
  });
  const categories = Array.from(categoriesSet);
  
  // Helper to calculate progress percentage
  const calculateProgress = (current: number, target: number): number => {
    if (target === 0) return 0;
    return Math.min((current / target) * 100, 100);
  };
  
  // Helper to format progress display
  const formatProgress = (tracker: ProgressTracker): string => {
    return `${tracker.currentValue}${tracker.unit} / ${tracker.targetValue}${tracker.unit}`;
  };
  
  // Helper to get the appropriate icon for a tracker based on category
  const getTrackerIcon = (tracker: ProgressTracker) => {
    switch (tracker.category.toLowerCase()) {
      case 'health':
      case 'fitness':
        return <Activity className="h-5 w-5 mr-2" style={{ color: tracker.color }} />;
      default:
        return <BarChart4 className="h-5 w-5 mr-2" style={{ color: tracker.color }} />;
    }
  };
  
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
          <h1 className="text-2xl font-orbitron mb-1">Progress Trackers</h1>
          <p className="text-[#7DAAB2]">Track and measure your personal and professional goals</p>
        </div>
        <Button 
          onClick={() => navigate('/progress-trackers/new')}
          className="hover:bg-primary hover:text-background"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Tracker
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1">
          <Card className="shadow-md border-slate-700/20">
            <CardHeader className="py-4">
              <Input
                placeholder="Search trackers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                prefix={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="favorites" className="flex-1">Favorites</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="space-y-1 px-2">
                <h3 className="text-sm font-semibold mb-2">Categories</h3>
                <div 
                  className={`text-sm p-1.5 rounded-md cursor-pointer flex items-center ${activeCategory === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  onClick={() => setActiveCategory(null)}
                >
                  <BarChart4 className="h-4 w-4 mr-2" />
                  All Categories
                </div>
                {categories.map(category => (
                  <div 
                    key={category}
                    className={`text-sm p-1.5 rounded-md cursor-pointer flex items-center ${activeCategory === category ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category.toLowerCase() === 'health' || category.toLowerCase() === 'fitness' 
                      ? <Activity className="h-4 w-4 mr-2" /> 
                      : <BarChart4 className="h-4 w-4 mr-2" />
                    }
                    {category}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content */}
        <div className="md:col-span-3">
          <Card className="shadow-md border-slate-700/20">
            <CardContent className="p-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-48" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                </div>
              ) : sortedTrackers.length > 0 ? (
                <>
                  <h2 className="text-xl font-medium mb-4">
                    {activeCategory ? activeCategory : activeTab === 'favorites' ? 'Favorite' : 'All'} Trackers
                    <span className="text-sm text-muted-foreground ml-2">({sortedTrackers.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sortedTrackers.map(tracker => (
                      <div 
                        key={tracker.id}
                        onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
                        className="border border-primary/20 rounded-lg p-4 hover:bg-muted/50 cursor-pointer hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center flex-1">
                            {getTrackerIcon(tracker)}
                            <h3 className="font-medium truncate">{tracker.title}</h3>
                          </div>
                          <div className="flex items-center">
                            {tracker.favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-2" />}
                            <Badge variant="outline" className="ml-2">
                              {tracker.category}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="mb-1">
                          <Progress value={calculateProgress(tracker.currentValue, tracker.targetValue)} className="h-2" />
                        </div>
                        
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{formatProgress(tracker)}</span>
                          <span>{Math.round(calculateProgress(tracker.currentValue, tracker.targetValue))}%</span>
                        </div>
                        
                        {tracker.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {tracker.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <BarChart4 className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No trackers found</h3>
                  <p className="text-muted-foreground mb-6">
                    {searchQuery || activeCategory
                      ? "Try adjusting your search or filters"
                      : "Create your first progress tracker to get started"}
                  </p>
                  <Button 
                    onClick={() => navigate('/progress-trackers/new')}
                    className="hover:bg-primary hover:text-background"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Tracker
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