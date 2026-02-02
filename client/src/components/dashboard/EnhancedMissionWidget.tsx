import React, { useState, useEffect } from 'react';
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Award, Zap, Info } from "lucide-react";
import { CalendarEvent, MissionPage } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";
import { useLYFEOS } from "@/lib/context";


interface EnhancedMissionWidgetProps {
  events: CalendarEvent[];
  className?: string;
  maxHeight?: string;
  hideHeader?: boolean;
}

export default function EnhancedMissionWidget({ 
  events, 
  className = "", 
  maxHeight = "96",
  hideHeader = false,
}: EnhancedMissionWidgetProps) {
  // Get mission pages from context
  const { missionPages, updateMissionPage } = useLYFEOS();
  
  // Load completed missions from localStorage
  const loadCompletedMissions = (): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem("completedMissions");
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Failed to load completed missions:", e);
      return {};
    }
  };
  
  const [completedMissions, setCompletedMissions] = useState<Record<string, boolean>>(loadCompletedMissions);
  const { toast } = useToast();
  
  // Save to localStorage whenever completedMissions changes
  useEffect(() => {
    localStorage.setItem("completedMissions", JSON.stringify(completedMissions));
  }, [completedMissions]);
  
  // Get current time in 24-hour format
  const getCurrentTimeString = (): string => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    return `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  };
  
  // Get today's date in YYYY-MM-DD format (local time, not UTC)
  const getTodayDateString = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Filter and sort upcoming events for today
  const getUpcomingEvents = (limit: number = 3) => {
    const currentTimeString = getCurrentTimeString();
    const todayDateString = getTodayDateString();
    
    return events
      .filter(event => {
        const isEventCompleted = completedMissions[event.id] || false;
        // Filter by today's date and upcoming time, or show if no date (for backwards compatibility)
        const isToday = !event.date || event.date === todayDateString;
        return !isEventCompleted && isToday && event.startTime >= currentTimeString;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, limit);
  };
  
  // Get all events for today (including past events)
  const getAllTodayEvents = () => {
    const todayDateString = getTodayDateString();
    
    return events
      .filter(event => {
        // Filter by today's date, or show if no date (for backwards compatibility)
        return !event.date || event.date === todayDateString;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };
  
  // Get all mission pages for today
  const getTodayMissionPages = () => {
    const todayDateString = getTodayDateString();
    
    return missionPages.filter(mission => {
      // Filter by today's date
      return mission.date === todayDateString;
    });
  };
  
  const toggleMission = (id: string) => {
    const event = events.find(e => e.id === id);
    const isCompleting = !completedMissions[id];
    
    setCompletedMissions(prev => ({
      ...prev,
      [id]: isCompleting
    }));
    
    if (event && isCompleting) {
      // Show toast notification for completed mission
      toast({
        title: "Mission Completed!",
        description: (
          <div className="flex flex-col space-y-2">
            <div className="text-sm opacity-90">{event.title}</div>
            <div className="flex space-x-4 text-sm mt-2">
              <div className="flex items-center text-red-400">
                <Zap className="h-4 w-4 mr-1" />
                <span>-5 Energy Points</span>
              </div>
              <div className="flex items-center text-primary">
                <Award className="h-4 w-4 mr-1" />
                <span>+15 Experience</span>
              </div>
            </div>
          </div>
        ),
      });
    }
  };
  
  // Render empty state when no events are scheduled
  const renderEmptyState = () => (
    <div className="glassmorphic rounded-xl p-6 text-center opacity-80 mt-2">
      <Calendar className="h-10 w-10 text-primary/50 mx-auto mb-3" />
      <p className="text-[#7DAAB2]">No missions scheduled for today</p>
      <p className="text-xs text-[#7DAAB2] mt-2">
        Create a new mission or visit the Calendar page
      </p>
      <Button
        variant="outline" 
        size="sm"
        className="mt-4 hover:bg-primary hover:text-background"
        onClick={() => window.location.href = '/calendar'}
      >
        <Calendar className="h-4 w-4 mr-2" />
        New Mission
      </Button>
    </div>
  );
  
  // Render empty state when all upcoming events are completed
  const renderAllCompletedState = () => (
    <div className="glassmorphic rounded-xl p-6 text-center opacity-80 mt-2">
      <Calendar className="h-10 w-10 text-primary/50 mx-auto mb-3" />
      <p className="text-[#7DAAB2]">All missions completed for now</p>
      <p className="text-xs text-[#7DAAB2] mt-2">
        Great job! Create new missions or check back later
      </p>
      <Button
        variant="outline" 
        size="sm"
        className="mt-4 hover:bg-primary hover:text-background"
        onClick={() => window.location.href = '/calendar'}
      >
        <Calendar className="h-4 w-4 mr-2" />
        New Mission
      </Button>
    </div>
  );
  
  // Helper to get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "work":
        return "text-blue-400";
      case "health":
        return "text-red-400";
      case "personal":
        return "text-purple-400";
      default:
        return "text-primary";
    }
  };
  
  // Helper to get category text
  const getCategoryText = (category: string) => {
    switch (category) {
      case "work":
        return "Work Mission";
      case "health":
        return "Health Mission";
      case "personal":
        return "Personal Mission";
      default:
        return "Mission";
    }
  };
  
  // Handle toggling mission pages
  const toggleMissionPage = (missionId: string) => {
    const mission = missionPages.find(m => m.id === missionId);
    if (mission) {
      const newCompleted = !mission.completed;
      updateMissionPage(missionId, { completed: newCompleted });
      
      if (newCompleted) {
        toast({
          title: "Mission Completed!",
          description: (
            <div className="flex flex-col space-y-2">
              <div className="text-sm opacity-90">{mission.title}</div>
              <div className="flex space-x-4 text-sm mt-2">
                <div className="flex items-center text-red-400">
                  <Zap className="h-4 w-4 mr-1" />
                  <span>-5 Energy Points</span>
                </div>
                <div className="flex items-center text-primary">
                  <Award className="h-4 w-4 mr-1" />
                  <span>+{mission.xpValue} Experience</span>
                </div>
              </div>
            </div>
          ),
        });
      }
    }
  };

  // Render mission widget
  const upcomingEvents = getUpcomingEvents(3);
  const todayEvents = getAllTodayEvents();
  const todayMissions = getTodayMissionPages();
  
  // Check if there are any items to show
  const hasTodayItems = todayEvents.length > 0 || todayMissions.length > 0;
  const hasUpcomingItems = upcomingEvents.length > 0 || todayMissions.filter(m => !m.completed).length > 0;
  
  return (
    <div className={`quest-log-box ${className}`}>
      {!hideHeader && (
        <div className="relative mb-6">
          <h2 className="text-xl font-orbitron text-[#dff9ff] flex items-center">
            <Calendar className="h-5 w-5 text-primary mr-2" />
            <span>Mission Log</span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="absolute top-0 right-0 text-xs py-1 px-2 h-auto"
            onClick={() => window.location.href = '/calendar'}
          >
            <Calendar className="h-3 w-3 mr-1" /> Calendar
          </Button>
        </div>
      )}
      
      <div className={`py-2 max-h-${maxHeight} overflow-y-auto`}>
        {!hasTodayItems ? (
          renderEmptyState()
        ) : !hasUpcomingItems ? (
          renderAllCompletedState()
        ) : (
          <div className="space-y-3">
            {/* Show mission pages for today first */}
            {todayMissions.filter(m => !m.completed).map((mission) => (
              <div 
                key={`mission-${mission.id}`}
                className={`p-4 rounded-lg transition-all duration-200 relative 
                  ${mission.completed ? 
                    'bg-green-400/5 border border-green-400/20' : 
                    'bg-primary/5 border border-primary/20 hover:border-primary/40'}`}
              >
                <Link href={`/mission/${mission.slug}`}>
                  <button className="absolute top-4 right-4 p-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary">
                    <Info className="h-4 w-4" />
                  </button>
                </Link>
                
                <div className="flex items-start">
                  <Checkbox
                    className="mt-1 rounded border transition-all duration-200 border-primary/50 data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary"
                    checked={mission.completed}
                    onCheckedChange={() => toggleMissionPage(mission.id)}
                  />
                  <div className="ml-3 flex-grow">
                    <div className="flex justify-between">
                      <h3 className={`font-orbitron text-base ${mission.completed ? 'line-through text-[#7DAAB2]' : 'text-[#D6F4FF]'}`}>
                        {mission.title}
                      </h3>
                      <div className="flex items-center mr-8">
                        <span className="text-red-400 text-xs font-mono mr-2">-5 EP</span>
                        <span className="text-primary text-xs font-mono mr-2">+{mission.xpValue} XP</span>
                      </div>
                    </div>
                    <p className={`text-xs text-[#7DAAB2] mt-0.5 ${mission.completed ? 'line-through' : ''}`}>
                      {mission.tags?.join(', ') || 'Mission'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Show upcoming calendar events */}
            {upcomingEvents.map((event) => {
              const isCompleted = completedMissions[event.id] || false;
              const categoryColor = getCategoryColor(event.category);
              
              return (
                <div 
                  key={event.id}
                  className={`p-4 rounded-lg transition-all duration-200 relative 
                    ${isCompleted ? 
                      'bg-green-400/5 border border-green-400/20' : 
                      'bg-primary/5 border border-primary/20 hover:border-primary/40'}`}
                >
                  <Link href={`/mission/${event.id}`}>
                    <button className="absolute top-4 right-4 p-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary">
                      <Info className="h-4 w-4" />
                    </button>
                  </Link>
                  
                  <div className="flex items-start">
                    <Checkbox
                      className={`mt-1 rounded border transition-all duration-200
                      ${event.category === 'work' ? 'border-blue-500/50 data-[state=checked]:bg-blue-500/20 data-[state=checked]:text-blue-400' : 
                        event.category === 'health' ? 'border-red-500/50 data-[state=checked]:bg-red-500/20 data-[state=checked]:text-red-400' : 
                        'border-purple-500/50 data-[state=checked]:bg-purple-500/20 data-[state=checked]:text-purple-400'}`}
                      checked={isCompleted}
                      onCheckedChange={() => toggleMission(event.id)}
                    />
                    <div className="ml-3 flex-grow">
                      <div className="flex justify-between">
                        <h3 className={`font-orbitron text-base ${isCompleted ? 'line-through text-[#7DAAB2]' : 'text-[#D6F4FF]'}`}>
                          {event.title}
                        </h3>
                        <div className="flex items-center mr-8">
                          <span className="text-red-400 text-xs font-mono mr-2">-5 EP</span>
                          <span className="text-primary text-xs font-mono mr-2">+15 XP</span>
                        </div>
                      </div>
                      <p className={`text-xs text-[#7DAAB2] mt-0.5 ${isCompleted ? 'line-through' : ''}`}>
                        {event.category === 'work' ? 'Conference Room 3' : 
                        event.category === 'health' ? 'Gym' : 'Virtual'} | {event.duration} | {event.startTime}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="mission-note text-center text-xs mt-5 text-[#7da4b6] italic opacity-80">
        <span>↴ Click the checkbox to mark missions as completed</span>
      </div>
    </div>
  );
}