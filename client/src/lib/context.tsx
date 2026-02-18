import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserStats, Quest, AIMessage, CalendarEvent, MissionPage, ChatSession, KanbanTask, KanbanStatus, KanbanBoard, KanbanColumn } from "./types";
import { toast } from "@/hooks/use-toast";
import { missionCompleteToast, levelUpToast, streakToast } from "@/lib/gamified-toast";
import { getRank } from "@/lib/ranks";
import { useCelebration } from "@/lib/celebrationContext";
import { useAuth } from "./authContext";
import { apiRequest, queryClient } from "./queryClient";
import { getLocalDateString } from "./utils";
import { applyPrimaryColor } from "./applyPrimaryColor";

// Initial stats data
const initialStats: UserStats = {
  attentionTokens: {
    current: 100,
    max: 100,
  },
  timeTokens: {
    current: 100,
    max: 100,
  },
  energyPoints: {
    current: 100,
    max: 100,
  },
  healthPoints: {
    current: 100,
    max: 100,
  },
  experience: {
    current: 0,
    max: 1000, // Level 1 threshold is 1000 XP
    level: 1,
    totalXP: 0,
    showLevelUp: false,
  },
  streakDays: 0,
  efficiencyScore: 0,
  aiAssistantName: "NOVA",
  
  // System settings
  notificationsEnabled: false,
  darkThemeEnabled: true,
  autoSyncEnabled: true,
  aiAssistantEnabled: true,
  primaryColor: "#ffffff",
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
];

// Initial AI messages (for backward compatibility)
const initialMessages: AIMessage[] = initialChatSessions[0].messages;

// Initial calendar events
const initialEvents: CalendarEvent[] = [];

// Initial mission pages
const initialMissionPages: MissionPage[] = [];

// Energy log data for dashboard persistence across page navigations
export interface EnergyLogData {
  mentalState: number;
  physicalState: number;
  emotionalState: number;
  wakeTime: string;
  sleepTime: string;
  isLoaded: boolean; // Tracks if data was loaded from server
  lastPopulatedFingerprint: string | null; // Tracks which data version we've populated
}

export interface IntentionLogData {
  gratitude: string;
  tomorrowGoals: string;
  annualGoals: string;
  thoughts: string;
  isLoaded: boolean;
  lastPopulatedFingerprint: string | null;
}

export interface ResearchEntry {
  sourceAuthor: string;
  sourceMaterial: string;
  researchNote: string;
  revisionNote: string;
  executionNote: string;
  savedAt: string;
}

export interface DataLogData {
  contentConsumed: string;
  research: string;
  sourceAuthor: string;
  sourceMaterial: string;
  researchNote: string;
  revisionNote: string;
  executionNote: string;
  todoIdeas: string;
  researchEntries: ResearchEntry[];
  isLoaded: boolean;
  lastPopulatedFingerprint: string | null;
}

export interface ReflectionLogData {
  wentWell: string;
  couldBeBetter: string;
  learned: string;
  isLoaded: boolean;
  lastPopulatedFingerprint: string | null;
}

const initialEnergyLog: EnergyLogData = {
  mentalState: 5,
  physicalState: 5,
  emotionalState: 5,
  wakeTime: "06:00",
  sleepTime: "22:00",
  isLoaded: false,
  lastPopulatedFingerprint: null,
};

const initialIntentionLog: IntentionLogData = {
  gratitude: "",
  tomorrowGoals: "",
  annualGoals: "",
  thoughts: "",
  isLoaded: false,
  lastPopulatedFingerprint: null,
};

const initialDataLog: DataLogData = {
  contentConsumed: "",
  research: "",
  sourceAuthor: "",
  sourceMaterial: "",
  researchNote: "",
  revisionNote: "",
  executionNote: "",
  todoIdeas: "",
  researchEntries: [],
  isLoaded: false,
  lastPopulatedFingerprint: null,
};

const initialReflectionLog: ReflectionLogData = {
  wentWell: "",
  couldBeBetter: "",
  learned: "",
  isLoaded: false,
  lastPopulatedFingerprint: null,
};

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
  userProfile: any | null;
  messages: AIMessage[];
  events: CalendarEvent[];
  missionPages: MissionPage[];
  chatSessions: ChatSession[];
  kanbanTasks: KanbanTask[];
  kanbanBoards: KanbanBoard[];
  activeChatSessionId: string;
  // Energy log state (persists across page navigations)
  energyLog: EnergyLogData;
  updateEnergyLog: (data: Partial<EnergyLogData>) => void;
  resetEnergyLog: () => void;
  // Intention log state (persists across page navigations)
  intentionLog: IntentionLogData;
  updateIntentionLog: (data: Partial<IntentionLogData>) => void;
  resetIntentionLog: () => void;
  // Data log state (persists across page navigations)
  dataLog: DataLogData;
  updateDataLog: (data: Partial<DataLogData>) => void;
  resetDataLog: () => void;
  // Reflection log state (persists across page navigations)
  reflectionLog: ReflectionLogData;
  updateReflectionLog: (data: Partial<ReflectionLogData>) => void;
  resetReflectionLog: () => void;
  toggleQuestCompletion: (id: string) => Promise<void> | void;
  createQuest: (quest: Omit<Quest, "id" | "completed">) => Promise<Quest>;
  updateQuest: (id: string, quest: Partial<Quest>) => Promise<Quest>;
  deleteQuest: (id: string) => Promise<void>;
  refetchQuests: (overrideUserId?: number) => Promise<void>;
  sendMessage: (content: string, imageIds?: number[]) => void;
  sendMessageInSession: (sessionId: string, content: string, imageIds?: number[]) => void;
  username: string;
  setUsername: (name: string) => void;
  aiCompanionName: string;
  setAICompanionName: (name: string) => void;
  aiPanelOpen: boolean;
  setAIPanelOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (id: string, eventData: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  createMissionPage: (mission: Omit<MissionPage, "id">) => MissionPage;
  updateMissionPage: (id: string, pageData: Partial<MissionPage>) => Promise<void>;
  deleteMissionPage: (id: string) => void;
  getMissionPageBySlug: (slug: string) => MissionPage | undefined;
  getMissionPageById: (id: string) => MissionPage | undefined;
  createChatSession: (title: string) => ChatSession;
  deleteChatSession: (id: string) => Promise<boolean>;
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
  activeTimerQuest: Quest | null;
  missionElapsedTimes: { [key: string]: number };
  missionBreakTimes: { [key: string]: number };
  timerStartedAt: number | null;
  timerPausedElapsed: number;
  timerIsPaused: boolean;
  isOnBreak: boolean;
  breakStartedAt: number | null;
  breakElapsed: number;
  startMissionTimer: (quest: Quest) => void;
  resumeMissionTimer: (quest: Quest) => void;
  endMissionTimer: (elapsedSeconds: number) => void;
  restartMissionTimer: (questId?: string) => void;
  pauseResumeTimer: () => void;
  statTips: Record<string, string[]>;
  statTipsLoading: boolean;
  computedStats: any;
}

// Create the context
export const LYFEOSContext = createContext<LYFEOSContextType | undefined>(undefined);

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
  const { triggerCelebration } = useCelebration();
  const [stats, setStats] = useState<UserStats>(initialStats);
  const [quests, setQuests] = useState<Quest[]>(initialQuests);
  const { data: userProfile = null } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated && !!user,
    staleTime: 60000,
  });
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [missionPages, setMissionPages] = useState<MissionPage[]>(initialMissionPages);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>(initialKanbanTasks);
  const [kanbanBoards, setKanbanBoards] = useState<KanbanBoard[]>(initialKanbanBoards);
  const [energyLog, setEnergyLog] = useState<EnergyLogData>(initialEnergyLog);
  const [intentionLog, setIntentionLog] = useState<IntentionLogData>(initialIntentionLog);
  const [dataLog, setDataLog] = useState<DataLogData>(initialDataLog);
  const [reflectionLog, setReflectionLog] = useState<ReflectionLogData>(initialReflectionLog);
  const [username, setUsername] = useState<string>("Alex Chen");
  const streakToastFired = useRef(false);
  const levelUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiCompanionName, setAICompanionNameState] = useState<string>("Lyfe");
  const [aiPanelOpen, setAIPanelOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialChatSessions);
  // Mapping from local chat session IDs to database conversation IDs
  const [sessionToDbIdMap, setSessionToDbIdMap] = useState<Record<string, number>>({});
  const [activeChatSessionId, setActiveChatSessionId] = useState<string>(initialChatSessions[0].id);
  const [activeTimerQuest, setActiveTimerQuest] = useState<Quest | null>(null);
  const [missionElapsedTimes, setMissionElapsedTimes] = useState<{ [key: string]: number }>({});
  const [missionBreakTimes, setMissionBreakTimes] = useState<{ [key: string]: number }>({});
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerPausedElapsed, setTimerPausedElapsed] = useState<number>(0);
  const [timerIsPaused, setTimerIsPaused] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const [statTips, setStatTips] = useState<Record<string, string[]>>({});
  const [statTipsLoading, setStatTipsLoading] = useState(false);
  const [computedStats, setComputedStats] = useState<any>(null);
  
  // Function to update user stats
  const updateUserStats = (newStats: UserStats) => {
    setStats(newStats);
    console.log("User stats updated:", newStats);
  };
  
  // Function to update energy log (persists across page navigations)
  const updateEnergyLog = (data: Partial<EnergyLogData>) => {
    setEnergyLog(prev => ({
      ...prev,
      ...data
    }));
  };
  
  // Function to reset energy log (on logout or new day)
  const resetEnergyLog = () => {
    setEnergyLog(initialEnergyLog);
  };
  
  // Function to update intention log (persists across page navigations)
  const updateIntentionLog = (data: Partial<IntentionLogData>) => {
    setIntentionLog(prev => ({
      ...prev,
      ...data
    }));
  };
  
  // Function to reset intention log (on logout or new day)
  const resetIntentionLog = () => {
    setIntentionLog(initialIntentionLog);
  };
  
  // Function to update data log (persists across page navigations)
  const updateDataLog = (data: Partial<DataLogData>) => {
    setDataLog(prev => ({
      ...prev,
      ...data
    }));
  };
  
  // Function to reset data log (on logout or new day)
  const resetDataLog = () => {
    setDataLog(initialDataLog);
  };
  
  // Function to update reflection log (persists across page navigations)
  const updateReflectionLog = (data: Partial<ReflectionLogData>) => {
    setReflectionLog(prev => ({
      ...prev,
      ...data
    }));
  };
  
  // Function to reset reflection log (on logout or new day)
  const resetReflectionLog = () => {
    setReflectionLog(initialReflectionLog);
  };
  
  const setPrimaryColor = (color: string) => {
    setStats(prevStats => ({
      ...prevStats,
      primaryColor: color
    }));
    
    applyPrimaryColor(color);
    localStorage.setItem('lyfeos-primary-color', color);
    
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

  useEffect(() => {
    if (isAuthenticated && user) {
      const name = user.displayName || user.username || user.firstName || "Player";
      setUsername(name);
    }
  }, [isAuthenticated, user]);

  // Load user stats (including AI assistant name) when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchStats = async () => {
        try {
          console.log("Fetching stats for user:", user.id);
          const response = await fetch(`/api/users/${user.id}/stats`, { credentials: "include" });
          if (response.ok) {
            const data = await response.json();
            let dbStats = data.stats;
            
            if (dbStats) {
              console.log("Stats loaded successfully:", dbStats);
              
              if (!dbStats.primaryColor) {
                const savedColor = localStorage.getItem('lyfeos-primary-color');
                if (savedColor && savedColor !== '#ffffff') {
                  dbStats = { ...dbStats, primaryColor: savedColor };
                }
              }
              
              const isOnboardingPage = window.location.pathname.replace(/\/+$/, '') === '/onboarding';
              if (isOnboardingPage) {
                const currentColor = localStorage.getItem('lyfeos-primary-color');
                if (currentColor && currentColor !== '#ffffff') {
                  dbStats = { ...dbStats, primaryColor: currentColor };
                }
              }
              
              setStats(dbStats);
              
              if (dbStats.streakDays > 1 && !streakToastFired.current) {
                streakToastFired.current = true;
                const today = new Date().toDateString();
                const lastStreakToastDate = localStorage.getItem("lyfeos_streak_toast_date");
                if (lastStreakToastDate !== today) {
                  let attempts = 0;
                  const maxAttempts = 20;
                  const showStreakAfterCeremony = () => {
                    attempts++;
                    if (sessionStorage.getItem("lyfeos_ceremony_complete") === "true") {
                      sessionStorage.removeItem("lyfeos_ceremony_complete");
                      localStorage.setItem("lyfeos_streak_toast_date", today);
                      setTimeout(() => streakToast(dbStats.streakDays), 800);
                    } else if (attempts < maxAttempts) {
                      setTimeout(showStreakAfterCeremony, 500);
                    }
                  };
                  setTimeout(showStreakAfterCeremony, 1000);
                }
              }
              
              const isOnboarding = window.location.pathname.replace(/\/+$/, '') === '/onboarding';
              if (!isOnboarding) {
                const effectiveColor = dbStats.primaryColor || localStorage.getItem('lyfeos-primary-color');
                if (effectiveColor && effectiveColor !== '#ffffff') {
                  applyPrimaryColor(effectiveColor);
                  localStorage.setItem('lyfeos-primary-color', effectiveColor);
                }
              }
              
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

      const fetchComputedStats = async () => {
        try {
          const response = await fetch("/api/computed-stats", { credentials: "include" });
          if (response.ok) {
            const data = await response.json();
            setComputedStats(data);
          }
        } catch (error) {
          console.error("Failed to fetch computed stats:", error);
        }
      };
      fetchComputedStats();

      const fetchAllTips = async () => {
        setStatTipsLoading(true);
        try {
          const response = await fetch("/api/stat-tips/all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            if (data.tips) {
              setStatTips(data.tips);
            }
          }
        } catch (error) {
          console.error("Failed to fetch stat tips:", error);
        } finally {
          setStatTipsLoading(false);
        }
      };
      fetchAllTips();
    }
  }, [isAuthenticated, user]);
  
  // Load mission pages when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchMissionPages = async () => {
        try {
          console.log("Fetching mission pages for user:", user.id);
          const response = await fetch(`/api/users/${user.id}/mission-pages`, { credentials: "include" });
          if (response.ok) {
            const data = await response.json();
            if (data.missionPages && Array.isArray(data.missionPages)) {
              console.log("Mission pages loaded successfully:", data.missionPages.length, "pages");
              
              // Transform mission pages to ensure correct types
              const transformedPages = data.missionPages.map((page: any) => ({
                id: String(page.id),
                title: page.title,
                slug: page.slug,
                content: page.content,
                createdAt: page.createdAt || page.created_at,
                updatedAt: page.updatedAt || page.updated_at,
                completed: page.completed,
                xpValue: page.xpValue || page.xp_value || 5,
                tags: Array.isArray(page.tags) ? page.tags : [],
                eventId: page.eventId ? String(page.eventId) : (page.event_id ? String(page.event_id) : undefined),
                date: page.date
              }));
              
              setMissionPages(transformedPages);
            }
          } else {
            console.error("Failed to fetch mission pages, status:", response.status);
          }
        } catch (error) {
          console.error("Failed to fetch mission pages:", error);
        }
      };
      
      fetchMissionPages();
    }
  }, [isAuthenticated, user]);
  
  // Load calendar events when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchCalendarEvents = async () => {
        try {
          console.log("Fetching calendar events for user:", user.id);
          const response = await fetch(`/api/users/${user.id}/calendar-events`, { credentials: "include" });
          if (response.ok) {
            const data = await response.json();
            if (data.events && Array.isArray(data.events)) {
              console.log("Calendar events loaded successfully:", data.events.length, "events");
              // Transform database events to frontend format (id as string)
              const transformedEvents = data.events.map((event: any) => ({
                id: String(event.id),
                title: event.title,
                description: event.description || "",
                startTime: event.startTime,
                duration: event.duration,
                category: event.category,
                date: event.date,
              }));
              setEvents(transformedEvents);
              
              // Sync calendar events to quests for the Missions page
              const today = getLocalDateString();
              const calendarQuests: Quest[] = transformedEvents
                .filter((event: CalendarEvent) => event.date === today)
                .map((event: CalendarEvent) => ({
                  id: `quest-calendar-${event.id}`,
                  title: event.title,
                  description: `${event.description || event.category} - ${event.date} at ${event.startTime}`,
                  completed: false,
                  energyCost: 1,
                  attentionCost: 0,
                  timeCost: 0,
                  experienceReward: 15,
                }));
              
              if (calendarQuests.length > 0) {
                console.log("Syncing calendar events to quests:", calendarQuests.length, "quests");
                setQuests((prev) => {
                  // Remove old calendar quests and add new ones
                  const nonCalendarQuests = prev.filter(q => !q.id.startsWith('quest-calendar-'));
                  return [...nonCalendarQuests, ...calendarQuests];
                });
              }
            }
          } else {
            console.error("Failed to fetch calendar events, status:", response.status);
          }
        } catch (error) {
          console.error("Failed to fetch calendar events:", error);
        }
      };
      
      fetchCalendarEvents();
    }
  }, [isAuthenticated, user]);
  
  // Refetch quests from the server
  const refetchQuests = async (overrideUserId?: number) => {
    const uid = overrideUserId || user?.id;
    if (!uid) return;
    try {
      console.log("Refetching quests for user:", uid);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(`/api/users/${uid}/quests?tz=${encodeURIComponent(tz)}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.quests && Array.isArray(data.quests)) {
          console.log("Quests refetched successfully:", data.quests.length, "quests");
          const transformedQuests: Quest[] = data.quests.map((quest: any) => ({
            id: String(quest.id),
            title: quest.title,
            description: quest.description || "",
            category: quest.category || "general",
            completed: quest.completed || false,
            completedAt: quest.completedAt || null,
            energyCost: quest.energyCost || 1,
            attentionCost: quest.attentionCost || 0,
            timeCost: quest.timeCost || 0,
            experienceReward: quest.experienceReward || 10,
            startDate: quest.startDate || null,
            startTime: quest.startTime || null,
            endDate: quest.endDate || null,
            endTime: quest.endTime || null,
            dueDate: quest.dueDate || null,
            notificationEnabled: quest.notificationEnabled || false,
            notificationTime: quest.notificationTime || null,
            notifications: quest.notifications || [],
            difficulty: quest.difficulty || "D",
            isRitualized: quest.isRitualized || false,
            repeatFrequency: quest.repeatFrequency || null,
            repeatInterval: quest.repeatInterval || null,
            repeatDays: quest.repeatDays || null,
            repeatEndDate: quest.repeatEndDate || null,
            parentRitualId: quest.parentRitualId || null,
            visionGoalId: quest.visionGoalId ?? null,
          }));
          setQuests(transformedQuests);
        }
      } else {
        console.error("Failed to refetch quests, status:", response.status);
      }
    } catch (error) {
      console.error("Failed to refetch quests:", error);
    }
  };

  // Load quests/missions when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      refetchQuests();
    }
  }, [isAuthenticated, user]);
  
  // Load chat conversations when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchConversations = async () => {
        try {
          console.log("Fetching conversations for user:", user.id);
          const response = await fetch('/api/conversations', { credentials: "include" });
          if (response.ok) {
            const conversations = await response.json();
            if (Array.isArray(conversations) && conversations.length > 0) {
              console.log("Conversations loaded successfully:", conversations.length, "conversations");
              
              // Transform database conversations to frontend ChatSession format
              const transformedSessions: ChatSession[] = [];
              const newSessionToDbIdMap: Record<string, number> = {};
              
              for (const conv of conversations) {
                // Fetch messages for each conversation
                const messagesResponse = await fetch(`/api/conversations/${conv.id}`, { credentials: "include" });
                let chatMessages: AIMessage[] = [];
                
                if (messagesResponse.ok) {
                  const convWithMessages = await messagesResponse.json();
                  if (convWithMessages.messages && Array.isArray(convWithMessages.messages)) {
                    chatMessages = convWithMessages.messages.map((msg: any) => ({
                      id: `msg-${msg.id}`,
                      sender: msg.role === 'assistant' ? 'ai' : 'user',
                      content: msg.content,
                      timestamp: new Date(msg.createdAt),
                    }));
                  }
                }
                
                const sessionId = `db-chat-${conv.id}`;
                transformedSessions.push({
                  id: sessionId,
                  title: conv.title,
                  messages: chatMessages,
                  createdAt: new Date(conv.createdAt),
                  updatedAt: new Date(conv.createdAt),
                });
                
                newSessionToDbIdMap[sessionId] = conv.id;
              }
              
              setChatSessions(transformedSessions);
              setSessionToDbIdMap(newSessionToDbIdMap);
              
              // Set the first conversation as active and sync legacy messages
              if (transformedSessions.length > 0) {
                setActiveChatSessionId(transformedSessions[0].id);
                setMessages(transformedSessions[0].messages);
              }
            } else {
              console.log("No conversations found, using default");
            }
          } else {
            console.error("Failed to fetch conversations, status:", response.status);
          }
        } catch (error) {
          console.error("Failed to fetch conversations:", error);
        }
      };
      
      fetchConversations();
    }
  }, [isAuthenticated, user]);
  
  // Function to update AI assistant name in the database
  const setAICompanionName = (name: string) => {
    setAICompanionNameState(name);
    
    if (isAuthenticated && user) {
      try {
        fetch(`/api/users/${user.id}/ai-assistant-name`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: "include",
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
  const toggleQuestCompletion = async (id: string) => {
    const currentQuest = quests.find(quest => quest.id === id);
    if (!currentQuest) return;
    
    const completed = !currentQuest.completed;
    
    // Optimistically update local state
    const updatedQuests = quests.map((quest) => {
      if (quest.id === id) {
        return { 
          ...quest, 
          completed,
          completedAt: completed ? new Date().toISOString() : null
        };
      }
      return quest;
    });
    setQuests(updatedQuests);
    
    if (completed) {
      const xpEstimate = Math.floor(currentQuest.experienceReward * ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[currentQuest.difficulty || 'D'] || 1));
      missionCompleteToast(currentQuest.title, xpEstimate);
      const isOnboarding1to6 = currentQuest.category === "onboarding" && [
        "Archetype Calibration", "Identity & Direction", "Craft & Mastery",
        "Capacity & Constraints", "Baselines & States", "History & Roots",
      ].some(t => currentQuest.title.includes(t));
      if (!isOnboarding1to6) {
        triggerCelebration({ type: "mission_complete", title: currentQuest.title, xp: xpEstimate });
      }
    }
    
    // Persist to database (runs in background after toast)
    try {
      const response = await fetch(`/api/quests/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        setQuests(quests);
        console.error("Failed to toggle quest completion");
        toast({
          title: "Update Failed",
          description: "Could not save mission status. Please try again.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      
      const data = await response.json();
      
      // Update the quest with the server response
      setQuests((prev) => prev.map((q) => 
        q.id === id ? { 
          ...q, 
          completed: data.quest.completed,
          completedAt: data.quest.completedAt 
        } : q
      ));
      
      // Update all stats from server response if available
      if (data.stats) {
        setStats((prevStats) => ({
          ...prevStats,
          timeTokens: data.stats.timeTokens || prevStats.timeTokens,
          attentionTokens: data.stats.attentionTokens || prevStats.attentionTokens,
          energyPoints: data.stats.energyPoints || prevStats.energyPoints,
          experience: {
            current: data.stats.experience.current,
            max: data.stats.experience.max,
            level: data.stats.experience.level,
            totalXP: data.stats.experience.totalXP || prevStats.experience.totalXP,
            showLevelUp: data.stats.experience.showLevelUp
          },
        }));
        
        if (data.stats.experience.showLevelUp) {
          const rank = getRank(data.stats.experience.level);
          levelUpToast(data.stats.experience.level, rank.name);
          if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
          levelUpTimerRef.current = setTimeout(() => {
            triggerCelebration({
              type: "level_up",
              level: data.stats.experience.level,
              rankName: rank.name,
              rankColor: rank.color,
              rankIcon: rank.icon,
            });
            levelUpTimerRef.current = null;
          }, 1200);
        }
      }
      
      if (currentQuest.isRitualized) {
        await refetchQuests();
      }

      if (currentQuest.visionGoalId) {
        queryClient.refetchQueries({ queryKey: ['/api/quests/linked-by-vision-goal'] });
      }
    } catch (error) {
      setQuests(quests);
      console.error("Error toggling quest completion:", error);
      toast({
        title: "Update Failed",
        description: "Could not save mission status. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  // Create a new quest/mission
  const createQuest = async (questData: Omit<Quest, "id" | "completed">): Promise<Quest> => {
    if (!user?.id) {
      throw new Error("User not authenticated");
    }
    
    const response = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: user.id,
        title: questData.title,
        description: questData.description,
        category: questData.category || "general",
        energyCost: questData.energyCost,
        experienceReward: questData.experienceReward,
        startDate: questData.startDate || null,
        startTime: questData.startTime || null,
        endDate: questData.endDate || null,
        endTime: questData.endTime || null,
        dueDate: questData.dueDate || null,
        notificationEnabled: questData.notificationEnabled || false,
        notificationTime: questData.notificationTime || null,
        notifications: questData.notifications || [],
        completed: false,
        isRitualized: questData.isRitualized || false,
        repeatFrequency: questData.repeatFrequency || null,
        repeatInterval: questData.repeatInterval || null,
        repeatDays: questData.repeatDays || null,
        repeatEndDate: questData.repeatEndDate || null,
      }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to create quest");
    }
    
    const { quest } = await response.json();
    const newQuest: Quest = {
      id: String(quest.id),
      title: quest.title,
      description: quest.description,
      category: quest.category,
      completed: quest.completed,
      energyCost: quest.energyCost,
      attentionCost: quest.attentionCost,
      timeCost: quest.timeCost,
      experienceReward: quest.experienceReward,
      startDate: quest.startDate,
      startTime: quest.startTime,
      endDate: quest.endDate,
      endTime: quest.endTime,
      dueDate: quest.dueDate,
      notificationEnabled: quest.notificationEnabled,
      notificationTime: quest.notificationTime,
      notifications: quest.notifications || [],
      difficulty: quest.difficulty || "D",
      isRitualized: quest.isRitualized || false,
      repeatFrequency: quest.repeatFrequency || null,
      repeatInterval: quest.repeatInterval || null,
      repeatDays: quest.repeatDays || null,
      repeatEndDate: quest.repeatEndDate || null,
      parentRitualId: quest.parentRitualId || null,
      visionGoalId: quest.visionGoalId ?? null,
    };
    
    setQuests((prev) => [...prev, newQuest]);

    if (newQuest.visionGoalId) {
      queryClient.invalidateQueries({ queryKey: ['/api/quests/linked-by-vision-goal'] });
    }
    
    return newQuest;
  };

  // Update a quest/mission
  const updateQuest = async (id: string, questData: Partial<Quest>): Promise<Quest> => {
    const response = await fetch(`/api/quests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(questData),
    });
    
    if (!response.ok) {
      throw new Error("Failed to update quest");
    }
    
    const { quest } = await response.json();
    const updatedQuest: Quest = {
      id: String(quest.id),
      title: quest.title,
      description: quest.description,
      category: quest.category,
      completed: quest.completed,
      energyCost: quest.energyCost,
      attentionCost: quest.attentionCost,
      timeCost: quest.timeCost,
      experienceReward: quest.experienceReward,
      startDate: quest.startDate,
      startTime: quest.startTime,
      endDate: quest.endDate,
      endTime: quest.endTime,
      dueDate: quest.dueDate,
      notificationEnabled: quest.notificationEnabled,
      notificationTime: quest.notificationTime,
      notifications: quest.notifications || [],
      difficulty: quest.difficulty || "D",
      isRitualized: quest.isRitualized || false,
      repeatFrequency: quest.repeatFrequency || null,
      repeatInterval: quest.repeatInterval || null,
      repeatDays: quest.repeatDays || null,
      repeatEndDate: quest.repeatEndDate || null,
      parentRitualId: quest.parentRitualId || null,
      visionGoalId: quest.visionGoalId ?? null,
    };
    
    setQuests((prev) => prev.map((q) => (q.id === id ? updatedQuest : q)));

    queryClient.invalidateQueries({ queryKey: ['/api/quests/linked-by-vision-goal'] });
    queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
    
    return updatedQuest;
  };

  // Delete a quest/mission
  const deleteQuest = async (id: string): Promise<void> => {
    if (id.startsWith("quest-calendar-")) {
      setQuests((prev) => prev.filter((q) => q.id !== id));
      return;
    }
    
    const response = await fetch(`/api/quests/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    
    if (!response.ok) {
      throw new Error("Failed to delete quest");
    }
    
    setQuests((prev) => prev.filter((q) => q.id !== id));
  };

  // Send a message to AI companion
  const sendMessage = (content: string, imageIds?: number[]) => {
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
      credentials: "include",
      body: JSON.stringify({
        userId: user?.id,
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
    // Generate temporary ID for optimistic update
    const tempId = `event-${Date.now()}`;
    const newEvent: CalendarEvent = {
      ...event,
      id: tempId,
    };
    
    // Optimistic update
    setEvents((prev) => [...prev, newEvent]);
    
    // Show event added toast
    toast({
      title: "Event Added",
      description: `${newEvent.title} - ${newEvent.startTime}`,
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    // Save to database if authenticated
    if (isAuthenticated && user) {
      apiRequest('/api/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          title: event.title,
          description: event.description || "",
          startTime: event.startTime,
          duration: event.duration,
          category: event.category,
          date: event.date,
        })
      })
        .then((response) => response.json())
        .then((data) => {
          const savedEvent = data?.event;
          if (savedEvent && savedEvent.id) {
            // Update the event with the real ID from the database
            setEvents((prev) => 
              prev.map((e) => 
                e.id === tempId ? { 
                  ...e, 
                  id: String(savedEvent.id),
                } : e
              )
            );
            console.log("Calendar event saved to database:", savedEvent.id);
            
            // Create a corresponding quest for the Missions page
            const questId = `quest-calendar-${savedEvent.id}`;
            const newQuest: Quest = {
              id: questId,
              title: event.title,
              description: `${event.description || event.category} - ${event.date} at ${event.startTime}`,
              completed: false,
              energyCost: 1,
              attentionCost: 0,
              timeCost: 0,
              experienceReward: 15,
            };
            
            console.log("Creating quest for calendar event:", savedEvent.id);
            setQuests((prev) => [...prev, newQuest]);
          }
        })
        .catch((error) => {
          console.error("Error saving calendar event to database:", error);
        });
    }
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
    
    // Update in database if authenticated and id is a real database ID
    if (isAuthenticated && user && !id.startsWith('event-')) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        apiRequest(`/api/calendar-events/${numericId}`, {
          method: 'PATCH',
          body: JSON.stringify(eventData)
        })
          .catch((error) => {
            console.error("Error updating calendar event in database:", error);
          });
      }
    }
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
    
    // Delete from database if authenticated and id is a real database ID
    if (isAuthenticated && user && !id.startsWith('event-')) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        apiRequest(`/api/calendar-events/${numericId}`, {
          method: 'DELETE',
        })
          .catch((error) => {
            console.error("Error deleting calendar event from database:", error);
          });
      }
    }
  };
  
  // Mission Pages Functions
  
  // Create a new mission page
  const createMissionPage = (mission: Omit<MissionPage, "id">): MissionPage => {
    // Generate temporary ID for optimistic update
    const tempId = `mission-${Date.now()}`;
    const newMissionPage: MissionPage = {
      ...mission,
      id: tempId,
    };
    
    // Optimistic update - add to local state immediately
    setMissionPages((prev) => [...prev, newMissionPage]);
    
    // Save to database if authenticated
    if (isAuthenticated && user) {
      apiRequest('/api/mission-pages', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          title: mission.title,
          slug: mission.slug,
          content: mission.content,
          completed: mission.completed || false,
          xpValue: mission.xpValue || 5,
          tags: mission.tags || [],
          eventId: mission.eventId ? parseInt(mission.eventId) : null,
          date: mission.date || null,
        })
      })
        .then((response) => response.json())
        .then((data) => {
          // Update the mission page with the real ID from the database
          // Server returns { page: { id, ... } } format
          const savedPage = data?.page;
          if (savedPage && savedPage.id) {
            setMissionPages((prev) => 
              prev.map((page) => 
                page.id === tempId ? { 
                  ...page, 
                  id: String(savedPage.id),
                  createdAt: savedPage.createdAt || page.createdAt,
                  updatedAt: savedPage.updatedAt || page.updatedAt,
                } : page
              )
            );
            console.log("Mission page saved to database:", savedPage.id);
          }
        })
        .catch((error) => {
          console.error("Error saving mission page to database:", error);
          // Keep the local version even if save fails
        });
    }
    
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
  const updateMissionPage = async (id: string, pageData: Partial<MissionPage>) => {
    // Return a promise that resolves when the mission page is updated
    return new Promise<void>((resolve, reject) => {
      setMissionPages((prev) => {
        const updated = prev.map((page) => 
          page.id === id ? { ...page, ...pageData, updatedAt: new Date().toISOString() } : page
        );
        
        return updated;
      });
      
      // Save to database if authenticated (don't wait for state update to call API)
      if (isAuthenticated && user) {
        apiRequest(`/api/mission-pages/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(pageData)
        })
          .then(() => {
            console.log("Mission page updated in database:", id);
            resolve();
          })
          .catch((error) => {
            console.error("Error updating mission page in database:", error);
            resolve(); // Still resolve since local state is updated
          });
      } else {
        // Wait for state update to complete if not authenticated
        setTimeout(() => resolve(), 0);
      }
      
      // Toast notification is optional here
    });
  };
  
  // Delete a mission page
  const deleteMissionPage = (id: string) => {
    // Find the page to show in toast
    const pageToDelete = missionPages.find(page => page.id === id);
    
    // Remove the page from local state
    setMissionPages((prev) => prev.filter(page => page.id !== id));
    
    // Delete from database if authenticated
    if (isAuthenticated && user) {
      apiRequest(`/api/mission-pages/${id}`, {
        method: 'DELETE'
      })
        .then(() => {
          console.log("Mission page deleted from database:", id);
        })
        .catch((error) => {
          console.error("Error deleting mission page from database:", error);
        });
    }
    
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
  
  // Helper to get or create a database conversation for a session
  const getOrCreateDbConversation = async (sessionId: string, title: string): Promise<number> => {
    // Check if we already have a database ID for this session
    if (sessionToDbIdMap[sessionId]) {
      return sessionToDbIdMap[sessionId];
    }
    
    // Create a new database conversation
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: "include",
      body: JSON.stringify({ title }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    
    const conversation = await response.json();
    const dbId = conversation.id;
    
    // Store the mapping
    setSessionToDbIdMap(prev => ({ ...prev, [sessionId]: dbId }));
    
    return dbId;
  };
  
  // Send a message in a specific chat session
  const sendMessageInSession = async (sessionId: string, content: string, imageIds?: number[]) => {
    await new Promise<void>(resolve => {
      const detail = { onComplete: resolve };
      window.dispatchEvent(new CustomEvent("nova-flush-pending-save", { detail }));
      setTimeout(resolve, 2000);
    });

    // Add user message immediately to UI
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
    
    try {
      // Get the session title for creating a new conversation if needed
      const session = chatSessions.find(s => s.id === sessionId);
      const title = session?.title || 'New Chat';
      
      // Get or create the database conversation
      const dbConversationId = await getOrCreateDbConversation(sessionId, title);
      
      const aiMessageId = `msg-ai-${Date.now()}`;
      let aiMessageAdded = false;
      let hasToolActions = false;
      
      // Make streaming API call to get AI response
      const response = await fetch(`/api/conversations/${dbConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        body: JSON.stringify({ content, imageIds }),
      });
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.toolAction) {
                  hasToolActions = true;
                  refetchQuests();
                  queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/events'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/vision-goals'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/user-stats'] });
                  if (data.toolAction?.action === 'update_daily_log') {
                    window.dispatchEvent(new CustomEvent("nova-daily-log-updated"));
                  }
                }
                
                if (data.content) {
                  fullContent += data.content;
                  
                  if (!aiMessageAdded) {
                    const aiMessage: AIMessage = {
                      id: aiMessageId,
                      sender: 'ai',
                      content: fullContent,
                      timestamp: new Date(),
                    };
                    
                    setChatSessions((prev) => 
                      prev.map((session) => {
                        if (session.id === sessionId) {
                          return {
                            ...session, 
                            messages: [...session.messages, aiMessage],
                            updatedAt: new Date()
                          };
                        }
                        return session;
                      })
                    );
                    
                    if (sessionId === activeChatSessionId) {
                      setMessages((prev) => [...prev, aiMessage]);
                    }
                    
                    aiMessageAdded = true;
                  } else {
                    setChatSessions((prev) => 
                      prev.map((session) => {
                        if (session.id === sessionId) {
                          return {
                            ...session,
                            messages: session.messages.map(msg => 
                              msg.id === aiMessageId 
                                ? { ...msg, content: fullContent }
                                : msg
                            ),
                            updatedAt: new Date()
                          };
                        }
                        return session;
                      })
                    );
                    
                    if (sessionId === activeChatSessionId) {
                      setMessages((prev) => 
                        prev.map(msg => 
                          msg.id === aiMessageId 
                            ? { ...msg, content: fullContent }
                            : msg
                        )
                      );
                    }
                  }
                }
                
                if (data.done && hasToolActions) {
                  refetchQuests();
                  queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/events'] });
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      // Add error message
      const errorMessage: AIMessage = {
        id: `msg-ai-error-${Date.now()}`,
        sender: 'ai',
        content: "I apologize, but I'm having trouble connecting right now. Please try again later.",
        timestamp: new Date(),
      };
      
      // Update chat session with error message
      setChatSessions((prev) => 
        prev.map((session) => {
          if (session.id === sessionId) {
            return {
              ...session, 
              messages: [...session.messages, errorMessage],
              updatedAt: new Date()
            };
          }
          return session;
        })
      );
      
      // Update legacy messages if this is the active session
      if (sessionId === activeChatSessionId) {
        setMessages((prev) => [...prev, errorMessage]);
      }
    }
  };
  
  // Create a new chat session and immediately activate it
  const createChatSession = (title: string): ChatSession => {
    const newChatSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setChatSessions((prev) => [...prev, newChatSession]);
    
    // Immediately set as active (bypasses lookup since state update is async)
    setActiveChatSessionId(newChatSession.id);
    setMessages([]);
    
    return newChatSession;
  };
  
  // Delete a chat session
  const deleteChatSession = async (id: string): Promise<boolean> => {
    // Delete from database FIRST if we have a database ID
    const dbId = sessionToDbIdMap[id];
    if (dbId) {
      try {
        const response = await fetch(`/api/conversations/${dbId}`, { method: 'DELETE', credentials: "include" });
        if (!response.ok) {
          console.error("Failed to delete conversation from database, status:", response.status);
          return false;
        }
        // Remove from map on success
        setSessionToDbIdMap((prev) => {
          const newMap = { ...prev };
          delete newMap[id];
          return newMap;
        });
      } catch (error) {
        console.error("Error deleting conversation from database:", error);
        return false;
      }
    }
    
    // Only update local state AFTER successful database deletion
    const isLastChat = chatSessions.length <= 1;
    
    // Check if this is the active session
    if (id === activeChatSessionId) {
      if (isLastChat) {
        // Create a new empty chat before deleting the last one
        const newChatSession: ChatSession = {
          id: `chat-${Date.now()}`,
          title: "New Chat",
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setChatSessions([newChatSession]);
        setActiveChatSessionId(newChatSession.id);
        setMessages([]);
      } else {
        // Find another session to make active
        const remainingChats = chatSessions.filter(chat => chat.id !== id);
        setActiveChatSessionId(remainingChats[0].id);
        
        // Update legacy messages array for backward compatibility
        setMessages(remainingChats[0].messages);
      }
    }
    
    // Remove the chat session from local state (skip if we already replaced the array for last chat)
    if (!isLastChat) {
      setChatSessions((prev) => prev.filter((chat) => chat.id !== id));
    }
    
    return true;
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
  };

  // Reset all daily tokens (energy, time, attention) when a new day is detected
  useEffect(() => {
    if (!user) return;

    const getLocalDateStr = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };

    let lastCheckedDate = getLocalDateStr();

    const checkForNewDay = async () => {
      const currentDate = getLocalDateStr();
      if (currentDate !== lastCheckedDate) {
        console.log("New day detected - syncing stats from server");
        lastCheckedDate = currentDate;
        setStats((prev) => ({
          ...prev,
          timeTokens: { ...prev.timeTokens, current: prev.timeTokens.max },
          attentionTokens: { ...prev.attentionTokens, current: prev.attentionTokens.max },
          energyPoints: { ...prev.energyPoints, current: prev.energyPoints.max },
        }));
        try {
          const res = await fetch(`/api/users/${user.id}/stats`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            if (data.stats) {
              setStats(data.stats);
            }
          }
        } catch (e) {
          console.log("Failed to sync stats after daily reset");
        }
      }
    };

    checkForNewDay();

    const interval = setInterval(checkForNewDay, 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForNewDay();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

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
  };

  const startMissionTimer = (quest: Quest) => {
    if (activeTimerQuest) return;
    setMissionElapsedTimes(prev => ({ ...prev, [quest.id]: 0 }));
    setMissionBreakTimes(prev => ({ ...prev, [quest.id]: 0 }));
    setTimerStartedAt(Date.now());
    setTimerPausedElapsed(0);
    setTimerIsPaused(false);
    setActiveTimerQuest(quest);
  };

  const resumeMissionTimer = (quest: Quest) => {
    if (activeTimerQuest) return;
    const prevElapsed = missionElapsedTimes[quest.id] || 0;
    const prevBreak = missionBreakTimes[quest.id] || 0;
    setTimerPausedElapsed(prevElapsed);
    setTimerStartedAt(Date.now());
    setTimerIsPaused(false);
    setBreakElapsed(prevBreak);
    setBreakStartedAt(null);
    setIsOnBreak(false);
    setActiveTimerQuest(quest);
  };

  const endMissionTimer = (elapsedSeconds: number) => {
    if (activeTimerQuest) {
      setMissionElapsedTimes(prev => ({ ...prev, [activeTimerQuest.id]: elapsedSeconds }));
      const currentBreak = breakStartedAt
        ? breakElapsed + Math.floor((Date.now() - breakStartedAt) / 1000)
        : breakElapsed;
      setMissionBreakTimes(prev => ({ ...prev, [activeTimerQuest.id]: currentBreak }));
    }
    setActiveTimerQuest(null);
    setTimerStartedAt(null);
    setTimerPausedElapsed(0);
    setTimerIsPaused(false);
    setIsOnBreak(false);
    setBreakStartedAt(null);
    setBreakElapsed(0);
  };

  const restartMissionTimer = (questId?: string) => {
    const id = questId ?? activeTimerQuest?.id;
    if (!id) return;
    setMissionElapsedTimes(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMissionBreakTimes(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeTimerQuest?.id === id) {
      setActiveTimerQuest(null);
      setTimerStartedAt(null);
      setTimerPausedElapsed(0);
      setTimerIsPaused(false);
      setIsOnBreak(false);
      setBreakStartedAt(null);
      setBreakElapsed(0);
    }
  };

  const pauseResumeTimer = () => {
    if (!activeTimerQuest) return;
    if (isOnBreak) {
      const currentBreakElapsed = breakStartedAt
        ? breakElapsed + Math.floor((Date.now() - breakStartedAt) / 1000)
        : breakElapsed;
      setBreakElapsed(currentBreakElapsed);
      setBreakStartedAt(null);
      setIsOnBreak(false);
      setTimerStartedAt(Date.now());
      setTimerIsPaused(false);
    } else if (timerStartedAt) {
      const elapsed = timerPausedElapsed + Math.floor((Date.now() - timerStartedAt) / 1000);
      setTimerPausedElapsed(elapsed);
      setTimerStartedAt(null);
      setTimerIsPaused(true);
      setIsOnBreak(true);
      setBreakStartedAt(Date.now());
    }
  };

  return (
    <LYFEOSContext.Provider
      value={{
        stats,
        quests,
        userProfile,
        messages,
        events,
        missionPages,
        chatSessions,
        kanbanTasks,
        kanbanBoards,
        activeChatSessionId,
        toggleQuestCompletion,
        createQuest,
        updateQuest,
        deleteQuest,
        refetchQuests,
        sendMessage,
        sendMessageInSession,
        username,
        setUsername,
        aiCompanionName,
        setAICompanionName,
        aiPanelOpen,
        setAIPanelOpen,
        sidebarCollapsed,
        setSidebarCollapsed,
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
        // Energy log state and functions
        energyLog,
        updateEnergyLog,
        resetEnergyLog,
        intentionLog,
        updateIntentionLog,
        resetIntentionLog,
        dataLog,
        updateDataLog,
        resetDataLog,
        reflectionLog,
        updateReflectionLog,
        resetReflectionLog,
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
        moveKanbanTask,
        activeTimerQuest,
        missionElapsedTimes,
        missionBreakTimes,
        timerStartedAt,
        timerPausedElapsed,
        timerIsPaused,
        isOnBreak,
        breakStartedAt,
        breakElapsed,
        startMissionTimer,
        resumeMissionTimer,
        endMissionTimer,
        restartMissionTimer,
        pauseResumeTimer,
        statTips,
        statTipsLoading,
        computedStats
      }}
    >
      {children}
    </LYFEOSContext.Provider>
  );
}

// Custom hook to use the context
export const useLYFEOS = () => {
  const context = useContext(LYFEOSContext);
  if (context === undefined) {
    throw new Error("useLYFEOS must be used within a LYFEOSProvider");
  }
  return context;
}


