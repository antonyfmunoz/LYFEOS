import "./instrument";

import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import * as Sentry from "@sentry/react";
import { sentryEnabled } from "./instrument";

const runtimeConfig = (window as Window & {
  __LYFEOS_RUNTIME_CONFIG__?: {
    clerkPublishableKey?: string;
  };
}).__LYFEOS_RUNTIME_CONFIG__;

const PUBLISHABLE_KEY = runtimeConfig?.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

// Add title
document.title = "LYFEOS - Dashboard";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update();
      }
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name !== 'lyfeos-v25') {
          await caches.delete(name);
        }
      }
    } catch (e) {
      console.warn('SW cleanup error:', e);
    }
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

const application = (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ClerkProvider>
);

createRoot(document.getElementById("root")!).render(
  sentryEnabled ? (
    <Sentry.ErrorBoundary fallback={<p role="alert">LyfeOS encountered an unexpected error. Please refresh and try again.</p>}>
      {application}
    </Sentry.ErrorBoundary>
  ) : application,
);
