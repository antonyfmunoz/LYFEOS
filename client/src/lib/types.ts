export interface UserStats {
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

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string; // format: "HH:MM"
  duration: string;
  category: "work" | "personal" | "health";
}

export type StatType = "time" | "energy" | "health" | "experience";
