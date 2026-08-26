import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface PushConfig { configured: boolean; supported: boolean; publicKey: string | null; provider: string | null }
interface PushRecord { id: number; endpoint: string | null; status: string; createdAt: string; lastSuccessAt: string | null; failureCount: number }

function applicationServerKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

export default function PushNotificationSettings() {
  const { toast } = useToast();
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const config = useQuery<PushConfig>({ queryKey: ["/api/push/config"], queryFn: () => apiRequest("/api/push/config") });
  const subscriptions = useQuery<{ subscriptions: PushRecord[] }>({ queryKey: ["/api/push/subscriptions"], queryFn: () => apiRequest("/api/push/subscriptions") });
  const browserSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!browserSupported) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setCurrentEndpoint(subscription?.endpoint || null)).catch(() => setCurrentEndpoint(null));
  }, [browserSupported, subscriptions.data]);

  const currentActive = Boolean(currentEndpoint && subscriptions.data?.subscriptions.some((subscription) => subscription.endpoint === currentEndpoint));
  const enable = async () => {
    if (!browserSupported || !config.data?.configured || !config.data.publicKey) return;
    setBusy(true);
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted in this browser.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.data.publicKey) as BufferSource });
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) throw new Error("The browser returned an incomplete push subscription.");
      await apiRequest("/api/push/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: payload.endpoint, expirationTime: payload.expirationTime ?? null, keys: payload.keys }) });
      setCurrentEndpoint(subscription.endpoint);
      await queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
      toast({ title: "Push notifications enabled", description: "This browser can now receive mission and reminder notifications." });
    } catch (error) {
      toast({ title: "Could not enable notifications", description: error instanceof Error ? error.message : "Try again in your browser settings.", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const disable = async () => {
    if (!browserSupported) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiRequest("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setCurrentEndpoint(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
      toast({ title: "Push notifications disabled", description: "This browser will no longer receive LyfeOS notifications." });
    } catch (error) {
      toast({ title: "Could not disable notifications", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const sendTest = async () => {
    setBusy(true);
    try { await apiRequest("/api/push/test", { method: "POST" }); toast({ title: "Test notification sent", description: "Your browser should display it shortly." }); }
    catch (error) { toast({ title: "Test delivery failed", description: error instanceof Error ? error.message : "Try re-enabling this device.", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const unavailableReason = !browserSupported ? "This browser does not support standards-based Web Push." : !config.data?.configured ? "Push delivery is not configured on this LyfeOS installation." : null;
  return (
    <div className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-icons text-primary text-sm">notifications</span>
        <Label className="text-sm text-foreground">Push Notifications</Label>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Receive private mission and reminder notifications on browsers you explicitly authorize. Each browser can be revoked independently.</p>
      <div className="flex items-center justify-between gap-3 p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
        <div className="flex items-center min-w-0">
          <span className="material-icons text-primary text-sm mr-2">notifications_active</span>
          <div className="min-w-0">
            <span className="text-sm">This browser</span>
            <p className="text-xs text-muted-foreground">{unavailableReason || (currentActive ? "Enabled" : "Not enabled")}</p>
          </div>
        </div>
        <button type="button" disabled={busy || Boolean(unavailableReason) || config.isLoading || subscriptions.isLoading} onClick={() => currentActive ? void disable() : void enable()} className={`w-10 h-5 rounded-full relative transition-colors disabled:opacity-40 ${currentActive ? "bg-primary" : "bg-card border border-primary/20"}`} role="switch" aria-checked={currentActive} aria-label={currentActive ? "Disable push notifications on this browser" : "Enable push notifications on this browser"}>
          {busy ? <Loader2 className="absolute h-3 w-3 animate-spin top-0.5 left-3.5 text-foreground" /> : <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${currentActive ? "translate-x-5" : "translate-x-0.5"}`} />}
        </button>
      </div>
      {currentActive && <button type="button" onClick={() => void sendTest()} disabled={busy} className="mt-2 text-xs text-primary hover:underline disabled:opacity-40">Send a test notification</button>}
      {(subscriptions.data?.subscriptions.length || 0) > 1 && <p className="mt-2 text-[10px] text-muted-foreground">{subscriptions.data!.subscriptions.length} authorized browsers are active on this account.</p>}
    </div>
  );
}
