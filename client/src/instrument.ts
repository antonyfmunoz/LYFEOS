import { COOKIE_CONSENT_CHANGED_EVENT, hasOptionalCookieConsent } from "./lib/cookieConsent";

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

let sentry: typeof import("@sentry/react") | null = null;
let sentryStart: Promise<void> | null = null;

export function startSentryAfterConsent(): Promise<void> {
  if (!dsn || !hasOptionalCookieConsent()) return Promise.resolve();
  sentryStart ||= import("@sentry/react").then((module) => {
    sentry = module;
    module.init({
      dsn,
      enabled: true,
      environment,
      release: runtimeConfig?.sentryRelease || import.meta.env.VITE_SENTRY_RELEASE,
      tunnel: "/api/sentry-tunnel",
      integrations: [module.browserTracingIntegration()],
      tracesSampleRate: environment === "production" ? 0.1 : 1,
      tracePropagationTargets: ["localhost", /^\/api\//],
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
  }).catch(() => { sentryStart = null; });
  return sentryStart;
}

export function stopSentryAfterConsentWithdrawal(): void {
  if (!sentry) return;
  void sentry.close();
  sentry = null;
  sentryStart = null;
}

export async function captureSentryException(error: unknown): Promise<void> {
  await startSentryAfterConsent();
  sentry?.captureException(error);
}

window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, () => {
  if (hasOptionalCookieConsent()) void startSentryAfterConsent();
  else stopSentryAfterConsentWithdrawal();
});
