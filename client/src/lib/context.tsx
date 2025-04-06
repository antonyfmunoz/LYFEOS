import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserStats, Quest, AIMessage, CalendarEvent } from "./types";

// Initial stats data
const initialStats: UserStats = {
  timeTokens: {
    current: 12,
    max: 24,
  },
  energyPoints: {
    current: 65,
    max: 100,
  },
  healthPoints: {
    current: 80,
    max: 100,
  },
  experience: {
    current: 9420,
    max: 10000,
    level: 15,
  },
};

// Initial quests data
const initialQuests: Quest[] = [
  {
    id: "quest1",
    title: "Deep Work Block",
    description: "Complete 2 hours of focused work without distractions",
    completed: false,
    energyCost: 20,
    experienceReward: 50,
  },
  {
    id: "quest2",
    title: "Morning Ritual",
    description: "Complete meditation, journaling, and exercise routine",
    completed: false,
    energyCost: 15,
    experienceReward: 35,
  },
  {
    id: "quest3",
    title: "Launch Plan",
    description: "Finalize and submit project launch strategy",
    completed: true,
    energyCost: 25,
    experienceReward: 75,
  },
];

// Initial AI messages
const initialMessages: AIMessage[] = [
  {
    id: "msg1",
    sender: "ai",
    content: "Looking at your energy levels and upcoming tasks, would you like me to suggest an optimized schedule for today?",
    timestamp: new Date(),
  },
];

// Initial calendar events
const initialEvents: CalendarEvent[] = [
  {
    id: "event1",
    title: "Strategy Meeting",
    description: "Conference Room 3 | 45 mins",
    startTime: "09:00",
    duration: "45 mins",
    category: "work",
  },
  {
    id: "event2",
    title: "Project Review",
    description: "Virtual | 1 hour",
    startTime: "11:30",
    duration: "1 hour",
    category: "work",
  },
  {
    id: "event3",
    title: "Workout Session",
    description: "Gym | 1 hour",
    startTime: "15:00",
    duration: "1 hour",
    category: "health",
  },
];

// Create context types
interface LifeOSContextType {
  stats: UserStats;
  quests: Quest[];
  messages: AIMessage[];
  events: CalendarEvent[];
  toggleQuestCompletion: (id: string) => void;
  sendMessage: (content: string) => void;
  username: string;
  setUsername: (name: string) => void;
}

// Create the context
const LifeOSContext = createContext<LifeOSContextType | undefined>(undefined);

// Provider component
export function LifeOSProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<UserStats>(initialStats);
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [username, setUsername] = useState<string>("Alex Chen");

  // Toggle quest completion
  const toggleQuestCompletion = (id: string) => {
    const updatedQuests = quests.map((quest) => {
      if (quest.id === id) {
        const completed = !quest.completed;
        
        // Update stats based on quest completion
        if (completed) {
          // Deduct energy and add XP
          setStats((prevStats) => {
            const energyCost = quest.energyCost;
            const experienceReward = quest.experienceReward;
            
            const newEnergy = Math.max(0, prevStats.energyPoints.current - energyCost);
            let newExperience = prevStats.experience.current + experienceReward;
            let newLevel = prevStats.experience.level;
            
            // Level up if experience exceeds max
            if (newExperience >= prevStats.experience.max) {
              newExperience = newExperience - prevStats.experience.max;
              newLevel += 1;
            }
            
            return {
              ...prevStats,
              energyPoints: {
                ...prevStats.energyPoints,
                current: newEnergy,
              },
              experience: {
                ...prevStats.experience,
                current: newExperience,
                level: newLevel,
              },
            };
          });
        } else {
          // Restore energy and remove XP if uncompleting
          setStats((prevStats) => {
            const energyCost = quest.energyCost;
            const experienceReward = quest.experienceReward;
            
            const newEnergy = Math.min(
              prevStats.energyPoints.max,
              prevStats.energyPoints.current + energyCost
            );
            
            let newExperience = prevStats.experience.current - experienceReward;
            let newLevel = prevStats.experience.level;
            
            // Level down if experience goes negative
            if (newExperience < 0 && newLevel > 1) {
              newExperience = prevStats.experience.max + newExperience;
              newLevel -= 1;
            } else if (newExperience < 0) {
              newExperience = 0;
            }
            
            return {
              ...prevStats,
              energyPoints: {
                ...prevStats.energyPoints,
                current: newEnergy,
              },
              experience: {
                ...prevStats.experience,
                current: newExperience,
                level: newLevel,
              },
            };
          });
        }
        
        return { ...quest, completed };
      }
      return quest;
    });
    
    setQuests(updatedQuests);
  };

  // Send a message to AI companion
  const sendMessage = (content: string) => {
    // Add user message
    const userMessage: AIMessage = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      content,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    
    // Simulate AI response
    setTimeout(() => {
      const aiMessage: AIMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: "ai",
        content: "I understand. Based on your current priorities and energy levels, I'd recommend focusing on completing your Deep Work Block first.",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  // Reset time tokens daily (simulation)
  useEffect(() => {
    const resetTimeTokens = () => {
      setStats((prev) => ({
        ...prev,
        timeTokens: {
          ...prev.timeTokens,
          current: prev.timeTokens.max,
        },
      }));
    };
    
    // Check time every hour
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        resetTimeTokens();
      }
    }, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <LifeOSContext.Provider
      value={{
        stats,
        quests,
        messages,
        events,
        toggleQuestCompletion,
        sendMessage,
        username,
        setUsername,
      }}
    >
      {children}
    </LifeOSContext.Provider>
  );
}

// Custom hook to use the context
export function useLifeOS() {
  const context = useContext(LifeOSContext);
  if (context === undefined) {
    throw new Error("useLifeOS must be used within a LifeOSProvider");
  }
  return context;
}
