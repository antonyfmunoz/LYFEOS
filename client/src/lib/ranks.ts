import { getProgressionRank, PROGRESSION_RANKS, type ProgressionRank } from "@shared/progression";

export type Rank = ProgressionRank;
export const RANKS: readonly Rank[] = PROGRESSION_RANKS;

export function getRank(level: number): Rank {
  return getProgressionRank(level);
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
