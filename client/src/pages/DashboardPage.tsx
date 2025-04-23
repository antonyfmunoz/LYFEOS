import { useEffect, useState } from "react";
import { useLYFEOS } from "../lib/context";
import StatWidget from "../components/dashboard/StatWidget";
import ExperienceBar from "../components/dashboard/ExperienceBar";
import { CalendarDays, Clock, Edit, PlusCircle, Save, Brain, HeartPulse, Smile, BookOpen, Book, AlarmClock, MoonStar, TargetIcon, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { ObsidianMarkdown } from "@/components/ui/obsidian-markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";

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
  usePageTitle("Dashboard");
  const { toast } = useToast();
  const { stats, events, updateUserStats } = useLYFEOS();
  
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
  
  // Total XP earned for the day
  const totalXpEarned = timeBlocks.reduce((acc, block) => {
    return acc + block.tasks.filter(task => task.completed).length * 10;
  }, 0);
  
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
  
  // Auto-save the reflection to localStorage whenever it changes
  useEffect(() => {
    const key = `dailyLog-${reflection.date}`;
    localStorage.setItem(key, JSON.stringify(reflection));
  }, [reflection]);
  
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
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
              <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
            </div>
          </div>
        </div>
      </section>
      
      {/* Stats and Progress Section */}
      <section className="mb-6">
        <div className="mb-3">
          <ExperienceBar
            current={stats.experience.current}
            max={stats.experience.max}
            level={stats.experience.level}
          />
        </div>
        
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
                        <div className="relative w-28">
                          <Input 
                            type="time"
                            className="w-full custom-time-input font-mono pr-8"
                            value={block.startTime}
                            onChange={(e) => saveBlockEdit(block.id, 'startTime', e.target.value)}
                          />
                          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                            <Clock className="h-3 w-3 text-primary/70" />
                          </div>
                        </div>
                        <span className="text-[#7DAAB2] self-center"> - </span>
                        <div className="w-32">
                          <CustomTimePicker
                            value={block.endTime}
                            onChange={(time) => saveBlockEdit(block.id, 'endTime', time)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-medium text-[#D6F4FF]">{block.name}</h3>
                        <div className="text-[#7DAAB2] text-xs flex items-center mt-1">
                          <span>{block.startTime}</span>
                          <span className="mx-1">-</span>
                          <span>{block.endTime}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {editingBlockId === block.id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/40 text-xs gap-1 hover:bg-yellow-400 hover:text-black transition-colors"
                        onClick={() => setEditingBlockId(null)}
                      >
                        <Save className="h-3 w-3" />
                        Done
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/40 text-xs gap-1 hover:bg-yellow-400 hover:text-black transition-colors"
                          onClick={() => setEditingBlockId(block.id)}
                        >
                          <Edit className="h-3 w-3" />
                          Edit
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Tasks List */}
                <div className="space-y-2 pl-12">
                  {block.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 py-1"
                    >
                      <Checkbox
                        id={`task-${task.id}`}
                        checked={task.completed}
                        onCheckedChange={() => toggleTaskCompletion(block.id, task.id)}
                        className="mt-1"
                      />
                      
                      {editingTaskId === task.id ? (
                        <div className="flex-1 flex gap-2">
                          <Input
                            className="flex-1 bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                            value={task.text}
                            onChange={(e) => saveTaskEdit(block.id, task.id, e.target.value)}
                            placeholder="Task description"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-primary/40 text-xs gap-1 hover:bg-yellow-400 hover:text-black transition-colors"
                            onClick={() => setEditingTaskId(null)}
                          >
                            <Save className="h-3 w-3" />
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-start justify-between">
                          <label
                            htmlFor={`task-${task.id}`}
                            className={`text-sm ${
                              task.completed
                                ? "line-through text-[#7DAAB2]"
                                : "text-[#D6F4FF]"
                            }`}
                          >
                            {task.text}
                          </label>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-[#7DAAB2] hover:text-primary hover:bg-transparent"
                            onClick={() => setEditingTaskId(task.id)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Add Task Input */}
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder:text-[#7DAAB2]/80"
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      placeholder="Add new task..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTaskText.trim()) {
                          addTaskToBlock(block.id);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-primary/40 text-xs gap-1 hover:bg-yellow-400 hover:text-black transition-colors"
                      onClick={() => addTaskToBlock(block.id)}
                      disabled={!newTaskText.trim()}
                    >
                      <PlusCircle className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
          {/* Add Time Block */}
          <div className="border border-dashed border-primary/30 rounded-xl p-4 hover:border-primary/50 transition">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] sm:flex-1"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                placeholder="Block Name (e.g., Deep Work, Routine)"
              />
              
              <div className="flex flex-wrap gap-2">
                <div className="relative w-28">
                  <Input
                    type="time"
                    className="w-full custom-time-input font-mono pr-8"
                    value={newBlockStartTime}
                    onChange={(e) => setNewBlockStartTime(e.target.value)}
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                    <Clock className="h-3 w-3 text-primary/70" />
                  </div>
                </div>
                <span className="text-[#7DAAB2] self-center"> - </span>
                <div className="w-28">
                  <CustomTimePicker
                    value={newBlockEndTime}
                    onChange={setNewBlockEndTime}
                  />
                </div>
                
                <Button
                  className="ml-auto sm:ml-0 hover:bg-yellow-400 hover:text-black transition-colors"
                  size="sm"
                  onClick={addTimeBlock}
                  disabled={!newBlockName.trim()}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Block
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Daily Reflection Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron flex items-center">
            <Brain className="h-5 w-5 text-primary mr-2" />
            <span>Daily Reflection</span>
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="hover:bg-yellow-400 hover:text-black transition-colors"
            onClick={() => {
              toast({
                title: "Daily Reflection Saved",
                description: "Your reflection has been saved to your journal.",
              });
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save to Journal
          </Button>
        </div>
        
        <div className="glassmorphic rounded-xl p-5 neon-border">
          {/* States Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {renderStateSelector(
              reflection.mentalState,
              (value) => updateReflection('mentalState', value),
              "Mental State",
              <Brain className="h-3.5 w-3.5 text-[#89ADFD]" />
            )}
            
            {renderStateSelector(
              reflection.physicalState,
              (value) => updateReflection('physicalState', value),
              "Physical State",
              <HeartPulse className="h-3.5 w-3.5 text-[#FF62A1]" />
            )}
            
            {renderStateSelector(
              reflection.emotionalState,
              (value) => updateReflection('emotionalState', value),
              "Emotional State",
              <Smile className="h-3.5 w-3.5 text-[#FACC15]" />
            )}
          </div>
          
          {/* Sleep Times Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="space-y-1.5">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <AlarmClock className="h-3.5 w-3.5 text-primary mr-2" />
                <span>Wake Time</span>
              </label>
              <CustomTimePicker
                value={reflection.wakeTime}
                onChange={(time) => updateReflection('wakeTime', time)}
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <MoonStar className="h-3.5 w-3.5 text-primary mr-2" />
                <span>Sleep Time</span>
              </label>
              <CustomTimePicker
                value={reflection.sleepTime}
                onChange={(time) => updateReflection('sleepTime', time)}
              />
            </div>
          </div>
          
          {/* Reflection Fields */}
          <div className="space-y-5">
            <div>
              <label className="text-sm flex items-center text-[#7DAAB2] mb-2">
                <BookOpen className="h-3.5 w-3.5 text-primary mr-2" />
                <span>Gratitude</span>
              </label>
              <Textarea
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder:text-[#7DAAB2]/80"
                value={reflection.gratitude}
                onChange={(e) => updateReflection('gratitude', e.target.value)}
                placeholder="What are you grateful for today?"
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm flex items-center text-[#7DAAB2] mb-2">
                <TargetIcon className="h-3.5 w-3.5 text-primary mr-2" />
                <span>Tomorrow's Goals</span>
              </label>
              <Textarea
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder:text-[#7DAAB2]/80"
                value={reflection.tomorrowGoals}
                onChange={(e) => updateReflection('tomorrowGoals', e.target.value)}
                placeholder="What do you want to accomplish tomorrow?"
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm flex items-center text-[#7DAAB2] mb-2">
                <Brain className="h-3.5 w-3.5 text-primary mr-2" />
                <span>Daily Thoughts</span>
              </label>
              <MarkdownEditor
                content={reflection.thoughts}
                setContent={(content) => updateReflection('thoughts', content)}
                placeholder="Capture your thoughts, ideas, and reflections..."
                heightClass="h-60"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm flex items-center text-[#7DAAB2] mb-2">
                  <BookOpen className="h-3.5 w-3.5 text-primary mr-2" />
                  <span>Content Consumed</span>
                </label>
                <Textarea
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder:text-[#7DAAB2]/80"
                  value={reflection.contentConsumed}
                  onChange={(e) => updateReflection('contentConsumed', e.target.value)}
                  placeholder="Books, articles, videos, podcasts..."
                  rows={4}
                />
              </div>
              
              <div>
                <label className="text-sm flex items-center text-[#7DAAB2] mb-2">
                  <ListChecks className="h-3.5 w-3.5 text-primary mr-2" />
                  <span>Research Notes</span>
                </label>
                <Textarea
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder:text-[#7DAAB2]/80"
                  value={reflection.research}
                  onChange={(e) => updateReflection('research', e.target.value)}
                  placeholder="Any new insights or learnings..."
                  rows={4}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Add missing functions needed from the original code
function saveBlockEdit(blockId: string, field: string, value: string) {
  console.log(`Editing block ${blockId}, field ${field} to ${value}`);
  // Implementation would go here
}

function addTaskToBlock(blockId: string) {
  console.log(`Adding task to block ${blockId}`);
  // Implementation would go here
}

function saveTaskEdit(blockId: string, taskId: string, value: string) {
  console.log(`Editing task ${taskId} in block ${blockId} to ${value}`);
  // Implementation would go here
}

function addTimeBlock() {
  console.log("Adding new time block");
  // Implementation would go here
}