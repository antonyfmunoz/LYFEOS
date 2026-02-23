import React, { useState } from "react";
import { 
  Plus, 
  X, 
  BriefcaseBusiness, 
  Heart, 
  User,
  Clock,
  CalendarDays
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useLYFEOS } from "@/lib/context";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export function QuickActionMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'category' | 'details'>('category');
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("1 hour");
  const [category, setCategory] = useState<"work" | "health" | "personal" | null>(null);
  const { addEvent } = useLYFEOS();
  const { toast } = useToast();
  // Get current time
  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };
  
  // Reset the form
  const resetForm = () => {
    setTitle("");
    setStartTime(getCurrentTime());
    setDuration("1 hour");
    setCategory(null);
    setStep('category');
  };
  
  // Open the quick action menu
  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };
  
  // Close the quick action menu
  const handleClose = () => {
    setIsOpen(false);
    resetForm();
  };
  
  // Select a category
  const handleCategorySelect = (categoryValue: "work" | "health" | "personal") => {
    setCategory(categoryValue);
    setStep('details');
  };
  
  // Submit the new mission
  const handleSubmit = () => {
    if (!title.trim() || !category || !startTime) {
      return;
    }
    
    const newEvent = {
      title,
      description: "",
      startTime,
      duration,
      category,
    };
    
    addEvent(newEvent);
    
    // Show toast notification
    toast({
      title: "Mission Added",
      description: `${title} has been added to your mission log`,
      className: cn(
        "bg-[#001E26] border text-white",
        category === "work" ? "border-blue-500" : 
        category === "health" ? "border-red-500" : 
        "border-purple-500"
      ),
    });
    
    handleClose();
  };
  
  // Render the category selection step
  const renderCategoryStep = () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-orbitron text-center mb-4">Select Mission Type</h3>
      
      <div className="grid grid-cols-1 gap-3">
        <Button
          variant="outline"
          className="flex items-center justify-start space-x-3 h-16 border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/40"
          onClick={() => handleCategorySelect("work")}
        >
          <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <BriefcaseBusiness className="h-5 w-5 text-blue-400" />
          </div>
          <div className="text-left">
            <span className="block font-medium text-blue-400">Work Mission</span>
            <span className="text-xs text-[#7DAAB2]">Tasks, meetings, projects</span>
          </div>
        </Button>
        
        <Button
          variant="outline"
          className="flex items-center justify-start space-x-3 h-16 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40"
          onClick={() => handleCategorySelect("health")}
        >
          <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <Heart className="h-5 w-5 text-red-400" />
          </div>
          <div className="text-left">
            <span className="block font-medium text-red-400">Health Mission</span>
            <span className="text-xs text-[#7DAAB2]">Exercise, nutrition, wellbeing</span>
          </div>
        </Button>
        
        <Button
          variant="outline"
          className="flex items-center justify-start space-x-3 h-16 border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/40"
          onClick={() => handleCategorySelect("personal")}
        >
          <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
            <User className="h-5 w-5 text-purple-400" />
          </div>
          <div className="text-left">
            <span className="block font-medium text-purple-400">Personal Mission</span>
            <span className="text-xs text-[#7DAAB2]">Hobbies, family, learning</span>
          </div>
        </Button>
      </div>
    </div>
  );
  
  // Render the mission details step
  const renderDetailsStep = () => (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-orbitron">
          {category === "work" ? (
            <span className="text-blue-400">Work Mission</span>
          ) : category === "health" ? (
            <span className="text-red-400">Health Mission</span>
          ) : (
            <span className="text-purple-400">Personal Mission</span>
          )}
        </h3>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep('category')}
          className="text-[#7DAAB2] hover:text-white"
        >
          Back
        </Button>
      </div>
      
      <div className="space-y-3 mt-2">
        <div>
          <Label htmlFor="quick-title">Mission Title</Label>
          <Input
            id="quick-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's your mission?"
            className="mt-1"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="quick-time">Start Time</Label>
            <CustomTimePicker
              value={startTime}
              onChange={setStartTime}
              className="mt-1 w-full"
            />
          </div>
          
          <div>
            <Label htmlFor="quick-duration">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="quick-duration" className="mt-1">
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15 mins">15 minutes</SelectItem>
                <SelectItem value="30 mins">30 minutes</SelectItem>
                <SelectItem value="45 mins">45 minutes</SelectItem>
                <SelectItem value="1 hour">1 hour</SelectItem>
                <SelectItem value="1.5 hours">1.5 hours</SelectItem>
                <SelectItem value="2 hours">2 hours</SelectItem>
                <SelectItem value="3 hours">3 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSubmit}
          className={cn(
            "px-4",
            category === "work" ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400" : 
            category === "health" ? "bg-red-500/20 hover:bg-red-500/30 text-red-400" : 
            "bg-purple-500/20 hover:bg-purple-500/30 text-purple-400"
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" /> Add Mission
        </Button>
      </div>
    </div>
  );
  
  return (
    <>
      {/* Floating action button */}
      <div className="fixed right-6 bottom-6 z-50">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute right-0 bottom-16 bg-[#001E26]/90 backdrop-blur-lg border border-primary/30 rounded-lg shadow-xl w-[320px] overflow-hidden"
              style={{ 
                boxShadow: "0 0 20px rgba(0, 242, 254, 0.2), 0 0 10px rgba(0, 242, 254, 0.1)" 
              }}
            >
              {step === 'category' ? renderCategoryStep() : renderDetailsStep()}
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          onClick={isOpen ? handleClose : handleOpen}
          size="lg"
          className={cn(
            "rounded-full w-14 h-14 shadow-lg transition-all duration-300",
            isOpen 
              ? "bg-red-500 hover:bg-red-600 rotate-45" 
              : "bg-primary hover:bg-primary/90"
          )}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </Button>
      </div>
    </>
  );
}