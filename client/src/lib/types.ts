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
  };
  streakDays: number;
  efficiencyScore: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  energyCost: number;
  experienceReward: number;
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
}

export type StatType = "attention" | "time" | "energy" | "health" | "experience" | "streak" | "efficiency";

export interface DashboardWidget {
  id: string;
  type: 'stats' | 'missions' | 'calendar' | 'markdown' | 'time' | 'weather' | 'custom';
  title: string;
  content?: any;
  x: number;
  y: number;
  w: number;
  h: number;
  isResizable?: boolean;
  isDraggable?: boolean;
  static?: boolean;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  isDefault?: boolean;
}
