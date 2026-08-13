export type ProgressionRank = {
  key: string;
  name: string;
  minLevel: number;
  color: string;
  icon: string;
};

// Rank communicates a sustained execution record inside LyfeOS. It is never a
// claim of a person's worth or of externally certified competence.
export const PROGRESSION_RANKS: readonly ProgressionRank[] = [
  { key: "novice", name: "Novice", minLevel: 1, color: "#9ca3af", icon: "" },
  { key: "apprentice", name: "Apprentice", minLevel: 5, color: "#34d399", icon: "" },
  { key: "warrior", name: "Warrior", minLevel: 10, color: "#60a5fa", icon: "" },
  { key: "elite", name: "Elite", minLevel: 20, color: "#a78bfa", icon: "" },
  { key: "veteran", name: "Veteran", minLevel: 30, color: "#fbbf24", icon: "" },
  { key: "master", name: "Master", minLevel: 40, color: "#f97316", icon: "" },
  { key: "champion", name: "Champion", minLevel: 50, color: "#ef4444", icon: "" },
  { key: "legend", name: "Legend", minLevel: 60, color: "#ec4899", icon: "" },
  { key: "mythic", name: "Mythic", minLevel: 70, color: "#22d3ee", icon: "" },
  { key: "transcendent", name: "Transcendent", minLevel: 80, color: "#10b981", icon: "" },
  { key: "sovereign", name: "Sovereign", minLevel: 90, color: "#f43f5e", icon: "" },
  { key: "monarch", name: "Monarch", minLevel: 100, color: "#FFD700", icon: "" },
] as const;

export function getProgressionRank(level: number): ProgressionRank {
  for (let index = PROGRESSION_RANKS.length - 1; index >= 0; index -= 1) {
    const candidate = PROGRESSION_RANKS[index];
    if (level >= candidate.minLevel) return candidate;
  }
  return PROGRESSION_RANKS[0];
}

export function missionExperience(reward: number, difficulty?: string | null): number {
  const multipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  return Math.floor(Math.max(0, reward || 0) * (multipliers[difficulty || "D"] || 1));
}
