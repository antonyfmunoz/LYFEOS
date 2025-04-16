import React, { useState } from "react";
import { Plus, X, Check, Clock, Calendar, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLYFEOS } from "@/lib/context";
import { motion, AnimatePresence } from "framer-motion";

export function QuickMissionFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("30 mins");
  const [category, setCategory] = useState("personal");
  const [customDuration, setCustomDuration] = useState("");
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  
  const { toast } = useToast();
  const { addEvent } = useLYFEOS();
  
  // Toggle the mission creation panel
  const togglePanel = () => {
    setIsOpen(!isOpen);
    
    // Reset form when opening
    if (!isOpen) {
      resetForm();
    }
  };
  
  // Reset form fields
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStartTime("");
    setDuration("30 mins");
    setCategory("personal");
    setCustomDuration("");
    setShowCustomDuration(false);
  };
  
  // Handle duration selection
  const handleDurationChange = (value: string) => {
    setDuration(value);
    setShowCustomDuration(value === "custom");
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !startTime) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    // Use custom duration if selected
    const finalDuration = duration === "custom" ? customDuration : duration;
    
    // Add new event
    addEvent({
      title,
      description,
      startTime,
      duration: finalDuration,
      category: category as "work" | "personal" | "health"
    });
    
    // Success toast
    toast({
      title: "Mission Created",
      description: "Your new mission has been added to your log",
      className: "bg-[#001E26] border border-cyan-500 text-white",
    });
    
    // Reset and close
    resetForm();
    setIsOpen(false);
  };
  
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "work": return "text-blue-400 border-blue-500 bg-blue-500/10";
      case "health": return "text-red-400 border-red-500 bg-red-500/10";
      case "personal": return "text-purple-400 border-purple-500 bg-purple-500/10";
      default: return "text-blue-400 border-blue-500 bg-blue-500/10";
    }
  };
  
  return (
    <>
      {/* Floating action button */}
      <div className="fixed right-6 bottom-20 z-50">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute bottom-16 right-0 bg-[#001E26]/90 backdrop-blur-lg border border-cyan-500/40 rounded-lg shadow-xl w-[320px] overflow-hidden"
              style={{ 
                boxShadow: "0 0 20px rgba(0, 210, 255, 0.2), 0 0 10px rgba(0, 210, 255, 0.1)" 
              }}
            >
              <div className="p-4 bg-cyan-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-cyan-500/20 flex items-center justify-center mr-2">
                      <Calendar className="h-4 w-4 text-cyan-400" />
                    </div>
                    <h3 className="font-orbitron text-cyan-400">New Mission</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-[#7DAAB2] hover:text-white hover:bg-cyan-500/20"
                    onClick={togglePanel}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-[#7DAAB2] block mb-1">Mission Name</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter mission title"
                    className="bg-slate-700/30 border-cyan-500/30 focus-visible:ring-cyan-500/30"
                  />
                </div>
                
                {/* Description */}
                <div>
                  <label className="text-xs text-[#7DAAB2] block mb-1">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your mission..."
                    className="bg-slate-700/30 border-cyan-500/30 focus-visible:ring-cyan-500/30 resize-none h-[80px]"
                  />
                </div>
                
                {/* Time */}
                <div>
                  <label className="text-xs text-[#7DAAB2] block mb-1">Start Time</label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-slate-700/30 border-cyan-500/30 focus-visible:ring-cyan-500/30 font-mono"
                  />
                </div>
                
                {/* Duration */}
                <div>
                  <label className="text-xs text-[#7DAAB2] block mb-1">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Duration
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select value={duration} onValueChange={handleDurationChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15 mins">15 minutes</SelectItem>
                          <SelectItem value="30 mins">30 minutes</SelectItem>
                          <SelectItem value="45 mins">45 minutes</SelectItem>
                          <SelectItem value="1 hour">1 hour</SelectItem>
                          <SelectItem value="1.5 hours">1.5 hours</SelectItem>
                          <SelectItem value="2 hours">2 hours</SelectItem>
                          <SelectItem value="3 hours">3 hours</SelectItem>
                          <SelectItem value="4 hours">4 hours</SelectItem>
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {showCustomDuration && (
                      <Input
                        value={customDuration}
                        onChange={(e) => setCustomDuration(e.target.value)}
                        placeholder="e.g. 25 mins"
                        className="bg-slate-700/30 border-cyan-500/30 focus-visible:ring-cyan-500/30 w-28"
                      />
                    )}
                  </div>
                </div>
                
                {/* Category */}
                <div>
                  <label className="text-xs text-[#7DAAB2] block mb-1">
                    <Tag className="h-3 w-3 inline mr-1" />
                    Category
                  </label>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      size="sm"
                      className={`flex-1 border ${category === "work" ? getCategoryColor("work") : "bg-slate-700/30"}`}
                      onClick={() => setCategory("work")}
                    >
                      Work
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={`flex-1 border ${category === "personal" ? getCategoryColor("personal") : "bg-slate-700/30"}`}
                      onClick={() => setCategory("personal")}
                    >
                      Personal
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={`flex-1 border ${category === "health" ? getCategoryColor("health") : "bg-slate-700/30"}`}
                      onClick={() => setCategory("health")}
                    >
                      Health
                    </Button>
                  </div>
                </div>
                
                {/* Submit button */}
                <Button 
                  type="submit"
                  className="w-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Create Mission
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          onClick={togglePanel}
          size="lg"
          className={`
            rounded-full w-14 h-14 shadow-lg transition-all duration-300
            ${isOpen
              ? "bg-cyan-500 hover:bg-cyan-600"
              : "bg-cyan-500 hover:bg-cyan-600"
            }
          `}
          style={{
            boxShadow: isOpen 
              ? "0 0 20px rgba(0, 210, 255, 0.3), 0 0 10px rgba(0, 210, 255, 0.2)" 
              : "0 0 15px rgba(0, 210, 255, 0.2)"
          }}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </Button>
      </div>
    </>
  );
}