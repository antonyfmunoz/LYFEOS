import React, { useState, useEffect } from "react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { AIAgentFAB } from "@/components/ui/ai-agent-fab";
import { cn } from "@/lib/utils";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { DraggableWidget } from "@/components/ui/draggable-widget";
import { useWidgets } from "@/hooks/use-widgets";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
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
  BarChart,
  RotateCcw
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
import { CalendarEvent, UserStats } from "@/lib/types";

// Define local enum for stats types as it differs from the global StatType
enum StatType {
  ATTENTION = "attention",
  TIME = "time",
  ENERGY = "energy",
  HEALTH = "health",
  EXPERIENCE = "experience"
}

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
  // Set the page title
  usePageTitle('Dashboard');
  
  const { stats, username, events } = useLYFEOS();
  const { toast } = useToast();
  const { widgets, moveWidget, resetWidgets } = useWidgets('dashboard');
  
  // Test function for toast notifications
  const testToast = () => {
    toast({
      title: "Theme Toast Test",
      description: "This toast should use the primary color theme",
      duration: 3000,
    });
  };
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
  
  const handleReset = () => {
    resetWidgets();
    toast({
      title: "Widgets Reset",
      description: "The dashboard widget layout has been reset to the default order.",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
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

  // Function to convert reflection to a journal entry
  const saveReflectionAsJournalEntry = (reflectionData: DailyReflection) => {
    const date = new Date(reflectionData.date);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Create content for the journal entry
    let content = `# Daily Reflection - ${formattedDate}\n\n`;
    
    // Add state metrics
    content += `## Daily State\n`;
    content += `- Mental State: ${reflectionData.mentalState}/10\n`;
    content += `- Physical State: ${reflectionData.physicalState}/10\n`;
    content += `- Emotional State: ${reflectionData.emotionalState}/10\n`;
    content += `- Wake Time: ${reflectionData.wakeTime}\n`;
    content += `- Sleep Time: ${reflectionData.sleepTime}\n\n`;
    
    // Add gratitude section if not empty
    if (reflectionData.gratitude && reflectionData.gratitude.trim()) {
      content += `## Gratitude\n${reflectionData.gratitude}\n\n`;
    }
    
    // Add tomorrow's goals if not empty
    if (reflectionData.tomorrowGoals && reflectionData.tomorrowGoals.trim()) {
      content += `## Tomorrow's Goals\n${reflectionData.tomorrowGoals}\n\n`;
    }
    
    // Add annual goals if not empty
    if (reflectionData.annualGoals && reflectionData.annualGoals.trim()) {
      content += `## Annual Goals\n${reflectionData.annualGoals}\n\n`;
    }
    
    // Add thoughts if not empty
    if (reflectionData.thoughts && reflectionData.thoughts.trim()) {
      content += `## Thoughts & Reflections\n${reflectionData.thoughts}\n\n`;
    }
    
    // Add content consumed if not empty
    if (reflectionData.contentConsumed && reflectionData.contentConsumed.trim()) {
      content += `## Content Consumed\n${reflectionData.contentConsumed}\n\n`;
    }
    
    // Add research if not empty
    if (reflectionData.research && reflectionData.research.trim()) {
      content += `## Research & Discoveries\n${reflectionData.research}\n\n`;
    }
    
    // Add to-do ideas if not empty
    if (reflectionData.todoIdeas && reflectionData.todoIdeas.trim()) {
      content += `## To-Do Ideas\n${reflectionData.todoIdeas}\n\n`;
    }
    
    // Create a mission page for this journal entry
    const title = `Journal - ${formattedDate}`;
    const slug = `journal-${reflectionData.date}`;
    
    try {
      useLYFEOS().createMissionPage({
        title,
        slug,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: false,
        xpValue: 20,
        tags: ['Journal', 'Daily Reflection']
      });
      
      toast({
        title: "Journal Entry Created",
        description: `Your daily reflection from ${formattedDate} has been saved to your journal.`,
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to create journal entry:", error);
    }
  };

  // Load reflection data from localStorage and check for date change
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastCheckedDate = localStorage.getItem('lastCheckedDate');
    const savedReflection = localStorage.getItem(`dailyLog-${today}`);
    
    // If today is different from the last checked date, 
    // save yesterday's reflection as a journal entry
    if (lastCheckedDate && lastCheckedDate !== today) {
      const yesterdayReflection = localStorage.getItem(`dailyLog-${lastCheckedDate}`);
      if (yesterdayReflection) {
        try {
          const parsedReflection = JSON.parse(yesterdayReflection);
          // Only save if there's any content in the reflection
          const hasContent = Object.entries(parsedReflection).some(([key, value]) => {
            return typeof value === 'string' && value.trim() !== '' && 
              !['date', 'wakeTime', 'sleepTime'].includes(key);
          });
          
          if (hasContent) {
            saveReflectionAsJournalEntry(parsedReflection);
          }
        } catch (e) {
          console.error("Failed to parse yesterday's reflection:", e);
        }
      }
      
      // Reset the reflection to default values but keep the date as today
      setReflection({
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
        date: today
      });
    } else if (savedReflection) {
      // If today's reflection exists, load it
      try {
        setReflection(JSON.parse(savedReflection));
      } catch (e) {
        console.error("Failed to parse saved reflection:", e);
      }
    }
    
    // Update last checked date
    localStorage.setItem('lastCheckedDate', today);
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

  // Create widget components map
  const widgetComponentsMap: Record<string, {
    content: React.ReactNode;
    icon: React.ReactNode;
    title: string;
  }> = {
    stats: {
      title: "Stats Log",
      icon: <BarChart className="h-5 w-5 text-primary" />,
      content: (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glassmorphic rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-[rgba(54,241,205,0.2)] flex items-center justify-center mr-2">
                  <Zap className="h-4 w-4 text-[#36F1CD]" />
                </div>
                <span className="text-sm font-medium">Energy</span>
              </div>
              <span className="text-sm text-[#36F1CD]">{stats?.energyPoints?.current || 0}/{stats?.energyPoints?.max || 100}</span>
            </div>
            <div className="w-full bg-primary/10 rounded-full h-2 mb-2">
              <div className="bg-[#36F1CD] h-2 rounded-full" style={{ width: `${((stats?.energyPoints?.current || 0) / (stats?.energyPoints?.max || 100)) * 100}%` }}></div>
            </div>
            <p className="text-xs text-[#7DAAB2]">
              Energy for physical and mental tasks
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-[rgba(137,173,253,0.2)] flex items-center justify-center mr-2">
                  <TargetIcon className="h-4 w-4 text-[#89ADFD]" />
                </div>
                <span className="text-sm font-medium">Focus</span>
              </div>
              <span className="text-sm text-[#89ADFD]">{stats?.attentionTokens?.current || 0}/{stats?.attentionTokens?.max || 100}</span>
            </div>
            <div className="w-full bg-primary/10 rounded-full h-2 mb-2">
              <div className="bg-[#89ADFD] h-2 rounded-full" style={{ width: `${((stats?.attentionTokens?.current || 0) / (stats?.attentionTokens?.max || 100)) * 100}%` }}></div>
            </div>
            <p className="text-xs text-[#7DAAB2]">
              Mental focus and concentration ability
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-[rgba(255,98,161,0.2)] flex items-center justify-center mr-2">
                  <HeartPulse className="h-4 w-4 text-[#FF62A1]" />
                </div>
                <span className="text-sm font-medium">Health</span>
              </div>
              <span className="text-sm text-[#FF62A1]">{stats?.healthPoints?.current || 0}/{stats?.healthPoints?.max || 100}</span>
            </div>
            <div className="w-full bg-primary/10 rounded-full h-2 mb-2">
              <div className="bg-[#FF62A1] h-2 rounded-full" style={{ width: `${((stats?.healthPoints?.current || 0) / (stats?.healthPoints?.max || 100)) * 100}%` }}></div>
            </div>
            <p className="text-xs text-[#7DAAB2]">
              Overall physical wellbeing status
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-[rgba(250,204,21,0.2)] flex items-center justify-center mr-2">
                  <Clock className="h-4 w-4 text-[#FACC15]" />
                </div>
                <span className="text-sm font-medium">Time</span>
              </div>
              <span className="text-sm text-[#FACC15]">{stats?.timeTokens?.current || 0}/{stats?.timeTokens?.max || 100}</span>
            </div>
            <div className="w-full bg-primary/10 rounded-full h-2 mb-2">
              <div className="bg-[#FACC15] h-2 rounded-full" style={{ width: `${((stats?.timeTokens?.current || 0) / (stats?.timeTokens?.max || 100)) * 100}%` }}></div>
            </div>
            <p className="text-xs text-[#7DAAB2]">
              Temporal resources remaining today
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <PlusCircle className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Experience</span>
              </div>
              <span className="text-sm text-primary">{stats?.experience?.current || 0}/{stats?.experience?.max || 100}</span>
            </div>
            <div className="w-full bg-primary/10 rounded-full h-2 mb-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: `${((stats?.experience?.current || 0) / (stats?.experience?.max || 100)) * 100}%` }}></div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#7DAAB2]">
                Level {stats?.experience?.level || 1}
              </p>
              <p className="text-xs text-[#7DAAB2]">
                +{stats?.experience?.max - (stats?.experience?.current || 0)} XP to Level {(stats?.experience?.level || 1) + 1}
              </p>
            </div>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 col-span-2">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Daily Progress</span>
              <div className="flex items-center">
                <div className="flex items-center mr-3">
                  <div className="w-2 h-2 rounded-full bg-primary mr-1"></div>
                  <span className="text-xs text-[#7DAAB2]">Progress</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-[#36F1CD] mr-1"></div>
                  <span className="text-xs text-[#7DAAB2]">Target</span>
                </div>
              </div>
            </div>
            <div className="h-16">
              <div className="flex h-full items-end justify-between">
                <div className="w-1/7 h-8 bg-primary rounded-sm relative">
                  <div className="w-full h-4 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-12 bg-primary rounded-sm relative">
                  <div className="w-full h-6 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-10 bg-primary rounded-sm relative">
                  <div className="w-full h-8 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-14 bg-primary rounded-sm relative">
                  <div className="w-full h-10 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-7 bg-primary rounded-sm relative">
                  <div className="w-full h-9 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-9 bg-primary rounded-sm relative">
                  <div className="w-full h-11 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
                <div className="w-1/7 h-5 bg-primary rounded-sm relative">
                  <div className="w-full h-7 bg-[#36F1CD]/20 absolute bottom-0 border-t border-[#36F1CD]"></div>
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-[#7DAAB2]">Mon</span>
              <span className="text-xs text-[#7DAAB2]">Tue</span>
              <span className="text-xs text-[#7DAAB2]">Wed</span>
              <span className="text-xs text-[#7DAAB2]">Thu</span>
              <span className="text-xs text-[#7DAAB2]">Fri</span>
              <span className="text-xs text-[#7DAAB2]">Sat</span>
              <span className="text-xs text-[#7DAAB2]">Sun</span>
            </div>
          </div>
        </div>
      )
    },
    mission: {
      title: "Mission Log",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      content: <EnhancedMissionWidget events={events || []} />
    },
    timeline: {
      title: "Timeline",
      icon: <CalendarDays className="h-5 w-5 text-primary" />,
      content: <MissionTimeline events={events || []} />
    },
    reflection: {
      title: "Daily Reflection",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Smile className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm font-medium">Mental State</span>
                </div>
                <span className="text-sm text-primary">{reflection.mentalState}/10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={reflection.mentalState}
                onChange={(e) => setReflection({...reflection, mentalState: parseInt(e.target.value)})}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-[#7DAAB2]">Low</span>
                <span className="text-xs text-[#7DAAB2]">High</span>
              </div>
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <HeartPulse className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm font-medium">Physical State</span>
                </div>
                <span className="text-sm text-primary">{reflection.physicalState}/10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={reflection.physicalState}
                onChange={(e) => setReflection({...reflection, physicalState: parseInt(e.target.value)})}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-[#7DAAB2]">Low</span>
                <span className="text-xs text-[#7DAAB2]">High</span>
              </div>
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Brain className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm font-medium">Emotional State</span>
                </div>
                <span className="text-sm text-primary">{reflection.emotionalState}/10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={reflection.emotionalState}
                onChange={(e) => setReflection({...reflection, emotionalState: parseInt(e.target.value)})}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-[#7DAAB2]">Low</span>
                <span className="text-xs text-[#7DAAB2]">High</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex items-center mb-2">
                  <AlarmClock className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm font-medium">Wake Time</span>
                </div>
                <CustomTimePicker 
                  value={reflection.wakeTime} 
                  onChange={(time) => setReflection({...reflection, wakeTime: time})}
                />
              </div>
              
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex items-center mb-2">
                  <MoonStar className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm font-medium">Sleep Time</span>
                </div>
                <CustomTimePicker 
                  value={reflection.sleepTime} 
                  onChange={(time) => setReflection({...reflection, sleepTime: time})}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-2">
                <CalendarDays className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Gratitude</span>
              </div>
              <textarea
                value={reflection.gratitude}
                onChange={(e) => setReflection({...reflection, gratitude: e.target.value})}
                placeholder="What are you grateful for today?"
                className="w-full h-20 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
              />
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-2">
                <TargetIcon className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Tomorrow's Goals</span>
              </div>
              <textarea
                value={reflection.tomorrowGoals}
                onChange={(e) => setReflection({...reflection, tomorrowGoals: e.target.value})}
                placeholder="Set your intentions for tomorrow..."
                className="w-full h-20 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
              />
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-2">
                <Book className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Content Consumed</span>
              </div>
              <textarea
                value={reflection.contentConsumed}
                onChange={(e) => setReflection({...reflection, contentConsumed: e.target.value})}
                placeholder="Books, articles, videos, podcasts..."
                className="w-full h-20 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      )
    },
    routine: {
      title: "Routine",
      icon: <Brain className="h-5 w-5 text-primary" />,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glassmorphic rounded-xl p-4">
            <div className="flex items-center mb-4">
              <ListChecks className="h-4 w-4 text-primary mr-2" />
              <span className="text-sm font-medium">Routine</span>
            </div>
            
            {timeBlocks.length > 0 ? (
              <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                {timeBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((block) => (
                  <div key={block.id} className="border border-primary/20 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      {editingBlockId === block.id ? (
                        <Input
                          value={block.name}
                          onChange={(e) => saveBlockEdit(block.id, 'name', e.target.value)}
                          className="h-7 text-sm"
                          onBlur={() => setEditingBlockId(null)}
                          autoFocus
                        />
                      ) : (
                        <div 
                          className="font-medium text-sm flex-1"
                          onClick={() => setEditingBlockId(block.id)}
                        >
                          {block.name}
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <div className="text-xs text-[#7DAAB2] font-mono flex items-center">
                          <CustomTimePicker 
                            value={block.startTime} 
                            onChange={(time) => saveBlockEdit(block.id, 'startTime', time)}
                            buttonClassName="h-6 px-2 py-0 min-w-[60px] text-xs"
                          />
                          <span className="mx-1">-</span>
                          <CustomTimePicker 
                            value={block.endTime} 
                            onChange={(time) => saveBlockEdit(block.id, 'endTime', time)}
                            buttonClassName="h-6 px-2 py-0 min-w-[60px] text-xs"
                          />
                        </div>
                        <button
                          onClick={() => handleDeleteBlock(block.id)}
                          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-destructive/20 transition-colors text-destructive"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mt-3">
                      {block.tasks.length > 0 && (
                        <div className="space-y-2">
                          {block.tasks.map((task) => (
                            <div key={task.id} className="flex items-start space-x-2">
                              <Checkbox
                                id={`task-${task.id}`}
                                checked={task.completed}
                                onCheckedChange={() => toggleTaskCompletion(block.id, task.id)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                {editingTaskId === task.id ? (
                                  <Input
                                    value={task.text}
                                    onChange={(e) => setNewTaskText(e.target.value)}
                                    className="h-7 text-sm"
                                    onBlur={() => saveTaskEdit(block.id, task.id, newTaskText)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        saveTaskEdit(block.id, task.id, newTaskText);
                                      }
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <label
                                    htmlFor={`task-${task.id}`}
                                    className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : ''}`}
                                    onClick={() => {
                                      setEditingTaskId(task.id);
                                      setNewTaskText(task.text);
                                    }}
                                  >
                                    {task.text}
                                  </label>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteTask(block.id, task.id)}
                                className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-destructive/20 transition-colors text-destructive"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center">
                        <Input
                          placeholder="Add a task..."
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          className="h-7 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newTaskText.trim()) {
                              handleAddTask(block.id, newTaskText);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2 h-7 w-7 p-0 hover:bg-primary/20"
                          onClick={() => {
                            if (newTaskText.trim()) {
                              handleAddTask(block.id, newTaskText);
                            }
                          }}
                          disabled={!newTaskText.trim()}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm italic">
                No routine blocks created yet. Add your first one below.
              </div>
            )}
            
            <div className="mt-4 space-y-4">
              <div className="glassmorphic p-3 rounded-lg">
                <h3 className="text-sm font-medium mb-2">Add New Block</h3>
                <div className="space-y-2">
                  <Input
                    placeholder="Block name"
                    value={newBlockName}
                    onChange={(e) => setNewBlockName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <CustomTimePicker
                        value={newBlockStartTime}
                        onChange={setNewBlockStartTime}
                        buttonClassName="w-full h-8 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <CustomTimePicker
                        value={newBlockEndTime}
                        onChange={setNewBlockEndTime}
                        buttonClassName="w-full h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full h-8 mt-2 text-sm hover:bg-yellow-400 hover:text-black transition-colors"
                    onClick={handleAddTimeBlock}
                  >
                    Add Block
                  </Button>
                </div>
              </div>
              
              <div className="glassmorphic p-3 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mr-2">
                    <div className="text-primary text-sm font-semibold">{totalXpEarned}</div>
                  </div>
                  <span className="text-sm">XP earned today</span>
                </div>
                <p className="text-xs text-[#7DAAB2]">
                  Complete tasks to earn XP points
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-4">
                <Edit className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Thoughts & Reflections</span>
              </div>
              <MarkdownEditor
                value={reflection.thoughts}
                onChange={(value) => setReflection({...reflection, thoughts: value})}
                placeholder="Reflect on your day..."
                height="180px"
              />
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-4">
                <Brain className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Research & Discoveries</span>
              </div>
              <textarea
                value={reflection.research}
                onChange={(e) => setReflection({...reflection, research: e.target.value})}
                placeholder="Any new insights or learnings..."
                className="w-full h-36 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
              />
            </div>
            
            <div className="glassmorphic rounded-xl p-4">
              <div className="flex items-center mb-4">
                <ListChecks className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">To-Do Ideas</span>
              </div>
              <textarea
                value={reflection.todoIdeas}
                onChange={(e) => setReflection({...reflection, todoIdeas: e.target.value})}
                placeholder="Ideas for future tasks..."
                className="w-full h-24 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      )
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="dashboard-container">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-orbitron mb-1">Daily Log</h1>
            <p className="text-[#7DAAB2]">
              {formattedDate} <span className="mx-2">•</span> {formattedTime}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              className="hover:bg-yellow-400 hover:text-black transition-colors"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Layout
            </Button>
            <CompactStatsWidget 
              stats={{
                energyPoints: {
                  current: stats?.energyPoints?.current || 0, 
                  max: stats?.energyPoints?.max || 100,
                },
                attentionTokens: {
                  current: stats?.attentionTokens?.current || 0,
                  max: stats?.attentionTokens?.max || 100,
                },
                timeTokens: {
                  current: stats?.timeTokens?.current || 0, 
                  max: stats?.timeTokens?.max || 100,
                },
                healthPoints: {
                  current: stats?.healthPoints?.current || 0, 
                  max: stats?.healthPoints?.max || 100,
                },
                experience: {
                  current: stats?.experience?.current || 0,
                  max: stats?.experience?.max || 100,
                  level: stats?.experience?.level || 1,
                },
                streakDays: stats?.streakDays || 0,
                efficiencyScore: stats?.efficiencyScore || 0
              }}
            />
          </div>
        </div>
        
        {/* Draggable Widgets */}
        {widgets.map((widget, index) => {
          if (!widget.enabled) return null;
          
          const widgetInfo = widgetComponentsMap[widget.type];
          if (!widgetInfo) return null;
          
          return (
            <DraggableWidget 
              key={widget.id} 
              id={widget.id}
              index={index}
              moveWidget={moveWidget}
              className="mb-6 pl-5"
            >
              <CollapsibleWidget 
                title={widgetInfo.title || widget.title} 
                icon={widgetInfo.icon}
                className="mb-4"
                defaultOpen={true}
              >
                {widgetInfo.content}
              </CollapsibleWidget>
            </DraggableWidget>
          );
        })}
        
        <AIAgentFAB />
      </div>
    </DndProvider>
  );
}