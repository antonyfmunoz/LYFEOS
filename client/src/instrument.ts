import * as Sentry from "@sentry/react";

type RuntimeConfig = {
  clerkPublishableKey?: string;
  environment?: string;
  sentryDsn?: string;
  sentryRelease?: string;
};

const runtimeConfig = (window as Window & {
  __LYFEOS_RUNTIME_CONFIG__?: RuntimeConfig;
}).__LYFEOS_RUNTIME_CONFIG__;

const dsn = runtimeConfig?.sentryDsn || import.meta.env.VITE_SENTRY_DSN;
const environment = runtimeConfig?.environment || import.meta.env.MODE;

// This module must remain the first import in main.tsx so global handlers and
// browser tracing are ready before React or application code executes.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  release: runtimeConfig?.sentryRelease || import.meta.env.VITE_SENTRY_RELEASE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: environment === "production" ? 0.1 : 1,
  tracePropagationTargets: ["localhost", /^\/api\//],
  // LyfeOS may contain deeply personal data. Keep operational context while
  // disabling automatic collection of identities, request content, and local
  // variable values until a documented privacy policy says otherwise.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    queryParams: false,
    httpBodies: [],
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
});

export const sentryEnabled = Boolean(dsn);
