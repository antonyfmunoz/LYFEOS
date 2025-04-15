import { useEffect, useState } from "react";
import { useLifeOS } from "../lib/context";
import StatWidget from "../components/dashboard/StatWidget";
import ExperienceBar from "../components/dashboard/ExperienceBar";
import { CalendarDays, Clock, Edit, PlusCircle, Save, Brain, HeartPulse, Smile, BookOpen, Book } from "lucide-react";
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
  reflection: string;
  gratitude: string;
  thoughts: string;
  contentConsumed: string;
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
    reflection: "",
    gratitude: "",
    thoughts: "",
    contentConsumed: "",
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
        <div className="glassmorphic rounded-xl p-4 neon-border hud-panel relative fade-in">
          <div className="grid-lines"></div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center relative z-10">
            <div className="flex items-center">
              <CalendarDays className="h-5 w-5 text-primary mr-2" />
              <h1 className="text-xl sm:text-2xl font-orbitron text-[#D6F4FF] text-glow">{formattedDate}</h1>
            </div>
            <div className="flex items-center mt-2 sm:mt-0">
              <Clock className="h-4 w-4 text-[#36F1CD] mr-2" />
              <span className="time-display">{formattedTime}</span>
            </div>
          </div>
          <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-primary/30"></div>
          <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-primary/30"></div>
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
          <h2 className="text-xl font-orbitron text-glow flex items-center">
            <span className="w-1 h-6 bg-primary mr-2 opacity-70"></span>
            Daily Routine
          </h2>
          <div className="flex items-center text-sm text-[#36F1CD] font-mono bg-[#00141A]/60 py-1 px-3 rounded-md border border-primary/20 shadow-lg">
            <span className="material-icons text-primary text-sm mr-1 flicker">star</span>
            <span className="tracking-wider">XP EARNED: <span className="text-white font-orbitron">+{totalXpEarned}</span></span>
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
                          className="w-28 bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                          value={block.startTime}
                          onChange={(e) => saveBlockEdit(block.id, 'startTime', e.target.value)}
                        />
                        <span className="text-[#7DAAB2] self-center"> - </span>
                        <Input 
                          type="time"
                          className="w-28 bg-[#00141A] border-primary/30 text-[#D6F4FF]"
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
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                value={newBlockStartTime}
                onChange={(e) => setNewBlockStartTime(e.target.value)}
              />
              <span className="mx-2 text-[#7DAAB2]">-</span>
              <Input 
                type="time"
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF]"
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
          <h2 className="text-xl font-orbitron text-glow flex items-center">
            <span className="w-1 h-6 bg-primary mr-2 opacity-70"></span>
            Reflection & Calibration
          </h2>
          <div className="text-xs text-[#7DAAB2] font-mono tracking-wide opacity-70">
            SYSTEM//HUNTER_LEVEL_ASSESSMENT
          </div>
        </div>
        
        <div className="daily-log-panel rounded-xl p-5 neon-border hud-corner relative fade-in">
          <div className="grid-lines"></div>
          <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-primary/30"></div>
          <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-primary/30"></div>
          
          <form className="space-y-5 relative z-10" onSubmit={(e) => { e.preventDefault(); saveReflection(); }}>
            {/* State ratings with enhanced styling */}
            <div className="stat-panel p-4 mb-2">
              <div className="text-sm text-[#D6F4FF] font-orbitron mb-3 opacity-90 flex items-center">
                <span className="material-icons text-primary text-base mr-1">equalizer</span>
                CURRENT STATUS METRICS
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderStateSelector(
                  reflection.mentalState,
                  (value) => updateReflection("mentalState", value),
                  "Mental State",
                  <Brain className="h-4 w-4 text-[#36F1CD]" />
                )}
                
                {renderStateSelector(
                  reflection.physicalState,
                  (value) => updateReflection("physicalState", value),
                  "Physical State",
                  <HeartPulse className="h-4 w-4 text-[#36F1CD]" />
                )}
                
                {renderStateSelector(
                  reflection.emotionalState,
                  (value) => updateReflection("emotionalState", value),
                  "Emotional State",
                  <Smile className="h-4 w-4 text-[#36F1CD]" />
                )}
              </div>
            </div>
            
            {/* Reflection fields - in a 2x2 grid with enhanced styling */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Reflection */}
              <div className="space-y-2 stat-panel p-4 rounded-lg">
                <label className="text-sm flex items-center text-[#D6F4FF] font-rajdhani font-medium">
                  <BookOpen className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <span className="font-orbitron text-xs uppercase tracking-wider">Daily Reflection</span>
                  <span className="ml-auto text-xs text-[#7DAAB2]">LOG//ENTRY</span>
                </label>
                <Textarea
                  placeholder="What did you accomplish today? What insights did you gain?"
                  className="reflection-textarea"
                  value={reflection.reflection}
                  onChange={(e) => updateReflection("reflection", e.target.value)}
                />
              </div>
              
              {/* Gratitude */}
              <div className="space-y-2 stat-panel p-4 rounded-lg">
                <label className="text-sm flex items-center text-[#D6F4FF] font-rajdhani font-medium">
                  <Smile className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <span className="font-orbitron text-xs uppercase tracking-wider">Gratitude</span>
                  <span className="ml-auto text-xs text-[#7DAAB2]">AURA//POSITIVE</span>
                </label>
                <Textarea
                  placeholder="What are you grateful for today?"
                  className="reflection-textarea"
                  value={reflection.gratitude}
                  onChange={(e) => updateReflection("gratitude", e.target.value)}
                />
              </div>
              
              {/* Thoughts Capture */}
              <div className="space-y-2 stat-panel p-4 rounded-lg">
                <label className="text-sm flex items-center text-[#D6F4FF] font-rajdhani font-medium">
                  <Brain className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <span className="font-orbitron text-xs uppercase tracking-wider">Thought Capture</span>
                  <span className="ml-auto text-xs text-[#7DAAB2]">MIND//SCAN</span>
                </label>
                <Textarea
                  placeholder="Capture any interesting thoughts, ideas, or realizations..."
                  className="reflection-textarea"
                  value={reflection.thoughts}
                  onChange={(e) => updateReflection("thoughts", e.target.value)}
                />
              </div>
              
              {/* Content Consumed */}
              <div className="space-y-2 stat-panel p-4 rounded-lg">
                <label className="text-sm flex items-center text-[#D6F4FF] font-rajdhani font-medium">
                  <Book className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <span className="font-orbitron text-xs uppercase tracking-wider">Content Consumed</span>
                  <span className="ml-auto text-xs text-[#7DAAB2]">KNOWL//GET</span>
                </label>
                <Textarea
                  placeholder="What books, articles, or other content did you consume today?"
                  className="reflection-textarea"
                  value={reflection.contentConsumed}
                  onChange={(e) => updateReflection("contentConsumed", e.target.value)}
                />
              </div>
            </div>
            
            {/* Save button with enhanced styling */}
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="premium-button relative group"
              >
                <span className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                <span className="absolute top-0 left-0 w-full h-full overflow-hidden">
                  <span className="absolute top-0 left-0 w-12 h-full bg-gradient-to-r from-transparent via-primary/20 to-transparent transform -skew-x-20 -translate-x-20 group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                </span>
                <span className="relative flex items-center z-10">
                  <Save className="h-4 w-4 mr-2 text-[#36F1CD]" />
                  <span className="font-orbitron text-sm tracking-wide">SAVE REFLECTION</span>
                </span>
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
