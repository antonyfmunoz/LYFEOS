import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, BarChart, CalendarDays, Clock, Brain, AlarmClock, 
  MoonStar, Smile, HeartPulse, Book, BookOpen, ListChecks, 
  Zap, Target as TargetIcon
} from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { usePageTitle } from '@/hooks/use-page-title';
import { UserStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { CustomTimePicker } from '@/components/ui/custom-time-picker';
import EnhancedMissionWidget from '@/components/dashboard/EnhancedMissionWidget';
import { DailyInitModal } from '@/components/dailyInit/DailyInitModal';
import { AIAgentFAB } from '@/components/ui/ai-agent-fab';
import { useToast } from '@/hooks/use-toast';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import { DraggableWidget } from '@/components/ui/draggable-widget';
import update from 'immutability-helper';
import { LevelUpModal } from '@/components/dashboard/LevelUpModal';

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

interface WidgetData {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen?: boolean;
}

// Helper function to format time (used for wake/sleep time pickers)
function formatTimeForInput(timeStr: string): string {
  const [hour, minute] = timeStr.split(':').map(Number);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

export default function DashboardPage() {
  // Set the page title
  usePageTitle('Dashboard');
  
  const { stats, username, events, updateUserStats } = useLYFEOS();
  const { toast } = useToast();
  
  // Level-up modal state
  const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
  
  // Dashboard state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
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
  
  // Watch for level-up changes
  useEffect(() => {
    // If showLevelUp is true, display the LevelUpModal
    if (stats?.experience?.showLevelUp) {
      setIsLevelUpModalOpen(true);
    }
  }, [stats?.experience?.showLevelUp]);
  
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
            className={`p-0 w-7 h-7 rounded-md hover:bg-primary/15 hover:text-primary active:bg-primary/20 focus:bg-primary/15 focus-visible:ring-primary/30 ${
              num === state
                ? "bg-primary/15 text-primary border border-primary/50"
                : "text-primary/60"
            }`}
            onClick={() => onChange(num)}
          >
            {num}
          </Button>
        ))}
      </div>
    </div>
  );
  
  // Widget metadata interface (without content - content is rendered dynamically)
  interface WidgetMeta {
    id: string;
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
  }

  // Define widgets for drag and drop functionality (metadata only)
  const [widgets, setWidgets] = useState<WidgetMeta[]>([
    {
      id: 'mission-log',
      title: "Mission Log",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'data-entry-log',
      title: "Data Log",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'intention-setter',
      title: "Intention Log",
      icon: <TargetIcon className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'energy-log',
      title: "Energy Log",
      icon: <Brain className="h-5 w-5 text-primary" />,
      defaultOpen: true
    }
  ]);

  // Render widget content dynamically based on id
  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'mission-log':
        return (
          <EnhancedMissionWidget 
            events={events} 
            maxHeight="96"
            hideHeader={true}
          />
        );
      case 'data-entry-log':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="ml-2">Today's Thoughts</span>
                </label>
                <MarkdownEditor
                  placeholder="Capture your thoughts, ideas and discoveries here..."
                  value={reflection.thoughts}
                  onChange={(value) => updateReflection("thoughts", value)}
                  minHeight="80px"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Book className="h-4 w-4 text-primary" />
                  <span className="ml-2">Content Consumed</span>
                </label>
                <MarkdownEditor
                  placeholder="Articles, books, or videos you consumed today..."
                  value={reflection.contentConsumed}
                  onChange={(value) => updateReflection("contentConsumed", value)}
                  minHeight="80px"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Zap className="h-4 w-4 text-primary" />
                <span className="ml-2">Research & Discoveries</span>
              </label>
              <MarkdownEditor
                placeholder="Interesting facts or discoveries you made..."
                value={reflection.research}
                onChange={(value) => updateReflection("research", value)}
                minHeight="60px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="ml-2">To-Do Ideas</span>
              </label>
              <MarkdownEditor
                placeholder="Things you want to remember to do later..."
                value={reflection.todoIdeas}
                onChange={(value) => updateReflection("todoIdeas", value)}
                minHeight="60px"
              />
            </div>
          </div>
        );
      case 'intention-setter':
        return (
          <div className="space-y-4">
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
        );
      case 'energy-log':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        );
      default:
        return null;
    }
  };
  
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
      <div className="dashboard-container">
        <AIAgentFAB />
        <DailyInitModal />
        
        {/* Level-up modal - shows when user levels up */}
        <LevelUpModal 
          level={stats.experience.level} 
          primaryColor={stats.primaryColor}
          isOpen={isLevelUpModalOpen}
          onClose={() => {
            // Reset the level-up modal state
            setIsLevelUpModalOpen(false);
            
            // Update stats to turn off the showLevelUp flag so it doesn't show again
            if (stats?.experience?.showLevelUp) {
              // Create an updated copy of stats with showLevelUp set to false
              const updatedStats = {
                ...stats,
                experience: {
                  ...stats.experience,
                  showLevelUp: false
                }
              };
              updateUserStats(updatedStats);
            }
          }}
        />
        
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
                  className="ml-3 bg-card border border-primary/30 rounded text-xs p-1"
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
                  className="bg-primary/10 hover:bg-primary hover:text-background rounded px-2 py-1 text-xs"
                >
                  {timeFormat === '12h' ? '24h' : '12h'}
                </button>
              </div>
            </div>
          </div>
        </section>
        
        {/* Draggable Widget Sections */}
        {widgets.map((widget, index) => (
          <DraggableWidget
            key={widget.id}
            id={widget.id}
            index={index}
            title={widget.title}
            icon={widget.icon}
            moveWidget={moveWidget}
            defaultOpen={widget.defaultOpen}
          >
            {renderWidgetContent(widget.id)}
          </DraggableWidget>
        ))}
      </div>
  );
}