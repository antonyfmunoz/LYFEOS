import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Award, Zap } from "lucide-react";
import { CalendarEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import InfoButton from './InfoButton';

interface EnhancedMissionWidgetProps {
  events: CalendarEvent[];
  className?: string;
  maxHeight?: string;
}

export default function EnhancedMissionWidget({ 
  events, 
  className = "", 
  maxHeight = "96", 
}: EnhancedMissionWidgetProps) {
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
  const [selectedMission, setSelectedMission] = useState<CalendarEvent | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
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
  
  // Filter and sort upcoming events
  const getUpcomingEvents = (limit: number = 3) => {
    const currentTimeString = getCurrentTimeString();
    
    return events
      .filter(event => {
        const isEventCompleted = completedMissions[event.id] || false;
        return !isEventCompleted && event.startTime >= currentTimeString;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, limit);
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
              <div className="flex items-center text-[#36F1CD]">
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
        Visit the Calendar page to add missions to your daily schedule
      </p>
    </div>
  );
  
  // Render empty state when all upcoming events are completed
  const renderAllCompletedState = () => (
    <div className="glassmorphic rounded-xl p-6 text-center opacity-80 mt-2">
      <Calendar className="h-10 w-10 text-primary/50 mx-auto mb-3" />
      <p className="text-[#7DAAB2]">All missions completed for now</p>
      <p className="text-xs text-[#7DAAB2] mt-2">
        Great job! Check back later for new missions
      </p>
    </div>
  );
  
  // Open mission info dialog
  const openMissionInfo = (event: CalendarEvent) => {
    setSelectedMission(event);
    setInfoDialogOpen(true);
  };
  
  // Render mission widget
  const upcomingEvents = getUpcomingEvents(3);
  
  return (
    <div>
      <div className={`quest-log-box glassmorphic rounded-xl p-6 neon-border ${className}`}>
        <div className="relative mb-6">
          <h2 className="text-xl font-orbitron text-[#dff9ff] flex items-center">
            <Calendar className="h-5 w-5 text-primary mr-2" />
            <span>Mission Log</span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="absolute top-0 right-0 text-[#00f2fe] text-xs py-1 px-2 h-auto border-[#00f2fe]/30 hover:bg-[#00f2fe]/5 hover:text-[#00f2fe]"
            onClick={() => window.location.href = '/calendar'}
          >
            <Calendar className="h-3 w-3 mr-1" /> Calendar
          </Button>
        </div>
        
        <div className={`py-2 max-h-${maxHeight} overflow-y-auto`}>
          {events.length === 0 ? (
            renderEmptyState()
          ) : upcomingEvents.length === 0 ? (
            renderAllCompletedState()
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => {
                const isCompleted = completedMissions[event.id] || false;
                
                return (
                  <div 
                    key={event.id}
                    className={`p-4 rounded-lg transition-all duration-200 relative 
                      ${isCompleted ? 
                        'bg-green-400/5 border border-green-400/20' : 
                        'bg-primary/5 border border-primary/20 hover:border-primary/40'}`}
                  >
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
                          <div className="flex items-center">
                            <span className="text-red-400 text-xs font-mono mr-2">-5 EP</span>
                            <span className="text-primary text-xs font-mono mr-2">+15 XP</span>
                            <InfoButton event={event} onClick={openMissionInfo} />
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
      
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="glassmorphic backdrop-blur-lg border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron">{selectedMission?.title}</DialogTitle>
            <DialogDescription className="opacity-90">
              {selectedMission?.category === "work" ? (
                <span className="text-primary">Work Mission</span>
              ) : selectedMission?.category === "personal" ? (
                <span className="text-[#7e57c2]">Personal Mission</span>
              ) : (
                <span className="text-[#EC4899]">Health Mission</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono">{selectedMission?.startTime}</span>
              </div>
              <span className="text-sm text-muted-foreground">Duration: {selectedMission?.duration}</span>
            </div>
            
            <div className="bg-primary/5 p-4 rounded-md">
              <h4 className="text-sm font-semibold mb-2">Description</h4>
              <p className="text-sm leading-relaxed">{selectedMission?.description || "Complete this mission to earn XP and progress through your daily goals."}</p>
            </div>
            
            <div className="bg-primary/5 p-4 rounded-md">
              <h4 className="text-sm font-semibold mb-2">Location</h4>
              <p className="text-sm leading-relaxed">
                {selectedMission?.category === "work" ? "Conference Room 3" : 
                 selectedMission?.category === "personal" ? "Virtual" : "Gym"}
              </p>
            </div>
            
            <div className="flex justify-between bg-primary/5 p-4 rounded-md">
              <div>
                <h4 className="text-sm font-semibold mb-2">Energy Cost</h4>
                <p className="text-sm leading-relaxed text-red-400 font-mono">-5 EP</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">XP Reward</h4>
                <p className="text-sm leading-relaxed text-primary font-mono">+15 XP</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInfoDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              className="bg-primary/20 hover:bg-primary/30 text-primary"
              onClick={() => {
                setInfoDialogOpen(false);
                // In the future, this would link to a full mission report page
              }}
            >
              View Full Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}