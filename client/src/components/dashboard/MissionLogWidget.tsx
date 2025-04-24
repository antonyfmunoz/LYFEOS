import React, { useState, useEffect, Fragment } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, CheckCircle2, Clock, ArrowRight, Award, Zap, Info } from "lucide-react";
import { CalendarEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import InfoIconButton from './InfoIconButton';
import { Button } from '@/components/ui/dynamic-color-button';

// Helper function to convert hex to rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  // Remove the # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface MissionLogWidgetProps {
  events: CalendarEvent[];
  className?: string;
  maxHeight?: string;
  compact?: boolean;
  questStyle?: boolean;
}

export default function MissionLogWidget({ 
  events, 
  className = "", 
  maxHeight = "96", 
  compact = false,
  questStyle = false
}: MissionLogWidgetProps) {
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
      const { dismiss } = toast({
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

  // Helper function to get end time
  const getEndTime = (startTime: string, duration: string): string => {
    // Parse the start time
    const [hourStr, minuteStr] = startTime.split(':');
    let hour = parseInt(hourStr, 10);
    let minute = parseInt(minuteStr, 10);
    
    // Parse the duration (assuming format like "30m" or "1h 15m")
    let durationMinutes = 0;
    if (duration.includes('h')) {
      const hourPart = duration.split('h')[0].trim();
      durationMinutes += parseInt(hourPart, 10) * 60;
      
      if (duration.includes('m')) {
        const minutePart = duration.split('h')[1].split('m')[0].trim();
        durationMinutes += parseInt(minutePart, 10);
      }
    } else if (duration.includes('m')) {
      const minutePart = duration.split('m')[0].trim();
      durationMinutes += parseInt(minutePart, 10);
    }
    
    // Calculate end time
    minute += durationMinutes;
    hour += Math.floor(minute / 60);
    minute = minute % 60;
    hour = hour % 24;
    
    // Format the end time
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
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
        className="mt-4 hover:bg-yellow-400 hover:text-black"
        onClick={() => window.location.href = '/calendar'}
      >
        <Calendar className="mr-2 h-4 w-4" />
        Create Mission
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
        className="mt-4 hover:bg-yellow-400 hover:text-black"
        onClick={() => window.location.href = '/calendar'}
      >
        <Calendar className="mr-2 h-4 w-4" />
        Create Mission
      </Button>
    </div>
  );
  
  // Open mission info dialog
  const openMissionInfo = (event: CalendarEvent) => {
    setSelectedMission(event);
    setInfoDialogOpen(true);
  };
  
  // Info Button Component
  const InfoButton = ({ event }: { event: CalendarEvent }) => (
    <Button
      variant="outline"
      size="icon"
      className="h-6 w-6 p-0 rounded-full"
      onClick={(e) => {
        e.stopPropagation();
        openMissionInfo(event);
      }}
    >
      <Info className="h-3.5 w-3.5" />
    </Button>
  );

  // Render the appropriate mission log UI based on style
  const upcomingEvents = getUpcomingEvents(3);
  
  // Render quest-style or timeline-style content based on props
  const renderMissionContent = () => {
    if (questStyle) {
      // Quest-style rendering
      return (
        <div className={`quest-log-box glassmorphic rounded-xl p-6 neon-border ${className}`}>
          {!compact && (
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMissionInfo(event);
                                }}
                              >
                                <Info className="h-4 w-4" />
                              </Button>
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
          
          {!compact && (
            <div className="mission-note text-center text-xs mt-5 text-[#7da4b6] italic opacity-80">
              <span>↴ Click the checkbox to mark missions as completed</span>
            </div>
          )}
        </div>
      );
    } else {
      // Timeline-style rendering (original)
      return (
        <div className={`mission-log-box bg-[#0d131f] border border-primary rounded-xl p-6 ${className}`}>
          {!compact && (
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
          
          <div className={`mission-schedule py-2 max-h-${maxHeight} overflow-y-auto`}>
            {events.length === 0 ? (
              renderEmptyState()
            ) : upcomingEvents.length === 0 ? (
              renderAllCompletedState()
            ) : (
              <ul className="list-none p-0 m-0">
                {upcomingEvents.map((event) => {
                  const isCompleted = completedMissions[event.id] || false;
                  
                  return (
                    <li 
                      key={event.id}
                      className={`mission-block mb-7 transition-all duration-300 p-3 rounded-lg border border-primary/30 ${isCompleted ? 'opacity-50' : ''}`}
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
                            <h3 className={`text-base font-semibold ${isCompleted ? 'line-through text-[#7DAAB2]' : 'text-white'}`}>
                              {event.title}
                            </h3>
                            <div className="flex items-center">
                              <span className="text-red-400 text-xs font-mono mr-2">-5 EP</span>
                              <span className="text-primary text-xs font-mono mr-2">+15 XP</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMissionInfo(event);
                                }}
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className={`text-sm ${isCompleted ? 'line-through' : ''} text-[#8aaac2]`}>
                            {event.category === 'work' ? 'Conference Room 3' : 
                            event.category === 'health' ? 'Gym' : 'Virtual'} | {event.duration} | {event.startTime}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          
          {!compact && (
            <div className="mission-note text-center text-xs mt-5 text-[#7da4b6] italic opacity-80">
              <span>↴ Click the checkbox to mark missions as completed</span>
            </div>
          )}
        </div>
      );
    }
  };
  
  // Render the dialog component 
  return (
    <div>
      {renderMissionContent()}
      
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="glassmorphic backdrop-blur-lg border-primary/50">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl">Mission Details</DialogTitle>
            <DialogDescription className="text-[#7DAAB2] text-sm">
              View detailed information about this mission
            </DialogDescription>
          </DialogHeader>

          {selectedMission && (
            <div className="py-4">
              <div className="flex flex-col space-y-4">
                <div>
                  <h3 className="font-orbitron text-lg">{selectedMission.title}</h3>
                  <p className="text-[#7DAAB2] text-sm mt-1">
                    {selectedMission.category === 'work' ? 'Work Mission' : 
                     selectedMission.category === 'health' ? 'Health Mission' : 'Personal Mission'}
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm text-[#D6F4FF] leading-relaxed">
                    {selectedMission.description || 'No additional description provided for this mission.'}
                  </p>
                </div>
                
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center text-[#7DAAB2]">
                    <Clock className="mr-2 h-4 w-4" />
                    <span className="text-sm">
                      {selectedMission.startTime} - {getEndTime(selectedMission.startTime, selectedMission.duration)} | {selectedMission.duration}
                    </span>
                  </div>
                  
                  <div className="flex items-center text-[#7DAAB2]">
                    <Calendar className="mr-2 h-4 w-4" />
                    <span className="text-sm">Today</span>
                  </div>
                </div>
                
                <div className="flex space-x-4 pt-2">
                  <div className="flex items-center text-red-400">
                    <Zap className="h-4 w-4 mr-1" />
                    <span className="text-sm">-5 Energy Points</span>
                  </div>
                  <div className="flex items-center text-primary">
                    <Award className="h-4 w-4 mr-1" />
                    <span className="text-sm">+15 Experience</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInfoDialogOpen(false)}
            >
              Close
            </Button>
            
            <Button
              size="sm"
              className="ml-2"
              onClick={() => {
                if (selectedMission) {
                  toggleMission(selectedMission.id);
                  setInfoDialogOpen(false);
                }
              }}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {completedMissions[selectedMission?.id || ""] ? "Mark Incomplete" : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}