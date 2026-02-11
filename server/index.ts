import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";
import { db } from "./db";
import { startNotificationScheduler } from "./notificationScheduler";

const app = express();

app.use(compression());

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
}));

app.set("trust proxy", 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex");
if (!process.env.SESSION_SECRET) {
  log("WARNING: SESSION_SECRET not set. Using auto-generated secret. Sessions will not persist across restarts. Set SESSION_SECRET in environment variables for production.");
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'lax'
  }
}));

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function createRateLimiter(maxRequests: number, windowMs: number, keyByIpOnly = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = keyByIpOnly ? `global:${ip}` : `${ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitStore.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (entry.count >= maxRequests) {
      res.set("Retry-After", String(Math.ceil((entry.windowStart + windowMs - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    entry.count++;
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimitStore.keys());
  for (const key of keys) {
    const entry = rateLimitStore.get(key);
    if (entry && now - entry.windowStart > 120000) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth/register", createRateLimiter(5, 60 * 1000));
app.use("/api/auth/login", createRateLimiter(10, 60 * 1000));
app.use("/api/auth/forgot-password", createRateLimiter(3, 60 * 1000));
app.use("/api/auth/reset-password", createRateLimiter(5, 60 * 1000));
app.use("/api/auth/resend-verification", createRateLimiter(3, 60 * 1000));
app.use("/api/profile/generate-affirmation", createRateLimiter(5, 60 * 1000));
app.use("/api/voice-command", createRateLimiter(20, 60 * 1000));
app.use("/api", createRateLimiter(100, 60 * 1000, true));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error: ${message} (${status})`);
    console.error(err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    app.use(express.static("dist/public", {
      maxAge: "1y",
      immutable: true,
    }));
    serveStatic(app);
  }

  const port = 5000;
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function startListening(attempt: number) {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_RETRIES) {
        log(`Port ${port} in use, retrying in ${RETRY_DELAY}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        server.close(() => {
          retryTimer = setTimeout(() => startListening(attempt + 1), RETRY_DELAY);
        });
      } else {
        log(`Failed to start server: ${err.message}`);
        process.exit(1);
      }
    });

    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      log(`serving on port ${port}`);
      startNotificationScheduler();
    });
  }

  startListening(0);

  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      log('Forcing shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

  process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.message}`);
    console.error(err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    console.error(reason);
    gracefulShutdown('unhandledRejection');
  });
})();
