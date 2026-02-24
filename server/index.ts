import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { startNotificationScheduler } from "./notificationScheduler";
import { createProxyMiddleware } from "http-proxy-middleware";
import { execSync } from "child_process";

const app = express();

function getFirebaseProjectIdForProxy(): string | null {
  const actualProjectId = process.env.VITE_FIREBASE_ACTUAL_PROJECT_ID;
  if (actualProjectId && !actualProjectId.includes(':')) {
    return actualProjectId;
  }
  const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    try {
      const parsed = JSON.parse(saKey);
      if (parsed.project_id) return parsed.project_id;
    } catch {}
  }
  const envProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (envProjectId && !envProjectId.includes(':')) {
    return envProjectId;
  }
  return null;
}

const firebaseProjectIdForProxy = getFirebaseProjectIdForProxy();
if (firebaseProjectIdForProxy) {
  app.use('/__/auth', createProxyMiddleware({
    target: `https://${firebaseProjectIdForProxy}.firebaseapp.com`,
    changeOrigin: true,
    secure: true,
    pathRewrite: (path) => `/__/auth${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        log(`Firebase proxy: ${req.method} ${req.url}`);
        proxyReq.removeHeader('x-forwarded-host');
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-forwarded-port');
        proxyReq.setHeader('x-forwarded-proto', 'https');
      },
      proxyRes: (proxyRes, req) => {
        log(`Firebase proxy response: ${proxyRes.statusCode} for ${req.url}`);
        delete proxyRes.headers['cross-origin-opener-policy'];
        delete proxyRes.headers['cross-origin-embedder-policy'];
        delete proxyRes.headers['cross-origin-resource-policy'];
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization';
      },
      error: (err, req, res) => {
        log(`Firebase proxy error: ${err.message} for ${req.url}`);
      },
    },
  }));
  log(`Firebase auth proxy configured for ${firebaseProjectIdForProxy}.firebaseapp.com`);
} else {
  log("WARNING: Could not determine Firebase project ID for auth proxy. Set FIREBASE_SERVICE_ACCOUNT_KEY or ensure VITE_FIREBASE_PROJECT_ID is the project ID (not the App ID).");
}

app.use(compression());

(async () => {
  try {
    await db.execute(sql`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
  } catch (e: any) {
    if (!e.message?.includes('already')) {
      console.log("Migration note:", e.message);
    }
  }
})();


app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
}));

app.set("trust proxy", 1);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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
app.use("/api/auth/ensure-firebase-user", createRateLimiter(3, 60 * 1000));
app.use("/api/auth/reset-password-firebase", createRateLimiter(5, 60 * 1000));
app.use("/api/auth/sync-email-verified", createRateLimiter(5, 60 * 1000));
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


async function ensureDatabaseSchema() {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'user_stats', 'user_profile', 'quests')`
    );
    const tableCount = parseInt(String(result.rows[0].count), 10);
    if (tableCount < 4) {
      log(`Database schema incomplete (${tableCount}/4 core tables found), running schema sync...`);
      execSync('npx drizzle-kit push', { stdio: 'inherit', timeout: 30000, cwd: process.cwd() });
      const verify = await db.execute(
        sql`SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'`
      );
      if (parseInt(String(verify.rows[0].count), 10) === 0) {
        log('CRITICAL: Database schema sync failed - users table still missing. Aborting startup.');
        process.exit(1);
      }
      log('Database schema synced successfully');
    }
  } catch (error) {
    log(`CRITICAL: Database schema check failed: ${error}. Aborting startup.`);
    process.exit(1);
  }
}

(async () => {
  await ensureDatabaseSchema();
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

  async function killPortProcess() {
    try {
      const { execSync } = await import('child_process');
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {}
  }

  async function startListening() {
    await killPortProcess();

    server.once('error', async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log(`Port ${port} in use, killing stale process and retrying...`);
        server.close(async () => {
          await killPortProcess();
          server.removeAllListeners('error');
          server.removeAllListeners('listening');
          server.once('error', (retryErr: NodeJS.ErrnoException) => {
            log(`Failed to start server: ${retryErr.message}`);
            process.exit(1);
          });
          server.once('listening', () => {
            log(`serving on port ${port}`);
            startNotificationScheduler();
          });
          server.listen({ port, host: "0.0.0.0", reusePort: true });
        });
      } else {
        log(`Failed to start server: ${err.message}`);
        process.exit(1);
      }
    });

    server.once('listening', () => {
      log(`serving on port ${port}`);
      startNotificationScheduler();
    });

    server.listen({ port, host: "0.0.0.0", reusePort: true });
  }

  startListening();

  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
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
