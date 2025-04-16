import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { CalendarEvent } from "@/lib/types";

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
  
  // Save to localStorage whenever completedMissions changes
  useEffect(() => {
    localStorage.setItem("completedMissions", JSON.stringify(completedMissions));
  }, [completedMissions]);
  
  const toggleMission = (id: string) => {
    setCompletedMissions(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
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

  if (questStyle) {
    // Quest-style rendering
    return (
      <div className={`quest-log-box glassmorphic rounded-xl p-6 ${className}`}>
        {!compact && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-medium text-[#d6f4ff] flex items-center">
              <Calendar className="h-5 w-5 text-primary mr-2" />
              <span>Today's Missions</span>
            </h2>
            <Button
              variant="outline"
              className="text-primary border-primary/30 hover:bg-primary/10"
              onClick={() => window.location.href = '/calendar'}
            >
              <Calendar className="h-4 w-4 mr-2" />
              View Calendar
            </Button>
          </div>
        )}
        
        <div className={`py-2 max-h-${maxHeight} overflow-y-auto`}>
          {events.length > 0 ? (
            <div className="space-y-3">
              {events
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((event) => {
                  const isCompleted = completedMissions[event.id] || false;
                  
                  return (
                    <div 
                      key={event.id}
                      className={`p-4 rounded-lg transition-all duration-200 cursor-pointer relative 
                        ${isCompleted ? 
                          'bg-green-400/5 border border-green-400/20' : 
                          'bg-primary/5 border border-primary/20 hover:border-primary/40'}`}
                      onClick={() => toggleMission(event.id)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center
                            ${isCompleted ? 'bg-green-500/20' : 
                              event.category === 'work' ? 'bg-blue-500/20' : 
                              event.category === 'health' ? 'bg-red-500/20' : 'bg-purple-500/20'}`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center">
                              <h3 className={`font-medium ${isCompleted ? 'line-through text-[#7DAAB2]' : 'text-[#D6F4FF]'}`}>
                                {event.title}
                              </h3>
                              <span className="ml-2 text-xs font-mono text-[#7DAAB2]">{event.startTime}</span>
                            </div>
                            <p className={`text-xs text-[#7DAAB2] mt-0.5 ${isCompleted ? 'line-through' : ''}`}>
                              {event.category === 'work' ? 'Conference Room 3' : 
                              event.category === 'health' ? 'Gym' : 'Virtual'} | {event.duration}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="px-2 py-1 rounded-md bg-primary/10 text-xs font-mono text-primary">
                            +15 XP
                          </div>
                          <Button variant="ghost" size="icon" className="ml-2 h-8 w-8">
                            <ArrowRight className="h-4 w-4 text-primary" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="glassmorphic rounded-xl p-6 text-center opacity-80">
              <Calendar className="h-10 w-10 text-primary/50 mx-auto mb-3" />
              <p className="text-[#7DAAB2]">No missions scheduled for today</p>
              <p className="text-xs text-[#7DAAB2] mt-2">
                Visit the Calendar page to add missions to your daily schedule
              </p>
            </div>
          )}
        </div>
        
        {!compact && (
          <div className="text-center text-xs mt-4 text-[#7da4b6] italic opacity-80">
            <span>Click missions to mark them as completed</span>
          </div>
        )}
      </div>
    );
  }
  
  // Timeline-style rendering (original)
  return (
    <div className={`mission-log-box bg-[#0d131f] border border-[#00f2fe] rounded-xl p-6 ${className}`}>
      {!compact && (
        <div className="mission-log-header flex items-center justify-between mb-6">
          <h2 className="text-xl font-orbitron text-[#dff9ff]">
            Today's Schedule
          </h2>
          <Button
            variant="ghost"
            className="text-[#00f2fe] font-bold text-sm p-0 hover:bg-transparent hover:text-[#00f2fe] hover:underline"
            onClick={() => window.location.href = '/calendar'}
          >
            VIEW CALENDAR
          </Button>
        </div>
      )}
      
      <div className={`mission-schedule py-2 max-h-${maxHeight} overflow-y-auto`}>
        {events.length > 0 ? (
          <ul className="list-none p-0 m-0">
            {events
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((event) => {
                const isCompleted = completedMissions[event.id] || false;
                
                return (
                  <li 
                    key={event.id}
                    className={`mission-block flex justify-between items-start mb-7 cursor-pointer transition-all duration-300 ${isCompleted ? 'opacity-50' : ''}`}
                    onClick={() => toggleMission(event.id)}
                  >
                    <div className="mission-left flex items-start">
                      {/* Time Column */}
                      <div className="time-col w-14 font-mono text-[#d0f0ff] mt-1">
                        {event.startTime}
                      </div>
                      
                      {/* Divider Line */}
                      <div className={`divider w-0.5 h-full mx-2 rounded-full self-stretch ${
                        event.category === 'work' ? 'bg-[#00f2fe]' : 
                        event.category === 'health' ? 'bg-[#ff5f78]' : 'bg-[#c280ff]'
                      }`}></div>
                      
                      {/* Mission Info */}
                      <div className="mission-info flex flex-col ml-5">
                        <div className={`mission-title text-base font-semibold mb-1.5 ${isCompleted ? 'line-through' : ''} text-white`}>
                          {event.title}
                        </div>
                        
                        <div className={`mission-subtext text-sm ${isCompleted ? 'line-through' : ''} text-[#8aaac2]`}>
                          {event.category === 'work' ? 'Conference Room 3' : 
                          event.category === 'health' ? 'Gym' : 'Virtual'} | {event.duration}
                        </div>
                      </div>
                    </div>
                    
                    {/* XP Badge */}
                    <div className="xp-badge px-2.5 py-1 bg-[#003c3c] text-[#00f2a3] text-xs font-bold rounded-lg border border-[#00f2a3] whitespace-nowrap h-fit mt-1.5 transition-opacity duration-300">
                      +15 XP
                    </div>
                  </li>
                );
              })}
          </ul>
        ) : (
          <div className="glassmorphic rounded-xl p-6 text-center opacity-80 mt-6">
            <Calendar className="h-10 w-10 text-primary/50 mx-auto mb-3" />
            <p className="text-[#7DAAB2]">No missions scheduled for today</p>
            <p className="text-xs text-[#7DAAB2] mt-2">
              Visit the Calendar page to add missions to your daily schedule
            </p>
          </div>
        )}
      </div>
      
      {!compact && (
        <div className="mission-note text-center text-xs mt-5 text-[#7da4b6] italic opacity-80">
          <span>↴ Click missions to mark them as completed</span>
        </div>
      )}
    </div>
  );
}