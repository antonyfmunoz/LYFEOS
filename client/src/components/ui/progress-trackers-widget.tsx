import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { apiRequest } from '@/lib/queryClient';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, 
  LineChart, 
  ChevronRight, 
  Search, 
  Star, 
  Plus, 
  TrendingUp,
  Timer,
  Activity,
  Scale,
  Dumbbell 
} from 'lucide-react';

// Define the structure of a progress tracker
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
  
  const trackers = trackersData?.progressTrackers || [];
  
  // Sort recent trackers by updated date
  const recentTrackers = [...trackers].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);
  
  // Get favorite trackers
  const favoriteTrackers = trackers.filter(tracker => tracker.favorite);
  
  // Group trackers by category
  const trackersByCategory = trackers.reduce((acc, tracker) => {
    const category = tracker.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(tracker);
    return acc;
  }, {} as Record<string, ProgressTracker[]>);
  
  const categories = Object.keys(trackersByCategory).sort();
  
  // Filter trackers by search query
  const filteredTrackers = searchQuery
    ? trackers.filter(tracker => 
        tracker.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tracker.description && tracker.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        tracker.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tracker.unit.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];
  
  // Get appropriate icon for a tracker based on its category or title
  const getTrackerIcon = (tracker: ProgressTracker) => {
    const lowerCategory = tracker.category.toLowerCase();
    const lowerTitle = tracker.title.toLowerCase();
    
    if (lowerCategory.includes('fitness') || lowerTitle.includes('workout') || lowerTitle.includes('exercise')) {
      return <Dumbbell className="h-4 w-4 mr-2 text-primary/70" />;
    } else if (lowerCategory.includes('health') || lowerTitle.includes('weight') || lowerTitle.includes('calories')) {
      return <Scale className="h-4 w-4 mr-2 text-primary/70" />;
    } else if (lowerCategory.includes('time') || lowerTitle.includes('duration') || lowerTitle.includes('hours')) {
      return <Timer className="h-4 w-4 mr-2 text-primary/70" />;
    } else if (lowerCategory.includes('activity') || lowerTitle.includes('steps') || lowerTitle.includes('distance')) {
      return <Activity className="h-4 w-4 mr-2 text-primary/70" />;
    }
    
    return <BarChart3 className="h-4 w-4 mr-2 text-primary/70" />;
  };
  
  // Calculate progress percentage
  const getProgressPercentage = (current: number, target: number) => {
    const percentage = Math.min(Math.round((current / target) * 100), 100);
    return percentage;
  };

  return (
    <Card className="w-full shadow-md border-slate-700/20 overflow-hidden">
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <BarChart3 className="h-5 w-5 text-primary mr-2" />
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
          Track your personal goals and metrics over time
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
          <CardContent className="p-4 space-y-2">
            <div className="text-xs text-muted-foreground mb-2">
              Search results for "{searchQuery}"
            </div>
            
            {filteredTrackers.length > 0 ? (
              <>
                {filteredTrackers.map(tracker => (
                  <div 
                    key={tracker.id}
                    className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
                  >
                    {getTrackerIcon(tracker)}
                    <div className="flex-1 truncate">{tracker.title}</div>
                    <Badge variant="outline" className="text-[10px] h-5 ml-2">
                      {tracker.category}
                    </Badge>
                    {tracker.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 ml-1" />}
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-4">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No trackers found</p>
              </div>
            )}
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
                ) : recentTrackers.length > 0 ? (
                  recentTrackers.map(tracker => (
                    <div 
                      key={tracker.id}
                      className="flex flex-col p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
                    >
                      <div className="flex items-center mb-1">
                        {getTrackerIcon(tracker)}
                        <div className="flex-1 truncate">{tracker.title}</div>
                        <Badge variant="outline" className="text-[10px] h-5 ml-2">
                          {tracker.category}
                        </Badge>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full">
                        <div 
                          className="h-full rounded-full bg-primary" 
                          style={{ 
                            width: `${getProgressPercentage(tracker.currentValue, tracker.targetValue)}%`,
                            backgroundColor: tracker.color 
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{tracker.currentValue} {tracker.unit}</span>
                        <span>{tracker.targetValue} {tracker.unit}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No recent trackers</p>
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
                ) : favoriteTrackers.length > 0 ? (
                  favoriteTrackers.map(tracker => (
                    <div 
                      key={tracker.id}
                      className="flex flex-col p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
                    >
                      <div className="flex items-center mb-1">
                        {getTrackerIcon(tracker)}
                        <div className="flex-1 truncate">{tracker.title}</div>
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full">
                        <div 
                          className="h-full rounded-full bg-primary" 
                          style={{ 
                            width: `${getProgressPercentage(tracker.currentValue, tracker.targetValue)}%`,
                            backgroundColor: tracker.color 
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{tracker.currentValue} {tracker.unit}</span>
                        <span>{tracker.targetValue} {tracker.unit}</span>
                      </div>
                    </div>
                  ))
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
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : categories.length > 0 ? (
                  categories.slice(0, 3).map(category => (
                    <div key={category} className="space-y-1">
                      <h3 className="text-xs font-medium capitalize">{category}</h3>
                      {trackersByCategory[category].slice(0, 2).map(tracker => (
                        <div 
                          key={tracker.id}
                          className="flex items-center p-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate(`/progress-trackers/${tracker.id}`)}
                        >
                          {getTrackerIcon(tracker)}
                          <div className="flex-1 truncate">{tracker.title}</div>
                          <Badge variant="outline" className="text-[10px] h-5 ml-2">
                            {`${tracker.currentValue}/${tracker.targetValue} ${tracker.unit}`}
                          </Badge>
                          {tracker.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 ml-1" />}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
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
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Tracker
        </Button>
        <div className="text-xs text-muted-foreground flex items-center">
          <TrendingUp className="h-3 w-3 mr-1" />
          {trackers.length} trackers
        </div>
      </CardFooter>
    </Card>
  );
}