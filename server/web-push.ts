import webpush from "web-push";

export interface WebPushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  questId?: number;
  actions?: Array<{ action: string; title: string }>;
}

export function webPushConfiguration(): { configured: boolean; publicKey: string | null } {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || null;
  return { configured: Boolean(publicKey && privateKey), publicKey };
}

let configuredFingerprint = "";
const TRANSIENT_PUSH_RETRY_DELAY_MS = 1_000;

function isTransientPushError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return statusCode >= 500 && statusCode < 600;
}

function configureProvider(): boolean {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "https://lyfeos.net";
  const fingerprint = `${subject}:${publicKey}`;
  if (configuredFingerprint !== fingerprint) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredFingerprint = fingerprint;
  }
  return true;
}

export async function deliverWebPush(subscription: { endpoint: string; p256dh: string; auth: string; expirationTime?: Date | null }, payload: WebPushPayload): Promise<void> {
  if (!configureProvider()) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  const device = {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime?.getTime() ?? null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  const options = { TTL: 60 * 60, urgency: "normal" as const, topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32) };
  try {
    await webpush.sendNotification(device, JSON.stringify({ data: payload }), options);
  } catch (error) {
    // A provider 5xx is explicitly transient. Retry once only; terminal endpoint
    // failures and other errors remain visible to the caller without masking them.
    if (!isTransientPushError(error)) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, TRANSIENT_PUSH_RETRY_DELAY_MS));
    await webpush.sendNotification(device, JSON.stringify({ data: payload }), options);
  }
}
