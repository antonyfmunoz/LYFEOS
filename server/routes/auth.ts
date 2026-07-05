import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { storage } from "../storage";
import { logger, formatLocalDate } from "../utils";

declare module "express-session" {
  interface SessionData {
    userId: number;
    displayName: string;
  }
}

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = await storage.getUserByClerkId(userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  (req as any).dbUser = user;
  return next();
};

export function registerAuthRoutes(app: Express): void {
  app.use(clerkMiddleware());

  app.post("/api/webhooks/clerk", async (req: Request, res: Response) => {
    try {
      const { type, data } = req.body;

      if (type === "user.created") {
        const clerkId = data.id;
        const email = data.email_addresses?.[0]?.email_address;
        const firstName = data.first_name || null;
        const lastName = data.last_name || null;

        if (!email) {
          logger.error("Clerk webhook user.created: no email found");
          return res.status(400).json({ error: "No email in webhook payload" });
        }

        const existing = await storage.getUserByEmail(email);
        if (existing) {
          if (!existing.clerkId) {
            await storage.updateUserClerkId(existing.id, clerkId);
          }
          return res.json({ success: true, userId: existing.id });
        }

        const displayName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
        const user = await storage.createUser({
          password: null,
          displayName,
          firstName,
          lastName,
          title: "COMMANDER",
          email,
          authProvider: "clerk",
          clerkId,
          termsAccepted: true,
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
          primaryColor: "#ffffff",
        });

        await storage.upsertUserProfile(user.id, {
          startStage: "beginner",
          targetArchetype: "architect",
          flowStyle: "hyperfocus",
          coreMotivation: "growth",
          setupMissionStatus: "not_started",
          primaryThemeColor: "#ffe03d",
          onboardingCompleted: false,
        });

        await storage.createUserIntegration({
          userId: user.id,
          appleHealthConnected: false,
          googleCalendarConnected: false,
          notionConnected: false,
        });

        const today = formatLocalDate();
        await storage.createUserDailyLog({
          userId: user.id,
          date: today,
          yesterdayXp: 0,
          todayPrimaryMission: "Get started with LYFEOS",
          optionalBoostsShown: false,
        });

        logger.debug("Clerk webhook: created new user", user.id);
        return res.json({ success: true, userId: user.id });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Clerk webhook error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

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

  app.get("/api/auth/check-display-name", async (req: Request, res: Response) => {
    try {
      const displayName = req.query.displayName as string;
      if (!displayName || displayName.trim().length < 3) {
        return res.status(400).json({ available: false, error: "Display name must be at least 3 characters" });
      }
      const existing = await storage.getUserByDisplayName(displayName.trim());
      return res.json({ available: !existing });
    } catch (error) {
      logger.error("Error checking display name:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/auth/set-display-name", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).dbUser;
      const userId = user.id;
      const { displayName: displayNameInput, firstName, lastName } = req.body;

      if (!displayNameInput || displayNameInput.trim().length < 3) {
        return res.status(400).json({ error: "Display name must be at least 3 characters" });
      }

      const existing = await storage.getUserByDisplayName(displayNameInput.trim());
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: "Display name already taken" });
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ") || displayNameInput.trim();
      const updatedUser = await storage.updateUser(userId, {
        displayName,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      const { password, ...userData } = updatedUser;
      return res.json(userData);
    } catch (error) {
      logger.error("Error setting display name:", error);
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

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).dbUser;
    const userProfile = await storage.getUserProfile(user.id);
    const userStats = await storage.getUserStats(user.id);

    const effectiveColor = (userProfile?.primaryThemeColor && userProfile.primaryThemeColor !== "#ffe03d" ? userProfile.primaryThemeColor : null)
      || (userStats?.primaryColor && userStats.primaryColor !== "#ffffff" ? userStats.primaryColor : null)
      || "#00e0ff";

    return res.status(200).json({
      user: {
        id: user.id,
        displayName: user.displayName
      },
      primaryColor: effectiveColor
    });
  });

  app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
    const user = (req as any).dbUser;

    res.json({
      twoFactorEnabled: user.twoFactorEnabled || false,
      emailVerified: user.emailVerified || false,
      phoneVerified: user.phoneVerified || false,
      phoneNumber: user.phoneNumber ? user.phoneNumber.replace(/(\+\d{1,3})\d{6}(\d{4})/, '$1******$2') : null,
      email: user.email || null,
    });
  });

  app.post("/api/auth/2fa/enable", requireAuth, async (req, res) => {
    const user = (req as any).dbUser;

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

  app.post("/api/auth/2fa/disable", requireAuth, async (req, res) => {
    const user = (req as any).dbUser;

    await storage.updateUser(user.id, {
      twoFactorEnabled: false,
    } as any);

    res.json({ message: "Two-factor authentication disabled" });
  });
}
