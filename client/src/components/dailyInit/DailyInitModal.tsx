import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, Star } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useTheme } from "@/lib/themeContext";
import { apiRequest } from "@/lib/queryClient";

// Define interfaces for better type checking
interface Mission {
  id: number;
  title: string;
  description: string;
  xpReward: number;
  completed: boolean;
}

interface MissionsResponse {
  quests: Mission[];
}

interface ExperiencePoints {
  current: number;
  max: number;
  level: number;
}

interface UserStats {
  stats: {
    experience: ExperiencePoints;
    // other stats fields can be added as needed
  }
}

// Simple interface for a mini habit/daily boost
interface DailyBoost {
  id: number;
  title: string;
  description: string;
  xpReward: number;
}

// Mock data for daily boosts - this would come from API in production
const DAILY_BOOSTS: DailyBoost[] = [
  {
    id: 1,
    title: "Morning Meditation",
    description: "5 minutes of mindfulness to start your day",
    xpReward: 15
  },
  {
    id: 2,
    title: "Hydration Check",
    description: "Drink a glass of water right now",
    xpReward: 10
  },
  {
    id: 3,
    title: "Quick Stretch",
    description: "Do a 2-minute stretching routine",
    xpReward: 10
  }
];

export function DailyInitModal() {
  const { user } = useAuth();
  const { primaryColor } = useTheme();
  const [open, setOpen] = useState(false);
  const [selectedBoosts, setSelectedBoosts] = useState<number[]>([]);
  
  // Extract username from user object with type safety
  const username = user ? (
    (user as any).displayName || (user as any).username || "Commander"
  ) : "Commander";
  
  // Fetch user stats with proper type annotation
  const { data: stats } = useQuery<UserStats>({
    queryKey: ['/api/users', user?.id, 'stats'],
    enabled: !!user?.id
  });

  // Fetch primary mission (most recent or highest priority quest)
  const { data: missions } = useQuery<MissionsResponse>({
    queryKey: ['/api/users', user?.id, 'quests'],
    enabled: !!user?.id
  });

  // Get primary mission from the fetched data with type safety
  const primaryMission: Mission = missions && 
    missions.quests && 
    Array.isArray(missions.quests) && 
    missions.quests.length > 0
      ? missions.quests[0]
      : {
          id: 0,
          title: "No active missions",
          description: "Create a new mission in your quest log",
          xpReward: 0,
          completed: false
        };

  // Check if we should show this modal (based on last login date)
  useEffect(() => {
    if (!user) return;
    
    // Get the last login date from localStorage (or set today as default)
    const lastLogin = localStorage.getItem('lyfeos-last-login-date');
    const today = new Date().toDateString();
    
    // If no last login or last login was before today, show the modal
    if (!lastLogin || lastLogin !== today) {
      // Small delay to let the dashboard load first
      const timer = setTimeout(() => {
        setOpen(true);
        // Update the last login date
        localStorage.setItem('lyfeos-last-login-date', today);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Toggle a boost selection
  const toggleBoost = (boostId: number) => {
    setSelectedBoosts(prev => 
      prev.includes(boostId) 
        ? prev.filter(id => id !== boostId)
        : [...prev, boostId]
    );
  };

  // Begin the day (close modal and award XP for selected boosts)
  const handleBeginDay = async () => {
    if (selectedBoosts.length > 0 && user) {
      try {
        // Calculate XP to award based on selected boosts
        const xpToAward = selectedBoosts.reduce((sum, boostId) => {
          const boost = DAILY_BOOSTS.find(b => b.id === boostId);
          return sum + (boost?.xpReward || 0);
        }, 0);
        
        // Award XP for selecting daily boosts
        if (xpToAward > 0) {
          await apiRequest(`/api/users/${user.id}/award-xp`, {
            method: 'POST',
            body: JSON.stringify({ amount: xpToAward, reason: 'Daily boost selection' })
          });
        }
      } catch (error) {
        console.error("Error awarding XP for daily boosts:", error);
      }
    }
    
    // Close the modal
    setOpen(false);
  };

  // Get XP progress with proper type safety
  const xpProgress: ExperiencePoints = stats && 
    stats.stats && 
    stats.stats.experience 
      ? stats.stats.experience
      : { current: 0, max: 100, level: 1 };
  
  const xpPercentage = Math.round((xpProgress.current / xpProgress.max) * 100);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[550px] glassmorphic border border-primary/40 bg-background/90"
                    style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
        <DialogHeader>
          <DialogTitle className="text-2xl text-center font-orbitron text-primary">
            Good to see you, {username}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Ready for another day of progress?
          </DialogDescription>
        </DialogHeader>
        
        {/* XP Progress */}
        <div className="mt-2 mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">Yesterday's Progress</span>
            <span className="text-sm font-semibold">
              Level {xpProgress.level} • {xpProgress.current}/{xpProgress.max} XP
            </span>
          </div>
          <Progress value={xpPercentage} className="h-2" />
        </div>
        
        {/* Primary Mission Card */}
        <Card className="border border-primary/30 bg-background/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Star className="mr-2 h-5 w-5 text-primary" />
              Today's Primary Mission
            </CardTitle>
            <CardDescription>Focus on completing this mission today</CardDescription>
          </CardHeader>
          <CardContent>
            <h3 className="font-bold text-foreground">{primaryMission.title}</h3>
            <p className="text-muted-foreground text-sm mt-1">{primaryMission.description}</p>
          </CardContent>
          <CardFooter className="pt-0 flex justify-between items-center">
            <Badge variant="outline" className="text-primary border-primary/40">
              {primaryMission.xpReward} XP
            </Badge>
            <span className="text-xs text-muted-foreground">Tap to view details</span>
          </CardFooter>
        </Card>
        
        {/* Daily Boosts */}
        <div className="mt-4">
          <h3 className="font-medium mb-2 flex items-center">
            <Sparkles className="mr-2 h-4 w-4 text-primary" />
            Optional Daily Boosts
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {DAILY_BOOSTS.map(boost => (
              <div 
                key={boost.id}
                className={`flex items-center p-3 rounded-md cursor-pointer transition-colors border ${
                  selectedBoosts.includes(boost.id)
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30 hover:bg-background/80"
                }`}
                onClick={() => toggleBoost(boost.id)}
              >
                <div className="mr-3">
                  {selectedBoosts.includes(boost.id) ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{boost.title}</h4>
                  <p className="text-xs text-muted-foreground">{boost.description}</p>
                </div>
                <Badge variant="outline" className="text-primary border-primary/40">
                  +{boost.xpReward} XP
                </Badge>
              </div>
            ))}
          </div>
        </div>
        
        <DialogFooter className="mt-6">
          <Button 
            className="w-full" 
            onClick={handleBeginDay}
          >
            Begin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}