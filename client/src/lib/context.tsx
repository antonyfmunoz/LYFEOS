import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserStats, Quest, AIMessage, CalendarEvent, MissionPage, ChatSession, KanbanTask, KanbanStatus, KanbanBoard, KanbanColumn } from "./types";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./authContext";
import { apiRequest } from "./queryClient";

// Initial stats data
const initialStats: UserStats = {
  attentionTokens: {
    current: 10,
    max: 10,
  },
  timeTokens: {
    current: 10,
    max: 10,
  },
  energyPoints: {
    current: 10,
    max: 10,
  },
  healthPoints: {
    current: 10,
    max: 10,
  },
  experience: {
    current: 0,
    max: 100,
    level: 1,
  },
  streakDays: 0,
  efficiencyScore: 0,
  aiAssistantName: "NOVA",
  
  // System settings
  notificationsEnabled: false,
  darkThemeEnabled: true,
  autoSyncEnabled: true,
  aiAssistantEnabled: true,
  primaryColor: "#00e0ff",
};

// Initial quests data
const initialQuests: Quest[] = [];

// Initial Chat Sessions
const initialChatSessions: ChatSession[] = [
  {
    id: "chat1",
    title: "General Assistance",
    messages: [
      {
        id: "msg1",
        sender: "ai",
        content: "Welcome to your AI companion. How can I assist you today? I can help with task prioritization, creative brainstorming, or just a friendly chat.",
        timestamp: new Date(),
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "chat2",
    title: "Project Planning",
    messages: [
      {
        id: "msg2",
        sender: "ai",
        content: "Let's organize your projects efficiently. I can help break down complex tasks into manageable steps.",
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
const initialEvents: CalendarEvent[] = [];

// Initial mission pages
const initialMissionPages: MissionPage[] = [];

// Initial kanban boards
const initialKanbanBoards: KanbanBoard[] = [
  {
    id: "board1",
    title: "Main Project",
    description: "Primary project board for tracking all tasks",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
    columns: [
      { id: "col1", title: "Backlog", status: "backlog", order: 0, boardId: "board1" },
      { id: "col2", title: "In Progress", status: "inProgress", order: 1, boardId: "board1" },
      { id: "col3", title: "Review", status: "review", order: 2, boardId: "board1" },
      { id: "col4", title: "Done", status: "done", order: 3, boardId: "board1" }
    ]
  }
];

// Initial kanban tasks
const initialKanbanTasks: KanbanTask[] = [
  {
    id: "task1",
    title: "Research competitors",
    description: "Analyze top 3 competitors in the market",
    status: "backlog",
    priority: "high",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ["research", "strategy"],
    boardId: "board1"
  },
  {
    id: "task2",
    title: "Draft content outline",
    description: "Create content structure for the project",
    status: "inProgress",
    priority: "medium",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ["content", "planning"],
    boardId: "board1"
  },
  {
    id: "task3",
    title: "UI Component refinement",
    description: "Improve existing UI components",
    status: "review",
    priority: "medium",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ["design", "frontend"],
    boardId: "board1"
  }
];

// Create context types
interface LYFEOSContextType {
  stats: UserStats;
  quests: Quest[];
  messages: AIMessage[];
  events: CalendarEvent[];
  missionPages: MissionPage[];
  chatSessions: ChatSession[];
  kanbanTasks: KanbanTask[];
  kanbanBoards: KanbanBoard[];
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
  deleteMissionPage: (id: string) => void;
  getMissionPageBySlug: (slug: string) => MissionPage | undefined;
  getMissionPageById: (id: string) => MissionPage | undefined;
  createChatSession: (title: string) => ChatSession;
  deleteChatSession: (id: string) => void;
  setActiveChatSession: (id: string) => void;
  updateChatSessionTitle: (id: string, title: string) => void;
  updateUserStats: (stats: UserStats) => void;
  setPrimaryColor: (color: string) => void;
  // Kanban board functions
  createKanbanBoard: (board: Omit<KanbanBoard, "id" | "createdAt" | "updatedAt" | "columns">) => KanbanBoard;
  updateKanbanBoard: (id: string, boardData: Partial<KanbanBoard>) => void;
  deleteKanbanBoard: (id: string) => void;
  // Kanban column functions
  addKanbanColumn: (boardId: string, column: Omit<KanbanColumn, "id" | "boardId" | "order">) => KanbanColumn;
  updateKanbanColumn: (id: string, columnData: Partial<KanbanColumn>) => void;
  deleteKanbanColumn: (id: string) => void;
  moveKanbanColumn: (boardId: string, columnId: string, targetIndex: number) => void;
  // Kanban task functions
  createKanbanTask: (task: Omit<KanbanTask, "id" | "createdAt" | "updatedAt">) => KanbanTask;
  updateKanbanTask: (id: string, taskData: Partial<KanbanTask>) => void;
  deleteKanbanTask: (id: string) => void;
  moveKanbanTask: (id: string, newStatus: KanbanStatus, boardId?: string) => void;
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

// We already defined initialMissionPages above

export function LYFEOSProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<UserStats>(initialStats);
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [missionPages, setMissionPages] = useState<MissionPage[]>(initialMissionPages);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>(initialKanbanTasks);
  const [kanbanBoards, setKanbanBoards] = useState<KanbanBoard[]>(initialKanbanBoards);
  const [username, setUsername] = useState<string>("Alex Chen");
  const [aiCompanionName, setAICompanionNameState] = useState<string>("Lyfe");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialChatSessions);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string>(initialChatSessions[0].id);
  
  // Function to update user stats
  const updateUserStats = (newStats: UserStats) => {
    setStats(newStats);
    console.log("User stats updated:", newStats);
  };
  
  // Function to set primary color
  const setPrimaryColor = (color: string) => {
    // Update stats with new primary color
    setStats(prevStats => ({
      ...prevStats,
      primaryColor: color
    }));
    
    // Function to convert hex to RGB
    const hexToRGB = (hex: string) => {
      // Remove the # if present
      hex = hex.replace(/^#/, '');
      
      // Parse the hex values
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      
      return { r, g, b };
    };
    
    // Function to convert hex to HSL
    const hexToHSL = (hex: string) => {
      // Remove the # if present
      hex = hex.replace(/^#/, '');
      
      // Parse the hex values
      let r = parseInt(hex.substring(0, 2), 16) / 255;
      let g = parseInt(hex.substring(2, 4), 16) / 255;
      let b = parseInt(hex.substring(4, 6), 16) / 255;
      
      // Find min and max values for RGB
      let max = Math.max(r, g, b);
      let min = Math.min(r, g, b);
      
      // Calculate lightness
      let l = (max + min) / 2;
      
      let h: number, s: number;
      
      if (max === min) {
        // Achromatic
        h = 0;
        s = 0;
      } else {
        // Calculate saturation
        s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
        
        // Calculate hue
        switch (max) {
          case r:
            h = (g - b) / (max - min) + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / (max - min) + 2;
            break;
          case b:
            h = (r - g) / (max - min) + 4;
            break;
          default:
            h = 0;
        }
        h /= 6;
      }
      
      // Convert to degrees and percentages
      h = Math.round(h * 360);
      s = Math.round(s * 100);
      l = Math.round(l * 100);
      
      return `${h} ${s}% ${l}%`;
    };
    
    // Set HSL value for primary color
    const hsl = hexToHSL(color);
    document.documentElement.style.setProperty('--primary', hsl);
    document.documentElement.style.setProperty('--primary-hsl', hsl);
    
    // Set hex color for direct use
    document.documentElement.style.setProperty('--primary-color', color);
    
    // Set RGB values for glow effects
    const rgbValues = hexToRGB(color);
    if (rgbValues) {
      const { r, g, b } = rgbValues;
      document.documentElement.style.setProperty('--primary-glow-light', `rgba(${r}, ${g}, ${b}, 0.3)`);
      document.documentElement.style.setProperty('--primary-glow-medium', `rgba(${r}, ${g}, ${b}, 0.5)`);
      document.documentElement.style.setProperty('--primary-glow-strong', `rgba(${r}, ${g}, ${b}, 0.7)`);
      document.documentElement.style.setProperty('--primary-bg-subtle', `rgba(${r}, ${g}, ${b}, 0.1)`);
      document.documentElement.style.setProperty('--primary-bg-light', `rgba(${r}, ${g}, ${b}, 0.2)`);
      document.documentElement.style.setProperty('--primary-border-subtle', `rgba(${r}, ${g}, ${b}, 0.2)`);
      document.documentElement.style.setProperty('--primary-shadow', `rgba(${r}, ${g}, ${b}, 0.3)`);
    }
    
    // Show toast notification
    toast({
      title: "Theme Color Updated",
      description: `UI theme color has been updated`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    // Update in database if user is authenticated
    if (isAuthenticated && user) {
      try {
        apiRequest(`/api/users/${user.id}/stats`, {
          method: 'PATCH',
          body: JSON.stringify({ primaryColor: color })
        }).catch(error => {
          console.error("Error updating primary color:", error);
        });
      } catch (error) {
        console.error("Error updating primary color:", error);
      }
    }
  };

  // Load user stats (including AI assistant name) when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchStats = async () => {
        try {
          console.log("Fetching stats for user:", user.id);
          const response = await fetch(`/api/users/${user.id}/stats`);
          if (response.ok) {
            const data = await response.json();
            const dbStats = data.stats;
            
            if (dbStats) {
              console.log("Stats loaded successfully:", dbStats);
              // Server now returns data in the format expected by our frontend components
              setStats(dbStats);
              
              // Set AI assistant name if available
              if (dbStats.aiAssistantName) {
                setAICompanionNameState(dbStats.aiAssistantName);
              }
            } else {
              console.log("No stats found for user, using defaults");
            }
          } else {
            console.error("Failed to fetch user stats, status:", response.status);
          }
        } catch (error) {
          console.error("Failed to fetch user stats:", error);
        }
      };
      
      fetchStats();
    }
  }, [isAuthenticated, user]);
  
  // Function to update AI assistant name in the database
  const setAICompanionName = (name: string) => {
    setAICompanionNameState(name);
    
    // Show toast notification
    toast({
      title: "AI Assistant Updated",
      description: `AI Assistant name set to ${name}`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    if (isAuthenticated && user) {
      try {
        fetch(`/api/users/${user.id}/ai-assistant-name`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        })
        .then(response => {
          if (!response.ok) {
            console.error("Failed to update AI assistant name in database");
          }
        })
        .catch(error => {
          console.error("Error updating AI assistant name:", error);
        });
      } catch (error) {
        console.error("Error updating AI assistant name:", error);
      }
    }
  };

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
                className: "bg-background/80 border border-primary text-foreground",
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
            className: "bg-background/80 border border-primary text-foreground",
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
            className: "bg-background/80 border border-destructive text-foreground",
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
    
    // Make API call to get AI response
    fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 1, // This will be replaced with the actual user ID from session
        sender: 'user',
        content,
        timestamp: new Date(),
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        if (data.aiResponse) {
          const aiMessage: AIMessage = {
            id: data.aiResponse.id || `msg-ai-${Date.now()}`,
            sender: 'ai',
            content: data.aiResponse.content,
            timestamp: new Date(data.aiResponse.timestamp) || new Date(),
          };
          setMessages((prev) => [...prev, aiMessage]);
        }
      })
      .catch(error => {
        console.error('Error:', error);
        // Add fallback message on error
        const aiMessage: AIMessage = {
          id: `msg-ai-error-${Date.now()}`,
          sender: 'ai',
          content: "I apologize, but I'm having trouble connecting right now. Please try again later.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      });
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
      className: "bg-background/80 border border-primary text-foreground",
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
      className: "bg-background/80 border border-primary text-foreground",
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
        className: "bg-background/80 border border-destructive text-foreground",
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
      className: "bg-background/80 border border-primary text-foreground",
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
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  // Delete a mission page
  const deleteMissionPage = (id: string) => {
    // Find the page to show in toast
    const pageToDelete = missionPages.find(page => page.id === id);
    
    // Remove the page
    setMissionPages((prev) => prev.filter(page => page.id !== id));
    
    // Show mission page deleted toast
    if (pageToDelete) {
      toast({
        title: "Mission Page Deleted",
        description: `${pageToDelete.title} has been removed`,
        variant: "destructive",
        className: "bg-background/80 border border-destructive text-foreground",
        duration: 3000,
      });
    }
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
    
    // Make API call to get AI response
    fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 1, // This will be replaced with the actual user ID from session
        sender: 'user',
        content,
        timestamp: new Date(),
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        if (data.aiResponse) {
          const aiMessage: AIMessage = {
            id: data.aiResponse.id || `msg-ai-${Date.now()}`,
            sender: 'ai',
            content: data.aiResponse.content,
            timestamp: new Date(data.aiResponse.timestamp) || new Date(),
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
        }
      })
      .catch(error => {
        console.error('Error:', error);
        // Add fallback message on error
        const aiMessage: AIMessage = {
          id: `msg-ai-error-${Date.now()}`,
          sender: 'ai',
          content: "I apologize, but I'm having trouble connecting right now. Please try again later.",
          timestamp: new Date(),
        };
        
        // Update chat session with error message
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
      });
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
      className: "bg-background/80 border border-primary text-foreground",
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
        className: "bg-background/80 border border-destructive text-foreground",
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
        className: "bg-background/80 border border-destructive text-foreground",
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
      className: "bg-background/80 border border-primary text-foreground",
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

  // Kanban Task Methods
  // Kanban board functions
  const createKanbanBoard = (board: Omit<KanbanBoard, "id" | "createdAt" | "updatedAt" | "columns">): KanbanBoard => {
    const timestamp = new Date().toISOString();
    const boardId = `board-${Date.now()}`;
    
    // Create default columns for the new board
    const defaultColumns = [
      { id: `col-backlog-${Date.now()}`, title: "Backlog", status: "backlog" as KanbanStatus, order: 0, boardId },
      { id: `col-inprogress-${Date.now() + 1}`, title: "In Progress", status: "inProgress" as KanbanStatus, order: 1, boardId },
      { id: `col-review-${Date.now() + 2}`, title: "Review", status: "review" as KanbanStatus, order: 2, boardId },
      { id: `col-done-${Date.now() + 3}`, title: "Done", status: "done" as KanbanStatus, order: 3, boardId }
    ];
    
    // Check if this is the first board
    const isFirstBoard = kanbanBoards.length === 0;
    
    // Extract isDefault from board if it exists
    const { isDefault: providedIsDefault, ...restBoard } = board;
    
    const newBoard: KanbanBoard = {
      id: boardId,
      createdAt: timestamp,
      updatedAt: timestamp,
      columns: defaultColumns,
      // Use provided isDefault if it exists, otherwise use isFirstBoard
      isDefault: providedIsDefault !== undefined ? providedIsDefault : isFirstBoard,
      // Spread the rest of the board properties
      ...restBoard
    };
    
    // Update board ID in columns
    newBoard.columns = defaultColumns.map(col => ({
      ...col,
      boardId: newBoard.id
    }));
    
    setKanbanBoards(prev => [...prev, newBoard]);
    
    // Show toast notification
    toast({
      title: "Board Created",
      description: `New board "${newBoard.title}" created`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    return newBoard;
  };
  
  const updateKanbanBoard = (id: string, boardData: Partial<KanbanBoard>) => {
    setKanbanBoards(prev => prev.map(board => 
      board.id === id 
        ? { 
            ...board, 
            ...boardData, 
            updatedAt: new Date().toISOString() 
          } 
        : board
    ));
    
    // Show toast notification
    toast({
      title: "Board Updated",
      description: "Board details have been updated",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  const deleteKanbanBoard = (id: string) => {
    const boardToDelete = kanbanBoards.find(board => board.id === id);
    if (!boardToDelete) return;
    
    // Check if this is the default board
    if (boardToDelete.isDefault && kanbanBoards.length > 1) {
      // Make another board the default
      const nextBoard = kanbanBoards.find(board => board.id !== id);
      if (nextBoard) {
        updateKanbanBoard(nextBoard.id, { isDefault: true });
      }
    }
    
    // Delete associated tasks
    setKanbanTasks(prev => prev.filter(task => task.boardId !== id));
    
    // Delete the board
    setKanbanBoards(prev => prev.filter(board => board.id !== id));
    
    // Show toast notification
    toast({
      title: "Board Deleted",
      description: `Board "${boardToDelete.title}" and its tasks have been removed`,
      variant: "destructive", 
      className: "bg-background/80 border border-destructive text-foreground",
      duration: 3000,
    });
  };
  
  // Kanban column functions
  const addKanbanColumn = (boardId: string, column: Omit<KanbanColumn, "id" | "boardId" | "order">): KanbanColumn => {
    const board = kanbanBoards.find(b => b.id === boardId);
    if (!board) throw new Error(`Board with ID ${boardId} not found`);
    
    // Get max order value to append this column at the end
    const maxOrder = Math.max(...board.columns.map(c => c.order), -1);
    
    const newColumn: KanbanColumn = {
      id: `col-${Date.now()}`,
      boardId,
      order: maxOrder + 1,
      ...column
    };
    
    setKanbanBoards(prev => prev.map(b => 
      b.id === boardId 
        ? {
            ...b,
            columns: [...b.columns, newColumn],
            updatedAt: new Date().toISOString()
          }
        : b
    ));
    
    // Show toast notification
    toast({
      title: "Column Added",
      description: `New column "${newColumn.title}" created`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    return newColumn;
  };
  
  const updateKanbanColumn = (id: string, columnData: Partial<KanbanColumn>) => {
    setKanbanBoards(prev => prev.map(board => {
      const columnIndex = board.columns.findIndex(col => col.id === id);
      if (columnIndex === -1) return board;
      
      const updatedColumns = [...board.columns];
      updatedColumns[columnIndex] = {
        ...updatedColumns[columnIndex],
        ...columnData
      };
      
      return {
        ...board,
        columns: updatedColumns,
        updatedAt: new Date().toISOString()
      };
    }));
    
    // Show toast notification
    toast({
      title: "Column Updated",
      description: "Column settings have been updated",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  const deleteKanbanColumn = (id: string) => {
    // Find which board contains this column
    let columnTitle = "";
    
    setKanbanBoards(prev => {
      return prev.map(board => {
        const columnIndex = board.columns.findIndex(col => col.id === id);
        if (columnIndex === -1) return board;
        
        // Store column title for the notification
        columnTitle = board.columns[columnIndex].title;
        
        // Don't delete if this is the only column left
        if (board.columns.length <= 1) {
          toast({
            title: "Cannot Delete Column",
            description: "A board must have at least one column",
            variant: "destructive",
            className: "bg-background/80 border border-destructive text-foreground",
            duration: 3000,
          });
          return board;
        }
        
        // Move tasks from this column to the first available column
        const columnStatus = board.columns[columnIndex].status;
        const firstColumn = board.columns.find(col => col.id !== id);
        
        if (firstColumn) {
          setKanbanTasks(tasks => tasks.map(task => 
            task.boardId === board.id && task.status === columnStatus
              ? { ...task, status: firstColumn.status }
              : task
          ));
        }
        
        // Remove the column
        const updatedColumns = board.columns.filter(col => col.id !== id);
        // Reorder remaining columns
        const reorderedColumns = updatedColumns.map((col, idx) => ({
          ...col,
          order: idx
        }));
        
        return {
          ...board,
          columns: reorderedColumns,
          updatedAt: new Date().toISOString()
        };
      });
    });
    
    if (columnTitle) {
      // Show toast notification
      toast({
        title: "Column Deleted",
        description: `Column "${columnTitle}" has been removed`,
        variant: "destructive", 
        className: "bg-background/80 border border-destructive text-foreground",
        duration: 3000,
      });
    }
  };
  
  // Kanban task functions
  const createKanbanTask = (task: Omit<KanbanTask, "id" | "createdAt" | "updatedAt">): KanbanTask => {
    const timestamp = new Date().toISOString();
    const newTask: KanbanTask = {
      id: `task-${Date.now()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      startDate: task.startDate || undefined,
      dueDate: task.dueDate || undefined,
      ...task
    };
    
    setKanbanTasks(prev => [...prev, newTask]);
    
    // Show toast notification
    toast({
      title: "Task Created",
      description: `New task "${task.title}" added`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    return newTask;
  };
  
  const updateKanbanTask = (id: string, taskData: Partial<KanbanTask>) => {
    setKanbanTasks(prev => prev.map(task => 
      task.id === id 
        ? { 
            ...task, 
            ...taskData, 
            updatedAt: new Date().toISOString(),
            // Explicitly handle date fields to ensure they're properly updated
            startDate: taskData.startDate !== undefined ? taskData.startDate : task.startDate,
            dueDate: taskData.dueDate !== undefined ? taskData.dueDate : task.dueDate
          } 
        : task
    ));
    
    // Show toast notification
    toast({
      title: "Task Updated",
      description: `Task has been updated`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  const deleteKanbanTask = (id: string) => {
    const taskToDelete = kanbanTasks.find(task => task.id === id);
    if (!taskToDelete) return;
    
    setKanbanTasks(prev => prev.filter(task => task.id !== id));
    
    // Show toast notification
    toast({
      title: "Task Deleted",
      description: `"${taskToDelete.title}" has been removed`,
      variant: "destructive",
      className: "bg-background/80 border border-destructive text-foreground",
      duration: 3000,
    });
  };
  
  const moveKanbanTask = (id: string, newStatus: KanbanStatus, boardId?: string) => {
    const taskToMove = kanbanTasks.find(task => task.id === id);
    if (!taskToMove) return;
    
    setKanbanTasks(prev => prev.map(task => 
      task.id === id 
        ? { 
            ...task, 
            status: newStatus,
            ...(boardId ? { boardId } : {}), // Only update boardId if provided
            updatedAt: new Date().toISOString() 
          } 
        : task
    ));
    
    // Show toast notification
    const statusLabels: Record<KanbanStatus, string> = {
      backlog: "Backlog",
      inProgress: "In Progress",
      review: "Review",
      done: "Done"
    };
    
    // Different messages based on whether it was moved between boards
    const message = boardId && boardId !== taskToMove.boardId
      ? `"${taskToMove.title}" moved to ${statusLabels[newStatus]} in another board`
      : `"${taskToMove.title}" moved to ${statusLabels[newStatus]}`;
    
    toast({
      title: "Task Moved",
      description: message,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };
  
  // Move a column to a new position within a board
  const moveKanbanColumn = (boardId: string, columnId: string, targetIndex: number) => {
    // Find the board
    const board = kanbanBoards.find(b => b.id === boardId);
    if (!board) return;
    
    // Find the column to move
    const columnIndex = board.columns.findIndex(col => col.id === columnId);
    if (columnIndex === -1) return;
    
    // Update the board
    setKanbanBoards(prev => {
      return prev.map(board => {
        if (board.id === boardId) {
          // Make a copy of the columns array
          const columns = [...board.columns];
          
          // Remove the column from its current position
          const [column] = columns.splice(columnIndex, 1);
          
          // Insert it at the target position
          columns.splice(targetIndex, 0, column);
          
          // Update order property of all columns
          const updatedColumns = columns.map((col, idx) => ({
            ...col,
            order: idx
          }));
          
          return {
            ...board,
            columns: updatedColumns,
            updatedAt: new Date().toISOString()
          };
        }
        return board;
      });
    });
    
    // Get column title for the toast
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      toast({
        title: "Column Moved",
        description: `"${column.title}" column has been moved to position ${targetIndex + 1}`,
        className: "bg-background/80 border border-primary text-foreground",
        duration: 3000,
      });
    }
  };

  return (
    <LYFEOSContext.Provider
      value={{
        stats,
        quests,
        messages,
        events,
        missionPages,
        chatSessions,
        kanbanTasks,
        kanbanBoards,
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
        deleteMissionPage,
        getMissionPageBySlug,
        getMissionPageById,
        createChatSession,
        deleteChatSession,
        setActiveChatSession,
        updateChatSessionTitle,
        updateUserStats,
        setPrimaryColor,
        // Kanban board functions
        createKanbanBoard,
        updateKanbanBoard,
        deleteKanbanBoard,
        // Kanban column functions
        addKanbanColumn,
        updateKanbanColumn,
        deleteKanbanColumn,
        moveKanbanColumn,
        // Kanban task functions
        createKanbanTask,
        updateKanbanTask,
        deleteKanbanTask,
        moveKanbanTask
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


