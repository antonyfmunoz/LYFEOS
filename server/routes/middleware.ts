import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { logger } from "../utils";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
};

export const isOwner = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const requestedUserId = parseInt(req.params.userId);
  if (isNaN(requestedUserId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }
  
  if (req.session.userId !== requestedUserId) {
    return res.status(403).json({ error: "Not authorized to access this data" });
  }
  
  return next();
};

function calculateXPForLevel(level: number): number {
  if (level <= 1) return 1000;
  
  if (level <= 10) {
    return Math.floor(1000 * Math.pow(1.0372, level - 1));
  } else if (level <= 50) {
    const level10XP = calculateXPForLevel(10);
    return Math.floor(level10XP * Math.pow(1.0572, level - 10));
  } else {
    const level50XP = calculateXPForLevel(50);
    return Math.floor(level50XP * Math.pow(1.0872, level - 50));
  }
}

export function calculateTotalXPForLevel(level: number): number {
  if (level <= 1) return 0;
  
  let totalXP = 0;
  for (let i = 1; i < level; i++) {
    totalXP += calculateXPForLevel(i);
  }
  
  return totalXP;
}

export function calculateLevelFromTotalXP(totalXP: number): { 
  level: number; 
  current: number; 
  max: number; 
} {
  let level = 1;
  
  while (calculateTotalXPForLevel(level + 1) <= totalXP) {
    level++;
    if (level >= 100) break;
  }
  
  const xpForThisLevel = calculateTotalXPForLevel(level);
  const xpForNextLevel = calculateTotalXPForLevel(level + 1);
  const current = totalXP - xpForThisLevel;
  const max = xpForNextLevel - xpForThisLevel;
  
  return { level, current, max };
}

export function calculateMissionCosts(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null
): { attentionCost: number; timeCost: number; energyCost: number } {
  if (!startDate || !startTime || !endDate || !endTime) {
    return { attentionCost: 1, timeCost: 1, energyCost: 1 };
  }
  
  try {
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startDateTime = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, 0, 0);
    const endDateTime = new Date(endYear, endMonth - 1, endDay, endHour, endMinute, 0, 0);
    
    const durationMs = endDateTime.getTime() - startDateTime.getTime();
    const durationMinutes = Math.max(0, Math.floor(durationMs / (1000 * 60)));
    
    const timeCost = durationMinutes;
    const attentionCost = durationMinutes;
    const energyCost = durationMinutes > 0 ? durationMinutes : 1;
    
    return { attentionCost, timeCost, energyCost };
  } catch (error) {
    logger.error("Error calculating mission costs:", error);
    return { attentionCost: 1, timeCost: 1, energyCost: 1 };
  }
}

export async function awardExperiencePoints(
  userId: number, 
  amount: number
): Promise<{ 
  success: boolean; 
  newStats?: { 
    experience: { 
      current: number; 
      max: number; 
      level: number; 
    } 
  }; 
  levelUp: boolean;
  totalXP?: number;
}> {
  try {
    logger.debug(`[awardExperiencePoints] Getting stats for user ${userId}`);
    const userStats = await storage.getUserStats(userId);
    const userProfile = await storage.getUserProfile(userId);
    
    if (!userStats || !userProfile) {
      logger.error(`[awardExperiencePoints] No stats or profile found for user ${userId}`);
      return { success: false, levelUp: false };
    }
    
    const oldTotalXP = userProfile.totalXP || 0;
    const newTotalXP = oldTotalXP + amount;
    
    const oldLevelInfo = calculateLevelFromTotalXP(oldTotalXP);
    const newLevelInfo = calculateLevelFromTotalXP(newTotalXP);
    
    const didLevelUp = newLevelInfo.level > oldLevelInfo.level;
    
    if (didLevelUp) {
      logger.debug(`[awardExperiencePoints] User ${userId} leveled up from ${oldLevelInfo.level} to ${newLevelInfo.level}!`);
    }
    
    logger.debug(`[awardExperiencePoints] New stats for user ${userId}:`, {
      totalXP: newTotalXP,
      level: newLevelInfo.level,
      current: newLevelInfo.current,
      max: newLevelInfo.max
    });
    
    await storage.updateUserProfile(userId, {
      totalXP: newTotalXP
    });
    
    const updatedStats = await storage.updateUserStats(userId, {
      experienceCurrent: newLevelInfo.current,
      experienceMax: newLevelInfo.max,
      level: newLevelInfo.level
    });
    
    return { 
      success: true,
      newStats: {
        experience: {
          current: updatedStats.experienceCurrent,
          max: updatedStats.experienceMax,
          level: updatedStats.level
        }
      },
      levelUp: didLevelUp,
      totalXP: newTotalXP
    };
  } catch (error) {
    logger.error("Error awarding XP:", error);
    return { success: false, levelUp: false };
  }
}
