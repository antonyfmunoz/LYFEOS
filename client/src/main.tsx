import "./instrument";

import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import * as Sentry from "@sentry/react";
import { sentryEnabled } from "./instrument";
import { AppErrorFallback } from "./components/AppErrorFallback";

const runtimeConfig = (window as Window & {
  __LYFEOS_RUNTIME_CONFIG__?: {
    clerkPublishableKey?: string;
  };
}).__LYFEOS_RUNTIME_CONFIG__;

const PUBLISHABLE_KEY = runtimeConfig?.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_JS_VERSION = "5.127.2";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

// Add title
document.title = "LYFEOS - Dashboard";

async function primeCurrentAppShell(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) return;
  const urls = [
    window.location.href,
    new URL('/', window.location.origin).href,
    ...performance.getEntriesByType('resource').map((entry) => entry.name),
  ];
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 10_000);
    channel.port1.onmessage = (event) => {
      if (event.data?.type !== 'CURRENT_APP_SHELL_CACHED') return;
      window.clearTimeout(timeout);
      resolve();
    };
    registration.active!.postMessage({ type: 'CACHE_CURRENT_APP_SHELL', urls }, [channel.port2]);
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update();
      }
    } catch (e) {
      console.warn('SW cleanup error:', e);
    }
    try {
      await navigator.serviceWorker.register('/sw.js');
      await primeCurrentAppShell();
    } catch (err) {
      console.warn('Service worker setup failed:', err);
    }
  });
}

const application = (
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    clerkJSVersion={CLERK_JS_VERSION}
  >
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ClerkProvider>
);

createRoot(document.getElementById("root")!).render(
  sentryEnabled ? (
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => <AppErrorFallback error={error} eventId={eventId} />}
    >
      {application}
    </Sentry.ErrorBoundary>
  ) : application,
);
