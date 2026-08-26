import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { storage } from "../storage";
import { logger, formatLocalDate } from "../utils";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { SESSION_COOKIE_NAME } from "../session-config";
import { applyClerkUserLifecycleEvent } from "../clerk-webhook-lifecycle";
import { deleteLocalAccountData } from "./profile";

declare module "express-session" {
  interface SessionData {
    userId: number;
    displayName: string;
  }
}

interface LocalUserSeed {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

async function initializeUserRecords(userId: number) {
  await storage.createUserStats({
    userId, experienceCurrent: 0, experienceMax: 1000, level: 1,
    timeTokensCurrent: 100, timeTokensMax: 100, energyPointsCurrent: 100,
    energyPointsMax: 100, healthPointsCurrent: 100, healthPointsMax: 100,
    attentionTokensCurrent: 100, attentionTokensMax: 100, streakDays: 0,
    efficiencyScore: 0, aiAssistantName: "NOVA", primaryColor: "#ffffff",
  });
  await storage.upsertUserProfile(userId, {
    startStage: "beginner", targetArchetype: "architect", flowStyle: "hyperfocus",
    coreMotivation: "growth", setupMissionStatus: "not_started", primaryThemeColor: "#ffe03d",
    onboardingCompleted: false,
  });
  await storage.createUserIntegration({ userId, appleHealthConnected: false, googleCalendarConnected: false, notionConnected: false });
  await storage.createUserDailyLog({
    userId, date: formatLocalDate(), yesterdayXp: 0,
    todayPrimaryMission: "Get started with LYFEOS", optionalBoostsShown: false,
  });
}

async function provisionLocalUser(seed: LocalUserSeed) {
  const existing = await storage.getUserByEmail(seed.email);
  if (existing) {
    if (!existing.clerkId) await storage.updateUserClerkId(existing.id, seed.clerkId);
    return existing;
  }

  const displayName = [seed.firstName, seed.lastName].filter(Boolean).join(" ") || seed.email.split("@")[0];
  const user = await storage.createUser({
    password: null,
    displayName,
    firstName: seed.firstName ?? null,
    lastName: seed.lastName ?? null,
    title: "COMMANDER",
    email: seed.email,
    authProvider: "clerk",
    clerkId: seed.clerkId,
    termsAccepted: true,
  });

  await initializeUserRecords(user.id);
  return user;
}

export const bindAuthenticatedPrincipal = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  if (!userId) return next();
  let user = await storage.getUserByClerkId(userId);
  if (!user) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
      if (!email) return res.status(401).json({ error: "A verified email is required to finish account setup" });
      user = await provisionLocalUser({ clerkId: userId, email, firstName: clerkUser.firstName, lastName: clerkUser.lastName });
    } catch (error) {
      logger.error("Unable to provision authenticated Clerk user:", error);
      return res.status(503).json({ error: "Account setup is temporarily unavailable" });
    }
  }
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  req.session.userId = user.id;
  req.session.displayName = user.displayName ?? "";
  (req as any).dbUser = user;
  return next();
};

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const sessionUserId = req.session?.userId;
  const sessionUser = sessionUserId ? await storage.getUser(sessionUserId) : undefined;
  if (!sessionUser) return res.status(401).json({ error: "Authentication required" });
  req.session.displayName = sessionUser.displayName ?? "";
  (req as any).dbUser = sessionUser;
  return next();
};

function verifyClerkWebhook(req: Request): { ok: true; body: Record<string, any> } | { ok: false; reason: string } {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: "Clerk webhook verification is not configured" };
  if (!Buffer.isBuffer(req.body)) return { ok: false, reason: "Webhook body was not received as raw JSON" };

  const id = req.header("svix-id");
  const timestamp = req.header("svix-timestamp");
  const signatures = req.header("svix-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return { ok: false, reason: "Missing or invalid Svix headers" };
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return { ok: false, reason: "Stale Svix timestamp" };

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, "base64"); } catch { return { ok: false, reason: "Invalid Clerk webhook signing secret" }; }
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${req.body.toString("utf8")}`).digest();
  const verified = signatures.split(" ").some((value) => {
    const [, encoded] = value.split(",", 2);
    if (!encoded) return false;
    try {
      const received = Buffer.from(encoded, "base64");
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    } catch { return false; }
  });
  if (!verified) return { ok: false, reason: "Invalid Svix signature" };

  try { return { ok: true, body: JSON.parse(req.body.toString("utf8")) }; }
  catch { return { ok: false, reason: "Invalid webhook JSON" }; }
}

export function registerAuthRoutes(app: Express): void {
  app.use(clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }));
  app.use(bindAuthenticatedPrincipal);

  const bindSession = (req: Request, user: { id: number; displayName: string | null }) => {
    req.session.userId = user.id;
    req.session.displayName = user.displayName ?? "";
  };

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, termsAccepted, avatarColor } = req.body;
      if (!z.string().email().safeParse(email).success || typeof password !== "string" || password.length < 6 || termsAccepted !== true) {
        return res.status(400).json({ error: "A valid email, password, and acceptance of the terms are required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (await storage.getUserByEmail(normalizedEmail)) return res.status(409).json({ error: "An account with this email already exists" });
      const user = await storage.createUser({
        email: normalizedEmail, password: await bcrypt.hash(password, 12), displayName: normalizedEmail.split("@")[0],
        title: "COMMANDER", authProvider: "email", termsAccepted: true, avatarColor: avatarColor || "#00e0ff",
      });
      await initializeUserRecords(user.id);
      bindSession(req, user);
      return res.status(201).json({ user: { id: user.id, displayName: user.displayName }, isNewUser: true });
    } catch (error) {
      logger.error("Registration error:", error);
      return res.status(500).json({ error: "Account setup is temporarily unavailable" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body;
      if (typeof identifier !== "string" || typeof password !== "string") return res.status(400).json({ error: "Email or username and password are required" });
      const user = await storage.getUserByIdentifier(identifier.trim());
      if (!user?.password || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Check your email and password" });
      bindSession(req, user);
      const profile = await storage.getUserProfile(user.id);
      return res.json({ user: { id: user.id, displayName: user.displayName }, isNewUser: !profile?.onboardingCompleted });
    } catch (error) {
      logger.error("Login error:", error);
      return res.status(500).json({ error: "Unable to sign in right now" });
    }
  });

  app.post("/api/auth/complete-registration", async (req: Request, res: Response) => {
    try {
      const { email, password, displayName, firstName, lastName, avatarColor, termsAccepted } = req.body;
      if (!z.string().email().safeParse(email).success || typeof password !== "string" || password.length < 6 || typeof displayName !== "string" || displayName.trim().length < 3 || termsAccepted !== true) {
        return res.status(400).json({ error: "Please provide a valid email, password, and display name" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (await storage.getUserByEmail(normalizedEmail)) return res.status(409).json({ error: "An account with this email already exists" });
      const existingName = await storage.getUserByDisplayName(displayName.trim());
      if (existingName) return res.status(409).json({ error: "Display name already taken" });
      const user = await storage.createUser({
        email: normalizedEmail, password: await bcrypt.hash(password, 12), displayName: displayName.trim(), firstName: firstName || null,
        lastName: lastName || null, title: "COMMANDER", authProvider: "email", termsAccepted: true, avatarColor: avatarColor || "#00e0ff",
      });
      await initializeUserRecords(user.id);
      bindSession(req, user);
      return res.status(201).json({ user: { id: user.id, displayName: user.displayName } });
    } catch (error) {
      logger.error("Complete registration error:", error);
      return res.status(500).json({ error: "Account setup is temporarily unavailable" });
    }
  });

  app.post("/api/webhooks/clerk", async (req: Request, res: Response) => {
    try {
      const verified = verifyClerkWebhook(req);
      if (!verified.ok) return res.status(process.env.CLERK_WEBHOOK_SIGNING_SECRET ? 401 : 503).json({ error: verified.reason });
      const type = typeof verified.body.type === "string" ? verified.body.type : "";
      const data = verified.body.data && typeof verified.body.data === "object" ? verified.body.data : {};
      const result = await applyClerkUserLifecycleEvent(type, data, {
        getUserByClerkId: (clerkId) => storage.getUserByClerkId(clerkId),
        getUserByEmail: (email) => storage.getUserByEmail(email),
        provisionUser: provisionLocalUser,
        updateUser: (id, patch) => storage.updateUser(id, patch),
        deleteLocalAccountData,
      });
      return res.status(result.status).json(result.body);
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

      const updatedUser = await storage.updateUser(userId, {
        displayName: displayNameInput.trim(),
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
        res.clearCookie(SESSION_COOKIE_NAME);
        return res.status(200).json({ message: "Already logged out" });
      }

      req.session.destroy((err) => {
        if (err) {
          logger.error("Error destroying session:", err);
          return res.status(500).json({ error: "Failed to logout" });
        }

        res.clearCookie(SESSION_COOKIE_NAME, {
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
