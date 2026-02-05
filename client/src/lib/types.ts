export interface UserStats {
  attentionTokens: {
    current: number;
    max: number;
  };
  timeTokens: {
    current: number;
    max: number;
  };
  energyPoints: {
    current: number;
    max: number;
  };
  healthPoints: {
    current: number;
    max: number;
  };
  experience: {
    current: number;
    max: number;
    level: number;
    totalXP?: number; // Total accumulated XP for the new system
    showLevelUp?: boolean; // Flag to trigger level-up animation
  };
  streakDays: number;
  efficiencyScore: number;
  aiAssistantName?: string;
  
  // System settings
  notificationsEnabled?: boolean;
  darkThemeEnabled?: boolean;
  autoSyncEnabled?: boolean;
  aiAssistantEnabled?: boolean;
  primaryColor?: string;
}

export interface QuestNotification {
  date: string; // format: "YYYY-MM-DD"
  time: string; // format: "HH:MM"
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  category?: string;
  completed: boolean;
  completedAt?: string | null;
  energyCost: number;
  attentionCost?: number;
  timeCost?: number;
  experienceReward: number;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  dueDate?: string | null;
  notificationEnabled?: boolean;
  notificationTime?: string | null;
  notifications?: QuestNotification[];
}

export interface AIMessage {
  id: string;
  sender: "ai" | "user";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: AIMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string; // format: "HH:MM"
  duration: string;
  category: "work" | "personal" | "health";
  date: string; // format: "YYYY-MM-DD"
}

export interface MissionPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  xpValue: number;
  tags: string[];
  eventId?: string; // Reference to the original calendar event if applicable
  date?: string; // format: "YYYY-MM-DD" - used for filtering by day
}

export type StatType = "attention" | "time" | "energy" | "health" | "experience" | "streak" | "efficiency";

export type KanbanStatus = "backlog" | "inProgress" | "review" | "done";

export interface KanbanBoard {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  columns: KanbanColumn[];
}

export interface KanbanColumn {
  id: string;
  title: string;
  status: KanbanStatus;
  order: number;
  boardId: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
  startDate?: string; // Optional start date
  dueDate?: string;   // Optional due date
  tags: string[];
  boardId: string;     // Reference to the board this task belongs to
}
