import { useEffect, useState } from "react";
import { useLifeOS } from "../lib/context";
import StatWidget from "../components/dashboard/StatWidget";
import ExperienceBar from "../components/dashboard/ExperienceBar";
import { CalendarDays, Clock, Edit, PlusCircle, Save, Brain, HeartPulse, Smile, BookOpen, Book, AlarmClock, MoonStar, TargetIcon, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

export default function DashboardPage() {
  const { stats, username } = useLifeOS();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  
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
    hour12: true
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
  
  // Save the reflection to localStorage
  const saveReflection = () => {
    const key = `dailyLog-${reflection.date}`;
    localStorage.setItem(key, JSON.stringify(reflection));
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
            <div className="flex items-center mt-2 sm:mt-0">
              <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
              <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
            </div>
          </div>
        </div>
      </section>
      
      {/* Stats and Progress Section */}
      <section className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatWidget
            type="time"
            icon="schedule"
            title="TIME TOKENS"
            current={stats.timeTokens.current}
            max={stats.timeTokens.max}
            description="Unallocated time remaining today"
          />
          <StatWidget
            type="energy"
            icon="bolt"
            title="ENERGY POINTS"
            current={stats.energyPoints.current}
            max={stats.energyPoints.max}
            description="Current cognitive and physical capacity"
          />
          <StatWidget
            type="health"
            icon="favorite"
            title="HEALTH POINTS"
            current={stats.healthPoints.current}
            max={stats.healthPoints.max}
            description="Overall physical and mental wellness"
          />
        </div>
        
        <div className="mt-3">
          <ExperienceBar
            current={stats.experience.current}
            max={stats.experience.max}
            level={stats.experience.level}
          />
        </div>
      </section>
      
      {/* Routine Execution Panel */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <Clock className="h-5 w-5 text-primary mr-2" />
            <span>Daily Routine</span>
          </h2>
          <div className="flex items-center text-sm text-[#36F1CD] font-mono">
            <span>XP Earned Today: +{totalXpEarned}</span>
          </div>
        </div>
        
        {/* Time Blocks */}
        <div className="space-y-3">
          {timeBlocks
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((block) => (
              <div 
                key={block.id} 
                className="glassmorphic rounded-xl p-4 neon-border hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition"
              >
                {/* Block Header */}
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    
                    {editingBlockId === block.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Input 
                          className="w-full sm:w-40 mb-1 sm:mb-0 bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                          value={block.name}
                          onChange={(e) => saveBlockEdit(block.id, 'name', e.target.value)}
                          placeholder="Block Name"
                        />
                        <Input 
                          type="time"
                          className="w-28 custom-time-input"
                          value={block.startTime}
                          onChange={(e) => saveBlockEdit(block.id, 'startTime', e.target.value)}
                        />
                        <span className="text-[#7DAAB2] self-center"> - </span>
                        <Input 
                          type="time"
                          className="w-28 custom-time-input"
                          value={block.endTime}
                          onChange={(e) => saveBlockEdit(block.id, 'endTime', e.target.value)}
                        />
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-medium text-[#D6F4FF]">{block.name}</h3>
                        <p className="text-xs text-[#7DAAB2]">{block.startTime} - {block.endTime}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:bg-primary/10"
                      onClick={() => editingBlockId === block.id ? setEditingBlockId(null) : setEditingBlockId(block.id)}
                    >
                      {editingBlockId === block.id ? <Save className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 ml-1"
                      onClick={() => handleDeleteBlock(block.id)}
                    >
                      <span className="sr-only">Delete</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </Button>
                  </div>
                </div>
                
                {/* Tasks */}
                <div className="space-y-2 ml-12 mt-3">
                  {block.tasks.map((task) => (
                    <div key={task.id} className="flex items-start group">
                      <div className="flex items-center h-5 mt-0.5">
                        <Checkbox
                          id={task.id}
                          checked={task.completed}
                          onCheckedChange={() => toggleTaskCompletion(block.id, task.id)}
                          className="border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                        />
                      </div>
                      
                      {editingTaskId === task.id ? (
                        <div className="flex-grow flex ml-2">
                          <Input 
                            className="bg-[#00141A] border-primary/30 text-[#D6F4FF] flex-grow"
                            value={newTaskText}
                            onChange={(e) => setNewTaskText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveTaskEdit(block.id, task.id, newTaskText);
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 text-primary"
                            onClick={() => saveTaskEdit(block.id, task.id, newTaskText)}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <label
                            htmlFor={task.id}
                            className={`ml-2 flex-grow text-sm ${
                              task.completed 
                                ? "text-[#7DAAB2] line-through" 
                                : "text-[#D6F4FF]"
                            }`}
                          >
                            {task.text}
                          </label>
                          
                          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-primary"
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setNewTaskText(task.text);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 text-destructive ml-1"
                              onClick={() => handleDeleteTask(block.id, task.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </Button>
                          </div>
                          
                          {task.completed && (
                            <span className="text-xs text-[#36F1CD] font-mono ml-2">
                              +10 XP
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  
                  {/* Add Task Input */}
                  <div className="flex items-center mt-3">
                    <Input 
                      className="bg-[#00141A] border-primary/30 text-[#D6F4FF] flex-grow text-sm h-8 placeholder:text-[#7DAAB2]/50"
                      placeholder="Add new task..."
                      value={editingBlockId === block.id ? newTaskText : ""}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTaskText.trim()) {
                          handleAddTask(block.id, newTaskText);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 text-primary h-8"
                      onClick={() => handleAddTask(block.id, newTaskText)}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </div>
        
        {/* Add New Block Section */}
        <div className="mt-4 glassmorphic rounded-xl p-4 neon-border">
          <h3 className="font-medium text-[#D6F4FF] mb-3 flex items-center">
            <PlusCircle className="h-4 w-4 mr-2 text-primary" />
            Add New Time Block
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Input 
              className="bg-[#00141A] border-primary/30 text-[#D6F4FF] sm:col-span-2"
              placeholder="Block Name"
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
            />
            
            <div className="flex items-center sm:col-span-2">
              <Input 
                type="time"
                className="custom-time-input"
                value={newBlockStartTime}
                onChange={(e) => setNewBlockStartTime(e.target.value)}
              />
              <span className="mx-2 text-[#7DAAB2]">-</span>
              <Input 
                type="time"
                className="custom-time-input"
                value={newBlockEndTime}
                onChange={(e) => setNewBlockEndTime(e.target.value)}
              />
            </div>
            
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
              onClick={handleAddTimeBlock}
            >
              Add Block
            </Button>
          </div>
        </div>
      </section>
      
      {/* Reflection & Calibration Panel */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <Brain className="h-5 w-5 text-primary mr-2" />
            <span>Reflection & Calibration</span>
          </h2>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveReflection(); }}>
            {/* Time settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <AlarmClock className="h-4 w-4 text-primary" />
                  <span className="ml-2">Wake Up Time</span>
                </label>
                <Input
                  type="time"
                  className="custom-time-input" 
                  value={reflection.wakeTime}
                  onChange={(e) => updateReflection("wakeTime", e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <MoonStar className="h-4 w-4 text-primary" />
                  <span className="ml-2">Sleep Time</span>
                </label>
                <Input
                  type="time"
                  className="custom-time-input"
                  value={reflection.sleepTime}
                  onChange={(e) => updateReflection("sleepTime", e.target.value)}
                />
              </div>
            </div>
            
            {/* State ratings - in a row for desktop, stacked for mobile */}
            <div className="border-t border-primary/10 pt-4 mb-2">
              <label className="text-sm flex items-center text-[#7DAAB2] mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <span className="ml-2">Energy Recap (Mental / Physical / Emotional)</span>
              </label>
              
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
              <h3 className="text-sm flex items-center text-[#7DAAB2] mb-3">
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
                  <Textarea
                    placeholder="- 
- 
-"
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[80px]"
                    value={reflection.gratitude}
                    onChange={(e) => updateReflection("gratitude", e.target.value)}
                  />
                </div>
                
                {/* Tomorrow's Goals */}
                <div className="space-y-2">
                  <label className="text-sm flex items-center text-[#7DAAB2]">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <span className="ml-2">Tomorrow's Goals</span>
                  </label>
                  <Textarea
                    placeholder="What do you want to accomplish tomorrow?"
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[60px]"
                    value={reflection.tomorrowGoals}
                    onChange={(e) => updateReflection("tomorrowGoals", e.target.value)}
                  />
                </div>
                
                {/* Annual Goals */}
                <div className="space-y-2">
                  <label className="text-sm flex items-center text-[#7DAAB2]">
                    <TargetIcon className="h-4 w-4 text-primary" />
                    <span className="ml-2">Annual Goals</span>
                  </label>
                  <Textarea
                    placeholder="Your big targets for the year"
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[80px]"
                    value={reflection.annualGoals}
                    onChange={(e) => updateReflection("annualGoals", e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            {/* End of Intention Setter Section */}
            
            {/* Save button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Daily Log
              </Button>
            </div>
          </form>
        </div>
      </section>
      
      {/* Daily Log Panel - Separate Widget */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <BookOpen className="h-5 w-5 text-primary mr-2" />
            <span>Daily Log</span>
          </h2>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveReflection(); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Today's Thoughts */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="ml-2">Today's Thoughts</span>
                </label>
                <Textarea
                  placeholder="Ideas worth saving..."
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[100px]"
                  value={reflection.thoughts}
                  onChange={(e) => updateReflection("thoughts", e.target.value)}
                />
              </div>
              
              {/* Content Consumed */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <Book className="h-4 w-4 text-primary" />
                  <span className="ml-2">Content Consumed</span>
                </label>
                <Textarea
                  placeholder="Books, podcasts, videos..."
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[100px]"
                  value={reflection.contentConsumed}
                  onChange={(e) => updateReflection("contentConsumed", e.target.value)}
                />
              </div>
              
              {/* Today's Research */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="ml-2">Today's Research</span>
                </label>
                <Textarea
                  placeholder="Summarize learnings or add links..."
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[100px]"
                  value={reflection.research}
                  onChange={(e) => updateReflection("research", e.target.value)}
                />
              </div>
              
              {/* New To-Do-List Ideas */}
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="ml-2">New To-Do-List Ideas</span>
                </label>
                <Textarea
                  placeholder="Add to Brain Dump..."
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[100px]"
                  value={reflection.todoIdeas}
                  onChange={(e) => updateReflection("todoIdeas", e.target.value)}
                />
              </div>
            </div>
            
            {/* Save button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Daily Log
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
