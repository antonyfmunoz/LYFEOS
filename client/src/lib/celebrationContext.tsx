import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type CelebrationType = "mission_complete" | "level_up";

export interface CelebrationEvent {
  type: CelebrationType;
  title?: string;
  xp?: number;
  level?: number;
  rankName?: string;
  rankColor?: string;
  rankIcon?: string;
}

interface CelebrationContextType {
  celebration: CelebrationEvent | null;
  triggerCelebration: (event: CelebrationEvent) => void;
  clearCelebration: () => void;
}

const CelebrationContext = createContext<CelebrationContextType>({
  celebration: null,
  triggerCelebration: () => {},
  clearCelebration: () => {},
});

export function useCelebration() {
  return useContext(CelebrationContext);
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);

  const triggerCelebration = useCallback((event: CelebrationEvent) => {
    setCelebration(event);
  }, []);

  const clearCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  return (
    <CelebrationContext.Provider value={{ celebration, triggerCelebration, clearCelebration }}>
      {children}
    </CelebrationContext.Provider>
  );
}
