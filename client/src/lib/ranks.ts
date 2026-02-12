export interface Rank {
  name: string;
  minLevel: number;
  color: string;
  icon: string;
}

export const RANKS: Rank[] = [
  { name: "Novice", minLevel: 1, color: "#9ca3af", icon: "" },
  { name: "Apprentice", minLevel: 5, color: "#34d399", icon: "" },
  { name: "Warrior", minLevel: 10, color: "#60a5fa", icon: "" },
  { name: "Elite", minLevel: 20, color: "#a78bfa", icon: "" },
  { name: "Veteran", minLevel: 30, color: "#fbbf24", icon: "" },
  { name: "Master", minLevel: 40, color: "#f97316", icon: "" },
  { name: "Champion", minLevel: 50, color: "#ef4444", icon: "" },
  { name: "Legend", minLevel: 60, color: "#ec4899", icon: "" },
  { name: "Mythic", minLevel: 70, color: "#22d3ee", icon: "" },
  { name: "Transcendent", minLevel: 80, color: "#10b981", icon: "" },
  { name: "Sovereign", minLevel: 90, color: "#f43f5e", icon: "" },
  { name: "Monarch", minLevel: 100, color: "#FFD700", icon: "" },
];

export function getRank(level: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (level >= RANKS[i].minLevel) {
      return RANKS[i];
    }
  }
  return RANKS[0];
}

export function getNextRank(level: number): Rank | null {
  const currentRank = getRank(level);
  const currentIndex = RANKS.indexOf(currentRank);
  if (currentIndex < RANKS.length - 1) {
    return RANKS[currentIndex + 1];
  }
  return null;
}

export function getLevelsToNextRank(level: number): number {
  const nextRank = getNextRank(level);
  if (!nextRank) return 0;
  return nextRank.minLevel - level;
}
