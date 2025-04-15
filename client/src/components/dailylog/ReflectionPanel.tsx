import React, { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Brain, HeartPulse, Smile, BookOpen, Book } from "lucide-react";

// Define the Reflection type
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

// Format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Get today's date in YYYY-MM-DD format
const getTodayDate = (): string => {
  return formatDate(new Date());
};

// Get formatted date for display
const getFormattedDisplayDate = (dateString = getTodayDate()): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  });
};

// Initial empty reflection
const getEmptyReflection = (): DailyReflection => ({
  mentalState: 5,
  physicalState: 5,
  emotionalState: 5,
  reflection: "",
  gratitude: "",
  thoughts: "",
  contentConsumed: "",
  date: getTodayDate()
});

export default function ReflectionPanel() {
  const [reflection, setReflection] = useState<DailyReflection>(getEmptyReflection());
  const [isSaved, setIsSaved] = useState(false);

  // Load reflection data from localStorage on initial mount
  useEffect(() => {
    const today = getTodayDate();
    const savedReflection = localStorage.getItem(`dailyLog-${today}`);
    
    if (savedReflection) {
      try {
        setReflection(JSON.parse(savedReflection));
      } catch (e) {
        console.error("Failed to parse saved reflection:", e);
        setReflection(getEmptyReflection());
      }
    }
  }, []);

  // Update a field in the reflection
  const updateReflection = (field: keyof DailyReflection, value: any) => {
    setReflection(prev => ({
      ...prev,
      [field]: value
    }));
    setIsSaved(false);
  };

  // Save the reflection to localStorage
  const saveReflection = () => {
    const key = `dailyLog-${reflection.date}`;
    localStorage.setItem(key, JSON.stringify(reflection));
    setIsSaved(true);
    
    // Show saved state temporarily
    setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  // Render state selector (1-10 scale)
  const renderStateSelector = (
    state: number,
    onChange: (value: number) => void,
    label: string,
    icon: React.ReactNode
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm flex items-center text-[#7DAAB2]">
          {icon}
          <span className="ml-2">{label}</span>
        </label>
        <span className="text-[#D6F4FF] font-mono">{state}/10</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <Button
            key={num}
            type="button"
            size="sm"
            variant="ghost"
            className={`p-0 w-8 h-8 rounded-md ${
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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Daily Reflection</h2>
        <div className="text-[#7DAAB2] text-sm font-mono">
          {getFormattedDisplayDate()}
        </div>
      </div>

      <div className="glassmorphic rounded-xl p-5 neon-border">
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); saveReflection(); }}>
          {/* State ratings */}
          <div className="space-y-4">
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
          
          {/* Reflection fields */}
          <div className="space-y-4">
            {/* Daily Reflection */}
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="ml-2">Daily Reflection</span>
              </label>
              <Textarea
                placeholder="What did you accomplish today? What insights did you gain?"
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y min-h-[100px]"
                value={reflection.reflection}
                onChange={(e) => updateReflection("reflection", e.target.value)}
              />
            </div>
            
            {/* Gratitude */}
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Smile className="h-4 w-4 text-primary" />
                <span className="ml-2">Gratitude</span>
              </label>
              <Textarea
                placeholder="What are you grateful for today?"
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y"
                value={reflection.gratitude}
                onChange={(e) => updateReflection("gratitude", e.target.value)}
              />
            </div>
            
            {/* Thoughts Capture */}
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Brain className="h-4 w-4 text-primary" />
                <span className="ml-2">Thought Capture</span>
              </label>
              <Textarea
                placeholder="Capture any interesting thoughts, ideas, or realizations..."
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y"
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
                placeholder="What books, articles, or other content did you consume today?"
                className="bg-[#00141A] border-primary/30 text-[#D6F4FF] placeholder-[#7DAAB2]/50 resize-y"
                value={reflection.contentConsumed}
                onChange={(e) => updateReflection("contentConsumed", e.target.value)}
              />
            </div>
          </div>
          
          {/* Save button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              className={`transition-all duration-300 ${
                isSaved 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-primary hover:bg-primary/90"
              }`}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaved ? "Saved!" : "Save Reflection"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}