import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { userDailyLogs } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import multer from "multer";
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
  InsertMediaItem
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
}> {
  try {
    // Get current user stats
    const userStats = await storage.getUserStats(userId);
    if (!userStats) {
      return { success: false, levelUp: false };
    }
    
    // Calculate new XP level
    let newExperience = userStats.experienceCurrent + amount;
    let newLevel = userStats.level;
    let newExperienceMax = userStats.experienceMax;
    let didLevelUp = false;
    
    // Level up if necessary
    while (newExperience >= userStats.experienceMax) {
      newExperience -= userStats.experienceMax;
      newLevel += 1;
      newExperienceMax = Math.floor(userStats.experienceMax * 1.2); // 20% increase per level
      didLevelUp = true;
    }
    
    // Update user stats
    const updatedStats = await storage.updateUserStats(userId, {
      experienceCurrent: newExperience,
      level: newLevel,
      experienceMax: newExperienceMax
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
      levelUp: didLevelUp
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
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      console.log("Register attempt:", req.body);
      
      // Validate user data
      const userData = {
        ...req.body,
        displayName: req.body.username,
        title: "COMMANDER"
      };
      
      // Basic validation
      if (!userData.username || !userData.password) {
        console.log("Register failed: Missing username or password");
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      const existingUser = await storage.getUserByUsername(userData.username);
      
      if (existingUser) {
        console.log("Register failed: Username already exists");
        return res.status(400).json({ error: "Username already exists" });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      // Save user with hashed password
      console.log("Creating new user:", userData.username);
      const user = await storage.createUser({
        username: userData.username,
        password: hashedPassword,
        displayName: userData.displayName,
        title: userData.title,
        email: userData.email || null,
        authProvider: userData.authProvider || 'email',
        termsAccepted: userData.termsAccepted || false
      });
      
      console.log("User created successfully with ID:", user.id);
      
      // Create initial user stats
      console.log("Creating initial stats for user:", user.id);
      await storage.createUserStats({
        userId: user.id,
        experienceCurrent: 0,
        experienceMax: 100,
        level: 1,
        timeTokensCurrent: 10,
        timeTokensMax: 10,
        energyPointsCurrent: 10,
        energyPointsMax: 10,
        healthPointsCurrent: 10,
        healthPointsMax: 10,
        attentionTokensCurrent: 10,
        attentionTokensMax: 10,
        streakDays: 0,
        efficiencyScore: 0,
        aiAssistantName: "NOVA"
      });
      
      // Create user profile
      console.log("Creating user profile for new user:", user.id);
      await storage.createUserProfile({
        userId: user.id,
        startStage: "beginner",
        targetArchetype: "architect",
        flowStyle: "hyperfocus",
        coreMotivation: "growth",
        setupMissionStatus: "not_started",
        primaryThemeColor: "#ecc94b",
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
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      console.log("Registration successful, session created for user:", user.username);
      
      return res.status(201).json({ user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      console.log("Login attempt:", { username });
      
      if (!username || !password) {
        console.log("Login failed: Missing username or password");
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Find user
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log("Login failed: User not found");
        
        // Auto-register any user for demo purposes
        console.log("Auto-registering new user:", username);
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        const newUser = await storage.createUser({
          username: username,
          password: hashedPassword,
          displayName: username,
          title: 'COMMANDER',
          email: username, // Using username as default email for auto-registration
          authProvider: 'email',
          termsAccepted: true
        });
        
        // Create initial user stats
        console.log("Creating initial stats for new user:", newUser.id);
        await storage.createUserStats({
          userId: newUser.id,
          experienceCurrent: 0,
          experienceMax: 100,
          level: 1,
          timeTokensCurrent: 10,
          timeTokensMax: 10,
          energyPointsCurrent: 10,
          energyPointsMax: 10,
          healthPointsCurrent: 10,
          healthPointsMax: 10,
          attentionTokensCurrent: 10,
          attentionTokensMax: 10,
          streakDays: 0,
          efficiencyScore: 0,
          aiAssistantName: "NOVA"
        });
        
        // Create user profile
        console.log("Creating user profile for new user:", newUser.id);
        await storage.createUserProfile({
          userId: newUser.id,
          startStage: "beginner",
          targetArchetype: "architect",
          flowStyle: "hyperfocus",
          coreMotivation: "growth",
          setupMissionStatus: "not_started",
          primaryThemeColor: "#ecc94b",
          onboardingCompleted: false
        });
        
        // Create user integrations
        console.log("Creating user integrations for new user:", newUser.id);
        await storage.createUserIntegration({
          userId: newUser.id,
          appleHealthConnected: false,
          googleCalendarConnected: false,
          notionConnected: false
        });
        
        // Create user daily logs
        console.log("Creating initial daily logs for new user:", newUser.id);
        const today = new Date().toISOString().split('T')[0];
        await storage.createUserDailyLog({
          userId: newUser.id,
          date: today,
          yesterdayXp: 0,
          todayPrimaryMission: "Get started with LYFEOS",
          optionalBoostsShown: false
        });
        
        // Create session
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        
        console.log("New user created, session created for user:", newUser.username);
        
        return res.status(200).json({ user: { id: newUser.id, username: newUser.username } });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log("Login failed: Invalid password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      console.log("Login successful for:", user.username);
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      return res.status(200).json({ user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error("Login error:", error);
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
          experienceMax: 100,
          level: 1,
          timeTokensCurrent: 10,
          timeTokensMax: 10,
          energyPointsCurrent: 10,
          energyPointsMax: 10,
          healthPointsCurrent: 10,
          healthPointsMax: 10,
          attentionTokensCurrent: 10,
          attentionTokensMax: 10,
          streakDays: 0,
          efficiencyScore: 0,
          aiAssistantName: "NOVA"
        });
        
        // Create user profile
        console.log("Creating user profile for new Firebase user:", user.id);
        await storage.createUserProfile({
          userId: user.id,
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
      
      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      console.log("Firebase login successful for user:", user.username);
      return res.status(200).json({ 
        user: { 
          id: user.id, 
          username: user.username,
          displayName: user.displayName 
        } 
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
    try {
      // Ensure the password cannot be updated through this endpoint
      const { displayName, bio, avatarColor, title, profilePicture } = req.body;
      
      const updatedUser = await storage.updateUser(userId, {
        displayName,
        bio,
        avatarColor,
        title,
        profilePicture
      });
      
      // Return user data without the password
      const { password, ...userData } = updatedUser;
      res.json(userData);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // USER STATS ROUTES
  app.get("/api/users/:userId/stats", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const dbStats = await storage.getUserStats(userId);
      if (!dbStats) {
        return res.status(404).json({ error: "User stats not found" });
      }
      
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
          current: dbStats.experienceCurrent,
          max: dbStats.experienceMax,
          level: dbStats.level,
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
      
      const quests = await storage.getQuests(userId);
      return res.status(200).json({ quests });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/quests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const questData = insertQuestSchema.parse(req.body);
      
      // Ensure user can only create quests for their own account
      if (questData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create quests for this user" });
      }
      
      const quest = await storage.createQuest(questData);
      return res.status(201).json({ quest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/quests/:questId", isAuthenticated, async (req: Request, res: Response) => {
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
        return res.status(403).json({ error: "Not authorized to update this quest" });
      }
      
      const questUpdate = req.body;
      const updatedQuest = await storage.updateQuest(questId, questUpdate);
      
      return res.status(200).json({ quest: updatedQuest });
    } catch (error) {
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
      
      // Toggle completion and reward XP if completed
      const updatedQuest = await storage.toggleQuestCompletion(questId);
      
      // Award XP if the quest is now completed
      let xpResult = { success: false, levelUp: false };
      if (updatedQuest.completed) {
        // Award 10 XP for completing a quest
        xpResult = await awardExperiencePoints(quest.userId, 10);
      }
      
      // Get updated user stats to return to the client
      const userStats = await storage.getUserStats(quest.userId);
      
      return res.status(200).json({ 
        quest: updatedQuest,
        xpAwarded: updatedQuest.completed ? 10 : 0,
        levelUp: xpResult.levelUp,
        stats: userStats ? {
          experience: {
            current: userStats.experienceCurrent,
            max: userStats.experienceMax,
            level: userStats.level
          }
        } : undefined
      });
    } catch (error) {
      console.error("Error toggling quest completion:", error);
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
            stats: xpResult.newStats,
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
            stats: xpResult.newStats,
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
            stats: xpResult.newStats,
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
            stats: xpResult.newStats,
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
      
      const { amount, action } = req.body;
      
      // Validate XP amount
      const xpAmount = parseInt(amount);
      if (isNaN(xpAmount) || xpAmount <= 0) {
        return res.status(400).json({ error: "XP amount must be a positive number" });
      }
      
      // Use helper function to award XP
      const xpResult = await awardExperiencePoints(userId, xpAmount);
      if (!xpResult.success) {
        return res.status(404).json({ error: "Failed to award XP" });
      }
      
      return res.status(200).json({ 
        success: true,
        action,
        xpAwarded: xpAmount,
        levelUp: xpResult.levelUp,
        stats: xpResult.newStats
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
      
      let query = db.select().from(userDailyLogs).where(eq(userDailyLogs.userId, userId));
      
      if (date) {
        query = query.where(eq(userDailyLogs.date, date as string));
      }
      
      // Order by most recent first
      query = query.orderBy(desc(userDailyLogs.date));
      
      const logs = await query;
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
      
      const { date, yesterdayXp, todayPrimaryMission, optionalBoostsShown, boostsData } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Check if a log already exists for this date
      const existingLog = await db.select().from(userDailyLogs)
        .where(eq(userDailyLogs.userId, userId))
        .where(eq(userDailyLogs.date, date));
      
      if (existingLog.length > 0) {
        // Update the existing log
        await db.update(userDailyLogs)
          .set({
            yesterdayXp: yesterdayXp !== undefined ? yesterdayXp : existingLog[0].yesterdayXp,
            todayPrimaryMission: todayPrimaryMission || existingLog[0].todayPrimaryMission,
            optionalBoostsShown: optionalBoostsShown !== undefined ? optionalBoostsShown : existingLog[0].optionalBoostsShown,
            boostsData: boostsData || existingLog[0].boostsData
          })
          .where(eq(userDailyLogs.id, existingLog[0].id));
          
        return res.status(200).json({ message: "Daily log updated successfully" });
      } else {
        // Create a new log
        const newLog = await db.insert(userDailyLogs).values({
          userId: userId,
          date,
          yesterdayXp: yesterdayXp || 0,
          todayPrimaryMission,
          optionalBoostsShown,
          boostsData: boostsData || {}
        }).returning();
        
        return res.status(201).json({ log: newLog[0] });
      }
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
      
      const { date, boostsData } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Check if a log exists for this date
      const existingLog = await db.select().from(userDailyLogs)
        .where(eq(userDailyLogs.userId, userId))
        .where(eq(userDailyLogs.date, date));
      
      if (existingLog.length > 0) {
        // Update the existing log
        await db.update(userDailyLogs)
          .set({
            boostsData: boostsData || existingLog[0].boostsData
          })
          .where(eq(userDailyLogs.id, existingLog[0].id));
          
        return res.status(200).json({ message: "Daily log updated successfully" });
      } else {
        // Create a new log if it doesn't exist
        const newLog = await db.insert(userDailyLogs).values({
          userId: userId,
          date,
          boostsData: boostsData || {}
        }).returning();
        
        return res.status(201).json({ log: newLog[0] });
      }
    } catch (error) {
      console.error("Error updating daily log:", error);
      return res.status(500).json({ error: "Failed to update daily log" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
