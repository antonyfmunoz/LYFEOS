import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
              className="absolute top-0 right-0 text-[#00f2fe] text-xs py-1 px-2 h-auto border-[#00f2fe]/30 hover:bg-[#00f2fe]/5 hover:text-[#00f2fe]"
              onClick={() => window.location.href = '/calendar'}
            >
              <Calendar className="h-3 w-3 mr-1" /> Calendar
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
                              <span className="text-primary text-xs font-mono">+15 XP</span>
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
          <div className="mission-note text-center text-xs mt-5 text-[#7da4b6] italic opacity-80">
            <span>↴ Click the checkbox to mark missions as completed</span>
          </div>
        )}
      </div>
    );
  }
  
  // Timeline-style rendering (original)
  return (
    <div className={`mission-log-box bg-[#0d131f] border border-[#00f2fe] rounded-xl p-6 ${className}`}>
      {!compact && (
        <div className="relative mb-6">
          <h2 className="text-xl font-orbitron text-[#dff9ff]">
            Mission Log
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
                    className={`mission-block mb-7 transition-all duration-300 p-3 rounded-lg border border-[#00f2fe]/30 ${isCompleted ? 'opacity-50' : ''}`}
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
                            <span className="text-primary text-xs font-mono">+15 XP</span>
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
          <span>↴ Click the checkbox to mark missions as completed</span>
        </div>
      )}
    </div>
  );
}