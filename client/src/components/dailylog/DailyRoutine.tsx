import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Edit, Save, Clock, X } from "lucide-react";

// Define the Time Block type
interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  name: string;
  tasks: { id: string; text: string; completed: boolean }[];
}

export default function DailyRoutine() {
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<TimeBlock | null>(null);
  const [newTaskText, setNewTaskText] = useState("");

  // Load time blocks from localStorage on initial mount
  useEffect(() => {
    const savedRoutine = localStorage.getItem("routineData");
    if (savedRoutine) {
      try {
        setTimeBlocks(JSON.parse(savedRoutine));
      } catch (e) {
        console.error("Failed to parse saved routine:", e);
        // If there's an error, use empty array
        setTimeBlocks([]);
      }
    }
  }, []);

  // Save time blocks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("routineData", JSON.stringify(timeBlocks));
  }, [timeBlocks]);

  // Handle adding a new time block
  const handleAddTimeBlock = () => {
    const newBlock: TimeBlock = {
      id: `block-${Date.now()}`,
      startTime: "09:00",
      endTime: "10:00",
      name: "New Block",
      tasks: []
    };
    setCurrentBlock(newBlock);
    setIsEditDialogOpen(true);
  };

  // Handle editing an existing time block
  const handleEditBlock = (block: TimeBlock) => {
    setCurrentBlock({...block});
    setIsEditDialogOpen(true);
  };

  // Save the current block being edited
  const handleSaveBlock = () => {
    if (!currentBlock) return;
    
    if (timeBlocks.some(block => block.id === currentBlock.id)) {
      // Update existing block
      setTimeBlocks(timeBlocks.map(block => 
        block.id === currentBlock.id ? currentBlock : block
      ));
    } else {
      // Add new block
      setTimeBlocks([...timeBlocks, currentBlock]);
    }
    
    setIsEditDialogOpen(false);
  };

  // Delete a time block
  const handleDeleteBlock = (blockId: string) => {
    setTimeBlocks(timeBlocks.filter(block => block.id !== blockId));
  };

  // Add a task to the current block
  const handleAddTask = () => {
    if (!currentBlock || !newTaskText.trim()) return;
    
    const newTask = {
      id: `task-${Date.now()}`,
      text: newTaskText,
      completed: false
    };
    
    setCurrentBlock({
      ...currentBlock,
      tasks: [...currentBlock.tasks, newTask]
    });
    
    setNewTaskText("");
  };

  // Remove a task from the current block
  const handleRemoveTask = (taskId: string) => {
    if (!currentBlock) return;
    
    setCurrentBlock({
      ...currentBlock,
      tasks: currentBlock.tasks.filter(task => task.id !== taskId)
    });
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

  // Get the XP reward (placeholder functionality)
  const getXpReward = () => {
    return Math.floor(Math.random() * 10) + 5; // Random XP between 5-15
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Daily Routine</h2>
        <Button
          variant="ghost"
          className="text-primary hover:text-primary hover:bg-primary/10 transition flex items-center gap-1"
          onClick={handleAddTimeBlock}
        >
          <PlusCircle className="h-4 w-4" />
          <span>Add Block</span>
        </Button>
      </div>

      {timeBlocks.length === 0 ? (
        <div className="glassmorphic rounded-xl p-6 text-center neon-border">
          <p className="text-[#7DAAB2]">No routine blocks added yet. Add your first time block to start building your daily routine.</p>
          <Button
            variant="outline"
            className="mt-3 border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={handleAddTimeBlock}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add First Block
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {timeBlocks
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((block) => (
              <div 
                key={block.id} 
                className="glassmorphic rounded-xl p-4 neon-border hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-3">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-[#D6F4FF]">{block.name}</h3>
                      <p className="text-xs text-[#7DAAB2]">{block.startTime} – {block.endTime}</p>
                    </div>
                  </div>
                  <div className="flex mt-2 md:mt-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:bg-primary/10"
                      onClick={() => handleEditBlock(block)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteBlock(block.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {block.tasks.length > 0 ? (
                  <div className="space-y-2 mt-3">
                    {block.tasks.map((task) => (
                      <div key={task.id} className="flex items-start">
                        <div className="flex items-center h-5 mt-1">
                          <Checkbox
                            id={task.id}
                            checked={task.completed}
                            onCheckedChange={() => toggleTaskCompletion(block.id, task.id)}
                            className="border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                          />
                        </div>
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
                        {task.completed && (
                          <span className="text-xs text-[#36F1CD] font-mono">
                            +{getXpReward()} XP
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#7DAAB2] italic mt-2">No tasks added</p>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Edit Time Block Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-[#001E26] border border-primary text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-[#D6F4FF]">
              {currentBlock?.id.startsWith('block-') ? 'Add New Block' : 'Edit Block'}
            </DialogTitle>
          </DialogHeader>
          
          {currentBlock && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-[#7DAAB2]">Block Name</label>
                <Input 
                  className="bg-[#00141A] border-primary/30 text-[#D6F4FF] focus:border-primary placeholder-[#7DAAB2]/50"
                  value={currentBlock.name}
                  onChange={(e) => setCurrentBlock({...currentBlock, name: e.target.value})}
                  placeholder="Morning Ritual"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm text-[#7DAAB2]">Start Time</label>
                  <Input 
                    type="time"
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                    value={currentBlock.startTime}
                    onChange={(e) => setCurrentBlock({...currentBlock, startTime: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-[#7DAAB2]">End Time</label>
                  <Input 
                    type="time"
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF]"
                    value={currentBlock.endTime}
                    onChange={(e) => setCurrentBlock({...currentBlock, endTime: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-[#7DAAB2]">Tasks</label>
                
                <div className="space-y-3">
                  {currentBlock.tasks.map((task) => (
                    <div key={task.id} className="flex items-center">
                      <Input 
                        className="bg-[#00141A] border-primary/30 text-[#D6F4FF] flex-grow"
                        value={task.text}
                        onChange={(e) => setCurrentBlock({
                          ...currentBlock,
                          tasks: currentBlock.tasks.map(t => 
                            t.id === task.id ? {...t, text: e.target.value} : t
                          )
                        })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveTask(task.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center mt-2">
                  <Input 
                    className="bg-[#00141A] border-primary/30 text-[#D6F4FF] flex-grow"
                    placeholder="Add new task..."
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddTask();
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 text-primary hover:bg-primary/10"
                    onClick={handleAddTask}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSaveBlock}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}