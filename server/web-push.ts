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
  await webpush.sendNotification({
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime?.getTime() ?? null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, JSON.stringify({ data: payload }), { TTL: 60 * 60, urgency: "normal", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32) });
}
