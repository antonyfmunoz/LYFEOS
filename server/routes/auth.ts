import type { Express, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { storage } from "../storage";
import { logger, formatLocalDate } from "../utils";
import { isAuthenticated } from "./middleware";
import { verifyFirebaseIdToken, createFirebaseUser, checkFirebaseEmailVerified, getFirebaseUserByEmail, createCustomToken } from "../firebaseAdmin";
import type { InsertUser } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/check-email", async (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      if (!email || !z.string().email().safeParse(email).success) {
        return res.status(400).json({ available: false, error: "Invalid email" });
      }
      const existing = await storage.getUserByEmail(email.trim());
      return res.json({ available: !existing });
    } catch (error) {
      logger.error("Error checking email:", error);
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
        primaryColor: "#ffffff"
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

      const today = formatLocalDate();
      await storage.createUserDailyLog({
        userId: user.id,
        date: today,
        yesterdayXp: 0,
        todayPrimaryMission: "Get started with LYFEOS",
        optionalBoostsShown: false
      });

      const firebaseUid = await createFirebaseUser(email, password);
      if (firebaseUid) {
        await storage.updateUserFirebaseUid(user.id, firebaseUid);
      }

      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);

      return res.status(201).json({ user: { id: user.id, username: user.username, email: user.email }, firebaseUid });
    } catch (error) {
      logger.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      logger.debug("Register attempt:", { email: req.body.email });
      
      const userData = {
        ...req.body,
        title: "COMMANDER"
      };
      
      if (!userData.email || !userData.password) {
        logger.debug("Register failed: Missing email or password");
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      if (!z.string().email().safeParse(userData.email).success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        logger.debug("Register failed: Email already exists");
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      if (userData.username) {
        const existingUser = await storage.getUserByUsername(userData.username);
        if (existingUser) {
          logger.debug("Register failed: Username already exists");
          return res.status(400).json({ error: "Username already exists" });
        }
      }
      
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      logger.debug("Creating new user with email:", userData.email);
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
      
      logger.debug("User created successfully with ID:", user.id);
      
      const firebaseUid = await createFirebaseUser(userData.email, userData.password);
      if (firebaseUid) {
        await storage.updateUserFirebaseUid(user.id, firebaseUid);
      }
      
      logger.debug("Creating initial stats for user:", user.id);
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
        primaryColor: "#ffffff"
      });
      
      logger.debug("Creating user profile for new user:", user.id);
      await storage.upsertUserProfile(user.id, {
        startStage: "beginner",
        targetArchetype: "architect",
        flowStyle: "hyperfocus",
        coreMotivation: "growth",
        setupMissionStatus: "not_started",
        primaryThemeColor: "#ffe03d",
        onboardingCompleted: false
      });
      
      logger.debug("Creating user integrations for new user:", user.id);
      await storage.createUserIntegration({
        userId: user.id,
        appleHealthConnected: false,
        googleCalendarConnected: false,
        notionConnected: false
      });
      
      logger.debug("Creating initial daily logs for new user:", user.id);
      const today = formatLocalDate();
      await storage.createUserDailyLog({
        userId: user.id,
        date: today,
        yesterdayXp: 0,
        todayPrimaryMission: "Get started with LYFEOS",
        optionalBoostsShown: false
      });

      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      logger.debug("Registration successful, session created for user:", user.id);
      
      return res.status(201).json({ user: { id: user.id, username: user.username, email: user.email }, firebaseUid });
    } catch (error) {
      logger.error("Registration error:", error);
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
      logger.error("Error checking username:", error);
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
      logger.error("Error setting username:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/geo/location", async (req: Request, res: Response) => {
    try {
      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip;
      
      const apis = [
        {
          url: `http://ip-api.com/json/${clientIp}?fields=city,regionName,country`,
          parse: (data: Record<string, string>) => ({
            city: data.city,
            region: data.regionName,
            country: data.country,
            location: [data.city, data.regionName, data.country].filter(Boolean).join(", ")
          })
        },
        {
          url: `https://ipapi.co/${clientIp}/json/`,
          parse: (data: Record<string, string>) => ({
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
        } catch (geoErr) {
          logger.debug("Geo API request failed:", geoErr);
        }
      }

      return res.status(502).json({ error: "Failed to detect location" });
    } catch (error) {
      logger.error("Geo location error:", error);
      return res.status(500).json({ error: "Failed to detect location" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const identifier = req.body.identifier || req.body.username;
      const { password } = req.body;
      logger.debug("Login attempt:", { identifier });
      
      if (!identifier || !password) {
        logger.debug("Login failed: Missing identifier or password");
        return res.status(400).json({ error: "Username or email and password are required" });
      }
      
      const user = await storage.getUserByIdentifier(identifier);
      if (!user) {
        logger.debug("Login failed: User not found");
        return res.status(401).json({ error: "Invalid credentials. Please check your username/email and password, or register a new account." });
      }
      
      if (user.authProvider && user.authProvider !== 'email') {
        logger.debug("Login failed: OAuth account cannot use password login");
        return res.status(401).json({ error: "This account uses social sign-in. Please log in with Google or Apple instead." });
      }
      
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        logger.debug("Login failed: Invalid password");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      logger.debug("Login successful for user ID:", user.id);
      
      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      const { streakDays, isNewDay } = await storage.processLoginStreak(user.id);
      if (isNewDay) {
        await storage.processDailyHealthUpdate(user.id);
        logger.debug("New day detected - updated streak and health for user:", user.username);
      }

      storage.logActivityEvent(user.id, 'login').catch(() => {});
      storage.initDefaultReminders(user.id).catch(() => {});
      
      const userProfile = await storage.getUserProfile(user.id);
      const isNewUser = !userProfile || !userProfile.onboardingCompleted;
      
      const userStats = await storage.getUserStats(user.id);
      
      return res.status(200).json({ 
        user: { id: user.id, username: user.username },
        isNewUser: isNewUser,
        primaryColor: userStats?.primaryColor || "#00e0ff"
      });
    } catch (error) {
      logger.error("Login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/auth/sync-email-verified", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.emailVerified) return res.json({ emailVerified: true });

      if (user.firebaseUid) {
        const verified = await checkFirebaseEmailVerified(user.firebaseUid);
        if (verified) {
          await storage.updateUser(user.id, { emailVerified: true } as any);
          return res.json({ emailVerified: true });
        }
      }
      return res.json({ emailVerified: false });
    } catch (error) {
      logger.error("Sync email verified error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/firebase-custom-token", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      let firebaseUid = user.firebaseUid;
      if (!firebaseUid) {
        if (!user.email) {
          return res.status(400).json({ error: "User has no email address for Firebase authentication" });
        }
        const fbUser = await getFirebaseUserByEmail(user.email);
        if (fbUser) {
          firebaseUid = fbUser.uid;
          await storage.updateUserFirebaseUid(user.id, firebaseUid);
        } else {
          const uid = await createFirebaseUser(user.email, crypto.randomBytes(32).toString('hex'));
          if (!uid) return res.status(500).json({ error: "Failed to create Firebase user" });
          firebaseUid = uid;
          await storage.updateUserFirebaseUid(user.id, firebaseUid);
        }
      }

      const token = await createCustomToken(firebaseUid);
      if (!token) return res.status(500).json({ error: "Failed to generate token" });

      return res.json({ token });
    } catch (error) {
      logger.error("Firebase custom token error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/ensure-firebase-user", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!z.string().email().safeParse(email).success) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ success: true });
      }

      if (!user.firebaseUid) {
        const fbUser = await getFirebaseUserByEmail(email);
        if (fbUser) {
          await storage.updateUserFirebaseUid(user.id, fbUser.uid);
        }
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Ensure Firebase user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password-firebase", async (req: Request, res: Response) => {
    try {
      const { firebaseIdToken, newPassword } = req.body;
      if (!firebaseIdToken || !newPassword) {
        return res.status(400).json({ error: "Firebase ID token and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const decoded = await verifyFirebaseIdToken(firebaseIdToken);
      if (!decoded || !decoded.email) {
        return res.status(401).json({ error: "Invalid Firebase token" });
      }

      const user = await storage.getUserByEmail(decoded.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, hashedPassword);

      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);

      return res.json({ success: true, message: "Password reset successfully", user: { id: user.id, username: user.username } });
    } catch (error) {
      logger.error("Firebase reset password error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    try {
      const { uid, email, displayName, photoURL, mode, provider } = req.body;
      const authMode = mode || 'login';
      const authProvider = provider || 'google';
      logger.debug("Firebase auth attempt:", { uid, email, displayName, mode: authMode, provider: authProvider });
      
      if (!uid || !email) {
        logger.debug("Firebase auth failed: Missing uid or email");
        return res.status(400).json({ error: "Firebase user ID and email are required" });
      }
      
      let user = await storage.getUserByEmail(email);
      let isNewUser = false;
      
      if (!user) {
        if (authMode === 'register') {
          logger.debug("Firebase register mode: Creating new account for email:", email);
          user = await storage.createUser({
            username: null,
            password: null,
            displayName: displayName || null,
            firstName: displayName?.split(' ')[0] || null,
            lastName: displayName?.split(' ').slice(1).join(' ') || null,
            title: "COMMANDER",
            email: email,
            authProvider: authProvider,
            firebaseUid: uid,
            termsAccepted: true
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
            primaryColor: "#ffffff"
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

          const today = formatLocalDate();
          await storage.createUserDailyLog({
            userId: user.id,
            date: today,
            yesterdayXp: 0,
            todayPrimaryMission: "Get started with LYFEOS",
            optionalBoostsShown: false
          });

          isNewUser = true;
          logger.debug("New user created via Google OAuth with ID:", user.id);
        } else {
          logger.debug("Firebase login rejected: No registered account for email:", email);
          return res.status(403).json({ 
            error: "No account found with this email. Please register first before signing in with Google.",
            code: "ACCOUNT_NOT_REGISTERED"
          });
        }
      } else {
        if (!user.firebaseUid) {
          await storage.updateUserFirebaseUid(user.id, uid);
        }
      }
      
      req.session.userId = user.id;
      req.session.username = user.username || user.email || String(user.id);
      
      const { streakDays, isNewDay } = await storage.processLoginStreak(user.id);
      if (isNewDay) {
        await storage.processDailyHealthUpdate(user.id);
        logger.debug("New day detected - updated streak and health for user:", user.username);
      }

      storage.logActivityEvent(user.id, 'login').catch(() => {});
      storage.initDefaultReminders(user.id).catch(() => {});
      
      const userProfile = await storage.getUserProfile(user.id);
      const onboardingCompleted = userProfile?.onboardingCompleted ?? false;
      
      const fbUserStats = await storage.getUserStats(user.id);
      
      logger.debug("Firebase auth successful for user:", user.username, "isNewUser:", isNewUser, "onboardingCompleted:", onboardingCompleted);
      return res.status(200).json({ 
        user: { 
          id: user.id, 
          username: user.username,
          displayName: user.displayName 
        },
        isNewUser: isNewUser,
        onboardingCompleted: onboardingCompleted,
        primaryColor: fbUserStats?.primaryColor || "#00e0ff"
      });
    } catch (error) {
      logger.error("Firebase auth error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    try {
      if (!req.session || !req.session.userId) {
        res.clearCookie("connect.sid");
        return res.status(200).json({ message: "Already logged out" });
      }
      
      req.session.destroy((err) => {
        if (err) {
          logger.error("Error destroying session:", err);
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
      logger.error("Logout error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/auth/me", (req: Request, res: Response) => {
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

  app.post("/api/auth/2fa/verify-email-firebase", isAuthenticated, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.firebaseUid) {
      const verified = await checkFirebaseEmailVerified(user.firebaseUid);
      if (verified) {
        await storage.updateUser(user.id, { emailVerified: true } as any);
        return res.json({ emailVerified: true, message: "Email verified successfully" });
      }
    }

    return res.json({ emailVerified: false, message: "Email not yet verified. Please check your inbox." });
  });

  app.post("/api/auth/2fa/verify-phone-firebase", isAuthenticated, async (req, res) => {
    const { firebaseIdToken } = req.body;
    if (!firebaseIdToken || typeof firebaseIdToken !== 'string') {
      return res.status(400).json({ error: "Firebase ID token is required" });
    }

    const decoded = await verifyFirebaseIdToken(firebaseIdToken);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired Firebase token" });
    }

    const phoneNumber = decoded.phone_number;
    if (!phoneNumber) {
      return res.status(400).json({ error: "No phone number found in Firebase token" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    await storage.updateUser(user.id, {
      phoneNumber,
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
}
