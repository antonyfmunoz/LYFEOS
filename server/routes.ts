import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, desc, and, gte, asc, sql, inArray, isNotNull } from "drizzle-orm";
import { userDailyLogs, quests as questsTable, userStats, users } from "@shared/schema";
import { registerChatRoutes } from "./replit_integrations/chat";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { sendVerificationEmail, sendPasswordResetEmail, send2FAVerificationEmail, send2FAVerificationSMS } from "./email";
import webpush from "web-push";
import { sendPushToUser } from "./notificationScheduler";
import { stripeService } from "./stripeService";
import { getStripePublishableKey } from "./stripeClient";
import { 
  insertUserSchema, 
  insertQuestSchema, 
  insertAIMessageSchema, 
  insertCalendarEventSchema,
  insertMissionPageSchema,
  insertContactSchema,
  insertSpreadsheetSchema,
  insertCanvasSchema,
  insertGraphSchema,
  insertFolderSchema,
  insertDocumentSchema,
  insertTemplateSchema,
  insertMediaItemSchema,
  insertMediaAlbumSchema,
  MediaItem,
  InsertMediaItem,
  Quest
} from "@shared/schema";

// Extend Request type to include session
declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
};

// Helper functions for XP calculations
/**
 * Calculate the XP required for a given level based on the exponential growth curve
 * @param level The level to calculate XP for
 * @returns The XP required for this level
 */
function calculateXPForLevel(level: number): number {
  // Base XP for level 1 is 1000
  if (level <= 1) return 1000;
  
  // Calculate based on which tier the level falls into
  if (level <= 10) {
    // Tier 1 (Levels 1-10): Lighter growth rate - ~3.72% per level
    return Math.floor(1000 * Math.pow(1.0372, level - 1));
  } else if (level <= 50) {
    // Tier 2 (Levels 11-50): Moderate growth rate - ~5.72% per level
    // Get the XP at level 10, then apply multiplier from there
    const level10XP = calculateXPForLevel(10);
    return Math.floor(level10XP * Math.pow(1.0572, level - 10));
  } else {
    // Tier 3 (Levels 51-100): Steep growth rate - ~8.72% per level
    // Get the XP at level 50, then apply multiplier from there
    const level50XP = calculateXPForLevel(50);
    return Math.floor(level50XP * Math.pow(1.0872, level - 50));
  }
}

/**
 * Calculate the total XP required to reach a given level
 * @param level The level to calculate total XP for
 * @returns The cumulative XP required to reach this level
 */
function calculateTotalXPForLevel(level: number): number {
  if (level <= 1) return 0; // No XP needed for level 1
  
  let totalXP = 0;
  // Sum up the XP required for each level
  for (let i = 1; i < level; i++) {
    totalXP += calculateXPForLevel(i);
  }
  
  return totalXP;
}

/**
 * Calculate level and progress based on total XP
 * @param totalXP The user's total XP
 * @returns Object with level, current and max XP
 */
function calculateLevelFromTotalXP(totalXP: number): { 
  level: number; 
  current: number; 
  max: number; 
} {
  // Start at level 1
  let level = 1;
  
  // Keep incrementing level until we find the right one
  while (calculateTotalXPForLevel(level + 1) <= totalXP) {
    level++;
    
    // Prevent infinite loops by stopping at level 100
    if (level >= 100) break;
  }
  
  // Calculate current XP within this level
  const xpForThisLevel = calculateTotalXPForLevel(level);
  const xpForNextLevel = calculateTotalXPForLevel(level + 1);
  const current = totalXP - xpForThisLevel;
  const max = xpForNextLevel - xpForThisLevel;
  
  return { level, current, max };
}

/**
 * Calculate attention and time costs based on mission duration
 * @param startDate Start date string (YYYY-MM-DD)
 * @param startTime Start time string (HH:mm)
 * @param endDate End date string (YYYY-MM-DD)
 * @param endTime End time string (HH:mm)
 * @returns Object with attentionCost and timeCost
 */
function calculateMissionCosts(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null
): { attentionCost: number; timeCost: number; energyCost: number } {
  if (!startDate || !startTime || !endDate || !endTime) {
    return { attentionCost: 1, timeCost: 1, energyCost: 1 };
  }
  
  try {
    // Parse dates using local Date constructor with explicit components
    // This ensures correct calendar math across month/year boundaries
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    // Create Date objects in local time (month is 0-indexed in JS Date)
    const startDateTime = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, 0, 0);
    const endDateTime = new Date(endYear, endMonth - 1, endDay, endHour, endMinute, 0, 0);
    
    // Calculate duration in minutes using proper Date arithmetic
    const durationMs = endDateTime.getTime() - startDateTime.getTime();
    const durationMinutes = Math.max(0, Math.floor(durationMs / (1000 * 60)));
    
    // All tokens = 1 per minute of duration
    const timeCost = durationMinutes;
    const attentionCost = durationMinutes;
    const energyCost = durationMinutes > 0 ? durationMinutes : 1;
    
    return { attentionCost, timeCost, energyCost };
  } catch (error) {
    console.error("Error calculating mission costs:", error);
    return { attentionCost: 1, timeCost: 1, energyCost: 1 };
  }
}

// Helper function to award XP
async function awardExperiencePoints(
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
    // Get current user stats and profile
    console.log(`[awardExperiencePoints] Getting stats for user ${userId}`);
    const userStats = await storage.getUserStats(userId);
    const userProfile = await storage.getUserProfile(userId);
    
    if (!userStats || !userProfile) {
      console.error(`[awardExperiencePoints] No stats or profile found for user ${userId}`);
      return { success: false, levelUp: false };
    }
    
    // Calculate new total XP
    const oldTotalXP = userProfile.totalXP || 0;
    const newTotalXP = oldTotalXP + amount;
    
    // Get old level info
    const oldLevelInfo = calculateLevelFromTotalXP(oldTotalXP);
    
    // Get new level info
    const newLevelInfo = calculateLevelFromTotalXP(newTotalXP);
    
    // Determine if user leveled up
    const didLevelUp = newLevelInfo.level > oldLevelInfo.level;
    
    if (didLevelUp) {
      console.log(`[awardExperiencePoints] User ${userId} leveled up from ${oldLevelInfo.level} to ${newLevelInfo.level}!`);
    }
    
    console.log(`[awardExperiencePoints] New stats for user ${userId}:`, {
      totalXP: newTotalXP,
      level: newLevelInfo.level,
      current: newLevelInfo.current,
      max: newLevelInfo.max
    });
    
    // Update user profile with new total XP
    await storage.updateUserProfile(userId, {
      totalXP: newTotalXP
    });
    
    // Update user stats with new level info
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
    console.error("Error awarding XP:", error);
    return { success: false, levelUp: false };
  }
}

// Middleware to check if user is accessing their own data
const isOwner = (req: Request, res: Response, next: NextFunction) => {
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

export async function registerRoutes(app: Express): Promise<Server> {
  // USER ROUTES
  app.get("/api/auth/check-email", async (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      if (!email || !z.string().email().safeParse(email).success) {
        return res.status(400).json({ available: false, error: "Invalid email" });
      }
      const existing = await storage.getUserByEmail(email.trim());
      return res.json({ available: !existing });
    } catch (error) {
      console.error("Error checking email:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/complete-registration", async (req: Request, res: Response) => {
    try {
      const { email, password, username, firstName, lastName, avatarColor, birthday, location, timezone, termsAccepted } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (!z.string().email().safeParse(email).success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      if (!username || username.trim().length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(username.trim());
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || username.trim();
      const user = await storage.createUser({
        username: username.trim(),
        password: hashedPassword,
        displayName,
        firstName: firstName || null,
        lastName: lastName || null,
        title: "COMMANDER",
        email,
        authProvider: 'email',
        termsAccepted: termsAccepted || false
      });

      await storage.createUserStats({
        userId: user.id,
        experienceCurrent: 0,
        experienceMax: 1000,
        level: 1,
        timeTokensCurrent: 100,
        timeTokensMax: 100,
        energyPointsCurrent: 100,
        energyPointsMax: 100,
        healthPointsCurrent: 100,
        healthPointsMax: 100,
        attentionTokensCurrent: 100,
        attentionTokensMax: 100,
        streakDays: 0,
        efficiencyScore: 0,
        aiAssistantName: "NOVA",
        primaryColor: avatarColor || "#00e0ff"
      });

      await storage.upsertUserProfile(user.id, {
        startStage: "beginner",
        targetArchetype: "architect",
        flowStyle: "hyperfocus",
        coreMotivation: "growth",
        setupMissionStatus: "not_started",
        primaryThemeColor: "#ffe03d",
        onboardingCompleted: false
      });

      await storage.createUserIntegration({
        userId: user.id,
        appleHealthConnected: false,
        googleCalendarConnected: false,
        notionConnected: false
      });

      const today = new Date().toISOString().split('T')[0];
      await storage.createUserDailyLog({
        userId: user.id,
        date: today,
        yesterdayXp: 0,
        todayPrimaryMission: "Get started with LYFEOS",
        optionalBoostsShown: false
      });

      if (email) {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await storage.setEmailVerificationToken(user.id, verificationToken, expiry);
        sendVerificationEmail(email, verificationToken, firstName).catch(err => {
          console.error("Failed to send verification email:", err);
        });
      }

      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);

      return res.status(201).json({ user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      console.log("Register attempt:", { email: req.body.email });
      
      const userData = {
        ...req.body,
        title: "COMMANDER"
      };
      
      if (!userData.email || !userData.password) {
        console.log("Register failed: Missing email or password");
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      if (!z.string().email().safeParse(userData.email).success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        console.log("Register failed: Email already exists");
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      if (userData.username) {
        const existingUser = await storage.getUserByUsername(userData.username);
        if (existingUser) {
          console.log("Register failed: Username already exists");
          return res.status(400).json({ error: "Username already exists" });
        }
      }
      
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      console.log("Creating new user with email:", userData.email);
      const user = await storage.createUser({
        username: userData.username || null,
        password: hashedPassword,
        displayName: userData.displayName || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        title: userData.title,
        email: userData.email,
        authProvider: userData.authProvider || 'email',
        termsAccepted: userData.termsAccepted || false
      });
      
      console.log("User created successfully with ID:", user.id);
      
      // Create initial user stats
      console.log("Creating initial stats for user:", user.id);
      await storage.createUserStats({
        userId: user.id,
        experienceCurrent: 0,
        experienceMax: 1000,
        level: 1,
        timeTokensCurrent: 100,
        timeTokensMax: 100,
        energyPointsCurrent: 100,
        energyPointsMax: 100,
        healthPointsCurrent: 100,
        healthPointsMax: 100,
        attentionTokensCurrent: 100,
        attentionTokensMax: 100,
        streakDays: 0,
        efficiencyScore: 0,
        aiAssistantName: "NOVA",
        primaryColor: userData.avatarColor || "#00e0ff"
      });
      
      // Create or update user profile (using upsert to handle race conditions)
      console.log("Creating user profile for new user:", user.id);
      await storage.upsertUserProfile(user.id, {
        startStage: "beginner",
        targetArchetype: "architect",
        flowStyle: "hyperfocus",
        coreMotivation: "growth",
        setupMissionStatus: "not_started",
        primaryThemeColor: "#ffe03d",
        onboardingCompleted: false
      });
      
      // Create user integrations
      console.log("Creating user integrations for new user:", user.id);
      await storage.createUserIntegration({
        userId: user.id,
        appleHealthConnected: false,
        googleCalendarConnected: false,
        notionConnected: false
      });
      
      // Create user daily logs
      console.log("Creating initial daily logs for new user:", user.id);
      const today = new Date().toISOString().split('T')[0];
      await storage.createUserDailyLog({
        userId: user.id,
        date: today,
        yesterdayXp: 0,
        todayPrimaryMission: "Get started with LYFEOS",
        optionalBoostsShown: false
      });
      
      if (userData.email) {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await storage.setEmailVerificationToken(user.id, verificationToken, expiry);
        sendVerificationEmail(userData.email, verificationToken, userData.firstName).catch(err => {
          console.error("Failed to send verification email:", err);
        });
      }

      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      console.log("Registration successful, session created for user:", user.id);
      
      return res.status(201).json({ user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/check-username", async (req: Request, res: Response) => {
    try {
      const username = req.query.username as string;
      if (!username || username.trim().length < 3) {
        return res.status(400).json({ available: false, error: "Username must be at least 3 characters" });
      }
      const existing = await storage.getUserByUsername(username.trim());
      return res.json({ available: !existing });
    } catch (error) {
      console.error("Error checking username:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/auth/set-username", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { username, firstName, lastName } = req.body;

      if (!username || username.trim().length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      const existing = await storage.getUserByUsername(username.trim());
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || username.trim();
      const updatedUser = await storage.updateUser(userId, {
        username: username.trim(),
        displayName,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      req.session.username = updatedUser.username || updatedUser.email || String(updatedUser.id);

      const { password, ...userData } = updatedUser;
      return res.json(userData);
    } catch (error) {
      console.error("Error setting username:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/geo/location", async (req: Request, res: Response) => {
    try {
      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip;
      
      const apis = [
        {
          url: `http://ip-api.com/json/${clientIp}?fields=city,regionName,country`,
          parse: (data: any) => ({
            city: data.city,
            region: data.regionName,
            country: data.country,
            location: [data.city, data.regionName, data.country].filter(Boolean).join(", ")
          })
        },
        {
          url: `https://ipapi.co/${clientIp}/json/`,
          parse: (data: any) => ({
            city: data.city,
            region: data.region,
            country: data.country_name,
            location: [data.city, data.region, data.country_name].filter(Boolean).join(", ")
          })
        }
      ];

      for (const api of apis) {
        try {
          const response = await fetch(api.url);
          if (!response.ok) continue;
          const data = await response.json();
          const result = api.parse(data);
          if (result.location) return res.json(result);
        } catch {}
      }

      return res.status(502).json({ error: "Failed to detect location" });
    } catch (error) {
      console.error("Geo location error:", error);
      return res.status(500).json({ error: "Failed to detect location" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      // Accept either 'username' or 'identifier' field for backward compatibility
      const identifier = req.body.identifier || req.body.username;
      const { password } = req.body;
      console.log("Login attempt:", { identifier });
      
      if (!identifier || !password) {
        console.log("Login failed: Missing identifier or password");
        return res.status(400).json({ error: "Username or email and password are required" });
      }
      
      // Find user by username or email
      const user = await storage.getUserByIdentifier(identifier);
      if (!user) {
        console.log("Login failed: User not found");
        return res.status(401).json({ error: "Invalid credentials. Please check your username/email and password, or register a new account." });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log("Login failed: Invalid password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      console.log("Login successful for user ID:", user.id);
      
      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      // Process daily stats (streak, health)
      const { streakDays, isNewDay } = await storage.processLoginStreak(user.id);
      if (isNewDay) {
        await storage.processDailyHealthUpdate(user.id);
        console.log("New day detected - updated streak and health for user:", user.username);
      }

      storage.logActivityEvent(user.id, 'login').catch(() => {});
      storage.initDefaultReminders(user.id).catch(() => {});
      
      // Check if user has completed onboarding
      const userProfile = await storage.getUserProfile(user.id);
      const isNewUser = !userProfile || !userProfile.onboardingCompleted;
      
      // Fetch primaryColor from user stats so the client can apply it before rendering
      const userStats = await storage.getUserStats(user.id);
      
      return res.status(200).json({ 
        user: { id: user.id, username: user.username },
        isNewUser: isNewUser,
        primaryColor: userStats?.primaryColor || "#00e0ff"
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ error: "Invalid verification token" });
      }
      const user = await storage.verifyEmail(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification link" });
      }
      return res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/resend-verification", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.emailVerified) return res.json({ message: "Email already verified" });
      if (!user.email) return res.status(400).json({ error: "No email address on file" });

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.setEmailVerificationToken(userId, verificationToken, expiry);
      const sent = await sendVerificationEmail(user.email, verificationToken, user.firstName || undefined);
      if (!sent) return res.status(500).json({ error: "Failed to send verification email" });
      return res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!z.string().email().safeParse(email).success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await storage.setPasswordResetToken(user.id, resetToken, expiry);
      await sendPasswordResetEmail(email, resetToken, user.firstName || undefined);

      return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ error: "Invalid reset token" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, hashedPassword);
      await storage.clearPasswordResetToken(user.id);

      return res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Firebase authentication handler
  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    try {
      const { uid, email, displayName, photoURL } = req.body;
      console.log("Firebase auth attempt:", { uid, email, displayName });
      
      if (!uid || !email) {
        console.log("Firebase auth failed: Missing uid or email");
        return res.status(400).json({ error: "Firebase user ID and email are required" });
      }
      
      // Check if user exists by email
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        // User doesn't exist, create a new one
        console.log("Creating new user from Firebase auth:", email);
        
        // Generate a username from email
        const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + 
                       Math.floor(Math.random() * 1000).toString();
        
        // Create the user with Firebase credentials
        user = await storage.createUser({
          username: username,
          password: 'firebase-auth', // Placeholder password for Firebase users
          displayName: displayName || username,
          title: 'COMMANDER',
          email: email,
          authProvider: 'firebase',
          firebaseUid: uid,
          termsAccepted: true
        });
        
        // Create initial user stats
        console.log("Creating initial stats for new Firebase user:", user.id);
        await storage.createUserStats({
          userId: user.id,
          experienceCurrent: 0,
          experienceMax: 1000,
          level: 1,
          timeTokensCurrent: 100,
          timeTokensMax: 100,
          energyPointsCurrent: 100,
          energyPointsMax: 100,
          healthPointsCurrent: 100,
          healthPointsMax: 100,
          attentionTokensCurrent: 100,
          attentionTokensMax: 100,
          streakDays: 0,
          efficiencyScore: 0,
          aiAssistantName: "NOVA"
        });
        
        // Create or update user profile (using upsert to handle race conditions)
        console.log("Creating user profile for new Firebase user:", user.id);
        await storage.upsertUserProfile(user.id, {
          startStage: "Awakening",
          targetArchetype: "Creator",
          flowStyle: {
            pace: 3, 
            environment: 3, 
            risk: 3, 
            learning: 3, 
            energy: 3
          },
          coreMotivation: "Growth",
          setupMissionStatus: {
            archetype: "incomplete", 
            integrations: "incomplete", 
            future_self: "incomplete", 
            rituals: "incomplete", 
            pillars: "incomplete"
          },
          primaryThemeColor: "#00e0ff", // Default teal color
          onboardingCompleted: false
        });
        
        // Create user integrations
        console.log("Creating user integrations for new Firebase user:", user.id);
        await storage.createUserIntegration({
          userId: user.id,
          appleHealthConnected: false,
          googleCalendarConnected: false,
          notionConnected: false,
          otherIntegrations: {}
        });
      } else {
        // User exists, update Firebase UID if needed
        if (!user.firebaseUid) {
          await storage.updateUserFirebaseUid(user.id, uid);
        }
      }
      
      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      const { streakDays, isNewDay } = await storage.processLoginStreak(user.id);
      if (isNewDay) {
        await storage.processDailyHealthUpdate(user.id);
        console.log("New day detected - updated streak and health for user:", user.username);
      }

      storage.logActivityEvent(user.id, 'login').catch(() => {});
      storage.initDefaultReminders(user.id).catch(() => {});
      
      // Fetch user profile to check if onboarding is completed
      const userProfile = await storage.getUserProfile(user.id);
      const isNewUser = !userProfile || !userProfile.onboardingCompleted;
      
      // Fetch primaryColor from user stats so the client can apply it before rendering
      const fbUserStats = await storage.getUserStats(user.id);
      
      console.log("Firebase login successful for user:", user.username, "isNewUser:", isNewUser);
      return res.status(200).json({ 
        user: { 
          id: user.id, 
          username: user.username,
          displayName: user.displayName 
        },
        isNewUser: isNewUser,
        primaryColor: fbUserStats?.primaryColor || "#00e0ff"
      });
    } catch (error) {
      console.error("Firebase auth error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    try {
      // If no session exists, just respond successfully
      if (!req.session || !req.session.userId) {
        res.clearCookie("connect.sid");
        return res.status(200).json({ message: "Already logged out" });
      }
      
      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          return res.status(500).json({ error: "Failed to logout" });
        }
        
        res.clearCookie("connect.sid", {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === "production",
          path: '/'
        });
        
        return res.status(200).json({ message: "Logged out successfully" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/auth/me", (req: Request, res: Response) => {
    // Check if user is authenticated
    if (req.session.userId) {
      return res.status(200).json({ 
        user: { 
          id: req.session.userId, 
          username: req.session.username 
        }
      });
    }
    
    return res.status(401).json({ error: "Not authenticated" });
  });

  // USER PROFILE ROUTES
  app.get("/api/users/:userId/profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Return user data without the password
      const { password, ...userData } = user;
      res.json(userData);
    } catch (error) {
      console.error("Error getting user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/users/:userId/profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      const { 
        username,
        displayName, 
        firstName,
        lastName,
        bio, 
        avatarColor, 
        title, 
        profilePicture
      } = req.body;
      
      if (username !== undefined) {
        const trimmed = username.trim();
        if (trimmed.length < 3) {
          return res.status(400).json({ error: "Username must be at least 3 characters." });
        }
        const existing = await storage.getUserByUsername(trimmed);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: "Username is already taken." });
        }
      }
      
      const updateData: any = {};
      if (username !== undefined) updateData.username = username.trim();
      if (displayName !== undefined) updateData.displayName = displayName;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (bio !== undefined) updateData.bio = bio;
      if (avatarColor !== undefined) updateData.avatarColor = avatarColor;
      if (title !== undefined) updateData.title = title;
      if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
      
      // Log the update data for debugging
      console.log("User profile update data:", updateData);
      
      const updatedUser = await storage.updateUser(userId, updateData);
      
      // Return user data without the password
      const { password, ...userData } = updatedUser;
      res.json(userData);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Specific endpoint for UserProfile schema (not user)
  app.patch("/api/users/:userId/user-profile", isOwner, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
    try {
      // Parse the update data
      const { 
        onboardingCompleted,
        startStage,
        targetArchetype, 
        coreMotivation,
        flowStyle,
        setupMissionStatus,
        primaryThemeColor,
        futureSelfSummary,
        aiPersonalityProfile
      } = req.body;
      
      // Create update object with only specified fields
      const updateData: any = {};
      if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
      if (startStage !== undefined) updateData.startStage = startStage;
      if (targetArchetype !== undefined) updateData.targetArchetype = targetArchetype;
      if (coreMotivation !== undefined) updateData.coreMotivation = coreMotivation;
      if (flowStyle !== undefined) updateData.flowStyle = flowStyle;
      if (setupMissionStatus !== undefined) updateData.setupMissionStatus = setupMissionStatus;
      if (primaryThemeColor !== undefined) updateData.primaryThemeColor = primaryThemeColor;
      if (futureSelfSummary !== undefined) updateData.futureSelfSummary = futureSelfSummary;
      if (aiPersonalityProfile !== undefined) updateData.aiPersonalityProfile = aiPersonalityProfile;
      
      // Log for debugging
      console.log("Updating user_profile with data:", updateData);
      
      // Check if profile exists and create or update accordingly
      const existingProfile = await storage.getUserProfile(userId);
      
      let updatedProfile;
      if (existingProfile) {
        updatedProfile = await storage.updateUserProfile(userId, updateData);
        console.log("Updated existing profile for user:", userId);
      } else {
        // Create a new profile if none exists
        updateData.userId = userId; // Required for creation
        updatedProfile = await storage.createUserProfile(updateData);
        console.log("Created new profile for user:", userId);
      }
      
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // SIMPLIFIED PROFILE ROUTES (uses session userId)
  app.get("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const updateData = req.body;
      updateData.updatedAt = new Date();
      
      // Use upsert to prevent race condition duplicates
      const updatedProfile = await storage.upsertUserProfile(userId, updateData);
      
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Validation schemas for account updates
  const updateAccountSchema = z.object({
    email: z.string().email("Invalid email format").optional().nullable().or(z.literal("")),
    phoneNumber: z.string().max(20, "Phone number too long").optional().nullable().or(z.literal("")),
  });
  
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });
  
  // Update account settings (email, phone)
  app.patch("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Validate input
      const parseResult = updateAccountSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }
      
      const { email, phoneNumber } = parseResult.data;
      
      const updateData: Record<string, any> = {};
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      
      const updatedUser = await storage.updateUser(userId, updateData);
      res.json({ 
        email: updatedUser.email, 
        phoneNumber: updatedUser.phoneNumber 
      });
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Change password
  app.post("/api/account/change-password", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Validate input
      const parseResult = changePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }
      
      const { currentPassword, newPassword } = parseResult.data;
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedPassword);
      
      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get account info (email, phone)
  app.get("/api/account", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        email: user.email, 
        phoneNumber: user.phoneNumber,
        authProvider: user.authProvider
      });
    } catch (error) {
      console.error("Error fetching account:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Generate Character Affirmation using AI
  app.post("/api/profile/generate-affirmation", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { displayName, archetypePrimary, archetypeSecondary, coreValues, vision5Year, primaryCraft, desiredEmotion } = req.body;
      
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });
      
      const pronoun = "they";
      const pronounCap = "They";
      const pronounPoss = "their";
      
      const prompt = `Generate a powerful character affirmation (200-300 words) for a person named "${displayName}". Write in second person, speaking directly to them using "you" and "your".

The affirmation should be written as if you are speaking directly to this person about who they are — powerful, certain, and declarative. Do NOT include any title, header, or greeting line like "# Your Affirmation" — start directly with the affirmation content itself.

Key details about this person:
- Primary Archetype: ${archetypePrimary} (their dominant energy and approach to life)
- Secondary Archetype: ${archetypeSecondary} (their supporting strength)
- Core Values: ${coreValues?.join(", ") || "growth, integrity, purpose"}
- 5-Year Vision: ${vision5Year || "becoming the best version of themselves"}
- Primary Craft: ${primaryCraft || "their chosen field"}
- Desired Emotion: ${desiredEmotion || "flow"}

Structure the affirmation as:
1. Opening identity statement (who you are at your core)
2. Your values and how you embody them
3. Your vision and what you're creating
4. Your strengths and traits
5. Your destiny and impact

Tone: Powerful, certain, declarative (NOT aspirational). Write as if this is already who they are. Do NOT use any emojis.

Example structure:
"You are a sovereign creator of reality, aligned with vision, integrity, and growth. Each day, you expand in clarity, discipline, and creativity..."

Generate the complete affirmation now:`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          { role: "user", content: prompt }
        ],
      });
      
      const affirmation = message.content[0].type === "text" ? message.content[0].text : "";
      
      res.json({ affirmation });
    } catch (error) {
      console.error("Error generating affirmation:", error);
      res.status(500).json({ error: "Failed to generate affirmation" });
    }
  });

  // USER STATS ROUTES
  app.get("/api/users/:userId/stats", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Process login streak and daily resets before returning stats
      // This ensures streak, HP, EP, time tokens, and attention tokens are always current
      await storage.processLoginStreak(userId);
      
      const dbStats = await storage.getUserStats(userId);
      if (!dbStats) {
        return res.status(404).json({ error: "User stats not found" });
      }
      
      // Recalculate XP from completed missions to ensure consistency
      const xpData = await storage.recalculateXP(userId);
      
      // Transform database stats into the nested object structure expected by the frontend
      const transformedStats = {
        attentionTokens: {
          current: dbStats.attentionTokensCurrent,
          max: dbStats.attentionTokensMax,
        },
        timeTokens: {
          current: dbStats.timeTokensCurrent,
          max: dbStats.timeTokensMax,
        },
        energyPoints: {
          current: dbStats.energyPointsCurrent,
          max: dbStats.energyPointsMax,
        },
        healthPoints: {
          current: dbStats.healthPointsCurrent,
          max: dbStats.healthPointsMax,
        },
        experience: {
          current: xpData.experienceCurrent,
          max: xpData.experienceMax,
          level: xpData.level,
          totalXP: xpData.totalXP,
          showLevelUp: false
        },
        streakDays: dbStats.streakDays || 0,
        efficiencyScore: dbStats.efficiencyScore || 0,
        aiAssistantName: dbStats.aiAssistantName,
        // Include system settings in the transformed stats
        notificationsEnabled: dbStats.notificationsEnabled,
        darkThemeEnabled: dbStats.darkThemeEnabled, 
        autoSyncEnabled: dbStats.autoSyncEnabled,
        aiAssistantEnabled: dbStats.aiAssistantEnabled,
        // Include primary color
        primaryColor: dbStats.primaryColor,
      };
      
      return res.status(200).json({ stats: transformedStats });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/users/:userId/stats", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Transform nested frontend stat model to flat database model
      const frontendStats = req.body;
      const dbStatsUpdate: any = {};
      
      if (frontendStats.attentionTokens) {
        if (frontendStats.attentionTokens.current !== undefined) {
          dbStatsUpdate.attentionTokensCurrent = frontendStats.attentionTokens.current;
        }
        if (frontendStats.attentionTokens.max !== undefined) {
          dbStatsUpdate.attentionTokensMax = frontendStats.attentionTokens.max;
        }
      }
      
      if (frontendStats.timeTokens) {
        if (frontendStats.timeTokens.current !== undefined) {
          dbStatsUpdate.timeTokensCurrent = frontendStats.timeTokens.current;
        }
        if (frontendStats.timeTokens.max !== undefined) {
          dbStatsUpdate.timeTokensMax = frontendStats.timeTokens.max;
        }
      }
      
      if (frontendStats.energyPoints) {
        if (frontendStats.energyPoints.current !== undefined) {
          dbStatsUpdate.energyPointsCurrent = frontendStats.energyPoints.current;
        }
        if (frontendStats.energyPoints.max !== undefined) {
          dbStatsUpdate.energyPointsMax = frontendStats.energyPoints.max;
        }
      }
      
      if (frontendStats.healthPoints) {
        if (frontendStats.healthPoints.current !== undefined) {
          dbStatsUpdate.healthPointsCurrent = frontendStats.healthPoints.current;
        }
        if (frontendStats.healthPoints.max !== undefined) {
          dbStatsUpdate.healthPointsMax = frontendStats.healthPoints.max;
        }
      }
      
      if (frontendStats.experience) {
        if (frontendStats.experience.current !== undefined) {
          dbStatsUpdate.experienceCurrent = frontendStats.experience.current;
        }
        if (frontendStats.experience.max !== undefined) {
          dbStatsUpdate.experienceMax = frontendStats.experience.max;
        }
        if (frontendStats.experience.level !== undefined) {
          dbStatsUpdate.level = frontendStats.experience.level;
        }
      }
      
      if (frontendStats.streakDays !== undefined) {
        dbStatsUpdate.streakDays = frontendStats.streakDays;
      }
      
      if (frontendStats.efficiencyScore !== undefined) {
        dbStatsUpdate.efficiencyScore = frontendStats.efficiencyScore;
      }
      
      // Handle system settings
      if (frontendStats.notificationsEnabled !== undefined) {
        dbStatsUpdate.notificationsEnabled = frontendStats.notificationsEnabled;
      }
      
      if (frontendStats.darkThemeEnabled !== undefined) {
        dbStatsUpdate.darkThemeEnabled = frontendStats.darkThemeEnabled;
      }
      
      if (frontendStats.autoSyncEnabled !== undefined) {
        dbStatsUpdate.autoSyncEnabled = frontendStats.autoSyncEnabled;
      }
      
      if (frontendStats.aiAssistantEnabled !== undefined) {
        dbStatsUpdate.aiAssistantEnabled = frontendStats.aiAssistantEnabled;
      }
      
      // Handle primary color
      if (frontendStats.primaryColor !== undefined) {
        dbStatsUpdate.primaryColor = frontendStats.primaryColor;
        console.log("Updating primary color to:", frontendStats.primaryColor);
      }
      
      // Handle onboarding fields
      if (frontendStats.lifeStage !== undefined) {
        dbStatsUpdate.lifeStage = frontendStats.lifeStage;
        console.log("Updating life stage to:", frontendStats.lifeStage);
      }
      
      if (frontendStats.archetype !== undefined) {
        dbStatsUpdate.archetype = frontendStats.archetype;
        console.log("Updating archetype to:", frontendStats.archetype);
      }
      
      if (frontendStats.workPace !== undefined) {
        dbStatsUpdate.workPace = frontendStats.workPace;
        console.log("Updating work pace to:", frontendStats.workPace);
      }
      
      if (frontendStats.environment !== undefined) {
        dbStatsUpdate.environment = frontendStats.environment;
        console.log("Updating environment to:", frontendStats.environment);
      }
      
      if (frontendStats.riskTolerance !== undefined) {
        dbStatsUpdate.riskTolerance = frontendStats.riskTolerance;
        console.log("Updating risk tolerance to:", frontendStats.riskTolerance);
      }
      
      if (frontendStats.onboardingCompleted !== undefined) {
        dbStatsUpdate.onboardingCompleted = frontendStats.onboardingCompleted;
        console.log("Updating onboarding completed to:", frontendStats.onboardingCompleted);
      }
      
      const dbUpdatedStats = await storage.updateUserStats(userId, dbStatsUpdate);
      
      // Get updated user profile to access totalXP
      const userProfile = await storage.getUserProfile(userId);
      const totalXP = userProfile?.totalXP || 0;
      
      // Transform the response back to the frontend model
      const transformedStats = {
        attentionTokens: {
          current: dbUpdatedStats.attentionTokensCurrent,
          max: dbUpdatedStats.attentionTokensMax,
        },
        timeTokens: {
          current: dbUpdatedStats.timeTokensCurrent,
          max: dbUpdatedStats.timeTokensMax,
        },
        energyPoints: {
          current: dbUpdatedStats.energyPointsCurrent,
          max: dbUpdatedStats.energyPointsMax,
        },
        healthPoints: {
          current: dbUpdatedStats.healthPointsCurrent,
          max: dbUpdatedStats.healthPointsMax,
        },
        experience: {
          current: dbUpdatedStats.experienceCurrent,
          max: dbUpdatedStats.experienceMax,
          level: dbUpdatedStats.level,
          totalXP: totalXP,
          showLevelUp: false
        },
        streakDays: dbUpdatedStats.streakDays || 0,
        efficiencyScore: dbUpdatedStats.efficiencyScore || 0,
        aiAssistantName: dbUpdatedStats.aiAssistantName,
        // Include system settings in the transformed stats
        notificationsEnabled: dbUpdatedStats.notificationsEnabled,
        darkThemeEnabled: dbUpdatedStats.darkThemeEnabled, 
        autoSyncEnabled: dbUpdatedStats.autoSyncEnabled,
        aiAssistantEnabled: dbUpdatedStats.aiAssistantEnabled,
        // Include primary color
        primaryColor: dbUpdatedStats.primaryColor,
        // Note: Onboarding fields moved to userProfile table
      };
      
      return res.status(200).json({ stats: transformedStats });
    } catch (error) {
      console.error("Error updating stats:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Specific endpoint for updating AI assistant name
  app.patch("/api/users/:userId/ai-assistant-name", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: "Valid name is required" });
      }
      
      const updatedStats = await storage.updateUserStats(userId, { aiAssistantName: name });
      
      return res.status(200).json({ 
        success: true,
        aiAssistantName: updatedStats.aiAssistantName 
      });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // QUEST ROUTES
  app.get("/api/users/:userId/quests", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Purge terminated missions older than 24 hours on app load
      try {
        await storage.purgeExpiredArchivedQuests();
      } catch (purgeError) {
        console.error("Error purging expired archived quests:", purgeError);
      }
      
      // Auto-convert any unconverted todoIdeas from past days into quests
      try {
        const clientTz = req.query.tz as string || 'UTC';
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: clientTz }));
        const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
        
        const unconvertedLogs = await db.select()
          .from(userDailyLogs)
          .where(and(
            eq(userDailyLogs.userId, userId),
            eq(userDailyLogs.todosConverted, false)
          ));
        
        const existingQuests = await db.select({ title: questsTable.title })
          .from(questsTable)
          .where(eq(questsTable.userId, userId));
        const existingTitles = new Set(existingQuests.map(q => q.title.toLowerCase().trim()));
        
        for (const log of unconvertedLogs) {
          if (log.todoIdeas && log.date < todayStr) {
            const todoLines = log.todoIdeas
              .split('\n')
              .map((line: string) => line.trim())
              .filter((line: string) => line.length > 0);
            
            const [year, month, day] = log.date.split('-').map(Number);
            const nextDayMidnight = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
            
            let created = 0;
            for (const todoLine of todoLines) {
              if (!existingTitles.has(todoLine.toLowerCase().trim())) {
                await storage.createQuest({
                  userId,
                  title: todoLine,
                  description: `Auto-created from To-Do Ideas on ${log.date}`,
                  category: 'todo',
                  completed: false,
                  experienceReward: 50,
                  createdAt: nextDayMidnight
                });
                existingTitles.add(todoLine.toLowerCase().trim());
                created++;
              }
            }
            
            await db.update(userDailyLogs)
              .set({ todosConverted: true })
              .where(eq(userDailyLogs.id, log.id));
            
            console.log(`Auto-converted ${created}/${todoLines.length} todoIdeas from ${log.date} for user ${userId} (${todoLines.length - created} duplicates skipped)`);
          }
        }
      } catch (todoError) {
        console.error("Error auto-converting todoIdeas:", todoError);
      }
      
      const quests = await storage.getQuests(userId);
      return res.status(200).json({ quests });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const ONBOARDING_TITLE_TO_ID: Record<string, number> = {
    "Onboarding: Access & Quickstart": 0,
    "Onboarding: Archetype Calibration": 1,
    "Onboarding: Identity & Direction": 2,
    "Onboarding: Craft & Mastery": 3,
    "Onboarding: Capacity & Constraints": 4,
    "Onboarding: Baselines & States": 5,
    "Onboarding: History & Roots": 6,
    "Onboarding: Systems & Rituals": 7,
  };

  async function syncOnboardingProfile(userId: number, questTitle: string) {
    try {
      const missionId = ONBOARDING_TITLE_TO_ID[questTitle];
      if (missionId === undefined) return;
      const profile = await storage.getUserProfile(userId);
      const existing: number[] = profile?.completedOnboardingMissions || [];
      if (!existing.includes(missionId)) {
        await storage.upsertUserProfile(userId, {
          completedOnboardingMissions: [...existing, missionId],
        });
        console.log(`Synced profile: added mission ${missionId} to completedOnboardingMissions for user ${userId}`);
      }
    } catch (err) {
      console.error("Failed to sync onboarding profile:", err);
    }
  }

  app.post("/api/quests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Pre-process the request body to convert date strings to Date objects
      const processedBody = { ...req.body };
      if (processedBody.completedAt && typeof processedBody.completedAt === 'string') {
        processedBody.completedAt = new Date(processedBody.completedAt);
      }
      
      const questData = insertQuestSchema.parse(processedBody);
      
      // Ensure user can only create quests for their own account
      if (questData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create quests for this user" });
      }
      
      // For onboarding quests, check if one already exists to prevent duplicates
      if (questData.category === "onboarding" && questData.title) {
        const existingQuests = await storage.getQuests(questData.userId);
        const existingOnboardingQuest = existingQuests.find(
          (q: Quest) => q.title === questData.title && q.category === "onboarding"
        );
        if (existingOnboardingQuest) {
          if (processedBody.completed && !existingOnboardingQuest.completed) {
            const { attentionCost: oaCost, timeCost: otCost, energyCost: oeCost } = calculateMissionCosts(
              processedBody.startDate || existingOnboardingQuest.startDate || null,
              processedBody.startTime || existingOnboardingQuest.startTime || null,
              processedBody.endDate || existingOnboardingQuest.endDate || null,
              processedBody.endTime || existingOnboardingQuest.endTime || null
            );
            const updatedQuest = await storage.updateQuest(existingOnboardingQuest.id, {
              completed: true,
              completedAt: processedBody.completedAt || new Date(),
              experienceReward: processedBody.experienceReward ?? existingOnboardingQuest.experienceReward,
              difficulty: processedBody.difficulty ?? existingOnboardingQuest.difficulty,
              startDate: processedBody.startDate ?? existingOnboardingQuest.startDate,
              startTime: processedBody.startTime ?? existingOnboardingQuest.startTime,
              endDate: processedBody.endDate ?? existingOnboardingQuest.endDate,
              endTime: processedBody.endTime ?? existingOnboardingQuest.endTime,
              attentionCost: oaCost,
              timeCost: otCost,
              energyCost: oeCost,
            });
            console.log(`Updated existing onboarding quest to completed for user ${questData.userId}: ${questData.title} (costs: AT=${oaCost}, TT=${otCost}, EP=${oeCost})`);
            await syncOnboardingProfile(questData.userId, questData.title);
            return res.status(200).json({ quest: updatedQuest, duplicate: true });
          }
          console.log(`Onboarding quest already exists for user ${questData.userId}: ${questData.title}`);
          return res.status(200).json({ quest: existingOnboardingQuest, duplicate: true });
        }
      }
      
      // Auto-calculate attention, time, and energy costs based on duration
      const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
        questData.startDate || null,
        questData.startTime || null,
        questData.endDate || null,
        questData.endTime || null
      );
      
      // AI-powered category + difficulty classification (skip for onboarding or pre-set categories)
      let assignedCategory = questData.category || "general";
      let assignedDifficulty = questData.difficulty || "D";
      const presetCategories = ["onboarding", "setup", "rituals"];
      if (!presetCategories.includes(assignedCategory) && questData.title) {
        try {
          const anthropic = new Anthropic({
            apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
          });
          const classifyResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 30,
            messages: [{
              role: "user",
              content: `Classify this mission. Respond with ONLY two words separated by a space: the category and the difficulty rank. Nothing else.

Categories: work, health, fitness, finance, learning, creative, social, personal, mindset, career, nutrition, recovery, planning, spiritual, household

Difficulty ranks (based on effort, complexity, and time required):
S = Extreme effort, multi-day or life-changing tasks
A = High effort, significant commitment (several hours or very challenging)
B = Moderate effort, requires focus and planning (1-3 hours)
C = Light effort, simple but requires some attention (30min-1hr)
D = Minimal effort, quick and easy tasks (under 30min)

Mission title: ${questData.title}
${questData.description ? `Description: ${questData.description}` : ''}`
            }],
          });
          const responseText = (classifyResponse.content[0] as any).text?.trim().toLowerCase();
          const validCategories = ["work", "health", "fitness", "finance", "learning", "creative", "social", "personal", "mindset", "career", "nutrition", "recovery", "planning", "spiritual", "household"];
          const validDifficulties = ["s", "a", "b", "c", "d"];
          if (responseText) {
            const parts = responseText.split(/\s+/);
            if (parts.length >= 2) {
              const cat = parts[0];
              const diff = parts[1];
              if (validCategories.includes(cat)) assignedCategory = cat;
              if (validDifficulties.includes(diff)) assignedDifficulty = diff.toUpperCase();
            } else if (parts.length === 1 && validCategories.includes(parts[0])) {
              assignedCategory = parts[0];
            }
          }
        } catch (aiError) {
          console.error("AI classification failed, using defaults:", aiError);
        }
      }
      
      const quest = await storage.createQuest({
        ...questData,
        category: assignedCategory,
        difficulty: assignedDifficulty,
        attentionCost,
        timeCost,
        energyCost,
      });
      if (assignedCategory === "onboarding" && quest.completed && quest.title) {
        await syncOnboardingProfile(questData.userId, quest.title);
      }
      return res.status(201).json({ quest });
    } catch (error) {
      console.error("Quest creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Recalculate costs for all quests for a user (useful for updating existing data)
  app.post("/api/quests/recalculate-costs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const quests = await storage.getQuests(userId);
      
      let updatedCount = 0;
      for (const quest of quests) {
        const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
          quest.startDate || null,
          quest.startTime || null,
          quest.endDate || null,
          quest.endTime || null
        );
        
        await storage.updateQuest(quest.id, {
          attentionCost,
          timeCost,
          energyCost,
        });
        updatedCount++;
      }
      
      return res.status(200).json({ message: `Recalculated costs for ${updatedCount} quests` });
    } catch (error) {
      console.error("Error recalculating quest costs:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/quests/:questId/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      // Get the quest to check ownership
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      // Verify ownership
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to toggle this quest" });
      }
      
      // Toggle completion - this now handles all stat updates (XP, time, energy, attention)
      // Capture level before toggle for accurate level-up detection
      const preToggleStats = await storage.getUserStats(quest.userId);
      const previousLevel = preToggleStats?.level || 1;

      const { quest: updatedQuest, statsUpdated } = await storage.toggleQuestCompletion(questId);
      
      // Get updated user stats and recalculate XP to ensure consistency
      const userStats = await storage.getUserStats(quest.userId);
      const xpData = await storage.recalculateXP(quest.userId);
      const levelUp = updatedQuest.completed && xpData.level > previousLevel;
      
      if (updatedQuest.completed) {
        const xpGained = Math.floor(quest.experienceReward * ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[quest.difficulty || 'D'] || 1));
        sendPushToUser(quest.userId, {
          title: levelUp ? "Level Up!" : "Mission Complete!",
          body: levelUp
            ? `${quest.title} completed! +${xpGained} XP — You leveled up!`
            : `${quest.title} completed! +${xpGained} XP`,
          tag: `quest-complete-${quest.id}`,
          url: "/quests",
        }).catch(() => {});
        storage.logActivityEvent(quest.userId, 'mission_complete', { questId: quest.id, title: quest.title }).catch(() => {});
      }

      return res.status(200).json({ 
        quest: updatedQuest,
        xpAwarded: updatedQuest.completed ? Math.floor(quest.experienceReward * ({ D: 1, C: 1.5, B: 2, A: 3, S: 5 }[quest.difficulty || 'D'] || 1)) : 0,
        levelUp: levelUp,
        statsUpdated: statsUpdated,
        stats: userStats ? {
          timeTokens: {
            current: userStats.timeTokensCurrent,
            max: userStats.timeTokensMax
          },
          attentionTokens: {
            current: userStats.attentionTokensCurrent,
            max: userStats.attentionTokensMax
          },
          energyPoints: {
            current: userStats.energyPointsCurrent,
            max: userStats.energyPointsMax
          },
          experience: {
            current: xpData.experienceCurrent,
            max: xpData.experienceMax,
            level: xpData.level,
            totalXP: xpData.totalXP,
            showLevelUp: levelUp
          }
        } : undefined
      });
    } catch (error) {
      console.error("Error toggling quest completion:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/quests/:questId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this quest" });
      }
      
      await storage.deleteQuest(questId);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Archived missions (soft-deleted within last 24 hours)
  app.get("/api/quests/archived", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      await storage.purgeExpiredArchivedQuests();
      const archived = await storage.getArchivedQuests(userId);
      return res.status(200).json(archived);
    } catch (error) {
      console.error("Error fetching archived quests:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/quests/:questId/restore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const restored = await storage.restoreQuest(questId);
      return res.status(200).json(restored);
    } catch (error) {
      console.error("Error restoring quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update quest (PATCH)
  const updateQuestSchema = insertQuestSchema.pick({
    title: true,
    description: true,
    category: true,
    difficulty: true,
    energyCost: true,
    experienceReward: true,
    startDate: true,
    startTime: true,
    endDate: true,
    endTime: true,
    dueDate: true,
    notificationEnabled: true,
    notificationTime: true,
    notifications: true,
    isRitualized: true,
    repeatFrequency: true,
    repeatInterval: true,
    repeatDays: true,
    repeatEndDate: true,
    visionGoalId: true,
  }).partial();

  app.patch("/api/quests/reorder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      const userId = req.session.userId!;
      for (let i = 0; i < orderedIds.length; i++) {
        const questId = orderedIds[i];
        const quest = await storage.getQuest(questId);
        if (quest && quest.userId === userId) {
          await storage.updateQuest(questId, { sortOrder: i });
        }
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error reordering quests:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Push Notification routes
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:lyfeos@replit.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }

  app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
  });

  app.post("/api/push/subscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid push subscription" });
      }
      
      const sub = await storage.savePushSubscription({
        userId: req.session.userId!,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      
      return res.status(200).json({ success: true, id: sub.id });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/push/subscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: "Endpoint required" });
      }
      await storage.deletePushSubscription(endpoint);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error removing push subscription:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const subs = await storage.getPushSubscriptions(req.session.userId!);
      if (subs.length === 0) {
        return res.status(400).json({ error: "No push subscriptions found. Enable notifications first." });
      }
      
      const payload = JSON.stringify({
        title: "LYFEOS",
        body: "Push notifications are working! You'll receive mission reminders here.",
        tag: "test-notification",
        url: "/quests"
      });
      
      const results = await Promise.allSettled(
        subs.map(sub => 
          webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          }, payload)
        )
      );
      
      const failed = results.filter(r => r.status === 'rejected');
      for (const fail of failed) {
        if ((fail as PromiseRejectedResult).reason?.statusCode === 410) {
          const idx = results.indexOf(fail);
          await storage.deletePushSubscription(subs[idx].endpoint);
        }
      }
      
      return res.status(200).json({ success: true, sent: results.length - failed.length });
    } catch (error) {
      console.error("Error sending test push:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/quests/:questId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questId = parseInt(req.params.questId);
      if (isNaN(questId)) {
        return res.status(400).json({ error: "Invalid quest ID" });
      }
      
      const quest = await storage.getQuest(questId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this quest" });
      }
      
      const validatedData = updateQuestSchema.parse(req.body);
      
      // Normalize empty strings to null for date/time fields
      const dateFields = ['startDate', 'startTime', 'endDate', 'endTime'] as const;
      for (const field of dateFields) {
        if (field in validatedData && validatedData[field] === '') {
          (validatedData as any)[field] = null;
        }
      }
      
      // Auto-calculate attention and time costs if dates/times are being updated
      const startDate = validatedData.startDate ?? quest.startDate;
      const startTime = validatedData.startTime ?? quest.startTime;
      const endDate = validatedData.endDate ?? quest.endDate;
      const endTime = validatedData.endTime ?? quest.endTime;
      
      const { attentionCost, timeCost, energyCost } = calculateMissionCosts(
        startDate || null,
        startTime || null,
        endDate || null,
        endTime || null
      );
      
      // Re-classify category + difficulty if title or description changed
      const titleChanged = 'title' in validatedData && validatedData.title !== quest.title;
      const descChanged = 'description' in validatedData && validatedData.description !== quest.description;
      let reclassifiedCategory = validatedData.category;
      let reclassifiedDifficulty = validatedData.difficulty;
      const presetCategories = ["onboarding", "setup", "rituals"];
      const currentCategory = validatedData.category || quest.category || "";
      if ((titleChanged || descChanged) && !presetCategories.includes(currentCategory)) {
        try {
          const anthropic = new Anthropic({
            apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
          });
          const newTitle = validatedData.title || quest.title;
          const newDesc = validatedData.description || quest.description;
          const classifyResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 30,
            messages: [{
              role: "user",
              content: `Classify this mission. Respond with ONLY two words separated by a space: the category and the difficulty rank. Nothing else.

Categories: work, health, fitness, finance, learning, creative, social, personal, mindset, career, nutrition, recovery, planning, spiritual, household

Difficulty ranks (based on effort, complexity, and time required):
S = Extreme effort, multi-day or life-changing tasks
A = High effort, significant commitment (several hours or very challenging)
B = Moderate effort, requires focus and planning (1-3 hours)
C = Light effort, simple but requires some attention (30min-1hr)
D = Minimal effort, quick and easy tasks (under 30min)

Mission title: ${newTitle}
${newDesc ? `Description: ${newDesc}` : ''}`
            }],
          });
          const responseText = (classifyResponse.content[0] as any).text?.trim().toLowerCase();
          const validCategories = ["work", "health", "fitness", "finance", "learning", "creative", "social", "personal", "mindset", "career", "nutrition", "recovery", "planning", "spiritual", "household"];
          const validDifficulties = ["s", "a", "b", "c", "d"];
          if (responseText) {
            const parts = responseText.split(/\s+/);
            if (parts.length >= 2) {
              if (validCategories.includes(parts[0])) reclassifiedCategory = parts[0];
              if (validDifficulties.includes(parts[1])) reclassifiedDifficulty = parts[1].toUpperCase();
            }
          }
        } catch (aiError) {
          console.error("AI re-classification failed on update:", aiError);
        }
      }
      
      const updatedQuest = await storage.updateQuest(questId, {
        ...validatedData,
        ...(reclassifiedCategory ? { category: reclassifiedCategory } : {}),
        ...(reclassifiedDifficulty ? { difficulty: reclassifiedDifficulty } : {}),
        attentionCost,
        timeCost,
        energyCost,
      });
      return res.status(200).json({ quest: updatedQuest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid quest data", details: error.errors });
      }
      console.error("Error updating quest:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // AI MESSAGE ROUTES
  app.get("/api/users/:userId/messages", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const messages = await storage.getMessages(userId);
      return res.status(200).json({ messages });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageData = insertAIMessageSchema.parse(req.body);
      
      // Ensure user can only post messages from their own account
      if (messageData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to post messages for this user" });
      }
      
      const message = await storage.createMessage(messageData);
      
      // If this is a user message, create an AI response using OpenAI
      if (messageData.sender === "user") {
        // Import the OpenAI client
        const { generateAIResponse } = await import('./openai');
        
        // Generate AI response
        const aiContent = await generateAIResponse(messageData.content);
        
        const aiResponse = await storage.createMessage({
          userId: messageData.userId,
          sender: "ai",
          content: aiContent
        });
        
        return res.status(201).json({ 
          userMessage: message,
          aiResponse 
        });
      }
      
      return res.status(201).json({ message });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error processing message:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CALENDAR EVENT ROUTES
  app.get("/api/users/:userId/events", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const events = await storage.getEvents(userId);
      return res.status(200).json({ events });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventData = insertCalendarEventSchema.parse(req.body);
      
      // Ensure user can only create events for their own account
      if (eventData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create events for this user" });
      }
      
      const event = await storage.createEvent(eventData);
      
      // Award XP for creating a calendar event
      try {
        // Add 5 XP for creating a calendar event
        const xpResult = await awardExperiencePoints(eventData.userId, 5);
        if (xpResult.success) {
          return res.status(201).json({ 
            event,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        console.error("Error awarding XP for event creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ event });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/events/:eventId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.eventId);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      // Get the event to check ownership
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Verify ownership
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this event" });
      }
      
      const eventUpdate = req.body;
      const updatedEvent = await storage.updateEvent(eventId, eventUpdate);
      
      return res.status(200).json({ event: updatedEvent });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // MISSION PAGE ROUTES
  app.get("/api/users/:userId/mission-pages", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const missionPages = await storage.getMissionPages(userId);
      return res.status(200).json({ missionPages });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this mission page" });
      }
      
      return res.status(200).json({ page });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/mission-pages/slug/:slug", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug;
      
      const page = await storage.getMissionPageBySlug(slug);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this mission page" });
      }
      
      return res.status(200).json({ page });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/mission-pages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageData = insertMissionPageSchema.parse(req.body);
      
      // Ensure user can only create pages for their own account
      if (pageData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create mission pages for this user" });
      }
      
      // Check if the slug is already taken
      const existingPage = await storage.getMissionPageBySlug(pageData.slug);
      if (existingPage) {
        return res.status(400).json({ error: "A mission page with this slug already exists" });
      }
      
      const page = await storage.createMissionPage(pageData);
      
      // Award XP for creating a mission page
      try {
        // Add 15 XP for creating a mission page
        const xpResult = await awardExperiencePoints(pageData.userId, 15);
        if (xpResult.success) {
          return res.status(201).json({ 
            page,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        console.error("Error awarding XP for mission page creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ page });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      // Get the page to check ownership
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this mission page" });
      }
      
      const pageUpdate = req.body;
      
      // If trying to update the slug, check if the new slug is taken
      if (pageUpdate.slug && pageUpdate.slug !== page.slug) {
        const existingPage = await storage.getMissionPageBySlug(pageUpdate.slug);
        if (existingPage && existingPage.id !== pageId) {
          return res.status(400).json({ error: "A mission page with this slug already exists" });
        }
      }
      
      const updatedPage = await storage.updateMissionPage(pageId, pageUpdate);
      
      return res.status(200).json({ page: updatedPage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      // Get the page to check ownership
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this mission page" });
      }
      
      await storage.deleteMissionPage(pageId);
      
      return res.status(200).json({ message: "Mission page deleted successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CALENDAR EVENT ROUTES
  app.get("/api/users/:userId/calendar-events", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const events = await storage.getEvents(userId);
      return res.status(200).json({ events });
    } catch (error) {
      console.error("Error getting calendar events:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this event" });
      }
      
      return res.status(200).json({ event });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/calendar-events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventData = insertCalendarEventSchema.parse(req.body);
      
      if (eventData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create events for this user" });
      }
      
      const event = await storage.createEvent(eventData);
      
      return res.status(201).json({ event });
    } catch (error) {
      console.error("Error creating calendar event:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this event" });
      }
      
      const eventUpdate = req.body;
      const updatedEvent = await storage.updateEvent(eventId, eventUpdate);
      
      return res.status(200).json({ event: updatedEvent });
    } catch (error) {
      console.error("Error updating calendar event:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this event" });
      }
      
      await storage.deleteEvent(eventId);
      
      return res.status(200).json({ message: "Calendar event deleted successfully" });
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CONTACT ROUTES
  app.get("/api/users/:userId/contacts", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const category = req.query.category as string | undefined;
      let contacts;
      
      if (category) {
        contacts = await storage.getContactsByCategory(userId, category);
      } else {
        contacts = await storage.getContacts(userId);
      }
      
      return res.status(200).json({ contacts });
    } catch (error) {
      console.error("Error getting contacts:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this contact" });
      }
      
      return res.status(200).json({ contact });
    } catch (error) {
      console.error("Error getting contact:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/contacts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Add the user ID to the contact data
      const contactData = {
        ...req.body,
        userId: req.session.userId,
      };
      
      // Validate contact data
      const validatedData = insertContactSchema.parse(contactData);
      
      // Create contact
      const contact = await storage.createContact(validatedData);
      
      // Award XP for creating a contact
      try {
        // Add 3 XP for creating a contact
        const xpResult = await awardExperiencePoints(contact.userId, 3);
        if (xpResult.success) {
          return res.status(201).json({
            contact,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            xpAwarded: 3,
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        console.error("Error awarding XP for contact creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ contact });
    } catch (error) {
      console.error("Error creating contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this contact" });
      }
      
      // Update contact
      const updatedContact = await storage.updateContact(contactId, req.body);
      
      return res.status(200).json({ contact: updatedContact });
    } catch (error) {
      console.error("Error updating contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this contact" });
      }
      
      // Delete contact
      await storage.deleteContact(contactId);
      
      return res.status(200).json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/contacts/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this contact" });
      }
      
      // Toggle favorite status
      const updatedContact = await storage.toggleFavoriteContact(contactId);
      
      return res.status(200).json({ contact: updatedContact });
    } catch (error) {
      console.error("Error toggling contact favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // SPREADSHEET ROUTES
  app.get("/api/users/:userId/spreadsheets", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const spreadsheets = await storage.getSpreadsheets(userId);
      
      return res.status(200).json({ spreadsheets });
    } catch (error) {
      console.error("Error getting spreadsheets:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/spreadsheets/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const spreadsheets = await storage.getSpreadsheetsByCategory(userId, category);
      
      return res.status(200).json({ spreadsheets });
    } catch (error) {
      console.error("Error getting spreadsheets by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this spreadsheet" });
      }
      
      return res.status(200).json({ spreadsheet });
    } catch (error) {
      console.error("Error getting spreadsheet:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/spreadsheets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate spreadsheet data
      const validateData = insertSpreadsheetSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create spreadsheet
      const spreadsheet = await storage.createSpreadsheet(validateData);
      
      // Award XP for creating a spreadsheet
      try {
        // Add 8 XP for creating a spreadsheet
        const xpResult = await awardExperiencePoints(spreadsheet.userId, 8);
        if (xpResult.success) {
          return res.status(201).json({
            spreadsheet,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            xpAwarded: 8,
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        console.error("Error awarding XP for spreadsheet creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ spreadsheet });
    } catch (error) {
      console.error("Error creating spreadsheet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this spreadsheet" });
      }
      
      // Update spreadsheet
      const updatedSpreadsheet = await storage.updateSpreadsheet(spreadsheetId, req.body);
      
      return res.status(200).json({ spreadsheet: updatedSpreadsheet });
    } catch (error) {
      console.error("Error updating spreadsheet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this spreadsheet" });
      }
      
      // Delete spreadsheet
      await storage.deleteSpreadsheet(spreadsheetId);
      
      return res.status(200).json({ message: "Spreadsheet deleted successfully" });
    } catch (error) {
      console.error("Error deleting spreadsheet:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/spreadsheets/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this spreadsheet" });
      }
      
      // Toggle favorite status
      const updatedSpreadsheet = await storage.toggleFavoriteSpreadsheet(spreadsheetId);
      
      return res.status(200).json({ spreadsheet: updatedSpreadsheet });
    } catch (error) {
      console.error("Error toggling spreadsheet favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CANVAS ROUTES
  app.get("/api/users/:userId/canvases", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const canvases = await storage.getCanvases(userId);
      
      return res.status(200).json({ canvases });
    } catch (error) {
      console.error("Error getting canvases:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/canvases/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const canvases = await storage.getCanvasesByCategory(userId, category);
      
      return res.status(200).json({ canvases });
    } catch (error) {
      console.error("Error getting canvases by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this canvas" });
      }
      
      return res.status(200).json({ canvas });
    } catch (error) {
      console.error("Error getting canvas:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/canvases", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate canvas data
      const validateData = insertCanvasSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create canvas
      const canvas = await storage.createCanvas(validateData);
      
      return res.status(201).json({ canvas });
    } catch (error) {
      console.error("Error creating canvas:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this canvas" });
      }
      
      // Update canvas
      const updatedCanvas = await storage.updateCanvas(canvasId, req.body);
      
      return res.status(200).json({ canvas: updatedCanvas });
    } catch (error) {
      console.error("Error updating canvas:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this canvas" });
      }
      
      // Delete canvas
      await storage.deleteCanvas(canvasId);
      
      return res.status(200).json({ message: "Canvas deleted successfully" });
    } catch (error) {
      console.error("Error deleting canvas:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/canvases/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this canvas" });
      }
      
      // Toggle favorite status
      const updatedCanvas = await storage.toggleFavoriteCanvas(canvasId);
      
      return res.status(200).json({ canvas: updatedCanvas });
    } catch (error) {
      console.error("Error toggling canvas favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GRAPH ROUTES
  app.get("/api/users/:userId/graphs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const graphs = await storage.getGraphs(userId);
      
      return res.status(200).json({ graphs });
    } catch (error) {
      console.error("Error getting graphs:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/graphs/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const graphs = await storage.getGraphsByCategory(userId, category);
      
      return res.status(200).json({ graphs });
    } catch (error) {
      console.error("Error getting graphs by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this graph" });
      }
      
      return res.status(200).json({ graph });
    } catch (error) {
      console.error("Error getting graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/graphs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate graph data
      const validateData = insertGraphSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create graph
      const graph = await storage.createGraph(validateData);
      
      return res.status(201).json({ graph });
    } catch (error) {
      console.error("Error creating graph:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this graph" });
      }
      
      // Update graph
      const updatedGraph = await storage.updateGraph(graphId, req.body);
      
      return res.status(200).json({ graph: updatedGraph });
    } catch (error) {
      console.error("Error updating graph:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this graph" });
      }
      
      // Delete graph
      await storage.deleteGraph(graphId);
      
      return res.status(200).json({ message: "Graph deleted successfully" });
    } catch (error) {
      console.error("Error deleting graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/graphs/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this graph" });
      }
      
      // Toggle favorite status
      const updatedGraph = await storage.toggleFavoriteGraph(graphId);
      
      return res.status(200).json({ graph: updatedGraph });
    } catch (error) {
      console.error("Error toggling graph favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Folder routes
  app.get("/api/users/:userId/folders", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const folders = await storage.getFolders(userId);
      
      return res.status(200).json({ folders });
    } catch (error) {
      console.error("Error getting folders:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Get children
      const childFolders = await storage.getFolderChildren(folderId);
      const documents = await storage.getDocumentsByFolder(folderId);
      
      return res.status(200).json({ 
        folder, 
        children: {
          folders: childFolders,
          documents
        } 
      });
    } catch (error) {
      console.error("Error getting folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderData = req.body;
      if (!folderData.name || folderData.name.trim() === '') {
        return res.status(400).json({ error: "Folder name is required" });
      }
      
      const userId = req.session.userId;
      
      // Verify parent folder exists and belongs to user if provided
      if (folderData.parentId) {
        const parentFolder = await storage.getFolder(folderData.parentId);
        if (!parentFolder) {
          return res.status(404).json({ error: "Parent folder not found" });
        }
        
        if (parentFolder.userId !== userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      const newFolder = await storage.createFolder({
        ...folderData,
        userId
      });
      
      return res.status(201).json({ folder: newFolder });
    } catch (error) {
      console.error("Error creating folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Prevent cycles in folder structure
      if (req.body.parentId && req.body.parentId !== folder.parentId) {
        if (req.body.parentId === folderId) {
          return res.status(400).json({ error: "A folder cannot be its own parent" });
        }
        
        // Check if the new parent is a descendant of this folder
        const checkForCycle = async (currentFolderId: number, targetFolderId: number): Promise<boolean> => {
          if (currentFolderId === targetFolderId) return true;
          
          const children = await storage.getFolderChildren(currentFolderId);
          for (const child of children) {
            const hasCycle = await checkForCycle(child.id, targetFolderId);
            if (hasCycle) return true;
          }
          
          return false;
        };
        
        const wouldCreateCycle = await checkForCycle(folderId, req.body.parentId);
        if (wouldCreateCycle) {
          return res.status(400).json({ error: "This would create a cycle in the folder structure" });
        }
      }
      
      const updatedFolder = await storage.updateFolder(folderId, req.body);
      
      return res.status(200).json({ folder: updatedFolder });
    } catch (error) {
      console.error("Error updating folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteFolder(folderId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/folders/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedFolder = await storage.toggleFavoriteFolder(folderId);
      
      return res.status(200).json({ folder: updatedFolder });
    } catch (error) {
      console.error("Error toggling folder favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Document routes
  app.get("/api/users/:userId/documents", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const documents = await storage.getDocuments(userId);
      
      return res.status(200).json({ documents });
    } catch (error) {
      console.error("Error getting documents:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      return res.status(200).json({ document });
    } catch (error) {
      console.error("Error getting document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentData = req.body;
      if (!documentData.title || documentData.title.trim() === '') {
        return res.status(400).json({ error: "Document title is required" });
      }
      
      if (!documentData.content) {
        documentData.content = '';  // Default empty content
      }
      
      const userId = req.session.userId;
      
      // Verify folder exists and belongs to user if provided
      if (documentData.folderId) {
        const folder = await storage.getFolder(documentData.folderId);
        if (!folder) {
          return res.status(404).json({ error: "Folder not found" });
        }
        
        if (folder.userId !== userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      const newDocument = await storage.createDocument({
        ...documentData,
        userId
      });
      
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      console.error("Error creating document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // If moving to a different folder, verify folder exists and belongs to user
      if (req.body.folderId && req.body.folderId !== document.folderId) {
        const folder = await storage.getFolder(req.body.folderId);
        if (!folder) {
          return res.status(404).json({ error: "Target folder not found" });
        }
        
        if (folder.userId !== req.session.userId) {
          return res.status(403).json({ error: "Not authorized to move to this folder" });
        }
      }
      
      const updatedDocument = await storage.updateDocument(documentId, req.body);
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      console.error("Error updating document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteDocument(documentId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/documents/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedDocument = await storage.toggleFavoriteDocument(documentId);
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      console.error("Error toggling document favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Template routes
  app.get("/api/users/:userId/templates", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const templates = await storage.getTemplates(userId);
      
      return res.status(200).json({ templates });
    } catch (error) {
      console.error("Error getting templates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/users/:userId/templates/category/:category", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { category } = req.params;
      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }
      
      const templates = await storage.getTemplatesByCategory(userId, category);
      
      return res.status(200).json({ templates });
    } catch (error) {
      console.error("Error getting templates by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      return res.status(200).json({ template });
    } catch (error) {
      console.error("Error getting template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateData = insertTemplateSchema.parse(req.body);
      
      if (!templateData.title || templateData.title.trim() === '') {
        return res.status(400).json({ error: "Template title is required" });
      }
      
      if (!templateData.content) {
        templateData.content = '';  // Default empty content
      }
      
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const newTemplate = await storage.createTemplate({
        ...templateData,
        userId
      });
      
      return res.status(201).json({ template: newTemplate });
    } catch (error) {
      console.error("Error creating template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const templateUpdate = req.body;
      
      const updatedTemplate = await storage.updateTemplate(templateId, templateUpdate);
      
      return res.status(200).json({ template: updatedTemplate });
    } catch (error) {
      console.error("Error updating template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteTemplate(templateId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/templates/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedTemplate = await storage.toggleFavoriteTemplate(templateId);
      
      return res.status(200).json({ template: updatedTemplate });
    } catch (error) {
      console.error("Error toggling template favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Create document from template
  app.post("/api/templates/:id/create-document", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to use this template" });
      }
      
      const { title, folderId } = req.body;
      const documentTitle = title || `${template.title} (Copy)`;
      
      // If folderId provided, verify it exists and belongs to user
      if (folderId) {
        const folder = await storage.getFolder(folderId);
        if (!folder) {
          return res.status(404).json({ error: "Target folder not found" });
        }
        
        if (folder.userId !== req.session.userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      // Create new document from template
      const newDocument = await storage.createDocument({
        userId: req.session.userId,
        folderId: folderId || null,
        title: documentTitle,
        content: template.content,
        description: template.description,
        format: template.format,
        tags: template.tags,
        favorite: false
      });
      
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      console.error("Error creating document from template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Integrations routes
  app.get("/api/users/:userId/integrations", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const integrations = await storage.getUserIntegrations(userId);
      
      // For security, don't return tokens in the response
      const safeIntegrations = integrations.map(integration => {
        const { accessToken, refreshToken, ...safeIntegration } = integration;
        return safeIntegration;
      });
      
      return res.status(200).json({ integrations: safeIntegrations });
    } catch (error) {
      console.error("Error getting user integrations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get a specific integration
  app.get("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      const integration = await storage.getIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Check ownership
      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this integration" });
      }
      
      // For security, don't return tokens in the response
      const { accessToken, refreshToken, ...safeIntegration } = integration;
      
      return res.status(200).json({ integration: safeIntegration });
    } catch (error) {
      console.error("Error getting integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new integration
  app.post("/api/integrations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const { provider, providerName, accessToken, refreshToken, tokenExpiry, scope, status, settings } = req.body;
      
      // Basic validation
      if (!provider || !providerName) {
        return res.status(400).json({ error: "Provider and provider name are required" });
      }
      
      const newIntegration = await storage.createIntegration({
        userId,
        provider,
        providerName,
        accessToken,
        refreshToken,
        tokenExpiry,
        scope,
        status: status || "active",
        settings: settings || {}
      });
      
      // For security, don't return tokens in the response
      const { accessToken: _, refreshToken: __, ...safeIntegration } = newIntegration;
      
      return res.status(201).json({ integration: safeIntegration });
    } catch (error) {
      console.error("Error creating integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update an integration
  app.patch("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      // Check if integration exists and belongs to user
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this integration" });
      }
      
      // Update the integration
      const updatedIntegration = await storage.updateIntegration(integrationId, req.body);
      
      // For security, don't return tokens in the response
      const { accessToken, refreshToken, ...safeIntegration } = updatedIntegration;
      
      return res.status(200).json({ integration: safeIntegration });
    } catch (error) {
      console.error("Error updating integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete an integration
  app.delete("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      // Check if integration exists and belongs to user
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this integration" });
      }
      
      // Delete the integration
      await storage.deleteIntegration(integrationId);
      
      return res.status(200).json({ message: "Integration deleted successfully" });
    } catch (error) {
      console.error("Error deleting integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Progress Tracker Routes
  app.get("/api/users/:userId/progress-trackers", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const progressTrackers = await storage.getProgressTrackersByUserId(userId);
      res.json({ progressTrackers });
    } catch (error) {
      console.error("Failed to fetch progress trackers:", error);
      res.status(500).json({ error: "Failed to fetch progress trackers" });
    }
  });

  app.get("/api/progress-trackers/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const category = req.params.category;
      const progressTrackers = await storage.getProgressTrackersByCategory(userId, category);
      res.json({ progressTrackers });
    } catch (error) {
      console.error("Failed to fetch progress trackers by category:", error);
      res.status(500).json({ error: "Failed to fetch progress trackers by category" });
    }
  });

  app.get("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const progressTracker = await storage.getProgressTracker(trackerId);
      if (!progressTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }

      if (progressTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this tracker" });
      }

      res.json({ progressTracker });
    } catch (error) {
      console.error("Failed to fetch progress tracker:", error);
      res.status(500).json({ error: "Failed to fetch progress tracker" });
    }
  });

  app.post("/api/progress-trackers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const trackerData = {
        ...req.body,
        userId
      };
      
      const progressTracker = await storage.createProgressTracker(trackerData);
      res.status(201).json({ progressTracker });
    } catch (error) {
      console.error("Failed to create progress tracker:", error);
      res.status(500).json({ error: "Failed to create progress tracker" });
    }
  });

  app.patch("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const existingTracker = await storage.getProgressTracker(trackerId);
      if (!existingTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }
      
      if (existingTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this tracker" });
      }
      
      const updatedTracker = await storage.updateProgressTracker(trackerId, req.body);
      res.json({ progressTracker: updatedTracker });
    } catch (error) {
      console.error("Failed to update progress tracker:", error);
      res.status(500).json({ error: "Failed to update progress tracker" });
    }
  });

  app.delete("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const existingTracker = await storage.getProgressTracker(trackerId);
      if (!existingTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }
      
      if (existingTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this tracker" });
      }
      
      await storage.deleteProgressTracker(trackerId);
      res.json({ message: "Progress tracker deleted successfully" });
    } catch (error) {
      console.error("Failed to delete progress tracker:", error);
      res.status(500).json({ error: "Failed to delete progress tracker" });
    }
  });

  // Media Items Routes
  app.get("/api/users/:userId/media-items", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const mediaItems = await storage.getMediaItemsByUserId(userId);
      res.json({ mediaItems });
    } catch (error) {
      console.error("Failed to fetch media items:", error);
      res.status(500).json({ error: "Failed to fetch media items" });
    }
  });

  app.get("/api/media-items/album/:albumId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.albumId);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      // Ensure the user owns the album before fetching its items
      const album = await storage.getMediaAlbum(albumId);
      if (!album) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (album.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this album" });
      }
      
      const mediaItems = await storage.getMediaItemsByAlbum(albumId);
      res.json({ mediaItems });
    } catch (error) {
      console.error("Failed to fetch media items by album:", error);
      res.status(500).json({ error: "Failed to fetch media items by album" });
    }
  });

  app.get("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const mediaItem = await storage.getMediaItem(itemId);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (mediaItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this media item" });
      }
      
      res.json({ mediaItem });
    } catch (error) {
      console.error("Failed to fetch media item:", error);
      res.status(500).json({ error: "Failed to fetch media item" });
    }
  });

  // Configure multer for file upload
  const multerStorage = multer.memoryStorage();
  const upload = multer({ 
    storage: multerStorage,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      // Only allow images and videos
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });

  // Handle media item upload with multer middleware
  app.post("/api/media-items", isAuthenticated, upload.array('files'), async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const files = req.files as Express.Multer.File[];
      const albumId = req.body.albumId ? parseInt(req.body.albumId) : undefined;
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      console.log(`Processing ${files.length} uploaded files`);
      
      // Process each uploaded file
      const mediaItems: MediaItem[] = [];
      
      for (const file of files) {
        const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        
        // Convert file buffer to base64 for storage
        const fileData = file.buffer.toString('base64');
        
        // Prepare media item data
        const itemData: InsertMediaItem = {
          userId,
          albumId,
          fileName: file.originalname,
          fileType,
          mimeType: file.mimetype,
          fileData: `data:${file.mimetype};base64,${fileData}`,
          thumbnailUrl: `data:${file.mimetype};base64,${fileData}`, // Use same data for thumbnail for now
          title: file.originalname,
          size: file.size,
          isFavorite: false,
          tags: []
        };
        
        // Create the media item
        const mediaItem = await storage.createMediaItem(itemData);
        mediaItems.push(mediaItem);
      }
      
      res.status(201).json({ mediaItems });
    } catch (error) {
      console.error("Failed to create media item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create media item" });
    }
  });

  app.patch("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this media item" });
      }
      
      // Don't allow changing the userId
      const { userId, ...updateData } = req.body;
      
      const updatedItem = await storage.updateMediaItem(itemId, updateData);
      res.json({ mediaItem: updatedItem });
    } catch (error) {
      console.error("Failed to update media item:", error);
      res.status(500).json({ error: "Failed to update media item" });
    }
  });

  app.delete("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this media item" });
      }
      
      await storage.deleteMediaItem(itemId);
      res.json({ message: "Media item deleted successfully" });
    } catch (error) {
      console.error("Failed to delete media item:", error);
      res.status(500).json({ error: "Failed to delete media item" });
    }
  });

  app.post("/api/media-items/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this media item" });
      }
      
      const updatedItem = await storage.toggleFavoriteMediaItem(itemId);
      res.json({ mediaItem: updatedItem });
    } catch (error) {
      console.error("Failed to toggle favorite status:", error);
      res.status(500).json({ error: "Failed to toggle favorite status" });
    }
  });

  // Media Albums Routes
  app.get("/api/users/:userId/media-albums", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const mediaAlbums = await storage.getMediaAlbumsByUserId(userId);
      res.json({ mediaAlbums });
    } catch (error) {
      console.error("Failed to fetch media albums:", error);
      res.status(500).json({ error: "Failed to fetch media albums" });
    }
  });

  app.get("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const mediaAlbum = await storage.getMediaAlbum(albumId);
      if (!mediaAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (mediaAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this album" });
      }
      
      res.json({ mediaAlbum });
    } catch (error) {
      console.error("Failed to fetch media album:", error);
      res.status(500).json({ error: "Failed to fetch media album" });
    }
  });

  app.post("/api/media-albums", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      
      const albumData = {
        ...req.body,
        userId
      };
      
      // Validate with schema
      const validatedData = insertMediaAlbumSchema.parse(albumData);
      
      const mediaAlbum = await storage.createMediaAlbum(validatedData);
      res.status(201).json({ mediaAlbum });
    } catch (error) {
      console.error("Failed to create media album:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create media album" });
    }
  });

  app.patch("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this album" });
      }
      
      // Don't allow changing the userId
      const { userId, ...updateData } = req.body;
      
      const updatedAlbum = await storage.updateMediaAlbum(albumId, updateData);
      res.json({ mediaAlbum: updatedAlbum });
    } catch (error) {
      console.error("Failed to update media album:", error);
      res.status(500).json({ error: "Failed to update media album" });
    }
  });

  app.delete("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this album" });
      }
      
      await storage.deleteMediaAlbum(albumId);
      res.json({ message: "Album deleted successfully" });
    } catch (error) {
      console.error("Failed to delete media album:", error);
      res.status(500).json({ error: "Failed to delete media album" });
    }
  });

  app.post("/api/media-albums/:id/set-cover", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this album" });
      }
      
      const { mediaItemId } = req.body;
      if (!mediaItemId) {
        return res.status(400).json({ error: "Media item ID is required" });
      }
      
      // Verify the media item exists and belongs to the user
      const mediaItem = await storage.getMediaItem(mediaItemId);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (mediaItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to use this media item" });
      }
      
      const updatedAlbum = await storage.setAlbumCoverImage(albumId, mediaItemId);
      res.json({ mediaAlbum: updatedAlbum });
    } catch (error) {
      console.error("Failed to set album cover image:", error);
      res.status(500).json({ error: "Failed to set album cover image" });
    }
  });


  // Experience points endpoint to award XP for various actions
  app.post("/api/users/:userId/award-xp", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { amount, reason } = req.body;
      console.log(`Awarding ${amount} XP to user ${userId} for ${reason || 'unknown action'}`);
      
      // Validate XP amount
      const xpAmount = parseInt(amount);
      if (isNaN(xpAmount) || xpAmount <= 0) {
        console.error(`Invalid XP amount: ${amount}`);
        return res.status(400).json({ error: "XP amount must be a positive number" });
      }
      
      // Use helper function to award XP
      const xpResult = await awardExperiencePoints(userId, xpAmount);
      console.log(`XP award result:`, xpResult);
      
      if (!xpResult.success) {
        console.error(`Failed to award XP to user ${userId}`);
        return res.status(404).json({ error: "Failed to award XP" });
      }
      
      return res.status(200).json({ 
        success: true,
        reason,
        xpAwarded: xpAmount,
        levelUp: xpResult.levelUp,
        stats: {
          ...xpResult.newStats,
          experience: {
            ...xpResult.newStats?.experience,
            totalXP: xpResult.totalXP,
            showLevelUp: xpResult.levelUp
          }
        }
      });
    } catch (error) {
      console.error("Error awarding XP:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Daily Log APIs
  
  // Get user's daily logs
  app.get("/api/users/:userId/daily-logs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { date } = req.query;
      
      let logs;
      if (date) {
        logs = await db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), eq(userDailyLogs.date, date as string)))
          .orderBy(desc(userDailyLogs.id))
          .limit(1);
      } else {
        logs = await db.select().from(userDailyLogs)
          .where(eq(userDailyLogs.userId, userId))
          .orderBy(desc(userDailyLogs.date));
      }
      return res.status(200).json({ logs });
    } catch (error) {
      console.error("Error fetching daily logs:", error);
      return res.status(500).json({ error: "Failed to fetch daily logs" });
    }
  });
  
  // Create a new daily log entry
  app.post("/api/users/:userId/daily-logs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { 
        date, yesterdayXp, todayPrimaryMission, optionalBoostsShown, boostsData,
        wakeTime, sleepTime, mentalState, physicalState, emotionalState,
        gratitude, tomorrowGoals, annualGoals, thoughts,
        contentConsumed, research, todoIdeas,
        sourceAuthor, sourceMaterial, researchNote, revisionNote, executionNote,
        researchEntries,
        wentWell, couldBeBetter, learned
      } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      const result = await db.insert(userDailyLogs).values({
        userId,
        date,
        yesterdayXp: yesterdayXp || 0,
        todayPrimaryMission: todayPrimaryMission || null,
        optionalBoostsShown: optionalBoostsShown || false,
        boostsData: boostsData || {},
        wakeTime: wakeTime || null,
        sleepTime: sleepTime || null,
        mentalState: mentalState ?? 5,
        physicalState: physicalState ?? 5,
        emotionalState: emotionalState ?? 5,
        gratitude: gratitude || null,
        tomorrowGoals: tomorrowGoals || null,
        annualGoals: annualGoals || null,
        thoughts: thoughts || null,
        contentConsumed: contentConsumed || null,
        research: research || null,
        todoIdeas: todoIdeas || null,
        sourceAuthor: sourceAuthor || null,
        sourceMaterial: sourceMaterial || null,
        researchNote: researchNote || null,
        revisionNote: revisionNote || null,
        executionNote: executionNote || null,
        researchEntries: researchEntries || [],
        wentWell: wentWell || null,
        couldBeBetter: couldBeBetter || null,
        learned: learned || null,
      }).onConflictDoUpdate({
        target: [userDailyLogs.userId, userDailyLogs.date],
        set: {
          ...(yesterdayXp !== undefined && { yesterdayXp }),
          ...(todayPrimaryMission !== undefined && { todayPrimaryMission }),
          ...(optionalBoostsShown !== undefined && { optionalBoostsShown }),
          ...(boostsData !== undefined && { boostsData }),
          ...(wakeTime !== undefined && { wakeTime }),
          ...(sleepTime !== undefined && { sleepTime }),
          ...(mentalState !== undefined && { mentalState }),
          ...(physicalState !== undefined && { physicalState }),
          ...(emotionalState !== undefined && { emotionalState }),
          ...(gratitude !== undefined && { gratitude }),
          ...(tomorrowGoals !== undefined && { tomorrowGoals }),
          ...(annualGoals !== undefined && { annualGoals }),
          ...(thoughts !== undefined && { thoughts }),
          ...(contentConsumed !== undefined && { contentConsumed }),
          ...(research !== undefined && { research }),
          ...(todoIdeas !== undefined && { todoIdeas }),
          ...(sourceAuthor !== undefined && { sourceAuthor }),
          ...(sourceMaterial !== undefined && { sourceMaterial }),
          ...(researchNote !== undefined && { researchNote }),
          ...(revisionNote !== undefined && { revisionNote }),
          ...(executionNote !== undefined && { executionNote }),
          ...(researchEntries !== undefined && { researchEntries }),
          ...(wentWell !== undefined && { wentWell }),
          ...(couldBeBetter !== undefined && { couldBeBetter }),
          ...(learned !== undefined && { learned }),
        },
      }).returning();
      
      const savedLog = result[0];
      
      // Convert previous day's todoIdeas into upcoming missions (quests)
      try {
        const [year, month, day] = date.split('-').map(Number);
        const previousDay = new Date(year, month - 1, day - 1);
        const previousDateStr = `${previousDay.getFullYear()}-${String(previousDay.getMonth() + 1).padStart(2, '0')}-${String(previousDay.getDate()).padStart(2, '0')}`;
        const todayMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
        
        const previousLogs = await db.select()
          .from(userDailyLogs)
          .where(and(
            eq(userDailyLogs.userId, userId),
            eq(userDailyLogs.date, previousDateStr)
          ));
        
        if (previousLogs.length > 0 && previousLogs[0].todoIdeas && !previousLogs[0].todosConverted) {
          const todoIdeasText = previousLogs[0].todoIdeas;
          const todoLines = todoIdeasText
            .split('\n')
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0);
          
          const existingQuests = await db.select({ title: questsTable.title })
            .from(questsTable)
            .where(eq(questsTable.userId, userId));
          const existingTitles = new Set(existingQuests.map(q => q.title.toLowerCase().trim()));
          
          let created = 0;
          for (const todoLine of todoLines) {
            if (!existingTitles.has(todoLine.toLowerCase().trim())) {
              await storage.createQuest({
                userId,
                title: todoLine,
                description: `Auto-created from To-Do Ideas on ${previousDateStr}`,
                category: 'todo',
                completed: false,
                experienceReward: 50,
                createdAt: todayMidnight
              });
              existingTitles.add(todoLine.toLowerCase().trim());
              created++;
            }
          }
          
          await db.update(userDailyLogs)
            .set({ todosConverted: true })
            .where(eq(userDailyLogs.id, previousLogs[0].id));
          
          console.log(`Created ${created}/${todoLines.length} quests from previous day's todoIdeas for user ${userId} (${todoLines.length - created} duplicates skipped)`);
        }
      } catch (todoError) {
        console.error("Error converting todoIdeas to quests:", todoError);
      }
      
      return res.status(200).json({ log: savedLog, message: "Daily log saved successfully" });
    } catch (error) {
      console.error("Error creating daily log:", error);
      return res.status(500).json({ error: "Failed to create daily log" });
    }
  });
  
  // Update existing daily log
  app.patch("/api/users/:userId/daily-logs/update", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { 
        date, boostsData,
        // Energy log fields
        wakeTime, sleepTime, mentalState, physicalState, emotionalState,
        // Intention log fields
        gratitude, tomorrowGoals, annualGoals, thoughts,
        // Data log fields
        contentConsumed, research, todoIdeas,
        // Research log fields
        sourceAuthor, sourceMaterial, researchNote, revisionNote, executionNote,
        // Reflection log fields
        wentWell, couldBeBetter, learned
      } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Check if a log exists for this date
      const existingLog = await db.select()
        .from(userDailyLogs)
        .where(and(
          eq(userDailyLogs.userId, userId),
          eq(userDailyLogs.date, date)
        ));
      
      if (existingLog.length > 0) {
        // Update the existing log with all fields
        await db.update(userDailyLogs)
          .set({
            boostsData: boostsData !== undefined ? boostsData : existingLog[0].boostsData,
            // Energy log fields
            wakeTime: wakeTime !== undefined ? wakeTime : existingLog[0].wakeTime,
            sleepTime: sleepTime !== undefined ? sleepTime : existingLog[0].sleepTime,
            mentalState: mentalState !== undefined ? mentalState : existingLog[0].mentalState,
            physicalState: physicalState !== undefined ? physicalState : existingLog[0].physicalState,
            emotionalState: emotionalState !== undefined ? emotionalState : existingLog[0].emotionalState,
            // Intention log fields
            gratitude: gratitude !== undefined ? gratitude : existingLog[0].gratitude,
            tomorrowGoals: tomorrowGoals !== undefined ? tomorrowGoals : existingLog[0].tomorrowGoals,
            annualGoals: annualGoals !== undefined ? annualGoals : existingLog[0].annualGoals,
            thoughts: thoughts !== undefined ? thoughts : existingLog[0].thoughts,
            // Data log fields
            contentConsumed: contentConsumed !== undefined ? contentConsumed : existingLog[0].contentConsumed,
            research: research !== undefined ? research : existingLog[0].research,
            todoIdeas: todoIdeas !== undefined ? todoIdeas : existingLog[0].todoIdeas,
            todosConverted: todoIdeas !== undefined ? false : existingLog[0].todosConverted,
            // Research log fields
            sourceAuthor: sourceAuthor !== undefined ? sourceAuthor : existingLog[0].sourceAuthor,
            sourceMaterial: sourceMaterial !== undefined ? sourceMaterial : existingLog[0].sourceMaterial,
            researchNote: researchNote !== undefined ? researchNote : existingLog[0].researchNote,
            revisionNote: revisionNote !== undefined ? revisionNote : existingLog[0].revisionNote,
            executionNote: executionNote !== undefined ? executionNote : existingLog[0].executionNote,
            // Reflection log fields
            wentWell: wentWell !== undefined ? wentWell : existingLog[0].wentWell,
            couldBeBetter: couldBeBetter !== undefined ? couldBeBetter : existingLog[0].couldBeBetter,
            learned: learned !== undefined ? learned : existingLog[0].learned
          })
          .where(eq(userDailyLogs.id, existingLog[0].id));
          
        const updatedLog = await db.select().from(userDailyLogs).where(eq(userDailyLogs.id, existingLog[0].id));
        storage.logActivityEvent(userId, 'daily_log', { date }).catch(() => {});
        
        return res.status(200).json({ log: updatedLog[0], message: "Daily log updated successfully" });
      } else {
        // Create a new log if it doesn't exist
        const newLog = await db.insert(userDailyLogs).values({
          userId: userId,
          date,
          boostsData: boostsData || {},
          // Energy log fields
          wakeTime: wakeTime || null,
          sleepTime: sleepTime || null,
          mentalState: mentalState || 5,
          physicalState: physicalState || 5,
          emotionalState: emotionalState || 5,
          // Intention log fields
          gratitude: gratitude || null,
          tomorrowGoals: tomorrowGoals || null,
          annualGoals: annualGoals || null,
          thoughts: thoughts || null,
          // Data log fields
          contentConsumed: contentConsumed || null,
          research: research || null,
          todoIdeas: todoIdeas || null,
          // Research log fields
          sourceAuthor: sourceAuthor || null,
          sourceMaterial: sourceMaterial || null,
          researchNote: researchNote || null,
          revisionNote: revisionNote || null,
          executionNote: executionNote || null,
          // Reflection log fields
          wentWell: wentWell || null,
          couldBeBetter: couldBeBetter || null,
          learned: learned || null
        }).returning();
        
        return res.status(201).json({ log: newLog[0] });
      }
    } catch (error) {
      console.error("Error updating daily log:", error);
      return res.status(500).json({ error: "Failed to update daily log" });
    }
  });

  app.get("/api/widget-states", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const states = await storage.getWidgetStates(userId);
      return res.json(states);
    } catch (error) {
      console.error("Error fetching widget states:", error);
      return res.status(500).json({ error: "Failed to fetch widget states" });
    }
  });

  app.put("/api/widget-states", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ widgetId: z.string().min(1), isOpen: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "widgetId (string) and isOpen (boolean) required" });
      }
      const states = await storage.setWidgetState(userId, parsed.data.widgetId, parsed.data.isOpen);
      return res.json(states);
    } catch (error) {
      console.error("Error updating widget state:", error);
      return res.status(500).json({ error: "Failed to update widget state" });
    }
  });

  app.get("/api/widget-layouts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const layouts = await storage.getWidgetLayouts(userId);
      return res.json(layouts);
    } catch (error) {
      console.error("Error fetching widget layouts:", error);
      return res.status(500).json({ error: "Failed to fetch widget layouts" });
    }
  });

  app.put("/api/widget-layouts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ page: z.string().min(1), order: z.array(z.string()) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "page (string) and order (string[]) required" });
      }
      const layouts = await storage.setWidgetLayout(userId, parsed.data.page, parsed.data.order);
      return res.json(layouts);
    } catch (error) {
      console.error("Error updating widget layout:", error);
      return res.status(500).json({ error: "Failed to update widget layout" });
    }
  });

  app.patch("/api/users/:userId/daily-logs/rename-research-field", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

      const schema = z.object({
        field: z.enum(["sourceAuthor", "sourceMaterial"]),
        oldValue: z.string(),
        newValue: z.string().min(1),
        scopeAuthor: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error });

      const { field, oldValue, newValue, scopeAuthor } = parsed.data;

      const allLogs = await db.select().from(userDailyLogs).where(eq(userDailyLogs.userId, userId));

      let updatedCount = 0;
      for (const log of allLogs) {
        let needsUpdate = false;
        const updates: Record<string, any> = {};

        const logAuthor = (log as any).sourceAuthor;
        const matchesScope = !scopeAuthor || field === 'sourceAuthor' || logAuthor === scopeAuthor;

        if ((log as any)[field] === oldValue && matchesScope) {
          updates[field] = newValue;
          needsUpdate = true;
        }

        const entries = Array.isArray((log as any).researchEntries) ? [...(log as any).researchEntries] : [];
        let entriesChanged = false;
        for (let i = 0; i < entries.length; i++) {
          const entryMatchesScope = !scopeAuthor || field === 'sourceAuthor' || entries[i].sourceAuthor === scopeAuthor;
          if (entries[i][field] === oldValue && entryMatchesScope) {
            entries[i] = { ...entries[i], [field]: newValue };
            entriesChanged = true;
          }
        }
        if (entriesChanged) {
          updates.researchEntries = entries;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await db.update(userDailyLogs).set(updates).where(eq(userDailyLogs.id, log.id));
          updatedCount++;
        }
      }

      return res.json({ success: true, updatedCount });
    } catch (error) {
      console.error("Error renaming research field:", error);
      return res.status(500).json({ error: "Failed to rename" });
    }
  });

  app.get("/api/dismissed-knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const entries = await storage.getDismissedKnowledge(userId);
      return res.json(entries);
    } catch (error) {
      console.error("Error fetching dismissed knowledge:", error);
      return res.status(500).json({ error: "Failed to fetch dismissed knowledge" });
    }
  });

  app.post("/api/dismissed-knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ author: z.string().min(1), sourceMaterial: z.string().nullable().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "author is required" });
      }
      const existing = await storage.getDismissedKnowledge(userId);
      const alreadyDismissed = existing.find(e => e.author === parsed.data.author && e.sourceMaterial === (parsed.data.sourceMaterial ?? null));
      if (alreadyDismissed) {
        return res.json(alreadyDismissed);
      }
      const entry = await storage.dismissKnowledgeEntry({ userId, author: parsed.data.author, sourceMaterial: parsed.data.sourceMaterial ?? null });
      return res.json(entry);
    } catch (error) {
      console.error("Error dismissing knowledge entry:", error);
      return res.status(500).json({ error: "Failed to dismiss knowledge entry" });
    }
  });

  app.delete("/api/dismissed-knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.undismissKnowledgeEntry(id, userId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Error undismissing knowledge entry:", error);
      return res.status(500).json({ error: "Failed to undismiss knowledge entry" });
    }
  });

  // Analytics / Insights API
  app.get("/api/analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      const [dailyLogs, allMissions, stats] = await Promise.all([
        db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, cutoffStr)))
          .orderBy(asc(userDailyLogs.date)),
        db.select().from(questsTable)
          .where(eq(questsTable.userId, userId)),
        storage.getUserStats(userId),
      ]);

      const moodTrends = dailyLogs.map(log => ({
        date: log.date,
        mental: log.mentalState ?? 5,
        physical: log.physicalState ?? 5,
        emotional: log.emotionalState ?? 5,
        average: Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10,
      }));

      const activeMissions = allMissions.filter(m => !m.deletedAt);
      const completedMissions = activeMissions.filter(m => m.completed);

      const completionsByDay: Record<string, number> = {};
      const xpByDay: Record<string, number> = {};
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dt = new Date(m.completedAt);
          const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
          if (day >= cutoffStr) {
            completionsByDay[day] = (completionsByDay[day] || 0) + 1;
            xpByDay[day] = (xpByDay[day] || 0) + (m.experienceReward || 0);
          }
        }
      });

      const dateRange: string[] = [];
      const d = new Date(cutoffStr);
      const today = new Date();
      while (d <= today) {
        dateRange.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }

      const missionCompletionTrend = dateRange.map(date => ({
        date,
        completed: completionsByDay[date] || 0,
        xpEarned: xpByDay[date] || 0,
      }));

      const categoryStats: Record<string, { total: number; completed: number; totalXp: number; totalEnergy: number }> = {};
      activeMissions.forEach(m => {
        const cat = m.category || "general";
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0, totalXp: 0, totalEnergy: 0 };
        categoryStats[cat].total++;
        if (m.completed) {
          categoryStats[cat].completed++;
          categoryStats[cat].totalXp += m.experienceReward || 0;
        }
        categoryStats[cat].totalEnergy += m.energyCost || 0;
      });

      const difficultyStats: Record<string, { total: number; completed: number }> = {};
      activeMissions.forEach(m => {
        const diff = m.difficulty || "D";
        if (!difficultyStats[diff]) difficultyStats[diff] = { total: 0, completed: 0 };
        difficultyStats[diff].total++;
        if (m.completed) difficultyStats[diff].completed++;
      });

      const sleepData = dailyLogs
        .filter(log => log.wakeTime || log.sleepTime)
        .map(log => ({ date: log.date, wakeTime: log.wakeTime, sleepTime: log.sleepTime }));

      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const weeklyBuckets: { missions: number; xp: number }[] = Array.from({ length: 7 }, () => ({ missions: 0, xp: 0 }));
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dow = new Date(m.completedAt).getDay();
          weeklyBuckets[dow].missions++;
          weeklyBuckets[dow].xp += m.experienceReward || 0;
        }
      });
      const weeklyPatterns = weeklyBuckets.map((b, i) => ({ day: dayNames[i], missions: b.missions, xp: b.xp }));

      const streakHistory = dateRange.map(date => ({ date, count: completionsByDay[date] || 0 }));

      const completionEntries = Object.entries(completionsByDay);
      const xpEntries = Object.entries(xpByDay);
      const bestDayMissions = completionEntries.length > 0 ? Math.max(...completionEntries.map(e => e[1])) : 0;
      const bestDayXp = xpEntries.length > 0 ? Math.max(...xpEntries.map(e => e[1])) : 0;
      const bestDayDate = completionEntries.length > 0 ? completionEntries.reduce((a, b) => b[1] > a[1] ? b : a)[0] : null;
      const totalDaysActive = completionEntries.filter(e => e[1] > 0).length;

      const difficultyRanks = ["S","A","B","C","D"];
      let highestDifficulty: string | null = null;
      for (const rank of difficultyRanks) {
        if (completedMissions.some(m => (m.difficulty || "D") === rank)) {
          highestDifficulty = rank;
          break;
        }
      }

      let longestStreak = 0;
      let currentRun = 0;
      for (const date of dateRange) {
        if ((completionsByDay[date] || 0) > 0) {
          currentRun++;
          if (currentRun > longestStreak) longestStreak = currentRun;
        } else {
          currentRun = 0;
        }
      }

      const personalRecords = { bestDayMissions, bestDayXp, bestDayDate, totalDaysActive, highestDifficulty, longestStreak };

      const totalEnergyCost = activeMissions.reduce((sum, m) => sum + (m.energyCost || 0), 0);
      const completedEnergyCost = completedMissions.reduce((sum, m) => sum + (m.energyCost || 0), 0);
      const tokenEfficiency = {
        totalEnergyCost,
        completedEnergyCost,
        efficiency: totalEnergyCost > 0 ? Math.round(completedEnergyCost / totalEnergyCost * 100) : 0,
      };

      const sleepWellnessCorrelation = dailyLogs
        .filter(log => log.wakeTime && log.sleepTime && log.mentalState != null && log.physicalState != null && log.emotionalState != null)
        .map(log => {
          const [wH, wM] = (log.wakeTime as string).split(":").map(Number);
          const [sH, sM] = (log.sleepTime as string).split(":").map(Number);
          let diffMin = (wH * 60 + wM) - (sH * 60 + sM);
          if (diffMin < 0) diffMin += 24 * 60;
          const sleepHours = Math.round(diffMin / 60 * 10) / 10;
          const mood = Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10;
          return { date: log.date, sleepHours, mood };
        });

      res.json({
        moodTrends,
        missionCompletionTrend,
        categoryStats,
        difficultyStats,
        sleepData,
        weeklyPatterns,
        streakHistory,
        personalRecords,
        tokenEfficiency,
        sleepWellnessCorrelation,
        summary: {
          totalMissions: activeMissions.length,
          completedMissions: completedMissions.length,
          completionRate: activeMissions.length > 0 ? Math.round((completedMissions.length / activeMissions.length) * 100) : 0,
          totalXpEarned: completedMissions.reduce((sum, m) => sum + (m.experienceReward || 0), 0),
          currentLevel: stats?.level ?? 1,
          currentXp: stats?.experienceCurrent ?? 0,
          currentStreak: stats?.streakDays ?? 0,
          avgMoodScore: moodTrends.length > 0 ? Math.round(moodTrends.reduce((s, m) => s + m.average, 0) / moodTrends.length * 10) / 10 : 0,
          daysTracked: dailyLogs.length,
        },
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/stat-analytics", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      const [dailyLogs, allMissions, stats] = await Promise.all([
        db.select().from(userDailyLogs)
          .where(and(eq(userDailyLogs.userId, userId), gte(userDailyLogs.date, cutoffStr)))
          .orderBy(asc(userDailyLogs.date)),
        db.select().from(questsTable)
          .where(eq(questsTable.userId, userId)),
        storage.getUserStats(userId),
      ]);

      const activeMissions = allMissions.filter(m => !m.deletedAt);
      const completedMissions = activeMissions.filter(m => m.completed);

      const dateRange: string[] = [];
      const d = new Date(cutoffStr);
      const today = new Date();
      while (d <= today) {
        dateRange.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }

      const xpByDay: Record<string, number> = {};
      const completionsByDay: Record<string, number> = {};
      const energyByDay: Record<string, number> = {};
      const missionsByDay: Record<string, { title: string; xp: number; energy: number; category: string; difficulty: string }[]> = {};

      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dt = new Date(m.completedAt);
          const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
          if (day >= cutoffStr) {
            xpByDay[day] = (xpByDay[day] || 0) + (m.experienceReward || 0);
            completionsByDay[day] = (completionsByDay[day] || 0) + 1;
            energyByDay[day] = (energyByDay[day] || 0) + (m.energyCost || 0);
            if (!missionsByDay[day]) missionsByDay[day] = [];
            missionsByDay[day].push({
              title: m.title,
              xp: m.experienceReward || 0,
              energy: m.energyCost || 0,
              category: m.category || "general",
              difficulty: m.difficulty || "D",
            });
          }
        }
      });

      const xpTrend = dateRange.map(date => ({
        date,
        xp: xpByDay[date] || 0,
        missions: completionsByDay[date] || 0,
      }));

      const energyTrend = dateRange.map(date => ({
        date,
        energyUsed: energyByDay[date] || 0,
        missions: completionsByDay[date] || 0,
      }));

      const categoryStats: Record<string, { total: number; completed: number; totalXp: number; totalEnergy: number }> = {};
      activeMissions.forEach(m => {
        const cat = m.category || "general";
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0, totalXp: 0, totalEnergy: 0 };
        categoryStats[cat].total++;
        if (m.completed) {
          categoryStats[cat].completed++;
          categoryStats[cat].totalXp += m.experienceReward || 0;
          categoryStats[cat].totalEnergy += m.energyCost || 0;
        }
      });

      const difficultyBreakdown: Record<string, { total: number; completed: number; totalXp: number }> = {};
      activeMissions.forEach(m => {
        const diff = m.difficulty || "D";
        if (!difficultyBreakdown[diff]) difficultyBreakdown[diff] = { total: 0, completed: 0, totalXp: 0 };
        difficultyBreakdown[diff].total++;
        if (m.completed) {
          difficultyBreakdown[diff].completed++;
          difficultyBreakdown[diff].totalXp += m.experienceReward || 0;
        }
      });

      const moodTrend = dailyLogs.map(log => ({
        date: log.date,
        mental: log.mentalState ?? 5,
        physical: log.physicalState ?? 5,
        emotional: log.emotionalState ?? 5,
        average: Math.round(((log.mentalState ?? 5) + (log.physicalState ?? 5) + (log.emotionalState ?? 5)) / 3 * 10) / 10,
      }));

      const completionTrend = dateRange.map(date => ({
        date,
        completed: completionsByDay[date] || 0,
        total: activeMissions.filter(m => {
          if (!m.createdAt) return false;
          const created = new Date(m.createdAt).toISOString().split("T")[0];
          return created <= date;
        }).length,
      }));

      const maxTokens = stats?.energyPointsMax ?? 100;
      const tokenUtilization = dateRange.map(date => {
        const used = energyByDay[date] || 0;
        return {
          date,
          used,
          remaining: Math.max(maxTokens - used, 0),
          utilization: maxTokens > 0 ? Math.round((used / maxTokens) * 100) : 0,
        };
      });

      const topMissions = completedMissions
        .filter(m => m.completedAt)
        .sort((a, b) => (b.experienceReward || 0) - (a.experienceReward || 0))
        .slice(0, 10)
        .map(m => ({
          title: m.title,
          xp: m.experienceReward || 0,
          energy: m.energyCost || 0,
          difficulty: m.difficulty || "D",
          category: m.category || "general",
          completedAt: m.completedAt,
        }));

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayBuckets = Array.from({ length: 7 }, () => ({ missions: 0, xp: 0, energy: 0 }));
      completedMissions.forEach(m => {
        if (m.completedAt) {
          const dow = new Date(m.completedAt).getDay();
          weekdayBuckets[dow].missions++;
          weekdayBuckets[dow].xp += m.experienceReward || 0;
          weekdayBuckets[dow].energy += m.energyCost || 0;
        }
      });
      const weekdayPatterns = weekdayBuckets.map((b, i) => ({ day: dayNames[i], ...b }));

      const totalXpEarned = completedMissions.reduce((s, m) => s + (m.experienceReward || 0), 0);
      const totalEnergySpent = completedMissions.reduce((s, m) => s + (m.energyCost || 0), 0);
      const avgXpPerMission = completedMissions.length > 0 ? Math.round(totalXpEarned / completedMissions.length) : 0;
      const avgEnergyPerMission = completedMissions.length > 0 ? Math.round(totalEnergySpent / completedMissions.length) : 0;

      res.json({
        xpTrend,
        energyTrend,
        completionTrend,
        tokenUtilization,
        categoryStats,
        difficultyBreakdown,
        moodTrend,
        topMissions,
        weekdayPatterns,
        summary: {
          totalMissions: activeMissions.length,
          completedMissions: completedMissions.length,
          completionRate: activeMissions.length > 0 ? Math.round((completedMissions.length / activeMissions.length) * 100) : 0,
          totalXpEarned,
          totalEnergySpent,
          avgXpPerMission,
          avgEnergyPerMission,
          currentLevel: stats?.level ?? 1,
          currentXp: stats?.experienceCurrent ?? 0,
          xpToNextLevel: (stats?.experienceMax ?? 1000) - (stats?.experienceCurrent ?? 0),
          maxXp: stats?.experienceMax ?? 1000,
          currentStreak: stats?.streakDays ?? 0,
          energyMax: stats?.energyPointsMax ?? 100,
          healthMax: stats?.healthPointsMax ?? 100,
          timeMax: stats?.timeTokensMax ?? 100,
          attentionMax: stats?.attentionTokensMax ?? 100,
          daysTracked: dailyLogs.length,
          avgMoodScore: moodTrend.length > 0 ? Math.round(moodTrend.reduce((s, m) => s + m.average, 0) / moodTrend.length * 10) / 10 : 0,
        },
      });
    } catch (error) {
      console.error("Error fetching stat analytics:", error);
      res.status(500).json({ error: "Failed to fetch stat analytics" });
    }
  });

  app.get("/api/streaks", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const stats = await storage.getUserStats(userId);
      const currentStreak = stats?.streakDays ?? 0;

      const allQuests = await storage.getQuests(userId);

      const today = new Date();
      const heatmapStart = new Date(today);
      heatmapStart.setDate(heatmapStart.getDate() - 364);
      const heatmapDays: string[] = [];
      for (let d = new Date(heatmapStart); d <= today; d.setDate(d.getDate() + 1)) {
        heatmapDays.push(d.toISOString().slice(0, 10));
      }
      const completionsByDay: Record<string, number> = {};
      allQuests.forEach(q => {
        if (q.completed && q.completedAt) {
          const day = new Date(q.completedAt).toISOString().slice(0, 10);
          completionsByDay[day] = (completionsByDay[day] || 0) + 1;
        }
      });
      const heatmap = heatmapDays.map(date => ({ date, count: completionsByDay[date] || 0 }));

      let longestStreak = 0;
      let currentRun = 0;
      let longestStart = "";
      let longestEnd = "";
      let runStart = "";
      for (const date of heatmapDays) {
        if ((completionsByDay[date] || 0) > 0) {
          if (currentRun === 0) runStart = date;
          currentRun++;
          if (currentRun > longestStreak) {
            longestStreak = currentRun;
            longestStart = runStart;
            longestEnd = date;
          }
        } else {
          currentRun = 0;
        }
      }

      const activeDays = heatmapDays.filter(d => (completionsByDay[d] || 0) > 0).length;
      const totalCompleted = allQuests.filter(q => q.completed).length;

      const ritualQuests = allQuests.filter(q => q.isRitualized && q.parentRitualId);
      const ritualGroups: Record<number, typeof ritualQuests> = {};
      ritualQuests.forEach(q => {
        const pid = q.parentRitualId!;
        if (!ritualGroups[pid]) ritualGroups[pid] = [];
        ritualGroups[pid].push(q);
      });
      const parentRituals = allQuests.filter(q => q.isRitualized && !q.parentRitualId);
      parentRituals.forEach(p => {
        if (!ritualGroups[p.id]) ritualGroups[p.id] = [];
      });

      const habitStreaks = Object.entries(ritualGroups).map(([parentIdStr, instances]) => {
        const parentId = parseInt(parentIdStr);
        const parent = allQuests.find(q => q.id === parentId);
        const title = parent?.title || instances[0]?.title || "Unknown Habit";
        const category = parent?.category || instances[0]?.category || "general";
        const frequency = parent?.repeatFrequency || instances[0]?.repeatFrequency || "daily";

        const completedInstances = instances
          .filter(q => q.completed && q.completedAt)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

        const completedDates = Array.from(new Set(completedInstances.map(q => new Date(q.completedAt!).toISOString().slice(0, 10)))).sort().reverse();

        let streak = 0;
        if (completedDates.length > 0) {
          const todayStr = today.toISOString().slice(0, 10);
          const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          if (completedDates[0] === todayStr || completedDates[0] === yesterdayStr) {
            streak = 1;
            for (let i = 1; i < completedDates.length; i++) {
              const prev = new Date(completedDates[i - 1] + "T00:00:00");
              const curr = new Date(completedDates[i] + "T00:00:00");
              const diff = (prev.getTime() - curr.getTime()) / 86400000;
              if (diff === 1) streak++;
              else break;
            }
          }
        }

        return {
          id: parentId,
          title,
          category,
          frequency,
          currentStreak: streak,
          totalCompleted: completedInstances.length,
          totalInstances: instances.length,
          lastCompleted: completedDates[0] || null,
        };
      }).filter(h => h.totalInstances > 0).sort((a, b) => b.currentStreak - a.currentStreak);

      const last30 = heatmapDays.slice(-30);
      const weeklyActivity: { week: string; missions: number }[] = [];
      for (let i = 0; i < last30.length; i += 7) {
        const chunk = last30.slice(i, i + 7);
        const missions = chunk.reduce((s, d) => s + (completionsByDay[d] || 0), 0);
        const label = new Date(chunk[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
        weeklyActivity.push({ week: label, missions });
      }

      res.json({
        currentStreak,
        longestStreak,
        longestStreakStart: longestStart,
        longestStreakEnd: longestEnd,
        activeDays,
        totalCompleted,
        heatmap,
        habitStreaks,
        weeklyActivity,
      });
    } catch (error) {
      console.error("Error fetching streaks:", error);
      res.status(500).json({ error: "Failed to fetch streaks" });
    }
  });

  app.get("/api/auth/2fa/status", isAuthenticated, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      twoFactorEnabled: user.twoFactorEnabled || false,
      emailVerified: user.emailVerified || false,
      phoneVerified: user.phoneVerified || false,
      phoneNumber: user.phoneNumber ? user.phoneNumber.replace(/(\+\d{1,3})\d{6}(\d{4})/, '$1******$2') : null,
      email: user.email || null,
    });
  });

  app.post("/api/auth/2fa/send-email-code", isAuthenticated, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.email) return res.status(400).json({ error: "No email address on file" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await storage.updateUser(user.id, {
      twoFactorEmailCode: hashedCode,
      twoFactorEmailExpiry: expiry,
    } as any);

    const sent = await send2FAVerificationEmail(user.email, code, user.firstName || undefined);
    if (!sent) return res.status(500).json({ error: "Failed to send verification email" });

    res.json({ message: "Verification code sent to your email" });
  });

  app.post("/api/auth/2fa/verify-email-code", isAuthenticated, async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: "Invalid code format" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.twoFactorEmailCode || !user.twoFactorEmailExpiry) {
      return res.status(400).json({ error: "No verification code pending" });
    }

    if (new Date() > new Date(user.twoFactorEmailExpiry)) {
      return res.status(400).json({ error: "Verification code has expired" });
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (hashedCode !== user.twoFactorEmailCode) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    await storage.updateUser(user.id, {
      emailVerified: true,
      twoFactorEmailCode: null,
      twoFactorEmailExpiry: null,
    } as any);

    res.json({ message: "Email verified successfully" });
  });

  app.post("/api/auth/2fa/send-phone-code", isAuthenticated, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    if (cleaned.length < 10) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await storage.updateUser(user.id, {
      phoneNumber: cleaned,
      twoFactorPhoneCode: hashedCode,
      twoFactorPhoneExpiry: expiry,
    } as any);

    const sent = await send2FAVerificationSMS(cleaned, code);
    if (!sent) return res.status(500).json({ error: "Failed to send SMS. Twilio may not be configured yet." });

    res.json({ message: "Verification code sent to your phone" });
  });

  app.post("/api/auth/2fa/verify-phone-code", isAuthenticated, async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: "Invalid code format" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.twoFactorPhoneCode || !user.twoFactorPhoneExpiry) {
      return res.status(400).json({ error: "No verification code pending" });
    }

    if (new Date() > new Date(user.twoFactorPhoneExpiry)) {
      return res.status(400).json({ error: "Verification code has expired" });
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (hashedCode !== user.twoFactorPhoneCode) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    await storage.updateUser(user.id, {
      phoneVerified: true,
      twoFactorPhoneCode: null,
      twoFactorPhoneExpiry: null,
    } as any);

    res.json({ message: "Phone verified successfully" });
  });

  app.post("/api/auth/2fa/enable", isAuthenticated, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.emailVerified) {
      return res.status(400).json({ error: "Email must be verified first" });
    }
    if (!user.phoneVerified) {
      return res.status(400).json({ error: "Phone must be verified first" });
    }

    await storage.updateUser(user.id, {
      twoFactorEnabled: true,
    } as any);

    res.json({ message: "Two-factor authentication enabled" });
  });

  app.post("/api/auth/2fa/disable", isAuthenticated, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    await storage.updateUser(user.id, {
      twoFactorEnabled: false,
    } as any);

    res.json({ message: "Two-factor authentication disabled" });
  });

  // User Categories CRUD
  app.get("/api/user-categories", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const categories = await storage.getUserCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching user categories:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user-categories", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { value, label, description } = req.body;
      if (!value || !label) {
        return res.status(400).json({ error: "Value and label are required" });
      }
      const existing = await storage.getUserCategories(userId);
      if (existing.some(c => c.value === value)) {
        return res.status(409).json({ error: "Category already exists" });
      }
      const category = await storage.createUserCategory({
        userId,
        value: value.toLowerCase().replace(/\s+/g, '_'),
        label,
        description: description || null,
      });
      res.json(category);
    } catch (error) {
      console.error("Error creating user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user-categories/generate-description", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { categoryName } = req.body;
      if (!categoryName) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Generate a short, one-sentence description (under 15 words) for a personal productivity mission category called "${categoryName}". The description should explain what types of tasks or goals belong in this category. Be concise and direct. Return ONLY the description, no quotes or punctuation at the start/end.`
          }
        ],
      });
      const description = message.content[0].type === "text" ? message.content[0].text.trim() : "";
      res.json({ description });
    } catch (error) {
      console.error("Error generating category description:", error);
      res.status(500).json({ error: "Failed to generate description" });
    }
  });

  app.patch("/api/user-categories/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      const { value, label } = req.body;
      if (!value || !label) {
        return res.status(400).json({ error: "Value and label are required" });
      }
      const existingCategories = await storage.getUserCategories(userId);
      const oldCategory = existingCategories.find(c => c.id === id);
      const duplicate = existingCategories.find(c => c.id !== id && c.value === value);
      if (duplicate) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      const result = await storage.updateUserCategory(id, userId, { value, label });
      if (!result) {
        return res.status(404).json({ error: "Category not found" });
      }
      if (oldCategory && oldCategory.value !== value) {
        await storage.updateQuestCategoryForUser(userId, oldCategory.value, value);
      }
      res.json(result);
    } catch (error) {
      console.error("Error updating user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/user-categories/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      await storage.deleteUserCategory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vision Goals CRUD
  app.get("/api/vision-goals/all", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const categories = ["legacy", "10year", "5year", "18month", "90day"];
      const allGoals = [];
      for (const cat of categories) {
        const goals = await storage.getVisionGoals(userId, cat);
        allGoals.push(...goals);
      }
      res.json(allGoals);
    } catch (error) {
      console.error("Error fetching all vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/vision-goals/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ['legacy', '10year', '5year', '18month', '90day'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      res.json(goals);
    } catch (error) {
      console.error("Error fetching vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/vision-goals", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category, title, description, rewardText, bonusXp } = req.body;
      const validCategories = ['legacy', '10year', '5year', '18month', '90day'];
      if (!validCategories.includes(category) || !title?.trim()) {
        return res.status(400).json({ error: "Category and title are required" });
      }
      const existing = await storage.getVisionGoals(userId, category);
      const maxOrder = existing.length > 0 ? Math.max(...existing.map(g => g.displayOrder)) : -1;
      const goal = await storage.createVisionGoal({
        userId,
        category,
        title: title.trim(),
        description: description?.trim() || null,
        rewardText: rewardText?.trim() || null,
        bonusXp: bonusXp ? parseInt(bonusXp) : 0,
        completed: false,
        displayOrder: maxOrder + 1,
      });
      res.json(goal);
    } catch (error) {
      console.error("Error creating vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/vision-goals/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const existingGoal = await storage.getVisionGoalById(id, userId);
      if (!existingGoal) return res.status(404).json({ error: "Vision goal not found" });
      const wasCompleted = existingGoal.completed ?? false;

      const updateData: any = {};
      if (req.body.title !== undefined) updateData.title = req.body.title.trim();
      if (req.body.description !== undefined) updateData.description = req.body.description?.trim() || null;
      if (req.body.rewardText !== undefined) updateData.rewardText = req.body.rewardText?.trim() || null;
      if (req.body.bonusXp !== undefined) updateData.bonusXp = parseInt(req.body.bonusXp) || 0;
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.completed !== undefined) {
        updateData.completed = req.body.completed;
        updateData.completedAt = req.body.completed ? new Date() : null;
      }
      if (req.body.displayOrder !== undefined) updateData.displayOrder = req.body.displayOrder;
      const goal = await storage.updateVisionGoal(id, userId, updateData);
      if (!goal) return res.status(404).json({ error: "Vision goal not found" });
      storage.logActivityEvent(userId, 'goal_review', { goalId: id, title: goal.title }).catch(() => {});

      let xpAwarded = 0;
      let xpRemoved = 0;
      const isCompleting = req.body.completed === true && !wasCompleted;
      const isUncompleting = req.body.completed === false && wasCompleted;

      if (isCompleting) {
        const activeRitualMissions = await db.select({ id: questsTable.id })
          .from(questsTable)
          .where(and(
            eq(questsTable.visionGoalId, id),
            eq(questsTable.userId, userId),
            eq(questsTable.completed, false),
            eq(questsTable.isRitualized, true)
          ));
        const disconnectedIds = activeRitualMissions.map(m => m.id);
        if (disconnectedIds.length > 0) {
          await db.update(questsTable)
            .set({ visionGoalId: null })
            .where(and(
              inArray(questsTable.id, disconnectedIds),
              eq(questsTable.userId, userId)
            ));
          await storage.updateVisionGoal(id, userId, { disconnectedMissionIds: disconnectedIds });
        }

        let bonusXp = goal.bonusXp;
        if (bonusXp === 0) {
          try {
            const anthropic = new Anthropic({
              apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
              baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
            });
            const aiResponse = await anthropic.messages.create({
              model: "claude-haiku-4-5-20250514",
              max_tokens: 50,
              messages: [{
                role: "user",
                content: `Assign bonus XP for completing this mission objective in a gamified life system. Category: ${goal.category}. Title: "${goal.title}". Respond with ONLY a number from this list: 25, 50, 75, 100, 150, 200, 250, 500. Higher XP for more ambitious/difficult objectives.`
              }],
            });
            const parsed = parseInt((aiResponse.content[0] as any).text?.trim());
            if ([25, 50, 75, 100, 150, 200, 250, 500].includes(parsed)) {
              bonusXp = parsed;
            } else {
              bonusXp = 50;
            }
          } catch {
            bonusXp = 50;
          }
          await storage.updateVisionGoal(id, userId, { bonusXp });
          goal.bonusXp = bonusXp;
        }
        if (bonusXp > 0) {
          const xpResult = await awardExperiencePoints(userId, bonusXp);
          if (xpResult.success) {
            xpAwarded = bonusXp;
          }
        }
      }

      if (isUncompleting) {
        const storedIds = existingGoal.disconnectedMissionIds;
        if (storedIds && storedIds.length > 0) {
          await db.update(questsTable)
            .set({ visionGoalId: id })
            .where(and(
              inArray(questsTable.id, storedIds),
              eq(questsTable.userId, userId),
              eq(questsTable.completed, false),
              sql`${questsTable.visionGoalId} IS NULL`
            ));
          await storage.updateVisionGoal(id, userId, { disconnectedMissionIds: null });
        }

        const bonusXp = existingGoal.bonusXp || 0;
        if (bonusXp > 0) {
          const profile = await storage.getUserProfile(userId);
          if (profile) {
            const oldTotalXP = profile.totalXP || 0;
            const newTotalXP = Math.max(0, oldTotalXP - bonusXp);
            await storage.updateUserProfile(userId, { totalXP: newTotalXP });
            const newLevelInfo = calculateLevelFromTotalXP(newTotalXP);
            await storage.updateUserStats(userId, {
              experienceCurrent: newLevelInfo.current,
              experienceMax: newLevelInfo.max,
              level: newLevelInfo.level,
            });
            xpRemoved = bonusXp;
          }
        }
      }

      if (isCompleting && xpAwarded > 0) {
        sendPushToUser(userId, {
          title: "Milestone Achieved!",
          body: `${goal.title} completed! +${xpAwarded} bonus XP${goal.rewardText ? ` — Reward: ${goal.rewardText}` : ""}`,
          tag: `goal-complete-${goal.id}`,
          url: "/goals-archive",
        }).catch(() => {});
      }

      const dbStats = await storage.getUserStats(userId);
      const xpData = await storage.recalculateXP(userId);
      const updatedStats = dbStats ? {
        attentionTokens: {
          current: dbStats.attentionTokensCurrent,
          max: dbStats.attentionTokensMax,
        },
        timeTokens: {
          current: dbStats.timeTokensCurrent,
          max: dbStats.timeTokensMax,
        },
        energyPoints: {
          current: dbStats.energyPointsCurrent,
          max: dbStats.energyPointsMax,
        },
        healthPoints: {
          current: dbStats.healthPointsCurrent,
          max: dbStats.healthPointsMax,
        },
        experience: {
          current: xpData.experienceCurrent,
          max: xpData.experienceMax,
          level: xpData.level,
          totalXP: xpData.totalXP,
          showLevelUp: false,
        },
        streakDays: dbStats.streakDays || 0,
        efficiencyScore: dbStats.efficiencyScore || 0,
        aiAssistantName: dbStats.aiAssistantName,
        notificationsEnabled: dbStats.notificationsEnabled,
        darkThemeEnabled: dbStats.darkThemeEnabled,
        autoSyncEnabled: dbStats.autoSyncEnabled,
        aiAssistantEnabled: dbStats.aiAssistantEnabled,
        primaryColor: dbStats.primaryColor,
      } : null;
      res.json({ ...goal, xpAwarded, xpRemoved, updatedStats });
    } catch (error) {
      console.error("Error updating vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/vision-goals/reorder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.some((id: any) => typeof id !== 'number')) {
        return res.status(400).json({ error: "ids must be an array of numbers" });
      }
      await storage.reorderVisionGoals(ids, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering vision goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/vision-goals/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteVisionGoal(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/quests/completed-by-vision-goal/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ["legacy", "10year", "5year", "18month", "90day"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      const goalIds = goals.map(g => g.id);
      if (goalIds.length === 0) {
        return res.json([]);
      }
      const allQuests = await storage.getQuests(userId);
      const completedLinked = allQuests
        .filter(q => q.completed && q.visionGoalId && goalIds.includes(q.visionGoalId))
        .map(q => ({
          id: q.id,
          title: q.title,
          completedAt: q.completedAt,
          visionGoalId: q.visionGoalId,
          difficulty: q.difficulty || "D",
          experienceReward: q.experienceReward,
          energyCost: q.energyCost,
          timeCost: q.timeCost || 0,
          attentionCost: q.attentionCost || 0,
          category: q.category || "general",
        }));
      res.json(completedLinked);
    } catch (error) {
      console.error("Error fetching completed missions by vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/quests/linked-by-vision-goal/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.params;
      const validCategories = ["legacy", "10year", "5year", "18month", "90day"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      const goals = await storage.getVisionGoals(userId, category);
      const goalIds = goals.map(g => g.id);
      if (goalIds.length === 0) {
        return res.json([]);
      }
      const allQuests = await storage.getQuests(userId);
      const linked = allQuests
        .filter(q => q.visionGoalId && goalIds.includes(q.visionGoalId))
        .map(q => ({
          id: q.id,
          title: q.title,
          completed: q.completed,
          completedAt: q.completedAt,
          visionGoalId: q.visionGoalId,
          difficulty: q.difficulty || "D",
          experienceReward: q.experienceReward,
          energyCost: q.energyCost,
          timeCost: q.timeCost || 0,
          attentionCost: q.attentionCost || 0,
          category: q.category || "general",
          isRitualized: q.isRitualized || false,
          parentRitualId: q.parentRitualId || null,
        }));
      res.json(linked);
    } catch (error) {
      console.error("Error fetching linked missions by vision goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stripe payment routes
  app.get("/api/stripe/publishable-key", async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Error getting Stripe publishable key:", error);
      res.status(500).json({ error: "Failed to get Stripe configuration" });
    }
  });

  app.get("/api/stripe/products", async (_req: Request, res: Response) => {
    try {
      const rows = await stripeService.listProductsWithPrices();
      const productsMap = new Map<string, any>();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }
      res.json({ data: Array.from(productsMap.values()) });
    } catch (error) {
      console.error("Error listing products:", error);
      res.status(500).json({ error: "Failed to list products" });
    }
  });

  app.get("/api/stripe/subscription", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) {
        return res.json({ subscription: null });
      }
      const subscription = await stripeService.getSubscription(user.stripeSubscriptionId);
      res.json({ subscription });
    } catch (error) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: "Failed to get subscription" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId is required" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        if (!user.email) return res.status(400).json({ error: "Email is required for checkout" });
        const customer = await stripeService.createCustomer(user.email, userId);
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/subscription?success=true`,
        `${baseUrl}/subscription?canceled=true`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No billing account found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/subscription`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // Smart Reminders API
  app.get("/api/smart-reminders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      let reminders = await storage.getSmartReminders(userId);
      if (reminders.length === 0) {
        reminders = await storage.initDefaultReminders(userId);
      }
      return res.json(reminders);
    } catch (error) {
      console.error("Error fetching smart reminders:", error);
      return res.status(500).json({ error: "Failed to fetch smart reminders" });
    }
  });

  app.patch("/api/smart-reminders/:reminderType", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { reminderType } = req.params;
      const validTypes = ['missions', 'reflection', 'goal_review'];
      if (!validTypes.includes(reminderType)) {
        return res.status(400).json({ error: "Invalid reminder type" });
      }

      const updateData: any = {};
      if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;
      if (req.body.preferredHour !== undefined) {
        const hour = parseInt(req.body.preferredHour);
        if (isNaN(hour) || hour < 0 || hour > 23) {
          return res.status(400).json({ error: "preferredHour must be 0-23" });
        }
        updateData.preferredHour = hour;
        updateData.source = 'manual';
      }
      if (req.body.preferredDays !== undefined) {
        const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const days = req.body.preferredDays;
        if (!Array.isArray(days) || !days.every((d: string) => validDays.includes(d))) {
          return res.status(400).json({ error: "Invalid preferredDays" });
        }
        updateData.preferredDays = days;
      }
      if (req.body.cooldownHours !== undefined) {
        const cd = parseInt(req.body.cooldownHours);
        if (isNaN(cd) || cd < 1 || cd > 168) {
          return res.status(400).json({ error: "cooldownHours must be 1-168" });
        }
        updateData.cooldownHours = cd;
      }
      if (req.body.source === 'learned') {
        updateData.source = 'learned';
      }

      const reminder = await storage.upsertSmartReminder(userId, reminderType, updateData);
      return res.json(reminder);
    } catch (error) {
      console.error("Error updating smart reminder:", error);
      return res.status(500).json({ error: "Failed to update smart reminder" });
    }
  });

  app.get("/api/smart-reminders/activity-summary", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const days = parseInt(req.query.days as string) || 30;

      const eventTypes = ['mission_complete', 'daily_log', 'goal_review', 'login'];
      const summary: Record<string, { count: number; peakHour: number | null }> = {};

      for (const eventType of eventTypes) {
        const events = await storage.getActivityEvents(userId, eventType, days);
        const hourCounts = new Array(24).fill(0);
        for (const event of events) {
          const hour = new Date(event.occurredAt).getHours();
          hourCounts[hour]++;
        }
        let peakHour: number | null = null;
        let peakCount = 0;
        for (let h = 0; h < 24; h++) {
          if (hourCounts[h] > peakCount) {
            peakCount = hourCounts[h];
            peakHour = h;
          }
        }
        summary[eventType] = { count: events.length, peakHour: events.length >= 3 ? peakHour : null };
      }

      return res.json(summary);
    } catch (error) {
      console.error("Error fetching activity summary:", error);
      return res.status(500).json({ error: "Failed to fetch activity summary" });
    }
  });

  // Register AI Chat routes
  registerChatRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
