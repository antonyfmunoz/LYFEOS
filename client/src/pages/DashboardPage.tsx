import React, { useState, useEffect } from "react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { AIAgentFAB } from "@/components/ui/ai-agent-fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useWidgets } from "@/hooks/use-widgets";
import { DraggableWidget } from "@/components/ui/draggable-widget";

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
  RotateCcw,
} from "lucide-react";

enum StatType {
  ATTENTION = "attention",
  TIME = "time",
  ENERGY = "energy",
  HEALTH = "health",
  EXPERIENCE = "experience"
}

interface DashboardTimelineEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  completed: boolean;
  type: string;
}

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

function MissionLogSystem() {
  return (
    <div>
      <p className="text-sm text-[#7DAAB2] mb-4">
        Record your ongoing missions, insights, and adventures.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="hover:bg-yellow-400 hover:text-black transition-colors"
      >
        <Edit className="h-4 w-4 mr-2" />
        Add Entry
      </Button>
    </div>
  );
}

function MissionTimeline({ events }: { events: DashboardTimelineEvent[] }) {
  return (
    <div>
      {events.length > 0 ? (
        <div className="space-y-4">
          {events.map((event) => (
            <div 
              key={event.id} 
              className="flex items-start py-2 border-b border-primary/10 last:border-none"
            >
              <div className="w-24 shrink-0 text-sm text-[#7DAAB2]">
                {event.time || "All day"}
              </div>
              <div className="flex-grow">
                <div className="flex items-center">
                  <span className={`text-sm font-medium ${event.completed ? 'line-through text-[#7DAAB2]' : ''}`}>
                    {event.title}
                  </span>
                </div>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-[#7DAAB2] bg-primary/10 px-2 py-0.5 rounded-full">
                    {event.type}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-[#7DAAB2]">
          <p>No events scheduled for today.</p>
          <p className="text-xs mt-1">
            Add events from the Calendar module or by using the 'Add Event' button.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const { toast } = useToast();
  const { 
    stats,
    events,
    updateUserStats
  } = useLYFEOS();
  
  // Use widgets hook for drag-and-drop functionality
  const { widgets, moveWidget, resetWidgets } = useWidgets('dashboard');
  
  // Current date and time
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [formattedDate, setFormattedDate] = useState("");
  const [formattedTime, setFormattedTime] = useState("");
  
  // State for daily reflection
  const [reflection, setReflection] = useState<DailyReflection>({
    mentalState: 5,
    physicalState: 5,
    emotionalState: 5,
    wakeTime: "07:00",
    sleepTime: "23:00",
    gratitude: "",
    tomorrowGoals: "",
    annualGoals: "",
    thoughts: "",
    contentConsumed: "",
    research: "",
    todoIdeas: "",
    date: new Date().toISOString().split('T')[0]
  });
  
  // Time blocks state
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockStartTime, setNewBlockStartTime] = useState("09:00");
  const [newBlockEndTime, setNewBlockEndTime] = useState("10:00");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  
  // Update date and time every minute
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(now);
      
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      };
      
      setFormattedDate(now.toLocaleDateString(undefined, options));
      setFormattedTime(now.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit'
      }));
    };
    
    updateDateTime();
    const intervalId = setInterval(updateDateTime, 60000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Function to save reflection as a journal entry
  const saveReflectionAsJournalEntry = (reflectionData: DailyReflection) => {
    // In a real implementation, this would save to the context
    console.log("Journal entry saved:", reflectionData);
    
    toast({
      title: "Reflection Saved",
      description: "Your daily reflection has been saved to the journal.",
    });
  };
  
  // Function to handle resetting widgets to default layout
  const handleReset = () => {
    resetWidgets();
    toast({
      title: "Layout Reset",
      description: "Dashboard widgets have been reset to the default layout.",
    });
  };

  return (
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
            <div className="compact-stats flex items-center gap-4">
              <div className="level-indicator flex items-center bg-primary/10 rounded-full px-3 py-1">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                  <Calendar className="h-3 w-3 text-background" />
                </div>
                <span className="text-xs font-semibold">Lv.{stats?.experience?.level || 1}</span>
              </div>
              
              <div className="streak-days flex items-center bg-primary/10 rounded-full px-3 py-1">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                  <Calendar className="h-3 w-3 text-background" />
                </div>
                <span className="text-xs font-semibold">{stats?.streakDays || 0} Days</span>
              </div>
              
              <div className="efficiency-score flex items-center bg-primary/10 rounded-full px-3 py-1">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
                  <BarChart className="h-3 w-3 text-background" />
                </div>
                <span className="text-xs font-semibold">{stats?.efficiencyScore || 0}% Eff.</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Dashboard Content - Original UI with Draggable Widgets */}
        <div className="space-y-6">
          {/* Stats Widget */}
          <DraggableWidget 
            id="stats" 
            index={widgets.findIndex(w => w.id === "stats")}
            moveWidget={moveWidget}
            className="glassmorphic rounded-xl p-4"
          >
            <div className="flex items-center mb-4">
              <BarChart className="h-4 w-4 text-primary mr-2" />
              <span className="text-sm font-medium">Stats Log</span>
            </div>
            
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
                  Attention tokens for focus activities
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
                  Health points for physical wellbeing
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
                  Time tokens for daily allocation
                </p>
              </div>
            </div>
          </DraggableWidget>
          
          {/* Mission Log Widget */}
          <DraggableWidget 
            id="mission" 
            index={widgets.findIndex(w => w.id === "mission")}
            moveWidget={moveWidget}
            className="glassmorphic rounded-xl p-4"
          >
            <div className="flex items-center mb-4">
              <Book className="h-4 w-4 text-primary mr-2" />
              <span className="text-sm font-medium">Mission Log</span>
            </div>
            <MissionLogSystem />
          </DraggableWidget>
          
          {/* Timeline Widget */}
          <DraggableWidget 
            id="timeline" 
            index={widgets.findIndex(w => w.id === "timeline")}
            moveWidget={moveWidget}
            className="glassmorphic rounded-xl p-4"
          >
            <div className="flex items-center mb-4">
              <CalendarDays className="h-4 w-4 text-primary mr-2" />
              <span className="text-sm font-medium">Timeline</span>
            </div>
            <MissionTimeline events={(events || []).map(event => ({
              id: event.id,
              title: event.title,
              date: event.startTime || new Date().toISOString(),
              time: event.startTime ? event.startTime.split('T')[1]?.substring(0, 5) : undefined,
              completed: false,
              type: event.category || 'event'
            }))} />
          </DraggableWidget>
          
          {/* Daily Reflection Widget */}
          <DraggableWidget 
            id="reflection" 
            index={widgets.findIndex(w => w.id === "reflection")}
            moveWidget={moveWidget}
            className="glassmorphic rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Brain className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Daily Reflection</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs hover:bg-yellow-400 hover:text-black transition-colors"
                onClick={() => saveReflectionAsJournalEntry(reflection)}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save to Journal
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-medium">Mental State</span>
                  <span className="text-sm text-[#89ADFD]">{reflection.mentalState}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={reflection.mentalState}
                  onChange={(e) => setReflection({...reflection, mentalState: parseInt(e.target.value)})}
                  className="w-full h-2 appearance-none bg-primary/10 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#89ADFD]"
                />
              </div>
              
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-medium">Physical State</span>
                  <span className="text-sm text-[#FF62A1]">{reflection.physicalState}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={reflection.physicalState}
                  onChange={(e) => setReflection({...reflection, physicalState: parseInt(e.target.value)})}
                  className="w-full h-2 appearance-none bg-primary/10 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FF62A1]"
                />
              </div>
              
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-medium">Emotional State</span>
                  <span className="text-sm text-[#FACC15]">{reflection.emotionalState}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={reflection.emotionalState}
                  onChange={(e) => setReflection({...reflection, emotionalState: parseInt(e.target.value)})}
                  className="w-full h-2 appearance-none bg-primary/10 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FACC15]"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex items-center mb-4">
                  <AlarmClock className="h-3.5 w-3.5 text-primary mr-2" />
                  <span className="text-xs font-medium">Wake Time</span>
                </div>
                <CustomTimePicker
                  value={reflection.wakeTime}
                  onChange={(time) => setReflection({...reflection, wakeTime: time})}
                />
              </div>
              
              <div className="glassmorphic rounded-xl p-4">
                <div className="flex items-center mb-4">
                  <MoonStar className="h-3.5 w-3.5 text-primary mr-2" />
                  <span className="text-xs font-medium">Sleep Time</span>
                </div>
                <CustomTimePicker
                  value={reflection.sleepTime}
                  onChange={(time) => setReflection({...reflection, sleepTime: time})}
                />
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
                  <span className="text-sm font-medium">Tomorrow's Goals</span>
                </div>
                <textarea
                  value={reflection.tomorrowGoals}
                  onChange={(e) => setReflection({...reflection, tomorrowGoals: e.target.value})}
                  placeholder="What do you aim to accomplish tomorrow?"
                  className="w-full h-36 bg-transparent border border-primary/20 rounded-md p-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>
          </DraggableWidget>
          
          {/* Routine Widget */}
          <DraggableWidget 
            id="routine" 
            index={widgets.findIndex(w => w.id === "routine")}
            moveWidget={moveWidget}
            className="glassmorphic rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-primary mr-2" />
                <span className="text-sm font-medium">Routine</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs hover:bg-yellow-400 hover:text-black transition-colors"
                onClick={() => {
                  const newId = crypto.randomUUID();
                  setTimeBlocks([
                    ...timeBlocks,
                    {
                      id: newId,
                      name: "New Time Block",
                      startTime: "09:00",
                      endTime: "10:00",
                      tasks: []
                    }
                  ]);
                  setEditingBlockId(newId);
                }}
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Add Time Block
              </Button>
            </div>
            
            <div className="space-y-4">
              {timeBlocks.length > 0 ? (
                timeBlocks
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((block) => (
                    <div key={block.id} className="glassmorphic rounded-xl p-4 border border-primary/20">
                      {editingBlockId === block.id ? (
                        <div className="space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex-grow">
                              <Input
                                value={newBlockName}
                                onChange={(e) => setNewBlockName(e.target.value)}
                                placeholder="Block name"
                                className="bg-background border-primary/30"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24">
                                <CustomTimePicker
                                  value={newBlockStartTime}
                                  onChange={(time) => setNewBlockStartTime(time)}
                                />
                              </div>
                              <span className="text-sm text-[#7DAAB2]">to</span>
                              <div className="w-24">
                                <CustomTimePicker
                                  value={newBlockEndTime}
                                  onChange={(time) => setNewBlockEndTime(time)}
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs hover:bg-yellow-400 hover:text-black transition-colors"
                              onClick={() => {
                                setEditingBlockId(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs hover:bg-yellow-400 hover:text-black transition-colors"
                              onClick={() => {
                                if (newBlockName.trim() === "") return;
                                
                                setTimeBlocks(timeBlocks.map(tb => 
                                  tb.id === block.id ? {
                                    ...tb,
                                    name: newBlockName,
                                    startTime: newBlockStartTime,
                                    endTime: newBlockEndTime
                                  } : tb
                                ));
                                
                                setEditingBlockId(null);
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-orbitron">{block.name}</h3>
                            <div className="flex items-center">
                              <span className="text-sm text-[#7DAAB2] mr-2">{block.startTime} - {block.endTime}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-yellow-400 hover:text-black transition-colors"
                                onClick={() => {
                                  setNewBlockName(block.name);
                                  setNewBlockStartTime(block.startTime);
                                  setNewBlockEndTime(block.endTime);
                                  setEditingBlockId(block.id);
                                }}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {block.tasks.map(task => (
                              <div
                                key={task.id}
                                className="flex items-start gap-2 py-2 border-t border-primary/10"
                              >
                                <Checkbox
                                  id={`task-${task.id}`}
                                  checked={task.completed}
                                  onCheckedChange={(checked) => {
                                    setTimeBlocks(timeBlocks.map(tb => 
                                      tb.id === block.id ? {
                                        ...tb,
                                        tasks: tb.tasks.map(t => 
                                          t.id === task.id ? { ...t, completed: !!checked } : t
                                        )
                                      } : tb
                                    ));
                                  }}
                                />
                                
                                {editingTaskId === task.id ? (
                                  <div className="flex-grow flex items-center gap-2">
                                    <Input
                                      value={newTaskText}
                                      onChange={(e) => setNewTaskText(e.target.value)}
                                      placeholder="Task description"
                                      className="h-8 text-sm bg-background border-primary/30"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs hover:bg-yellow-400 hover:text-black transition-colors"
                                      onClick={() => {
                                        if (newTaskText.trim() === "") return;
                                        
                                        setTimeBlocks(timeBlocks.map(tb => 
                                          tb.id === block.id ? {
                                            ...tb,
                                            tasks: tb.tasks.map(t => 
                                              t.id === task.id ? { ...t, text: newTaskText } : t
                                            )
                                          } : tb
                                        ));
                                        
                                        setEditingTaskId(null);
                                      }}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs hover:bg-red-400 hover:text-black transition-colors"
                                      onClick={() => {
                                        setEditingTaskId(null);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <label
                                    htmlFor={`task-${task.id}`}
                                    className={`text-sm flex-grow ${task.completed ? 'line-through text-[#7DAAB2]' : ''}`}
                                  >
                                    {task.text}
                                  </label>
                                )}
                                
                                {editingTaskId !== task.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-yellow-400 hover:text-black transition-colors"
                                    onClick={() => {
                                      setNewTaskText(task.text);
                                      setEditingTaskId(task.id);
                                    }}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            
                            <div className="mt-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs justify-center hover:bg-primary/10 text-[#7DAAB2]"
                                onClick={() => {
                                  const newTaskId = crypto.randomUUID();
                                  
                                  setTimeBlocks(timeBlocks.map(tb => 
                                    tb.id === block.id ? {
                                      ...tb,
                                      tasks: [
                                        ...tb.tasks,
                                        { id: newTaskId, text: "New task", completed: false }
                                      ]
                                    } : tb
                                  ));
                                  
                                  setNewTaskText("New task");
                                  setEditingTaskId(newTaskId);
                                }}
                              >
                                <PlusCircle className="h-3.5 w-3.5 mr-2" />
                                Add Task
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
              ) : (
                <div className="text-center p-6 text-[#7DAAB2]">
                  <p>No time blocks added yet.</p>
                  <p className="text-xs mt-1">
                    Add time blocks to organize your day into manageable chunks.
                  </p>
                </div>
              )}
            </div>
          </DraggableWidget>
        </div>
        
        <AIAgentFAB />
      </div>
  );
}