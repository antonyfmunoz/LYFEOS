import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserStats, Quest, AIMessage, CalendarEvent, MissionPage, ChatSession } from "./types";
import { toast } from "@/hooks/use-toast";

// Initial stats data
const initialStats: UserStats = {
  attentionTokens: {
    current: 80,
    max: 100,
  },
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

// Initial Chat Sessions
const initialChatSessions: ChatSession[] = [
  {
    id: "chat1",
    title: "Getting Started",
    messages: [
      {
        id: "msg1",
        sender: "ai",
        content: "Looking at your energy levels and upcoming tasks, would you like me to suggest an optimized schedule for today?",
        timestamp: new Date(),
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

// Initial AI messages (for backward compatibility)
const initialMessages: AIMessage[] = initialChatSessions[0].messages;

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
interface LYFEOSContextType {
  stats: UserStats;
  quests: Quest[];
  messages: AIMessage[];
  events: CalendarEvent[];
  missionPages: MissionPage[];
  chatSessions: ChatSession[];
  activeChatSessionId: string;
  toggleQuestCompletion: (id: string) => void;
  sendMessage: (content: string) => void;
  sendMessageInSession: (sessionId: string, content: string) => void;
  username: string;
  setUsername: (name: string) => void;
  aiCompanionName: string;
  setAICompanionName: (name: string) => void;
  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (id: string, eventData: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  createMissionPage: (mission: Omit<MissionPage, "id">) => MissionPage;
  updateMissionPage: (id: string, pageData: Partial<MissionPage>) => void;
  getMissionPageBySlug: (slug: string) => MissionPage | undefined;
  getMissionPageById: (id: string) => MissionPage | undefined;
  createChatSession: (title: string) => ChatSession;
  deleteChatSession: (id: string) => void;
  setActiveChatSession: (id: string) => void;
  updateChatSessionTitle: (id: string, title: string) => void;
}

// Create the context
const LYFEOSContext = createContext<LYFEOSContextType | undefined>(undefined);

// Provider component
// Helper to generate slugs for mission pages
const createSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-');
};

// Initial mission pages (empty array for now)
const initialMissionPages: MissionPage[] = [];

export function LYFEOSProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<UserStats>(initialStats);
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [missionPages, setMissionPages] = useState<MissionPage[]>(initialMissionPages);
  const [username, setUsername] = useState<string>("Alex Chen");
  const [aiCompanionName, setAICompanionName] = useState<string>("Nova");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialChatSessions);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string>(initialChatSessions[0].id);

  // Toggle quest completion
  const toggleQuestCompletion = (id: string) => {
    const currentQuest = quests.find(quest => quest.id === id);
    if (!currentQuest) return;
    
    const completed = !currentQuest.completed;
    
    const updatedQuests = quests.map((quest) => {
      if (quest.id === id) {
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
              
              // Show level up toast
              toast({
                title: "Level Up!",
                description: `You've reached level ${newLevel}! Keep up the good work!`,
                variant: "default",
                className: "bg-[#001E26] border border-[#36F1CD] text-white",
                duration: 5000,
              });
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
          
          // Show quest completed toast
          toast({
            title: "Quest Completed",
            description: `${quest.title} — +${quest.experienceReward} XP`,
            variant: "default",
            className: "bg-[#001E26] border border-[#36F1CD] text-white",
            duration: 3000,
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
          
          // Show quest unmarked toast
          toast({
            title: "Quest Unmarked",
            description: `${quest.title} has been marked as incomplete`,
            variant: "destructive",
            className: "bg-[#181818] border border-red-500 text-white",
            duration: 3000,
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
  
  // Add a new calendar event
  const addEvent = (event: Omit<CalendarEvent, "id">) => {
    const newEvent: CalendarEvent = {
      ...event,
      id: `event-${Date.now()}`,
    };
    
    setEvents((prev) => [...prev, newEvent]);
    
    // Show event added toast
    toast({
      title: "Event Added",
      description: `${newEvent.title} - ${newEvent.startTime}`,
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
      duration: 3000,
    });
  };
  
  // Update an existing calendar event
  const updateEvent = (id: string, eventData: Partial<CalendarEvent>) => {
    setEvents((prev) => 
      prev.map((event) => 
        event.id === id ? { ...event, ...eventData } : event
      )
    );
    
    // Show event updated toast
    toast({
      title: "Event Updated",
      description: "Calendar event has been updated",
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
      duration: 3000,
    });
  };
  
  // Delete a calendar event
  const deleteEvent = (id: string) => {
    // Find the event to show in toast
    const eventToDelete = events.find(event => event.id === id);
    
    // Remove the event
    setEvents((prev) => prev.filter((event) => event.id !== id));
    
    // Show event deleted toast
    if (eventToDelete) {
      toast({
        title: "Event Deleted",
        description: `${eventToDelete.title} has been removed`,
        variant: "destructive",
        className: "bg-[#181818] border border-red-500 text-white",
        duration: 3000,
      });
    }
  };
  
  // Mission Pages Functions
  
  // Create a new mission page
  const createMissionPage = (mission: Omit<MissionPage, "id">): MissionPage => {
    const newMissionPage: MissionPage = {
      ...mission,
      id: `mission-${Date.now()}`,
    };
    
    setMissionPages((prev) => [...prev, newMissionPage]);
    
    // Show mission page created toast
    toast({
      title: "Mission Page Created",
      description: `${newMissionPage.title} page has been created`,
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
      duration: 3000,
    });
    
    return newMissionPage;
  };
  
  // Update an existing mission page
  const updateMissionPage = (id: string, pageData: Partial<MissionPage>) => {
    setMissionPages((prev) => 
      prev.map((page) => 
        page.id === id ? { ...page, ...pageData, updatedAt: new Date().toISOString() } : page
      )
    );
    
    // Show mission page updated toast
    toast({
      title: "Mission Page Updated",
      description: "Your mission page has been updated",
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
      duration: 3000,
    });
  };
  
  // Get mission page by slug
  const getMissionPageBySlug = (slug: string): MissionPage | undefined => {
    return missionPages.find(page => page.slug === slug);
  };
  
  // Get mission page by ID
  const getMissionPageById = (id: string): MissionPage | undefined => {
    return missionPages.find(page => page.id === id);
  };
  
  // Chat Sessions Functions
  
  // Send a message in a specific chat session
  const sendMessageInSession = (sessionId: string, content: string) => {
    // Add user message
    const userMessage: AIMessage = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      content,
      timestamp: new Date(),
    };
    
    // Update chat session with new message
    setChatSessions((prev) => 
      prev.map((session) => {
        if (session.id === sessionId) {
          const updatedMessages = [...session.messages, userMessage];
          return {
            ...session, 
            messages: updatedMessages,
            updatedAt: new Date()
          };
        }
        return session;
      })
    );
    
    // Update legacy messages if this is the active session
    if (sessionId === activeChatSessionId) {
      setMessages((prev) => [...prev, userMessage]);
    }
    
    // Simulate AI response
    setTimeout(() => {
      const aiMessage: AIMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: "ai",
        content: "I understand. Based on your current priorities and energy levels, I'd recommend focusing on completing your Deep Work Block first.",
        timestamp: new Date(),
      };
      
      // Update chat session with AI response
      setChatSessions((prev) => 
        prev.map((session) => {
          if (session.id === sessionId) {
            const updatedMessages = [...session.messages, aiMessage];
            return {
              ...session, 
              messages: updatedMessages,
              updatedAt: new Date()
            };
          }
          return session;
        })
      );
      
      // Update legacy messages if this is the active session
      if (sessionId === activeChatSessionId) {
        setMessages((prev) => [...prev, aiMessage]);
      }
    }, 1000);
  };
  
  // Create a new chat session
  const createChatSession = (title: string): ChatSession => {
    const newChatSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setChatSessions((prev) => [...prev, newChatSession]);
    
    // Show chat created toast
    toast({
      title: "New Chat Created",
      description: `${title}`,
      variant: "default",
      className: "bg-[#001E26] border border-purple-500 text-white",
      duration: 3000,
    });
    
    return newChatSession;
  };
  
  // Delete a chat session
  const deleteChatSession = (id: string) => {
    // Find the chat to show in toast
    const chatToDelete = chatSessions.find(chat => chat.id === id);
    
    // Don't allow deleting the last chat
    if (chatSessions.length <= 1) {
      toast({
        title: "Cannot Delete",
        description: "You need to have at least one chat session",
        variant: "destructive",
        className: "bg-[#181818] border border-red-500 text-white",
        duration: 3000,
      });
      return;
    }
    
    // Check if this is the active session
    if (id === activeChatSessionId) {
      // Find another session to make active
      const remainingChats = chatSessions.filter(chat => chat.id !== id);
      setActiveChatSessionId(remainingChats[0].id);
      
      // Update legacy messages array for backward compatibility
      setMessages(remainingChats[0].messages);
    }
    
    // Remove the chat session
    setChatSessions((prev) => prev.filter((chat) => chat.id !== id));
    
    // Show chat deleted toast
    if (chatToDelete) {
      toast({
        title: "Chat Deleted",
        description: `${chatToDelete.title} has been removed`,
        variant: "destructive",
        className: "bg-[#181818] border border-red-500 text-white",
        duration: 3000,
      });
    }
  };
  
  // Set the active chat session
  const setActiveChatSession = (id: string) => {
    // Find the session
    const session = chatSessions.find(chat => chat.id === id);
    if (!session) return;
    
    // Set as active
    setActiveChatSessionId(id);
    
    // Update legacy messages for backward compatibility
    setMessages(session.messages);
  };
  
  // Update chat session title
  const updateChatSessionTitle = (id: string, title: string) => {
    setChatSessions((prev) => 
      prev.map((session) => 
        session.id === id ? { ...session, title, updatedAt: new Date() } : session
      )
    );
    
    // Show title updated toast
    toast({
      title: "Chat Updated",
      description: "Chat title has been updated",
      variant: "default",
      className: "bg-[#001E26] border border-purple-500 text-white",
      duration: 3000,
    });
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
    <LYFEOSContext.Provider
      value={{
        stats,
        quests,
        messages,
        events,
        missionPages,
        chatSessions,
        activeChatSessionId,
        toggleQuestCompletion,
        sendMessage,
        sendMessageInSession,
        username,
        setUsername,
        aiCompanionName,
        setAICompanionName,
        addEvent,
        updateEvent,
        deleteEvent,
        createMissionPage,
        updateMissionPage,
        getMissionPageBySlug,
        getMissionPageById,
        createChatSession,
        deleteChatSession,
        setActiveChatSession,
        updateChatSessionTitle,
      }}
    >
      {children}
    </LYFEOSContext.Provider>
  );
}

// Custom hook to use the context
export function useLYFEOS() {
  const context = useContext(LYFEOSContext);
  if (context === undefined) {
    throw new Error("useLYFEOS must be used within a LYFEOSProvider");
  }
  return context;
}
