import "./instrument";

import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { startSentryAfterConsent } from "./instrument";
import { COOKIE_CONSENT_CHANGED_EVENT, hasOptionalCookieConsent } from "./lib/cookieConsent";
import LandingPage from "./pages/LandingPage";

const AppBootstrap = lazy(() => import("./AppBootstrap"));
const CLERK_JS_VERSION = "5.127.2";

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

async function startServiceWorker(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.update();
    }
  } catch (error) {
    console.warn('SW cleanup error:', error);
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    const prime = () => { void primeCurrentAppShell(); };
    if (document.readyState === 'complete') prime();
    else window.addEventListener('load', prime, { once: true });
  } catch (error) {
    console.warn('Service worker setup failed:', error);
  }
}

if ('serviceWorker' in navigator) void startServiceWorker();

function ConsentGatedApplication() {
  const [hasConsent, setHasConsent] = useState(hasOptionalCookieConsent);
  useEffect(() => {
    const syncConsent = () => setHasConsent(hasOptionalCookieConsent());
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);
  }, []);

  if (!hasConsent) return <LandingPage />;
  return <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Loading LyfeOS" />}><AppBootstrap clerkJSVersion={CLERK_JS_VERSION} /></Suspense>;
}

createRoot(document.getElementById("root")!).render(<ConsentGatedApplication />);
void startSentryAfterConsent();
