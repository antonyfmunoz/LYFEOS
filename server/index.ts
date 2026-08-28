import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not set. Server cannot start without a database connection.");
  process.exit(1);
}

if (!process.env.CLERK_SECRET_KEY) {
  console.error("CLERK_SECRET_KEY required");
  process.exit(1);
}

if (!process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  console.error("VITE_CLERK_PUBLISHABLE_KEY required");
  process.exit(1);
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite";
import session from "express-session";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import connectPgSimple from "connect-pg-simple";
import { startNotificationScheduler } from "./notificationScheduler";
import { startUMHOutboxWorker } from "./umh/outbox";
import { startHealthDeletionReceiptCleanup } from "./health-deletion-cleanup";
import { startProductAnalyticsDeletionWorker } from "./product-analytics";
import { startHypothesisWorker, stopHypothesisWorker } from "./hypothesis-engine";
import { startScheduledAutomationWorker, stopScheduledAutomationWorker } from "./scheduled-automation-worker";
import { execSync } from "child_process";
import * as Sentry from "@sentry/node";
import { SESSION_COOKIE_NAME } from "./session-config";
import { consumeDistributedRateLimit, deleteExpiredRateLimits, rateLimitBucketHash } from "./distributed-rate-limit";
import { migrateLegacyIntegrationCredentials } from "./integration-provider-credentials";

const sentryDsn = process.env.SENTRY_DSN;
const sentryEnvironment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
// The immutable image revision is updated by the deploy command and must win
// over a manually configured fallback so server and browser events cannot be
// attributed to an older release after a successful deployment.
const sentryRelease = process.env.LYFEOS_RELEASE?.trim() || process.env.SENTRY_RELEASE?.trim();

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: sentryEnvironment,
  release: sentryRelease,
  // Error monitoring is the production-MVP need. Keep performance sampling
  // intentionally low until real traffic establishes a useful baseline.
  tracesSampleRate: sentryEnvironment === "production" ? 0.1 : 1,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
});

const app = express();

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

// Clerk's Svix signature covers the exact request bytes. This must run before
// JSON parsing so the webhook route can authenticate those bytes.
app.post("/api/webhooks/clerk", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString("hex");
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("SESSION_SECRET required in production");
    process.exit(1);
  }
  log("WARNING: SESSION_SECRET not set. Using auto-generated secret. Sessions will not persist across restarts. Set SESSION_SECRET in environment variables for production.");
}


const PostgresSessionStore = connectPgSimple(session);
app.use(session({
  store: new PostgresSessionStore({
    pool,
    tableName: "session",
    createTableIfMissing: false,
    pruneSessionInterval: 60,
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: SESSION_COOKIE_NAME,
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
    const principal = req.session?.userId ? `user:${req.session.userId}` : `ip:${ip}`;
    const key = keyByIpOnly ? `global:${principal}` : `${principal}:${req.path}`;
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

const isolatedQualification = process.env.LYFEOS_TEST_ENV === "isolated" && !process.env.FLY_APP_NAME;
const qualificationRequestLimit = (productionLimit: number) => isolatedQualification ? 10_000 : productionLimit;

function requestSubject(req: Request): string | null {
  const value = req.body?.identifier ?? req.body?.email ?? req.body?.displayName ?? req.query.email ?? req.query.displayName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createDistributedRateLimiter(scope: string, productionLimit: number, subjectAware = true) {
  const maxRequests = qualificationRequestLimit(productionLimit);
  const windowMs = 60 * 1000;
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const buckets = [rateLimitBucketHash(sessionSecret, scope, "ip", ip)];
    const subject = subjectAware ? requestSubject(req) : null;
    if (subject) buckets.push(rateLimitBucketHash(sessionSecret, scope, "subject", subject));
    try {
      const decision = await consumeDistributedRateLimit(pool, buckets, maxRequests, windowMs);
      res.setHeader("RateLimit-Limit", String(maxRequests));
      res.setHeader("RateLimit-Remaining", String(decision.remaining));
      res.setHeader("RateLimit-Reset", String(decision.retryAfterSeconds));
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(decision.retryAfterSeconds));
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }
      return next();
    } catch (error) {
      log(`Sensitive request limiter unavailable for ${scope}: ${error instanceof Error ? error.message : "unknown error"}`);
      return res.status(503).json({ error: "This request is temporarily unavailable. Please try again." });
    }
  };
}

app.use("/api/auth/register", createDistributedRateLimiter("auth.register", 5));
app.use("/api/auth/complete-registration", createDistributedRateLimiter("auth.complete_registration", 5));
app.use("/api/auth/login", createDistributedRateLimiter("auth.login", 10));
app.use("/api/auth/check-email", createDistributedRateLimiter("auth.check_email", 20));
app.use("/api/auth/check-display-name", createDistributedRateLimiter("auth.check_display_name", 30));
app.use("/api/auth/sync-email-verified", createDistributedRateLimiter("auth.sync_email_verified", 5));
app.use("/api/webhooks/clerk", createDistributedRateLimiter("webhook.clerk", 120, false));
app.use("/api/public/forms", createDistributedRateLimiter("public.forms", 30, false));
app.use("/api/profile/generate-affirmation", createRateLimiter(qualificationRequestLimit(5), 60 * 1000));
app.use("/api/voice-command", createRateLimiter(qualificationRequestLimit(20), 60 * 1000));
app.use("/api/ai/orchestration-runs", createRateLimiter(qualificationRequestLimit(10), 60 * 1000, true));
// The isolated authenticated journey exercises the whole API through one local
// loopback address. Keep the production ceiling unchanged while preventing the
// shared CI harness from turning unrelated later tests into 429 cascades.
// Product pages hydrate several independent, user-owned surfaces. Bound that
// aggregate traffic per authenticated account rather than pooling every user
// behind the same proxy IP, while preserving the existing production ceiling.
app.use("/api", createRateLimiter(qualificationRequestLimit(100), 60 * 1000, true));

const rateLimitCleanupTimer = setInterval(() => {
  deleteExpiredRateLimits(pool).catch((error) => log(`Rate-limit cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`));
}, 5 * 60 * 1000);
rateLimitCleanupTimer.unref();

app.use((req, res, next) => {
  const requestId = req.header("x-request-id") || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);
  (req as Request & { requestId?: string }).requestId = requestId;
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms requestId=${requestId}`;

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
  const migratedIntegrationCredentials = await migrateLegacyIntegrationCredentials();
  if (migratedIntegrationCredentials > 0) log(`Migrated ${migratedIntegrationCredentials} legacy integration credential envelope(s)`);
  const server = await registerRoutes(app);

  // API callers must receive an API-shaped 404. Without this boundary, Vite
  // (or the production SPA fallback) can return index.html with status 200 for
  // a misspelled or retired API route, which looks like a successful mutation.
  app.use("/api", (req: Request, res: Response) => {
    res.status(404).json({ error: "API route not found", path: req.path });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const requestId = (_req as Request & { requestId?: string }).requestId;
    const message = status >= 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : (err.message || "Internal Server Error");

    log(`Error: ${err.message || "Internal Server Error"} (${status}) requestId=${requestId || "unknown"}`);
    Sentry.withScope((scope) => {
      scope.setTag("request_id", requestId || "unknown");
      scope.setTag("http_status", String(status));
      scope.setContext("request", { method: _req.method, path: _req.path });
      Sentry.captureException(err);
    });
    console.error(err);
    res.status(status).json({ message, requestId });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite-dev");
    await setupVite(app, server);
  } else {
    const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!clerkPublishableKey) {
      console.error("VITE_CLERK_PUBLISHABLE_KEY required in production");
      process.exit(1);
    }
    serveStatic(app, {
      clerkPublishableKey,
      sentryDsn,
      environment: sentryEnvironment,
      sentryRelease,
    });
  }

  const port = process.env.PORT || 5000;

  server.once('error', (err: NodeJS.ErrnoException) => {
    log(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

  server.once('listening', () => {
    log(`serving on port ${port}`);
    startNotificationScheduler();
    startUMHOutboxWorker();
    startHealthDeletionReceiptCleanup();
    startProductAnalyticsDeletionWorker();
    startHypothesisWorker();
    if (process.env.LYFEOS_TEST_ENV !== "isolated") startScheduledAutomationWorker();
  });

  server.listen({ port, host: "0.0.0.0" });

  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    stopHypothesisWorker();
    stopScheduledAutomationWorker();
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

  process.on('uncaughtException', async (err) => {
    log(`Uncaught exception: ${err.message}`);
    Sentry.captureException(err);
    await Sentry.flush(2000);
    console.error(err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', async (reason, promise) => {
    log(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    Sentry.captureException(reason);
    await Sentry.flush(2000);
    console.error(reason);
    gracefulShutdown('unhandledRejection');
  });
})();
