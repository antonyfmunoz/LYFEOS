import React, { useState, useEffect, useCallback } from "react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { AIAgentFAB } from "@/components/ui/ai-agent-fab";
import { cn } from "@/lib/utils";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import {
  Brain,
  BookOpen,
  Edit,
  Save,
  AlarmClock,
  Clock,
  CalendarDays,
  PlusCircle,
  Book,
  Smile,
  MoonStar,
  HeartPulse,
  TargetIcon,
  ListChecks,
  Calendar,
  CheckCircle2,
  Zap,
  BarChart
} from "lucide-react";
import MissionLogWidget from "@/components/dashboard/MissionLogWidget";
import EnhancedMissionWidget from "@/components/dashboard/EnhancedMissionWidget";
import MissionLogSystem from "@/components/dashboard/MissionLogSystem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { ObsidianMarkdown } from "@/components/ui/obsidian-markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Checkbox } from "@/components/ui/checkbox";
import CompactStatsWidget from "@/components/dashboard/CompactStatsWidget";
import { StatType, CalendarEvent } from "@/lib/types";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import update from 'immutability-helper';

// Define types
interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  name: string;
  tasks: { id: string; text: string; completed: boolean }[];
}

interface DailyReflection {
  mentalState: number;
  physicalState: number;
  emotionalState: number;
  wakeTime: string;
  sleepTime: string;
  gratitude: string;
  tomorrowGoals: string;
  annualGoals: string;
  thoughts: string;
  contentConsumed: string;
  research: string;
  todoIdeas: string;
  date: string; // YYYY-MM-DD format
}

// Mission Timeline Component
function MissionTimeline({ events }: { events: CalendarEvent[] }) {
  const [completedMissions, setCompletedMissions] = useState<Record<string, boolean>>({});
  
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
  
  return (
    <div className="relative pl-10 pr-2 py-2 max-h-96 overflow-y-auto mission-timeline-container">
      {/* Vertical Timeline Line */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/80 via-primary/30 to-primary/10 z-0"></div>
      
      {events.length > 0 ? (
        events
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((event) => {
            const isCompleted = completedMissions[event.id] || false;
            
            return (
              <div 
                key={event.id}
                className={`mb-5 relative mission-block ${isCompleted ? 'opacity-60' : ''}`}
              >
                {/* Timeline Dot */}
                <div className={`absolute left-[-20px] top-2 w-4 h-4 rounded-full bg-black border-2 
                  ${event.category === 'work' ? 'border-blue-500' : 
                    event.category === 'health' ? 'border-green-500' : 'border-purple-500'}`}>
                </div>
                
                {/* Time Label */}
                <div className="absolute left-[-130px] top-1 w-24 text-right">
                  <span className="text-xs font-mono text-[#7DAAB2]">{event.startTime}</span>
                </div>
                
                {/* Mission Card */}
                <div 
                  className={`glassmorphic rounded-xl p-4 neon-border hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition ml-2 cursor-pointer ${isCompleted ? 'border-green-400/30 bg-green-400/5' : ''}`}
                  onClick={() => toggleMission(event.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 
                        ${isCompleted ? 'bg-green-500/20' :
                          event.category === 'work' ? 'bg-blue-500/20' : 
                          event.category === 'health' ? 'bg-green-500/20' : 'bg-purple-500/20'}`}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : event.category === 'work' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        ) : event.category === 'health' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-9.33-5"/><path d="m10.67 21.33-.67-1.33"/><path d="M3 7v2"/><path d="M7 3h2"/><path d="M5.67 5.67 4.33 4.33"/><path d="M18 21l3-3h-6l3-3"/><path d="M16 3h5v5"/><path d="m16 8-5-5"/></svg>
                        )}
                      </div>
                      
                      <div>
                        <div className="flex items-center">
                          <h3 className={`font-medium ${isCompleted ? 'line-through text-[#7DAAB2]' : 'text-[#D6F4FF]'}`}>{event.title}</h3>
                          <div className="ml-2 px-2 py-0.5 bg-primary/10 rounded text-xs font-mono text-[#36F1CD]">
                            +15 XP
                          </div>
                        </div>
                        
                        <div className="flex items-center mt-1">
                          <Clock className="h-3 w-3 text-primary mr-1" />
                          <p className="text-xs text-[#7DAAB2]">{event.startTime} – {getEndTime(event.startTime, event.duration)}</p>
                        </div>
                        
                        {event.description && (
                          <p className={`text-xs text-[#7DAAB2] mt-1 italic ${isCompleted ? 'line-through' : ''}`}>{event.description}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                      <div className={`text-xs font-semibold rounded-full px-2 py-0.5 
                        ${isCompleted ? 'bg-green-500/10 text-green-400' :
                          event.category === 'work' ? 'bg-blue-500/10 text-blue-400' : 
                          event.category === 'health' ? 'bg-green-500/10 text-green-400' : 
                            'bg-purple-500/10 text-purple-400'}`}>
                        {isCompleted ? 'Completed' : event.category.charAt(0).toUpperCase() + event.category.slice(1)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
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
  );
}

// Define widget data structure
interface WidgetData {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen?: boolean;
}

export default function DashboardPage() {
  // Set the page title
  usePageTitle('Dashboard');
  
  const { stats, username, events } = useLYFEOS();
  const { toast } = useToast();
  
  // Time blocks state
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockStartTime, setNewBlockStartTime] = useState("09:00");
  const [newBlockEndTime, setNewBlockEndTime] = useState("10:00");
  
  // Task editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  
  // Date and time state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Reflection state
  const [reflection, setReflection] = useState<DailyReflection>({
    mentalState: 5,
    physicalState: 5,
    emotionalState: 5,
    wakeTime: "06:00",
    sleepTime: "22:00",
    gratitude: "",
    tomorrowGoals: "",
    annualGoals: "",
    thoughts: "",
    contentConsumed: "",
    research: "",
    todoIdeas: "",
    date: new Date().toISOString().split('T')[0]
  });
  
  // Format current date 
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Format time
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
    timeZone: timezone
  });
  
  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Update reflection
  const updateReflection = (field: keyof DailyReflection, value: any) => {
    setReflection(prev => ({ ...prev, [field]: value }));
  };
  
  // Render state selector sliders
  const renderStateSelector = (
    value: number,
    onChange: (value: number) => void,
    label: string,
    icon: React.ReactNode
  ) => {
    return (
      <div className="space-y-2">
        <label className="text-sm flex items-center justify-between text-[#7DAAB2]">
          <div className="flex items-center">
            {icon}
            <span className="ml-2">{label}</span>
          </div>
          <span className="text-[#D6F4FF] font-mono">{value}/10</span>
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>
    );
  };
  
  // Initialize widgets with unique IDs for drag and drop
  const [widgets, setWidgets] = useState<WidgetData[]>([
    {
      id: uuidv4(),
      title: "Daily Mission Log",
      icon: <Clock className="h-5 w-5 text-primary" />,
      content: <MissionLogWidget events={events || []} />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Mission Timeline",
      icon: <CalendarDays className="h-5 w-5 text-primary" />,
      content: <MissionTimeline events={events} />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Stats & Progress",
      icon: <BarChart className="h-5 w-5 text-primary" />,
      content: <CompactStatsWidget stats={stats} />,
      defaultOpen: true
    },
    {
      id: uuidv4(),
      title: "Daily Journal",
      icon: <Edit className="h-5 w-5 text-primary" />,
      content: (
        <div className="space-y-4">
          {/* Basic info that shows at the top - date, wake/sleep, states */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <p className="text-[#7DAAB2] text-sm flex items-center space-x-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span>{formattedDate}</span>
              </p>
              
              <div className="text-xs md:text-sm text-[#7DAAB2] flex items-center mr-2">
                <div className="flex items-center mr-4">
                  <Zap className="h-4 w-4 text-yellow-400 mr-1" />
                  <span className="text-yellow-400 font-mono">+5</span>
                </div>
              </div>
            </div>
            
            {/* Wake-Sleep times */}
            <div className="flex flex-col md:flex-row gap-4 mb-3">
              <div className="flex-1">
                <div className="space-y-2">
                  <label className="text-sm flex items-center text-[#7DAAB2]">
                    <AlarmClock className="h-4 w-4 text-primary" />
                    <span className="ml-2">Wake Time</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 w-full">
                      <AlarmClock className="h-4 w-4 text-primary/70" />
                      <CustomTimePicker
                        value={reflection.wakeTime}
                        onChange={(value) => updateReflection("wakeTime", value)}
                        className="flex-grow"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex-1">
                <div className="space-y-2">
                  <label className="text-sm flex items-center text-[#7DAAB2]">
                    <MoonStar className="h-4 w-4 text-primary" />
                    <span className="ml-2">Sleep Time</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 w-full">
                      <MoonStar className="h-4 w-4 text-primary/70" />
                      <CustomTimePicker
                        value={reflection.sleepTime}
                        onChange={(value) => updateReflection("sleepTime", value)}
                        className="flex-grow"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* State ratings - in a row for desktop, stacked for mobile */}
          <div className="border-t border-primary/10 pt-4 mb-2">
            <div className="flex items-center justify-between text-sm mb-3">
              <label className="flex items-center text-[#7DAAB2] font-bold">
                <Brain className="h-4 w-4 text-primary" />
                <span className="ml-2">Energy Recap</span>
              </label>
              <div className="flex items-center">
                <span className="text-[#7DAAB2] mr-2">Daily Total:</span>
                <span className="text-[#D6F4FF] font-mono">
                  {Math.round(((reflection.mentalState + reflection.physicalState + reflection.emotionalState) / 30) * 100)}%
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderStateSelector(
                reflection.mentalState,
                (value) => updateReflection("mentalState", value),
                "Mental State",
                <Brain className="h-4 w-4 text-primary" />
              )}
              
              {renderStateSelector(
                reflection.physicalState,
                (value) => updateReflection("physicalState", value),
                "Physical State",
                <HeartPulse className="h-4 w-4 text-primary" />
              )}
              
              {renderStateSelector(
                reflection.emotionalState,
                (value) => updateReflection("emotionalState", value),
                "Emotional State",
                <Smile className="h-4 w-4 text-primary" />
              )}
            </div>
          </div>
          
          <div className="border-t border-primary/10 pt-4">
            <h3 className="text-sm flex items-center text-[#7DAAB2] mb-3 font-bold">
              <TargetIcon className="h-4 w-4 text-primary mr-2" />
              Intention Setter
            </h3>
            
            <div className="space-y-4">
              {/* Gratitude */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Smile className="h-4 w-4 text-primary" />
                  <span className="ml-2">Gratitude</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="What three things are you most grateful for today?"
                    value={reflection.gratitude}
                    onChange={(value) => updateReflection("gratitude", value)}
                    minHeight="80px"
                  />
                </div>
              </div>
              
              {/* Tomorrow's Goals */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="ml-2">Tomorrow's Goals</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="What three things do you want to accomplish tomorrow?"
                    value={reflection.tomorrowGoals}
                    onChange={(value) => updateReflection("tomorrowGoals", value)}
                    minHeight="60px"
                  />
                </div>
              </div>
              
              {/* Annual Goals */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <TargetIcon className="h-4 w-4 text-primary" />
                  <span className="ml-2">Annual Goals</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="What are your three big targets for the year?"
                    value={reflection.annualGoals}
                    onChange={(value) => updateReflection("annualGoals", value)}
                    minHeight="80px"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      defaultOpen: true
    },
  ]);
  
  // Callback for widget drag and drop reordering
  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgets((prevWidgets) => 
      update(prevWidgets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevWidgets[dragIndex]],
        ],
      })
    );
  }, []);
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="grid lg:grid-cols-2 gap-6 pb-10">
        {widgets.map((widget, index) => (
          <section key={widget.id} className="mb-6">
            <CollapsibleWidget
              id={widget.id}
              index={index}
              title={widget.title}
              icon={widget.icon}
              defaultOpen={widget.defaultOpen}
              moveWidget={moveWidget}
            >
              {widget.content}
            </CollapsibleWidget>
          </section>
        ))}
      </div>
    </DndProvider>
  );
}