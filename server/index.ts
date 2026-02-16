import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";
import { db } from "./db";
import { startNotificationScheduler } from "./notificationScheduler";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { createProxyMiddleware } from "http-proxy-middleware";

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
    headers: {
      'X-Forwarded-Host': '',
    },
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
      },
    },
  }));
  log(`Firebase auth proxy configured for ${firebaseProjectIdForProxy}.firebaseapp.com`);
} else {
  log("WARNING: Could not determine Firebase project ID for auth proxy. Set FIREBASE_SERVICE_ACCOUNT_KEY or ensure VITE_FIREBASE_PROJECT_ID is the project ID (not the App ID).");
}

app.use(compression());

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
}));

app.set("trust proxy", 1);

// Stripe webhook route MUST be registered BEFORE express.json() middleware
// Webhooks need the raw Buffer body for signature verification
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

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

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl } as any);
    log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const domains = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (domains) {
      const webhookBaseUrl = `https://${domains}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        log(`Stripe webhook configured: ${result?.webhook?.url || 'webhook ready'}`);
      } catch (webhookErr) {
        console.error('Webhook setup error (non-fatal):', webhookErr);
      }
    }

    stripeSync.syncBackfill()
      .then(() => log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

(async () => {
  await initStripe();
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
  const MAX_RETRIES = 20;
  const RETRY_DELAY = 2000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function startListening(attempt: number) {
    server.removeAllListeners('error');
    server.removeAllListeners('listening');

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

    server.once('listening', () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      log(`serving on port ${port}`);
      startNotificationScheduler();
    });

    server.listen({ port, host: "0.0.0.0", reusePort: true });
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
