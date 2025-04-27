/**
 * LYFEOS XP and Level Calculation Utilities
 * 
 * These functions manage the exponential XP scaling system with different growth rates:
 * - Levels 1-10: Light growth curve (1.0372 multiplier)
 * - Levels 11-50: Moderate growth curve (1.0572 multiplier)
 * - Levels 51-100: Steep growth curve (1.0872 multiplier)
 * 
 * This implements the system where:
 * - Level 1 requires 1,000 XP (10 hours equivalent)
 * - Level 100 requires 10,000,000 XP (100,000 hours equivalent)
 */

// Base XP for Level 1
const BASE_XP_LEVEL_1 = 1000;

// XP multipliers for different level ranges
const MULTIPLIER_TIER_1 = 1.0372; // Levels 1-10
const MULTIPLIER_TIER_2 = 1.0572; // Levels 11-50
const MULTIPLIER_TIER_3 = 1.0872; // Levels 51-100

// Cached XP requirements to avoid recalculation
const xpRequirementsCache = new Map<number, number>();

/**
 * Calculates the XP needed for a specific level
 * @param level The target level
 * @returns The amount of XP needed to reach this level from the previous one
 */
export function calculateXpForLevel(level: number): number {
  // Check cache first
  if (xpRequirementsCache.has(level)) {
    return xpRequirementsCache.get(level)!;
  }
  
  // Level 1 is our base case
  if (level === 1) {
    const xpNeeded = BASE_XP_LEVEL_1;
    xpRequirementsCache.set(level, xpNeeded);
    return xpNeeded;
  }
  
  // Choose multiplier based on level tier
  let multiplier: number;
  if (level <= 10) {
    multiplier = MULTIPLIER_TIER_1;
  } else if (level <= 50) {
    multiplier = MULTIPLIER_TIER_2;
  } else {
    multiplier = MULTIPLIER_TIER_3;
  }
  
  // Get XP for previous level and apply multiplier
  const prevLevelXp = calculateXpForLevel(level - 1);
  const xpNeeded = Math.round(prevLevelXp * multiplier);
  
  // Cache and return
  xpRequirementsCache.set(level, xpNeeded);
  return xpNeeded;
}

/**
 * Calculates the total XP needed to reach a specific level
 * @param level The target level
 * @returns The total cumulative XP needed to reach this level from level 0
 */
export function calculateTotalXpForLevel(level: number): number {
  let totalXp = 0;
  for (let i = 1; i <= level; i++) {
    totalXp += calculateXpForLevel(i);
  }
  return totalXp;
}

/**
 * Determines the level based on total XP accumulated
 * @param totalXp The total accumulated XP
 * @returns The current level and XP progress toward the next level
 */
export function calculateLevelFromXp(totalXp: number): { 
  level: number; 
  currentLevelXp: number; 
  nextLevelXp: number;
  progress: number;
  totalXp: number;
} {
  let level = 0;
  let cumulativeXp = 0;
  let previousCumulativeXp = 0;
  
  // Find the highest level the user has fully completed
  while (true) {
    const nextLevelXp = calculateXpForLevel(level + 1);
    if (cumulativeXp + nextLevelXp > totalXp) {
      break;
    }
    
    previousCumulativeXp = cumulativeXp;
    cumulativeXp += nextLevelXp;
    level++;
    
    // Cap at level 100 as a safety measure
    if (level >= 100) {
      break;
    }
  }
  
  // Calculate XP progress in current level
  const currentLevelXp = totalXp - previousCumulativeXp;
  const nextLevelXp = calculateXpForLevel(level + 1);
  const progress = currentLevelXp / nextLevelXp;
  
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progress,
    totalXp
  };
}

/**
 * Adds XP to a user's total and calculates new level information
 * @param currentTotalXp The current total XP
 * @param xpToAdd The amount of XP to add
 * @returns Updated level information including whether a level-up occurred
 */
export function awardExperiencePoints(currentTotalXp: number, xpToAdd: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  totalXp: number;
  leveledUp: boolean;
  levelsGained: number;
} {
  // Get current level info
  const currentLevelInfo = calculateLevelFromXp(currentTotalXp);
  
  // Calculate new total XP
  const newTotalXp = currentTotalXp + xpToAdd;
  
  // Calculate new level info
  const newLevelInfo = calculateLevelFromXp(newTotalXp);
  
  // Check if level up occurred
  const leveledUp = newLevelInfo.level > currentLevelInfo.level;
  const levelsGained = newLevelInfo.level - currentLevelInfo.level;
  
  return {
    ...newLevelInfo,
    leveledUp,
    levelsGained
  };
}

/**
 * Pre-calculate and cache XP requirements for all levels
 * This should be called during app initialization to improve performance
 */
export function initializeXpCache(): void {
  for (let i = 1; i <= 100; i++) {
    calculateXpForLevel(i);
    calculateTotalXpForLevel(i);
  }
}