import React, { useState, useEffect } from "react";
import { useLYFEOS } from "@/lib/context";
import { cn } from "@/lib/utils";
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
  Zap
} from "lucide-react";
import MissionLogWidget from "@/components/dashboard/MissionLogWidget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { ObsidianMarkdown } from "@/components/ui/obsidian-markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Checkbox } from "@/components/ui/checkbox";
import StatsWidget from "@/components/dashboard/StatsWidget";
import { StatType, CalendarEvent } from "@/lib/types";

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

// Helper functions
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

export default function DashboardPage() {
  const { stats, username, events } = useLYFEOS();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Time blocks state
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockStartTime, setNewBlockStartTime] = useState("09:00");
  const [newBlockEndTime, setNewBlockEndTime] = useState("10:00");
  
  // Task editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  
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
  
  // Load time blocks from localStorage
  useEffect(() => {
    const savedRoutine = localStorage.getItem("routineData");
    if (savedRoutine) {
      try {
        setTimeBlocks(JSON.parse(savedRoutine));
      } catch (e) {
        console.error("Failed to parse saved routine:", e);
        setTimeBlocks([]);
      }
    }
  }, []);

  // Load reflection data from localStorage
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const savedReflection = localStorage.getItem(`dailyLog-${today}`);
    
    if (savedReflection) {
      try {
        setReflection(JSON.parse(savedReflection));
      } catch (e) {
        console.error("Failed to parse saved reflection:", e);
      }
    }
  }, []);
  
  // Calculate total XP earned whenever timeBlocks change
  useEffect(() => {
    let xpTotal = 0;
    timeBlocks.forEach(block => {
      block.tasks.forEach(task => {
        if (task.completed) {
          // Each completed task earns 10 XP
          xpTotal += 10;
        }
      });
    });
    setTotalXpEarned(xpTotal);
  }, [timeBlocks]);
  
  // Save time blocks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("routineData", JSON.stringify(timeBlocks));
  }, [timeBlocks]);
  
  // Auto-save the reflection to localStorage whenever it changes
  useEffect(() => {
    const key = `dailyLog-${reflection.date}`;
    localStorage.setItem(key, JSON.stringify(reflection));
  }, [reflection]);
  
  // Handle adding a new time block
  const handleAddTimeBlock = () => {
    const newBlock: TimeBlock = {
      id: `block-${Date.now()}`,
      startTime: newBlockStartTime,
      endTime: newBlockEndTime,
      name: newBlockName || "New Block",
      tasks: []
    };
    
    setTimeBlocks([...timeBlocks, newBlock]);
    
    // Reset fields
    setNewBlockName("");
    setNewBlockStartTime("09:00");
    setNewBlockEndTime("10:00");
  };
  
  // Handle editing block name
  const saveBlockEdit = (blockId: string, field: 'name' | 'startTime' | 'endTime', value: string) => {
    setTimeBlocks(timeBlocks.map(block => {
      if (block.id === blockId) {
        return { ...block, [field]: value };
      }
      return block;
    }));
  };
  
  // Handle deleting a time block
  const handleDeleteBlock = (blockId: string) => {
    setTimeBlocks(timeBlocks.filter(block => block.id !== blockId));
  };
  
  // Handle adding a task to a block
  const handleAddTask = (blockId: string, taskText: string) => {
    if (!taskText.trim()) return;
    
    const newTask = {
      id: `task-${Date.now()}`,
      text: taskText,
      completed: false
    };
    
    setTimeBlocks(timeBlocks.map(block => {
      if (block.id === blockId) {
        return { ...block, tasks: [...block.tasks, newTask] };
      }
      return block;
    }));
    
    setNewTaskText("");
  };
  
  // Handle deleting a task
  const handleDeleteTask = (blockId: string, taskId: string) => {
    setTimeBlocks(timeBlocks.map(block => {
      if (block.id === blockId) {
        return { ...block, tasks: block.tasks.filter(task => task.id !== taskId) };
      }
      return block;
    }));
  };
  
  // Save task edit
  const saveTaskEdit = (blockId: string, taskId: string, newText: string) => {
    setTimeBlocks(timeBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          tasks: block.tasks.map(task => {
            if (task.id === taskId) {
              return { ...task, text: newText };
            }
            return task;
          })
        };
      }
      return block;
    }));
    
    setEditingTaskId(null);
  };
  
  // Toggle task completion
  const toggleTaskCompletion = (blockId: string, taskId: string) => {
    setTimeBlocks(timeBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          tasks: block.tasks.map(task => {
            if (task.id === taskId) {
              return { ...task, completed: !task.completed };
            }
            return task;
          })
        };
      }
      return block;
    }));
  };
  
  // Update reflection
  const updateReflection = (field: keyof DailyReflection, value: any) => {
    setReflection(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Render state selector (1-10 scale)
  const renderStateSelector = (
    state: number,
    onChange: (value: number) => void,
    label: string,
    icon: React.ReactNode
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm flex items-center text-[#7DAAB2]">
          {icon}
          <span className="ml-2">{label}</span>
        </label>
        <span className="text-[#D6F4FF] font-mono">{state}/10</span>
      </div>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <Button
            key={num}
            type="button"
            size="sm"
            variant="ghost"
            className={`p-0 w-7 h-7 rounded-md ${
              num === state
                ? "bg-primary/20 text-primary border border-primary/50"
                : "text-[#7DAAB2] hover:bg-primary/10 hover:text-primary"
            }`}
            onClick={() => onChange(num)}
          >
            {num}
          </Button>
        ))}
      </div>
    </div>
  );
  
  return (
    <div className="dashboard-container">
      {/* Date Header - Cinematic HUD Style */}
      <section className="mb-6">
        <div className="glassmorphic rounded-xl p-3 neon-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="flex items-center">
              <CalendarDays className="h-5 w-5 text-primary mr-2" />
              <h1 className="text-xl sm:text-2xl font-orbitron text-[#D6F4FF]">{formattedDate}</h1>
            </div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
              <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
              
              <select 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="ml-3 bg-[#00141A] border border-primary/30 rounded text-xs text-[#7DAAB2] p-1"
              >
                {[
                  { label: 'EST', value: 'America/New_York' },
                  { label: 'CST', value: 'America/Chicago' },
                  { label: 'MST', value: 'America/Denver' },
                  { label: 'PST', value: 'America/Los_Angeles' },
                  { label: 'GMT', value: 'Europe/London' },
                  { label: 'CET', value: 'Europe/Paris' },
                  { label: 'JST', value: 'Asia/Tokyo' },
                  { label: 'AEST', value: 'Australia/Sydney' },
                  { label: 'NZST', value: 'Pacific/Auckland' }
                ].map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              
              <button 
                onClick={() => setTimeFormat(prev => prev === '12h' ? '24h' : '12h')}
                className="bg-primary/10 hover:bg-primary/20 text-primary rounded px-2 py-1 text-xs"
              >
                {timeFormat === '12h' ? '24h' : '12h'}
              </button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Stats and Progress Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <Zap className="h-5 w-5 text-primary mr-2" />
            <span>Stat Log</span>
          </h2>
        </div>
        
        <StatsWidget stats={stats} />
      </section>
      
      {/* Mission Log Panel */}
      <section className="mb-6">
        <MissionLogWidget 
          events={events} 
          questStyle={true} 
          maxHeight="96"
        />
      </section>
      
      {/* Data Entry Log Panel */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <BookOpen className="h-5 w-5 text-primary mr-2" />
            <span>Data Entry Log</span>
          </h2>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Today's Thoughts */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="ml-2">Today's Thoughts</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="Ideas worth saving..."
                    value={reflection.thoughts}
                    onChange={(value) => updateReflection("thoughts", value)}
                    minHeight="100px"
                    autoBullets={true}
                  />
                </div>
              </div>
              
              {/* Content Consumed */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Book className="h-4 w-4 text-primary" />
                  <span className="ml-2">Content Consumed</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="Books, podcasts, videos..."
                    value={reflection.contentConsumed}
                    onChange={(value) => updateReflection("contentConsumed", value)}
                    minHeight="100px"
                  />
                </div>
              </div>
              
              {/* Today's Research */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="ml-2">Today's Research</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="Summarize learnings or add links..."
                    value={reflection.research}
                    onChange={(value) => updateReflection("research", value)}
                    minHeight="100px"
                  />
                </div>
              </div>
              
              {/* New To-Do-List Ideas */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="ml-2">New To-Do-List Ideas</span>
                </label>
                <div className="flex flex-col space-y-2">
                  <MarkdownEditor
                    placeholder="Add anything..."
                    value={reflection.todoIdeas}
                    onChange={(value) => updateReflection("todoIdeas", value)}
                    minHeight="100px"
                    autoBullets={true}
                  />
                </div>
              </div>
            </div>
            
            {/* Auto-saved, no button needed */}
          </div>
        </div>
      </section>
      
      {/* Recalibration Log Panel */}
      <section className="mb-6" style={{ position: 'relative', zIndex: 1 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <Brain className="h-5 w-5 text-primary mr-2" />
            <span>Recalibration Log</span>
          </h2>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="space-y-4">
            {/* Sleep Tracker Section */}
            <div className="mb-3">
              <h3 className="text-sm flex items-center text-[#7DAAB2] mb-3 font-bold">
                <MoonStar className="h-4 w-4 text-primary mr-2" />
                Sleep Tracker
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm flex items-center text-[#7DAAB2]">
                    <AlarmClock className="h-4 w-4 text-primary" />
                    <span className="ml-2">Wake Up Time</span>
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
                      autoBullets={true}
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
                      autoBullets={true}
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
                      autoBullets={true}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Auto-saved, no button needed */}
          </div>
        </div>
      </section>
      
    </div>
  );
}