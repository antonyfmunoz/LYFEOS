import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, PlusCircle, ChevronRight, Star, Search, BarChart4 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

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

export default function ProgressTrackersWidget() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch progress trackers
  const { data: trackersData, isLoading } = useQuery<ProgressTrackersResponse>({
    queryKey: ['/api/users', user?.id, 'progress-trackers'],
    enabled: !!user,
  });
  
  const progressTrackers = trackersData?.progressTrackers || [];
  const recentTrackers = [...progressTrackers].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);
  
  const favoriteTrackers = progressTrackers.filter(tracker => tracker.favorite);
  
  // Group trackers by category
  const trackersByCategory = progressTrackers.reduce((acc, tracker) => {
    const category = tracker.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(tracker);
    return acc;
  }, {} as Record<string, ProgressTracker[]>);
  
  const categories = Object.keys(trackersByCategory).sort();
  
  const filteredTrackers = searchQuery
    ? progressTrackers.filter(tracker => 
        tracker.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tracker.description && tracker.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tracker.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tracker.unit.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

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
        return <Activity className="h-4 w-4 mr-2" style={{ color: tracker.color }} />;
      default:
        return <BarChart4 className="h-4 w-4 mr-2" style={{ color: tracker.color }} />;
    }
  };

  // Render an individual tracker list item
  const renderTrackerItem = (tracker: ProgressTracker) => (
    <div 
      key={tracker.id}
      className="p-2 rounded-md hover:bg-muted/50 cursor-pointer space-y-1"
      onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
    >
      <div className="flex items-center">
        {getTrackerIcon(tracker)}
        <div className="flex-1 truncate text-sm font-medium">{tracker.title}</div>
        {tracker.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 ml-1" />}
      </div>
      <div className="px-1">
        <Progress value={calculateProgress(tracker.currentValue, tracker.targetValue)} className="h-1.5" />
        <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground">
          <span>{formatProgress(tracker)}</span>
          <span>{Math.round(calculateProgress(tracker.currentValue, tracker.targetValue))}%</span>
        </div>
      </div>
    </div>
  );
  
  return (
    <Card className="w-full shadow-md border-slate-700/20 overflow-hidden">
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <BarChart4 className="h-5 w-5 text-primary mr-2" />
            <CardTitle className="text-lg font-orbitron">Progress Trackers</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate('/progress-trackers')}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Track your personal and professional goals
        </CardDescription>
      </CardHeader>
      
      <div className="px-4 pt-3 pb-2">
        <Input
          placeholder="Search trackers..."
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
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <>
                  {filteredTrackers.length === 0 && (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      No results found
                    </div>
                  )}
                  
                  {filteredTrackers.slice(0, 4).map(tracker => renderTrackerItem(tracker))}
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
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : recentTrackers.length > 0 ? (
                  recentTrackers.map(tracker => renderTrackerItem(tracker))
                ) : (
                  <div className="text-center py-4">
                    <BarChart4 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No recent trackers</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="favorites" className="p-0 m-0">
              <CardContent className="p-4 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : favoriteTrackers.length > 0 ? (
                  favoriteTrackers.map(tracker => renderTrackerItem(tracker))
                ) : (
                  <div className="text-center py-4">
                    <Star className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No favorite trackers</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>
            
            <TabsContent value="categories" className="p-0 m-0">
              <CardContent className="p-4 space-y-4">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : categories.length > 0 ? (
                  categories.slice(0, 3).map(category => (
                    <div key={category} className="space-y-1">
                      <h3 className="text-xs font-medium capitalize">{category}</h3>
                      {trackersByCategory[category].slice(0, 2).map(tracker => renderTrackerItem(tracker))}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <BarChart4 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No trackers available</p>
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
          variant="ghost" 
          size="sm"
          className="h-7 text-xs bg-primary/10 hover:bg-primary hover:text-background text-primary border border-primary/50"
          onClick={() => navigate('/progress-trackers/new')}
        >
          <PlusCircle className="h-3.5 w-3.5 mr-1" />
          New Tracker
        </Button>
        <div className="text-xs text-muted-foreground flex items-center">
          <BarChart4 className="h-3 w-3 mr-1" />
          {progressTrackers.length} trackers
        </div>
      </CardFooter>
    </Card>
  );
}