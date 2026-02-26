import { useState, useEffect, useCallback } from "react";
import { X, Download, Share } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";

const DISMISS_KEY_PREFIX = "lyfeos_pwa_dismissed_";
const NEW_USER_WINDOW = 3 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
}

function getDismissKey(userId: number | undefined | null): string {
  return `${DISMISS_KEY_PREFIX}${userId || "anon"}`;
}

function wasPermanentlyDismissed(userId: number | undefined | null): boolean {
  try {
    return localStorage.getItem(getDismissKey(userId)) === "true";
  } catch {
    return false;
  }
}

function isDashboardTutorialComplete(profile: any, userId: number | undefined | null): boolean {
  try {
    const skipKey = `lyfeos-tutorials-all-skipped-${userId || "anon"}`;
    if (localStorage.getItem(skipKey) === "true") return true;
  } catch {}

  const completed: string[] = profile?.completedTutorials || [];
  return completed.includes("dashboard");
}

interface PWAInstallPromptProps {
  tutorialActive?: boolean;
  tutorialLoading?: boolean;
}

export default function PWAInstallPrompt({ tutorialActive = false, tutorialLoading = true }: PWAInstallPromptProps) {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(() => wasPermanentlyDismissed(user?.id));

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: !!user,
    staleTime: 60000,
  });

  const isReturningUser = profile?.onboardingCompleted === true;

  const isNewUser = (() => {
    if (isReturningUser) return false;
    if (!profile?.createdAt) return false;
    const created = new Date(profile.createdAt).getTime();
    return Date.now() - created < NEW_USER_WINDOW;
  })();

  const dashboardTutorialDone = isDashboardTutorialComplete(profile, user?.id);

  const canShow = !isStandalone() && isMobileDevice() && !wasPermanentlyDismissed(user?.id) && isNewUser && !isReturningUser && !tutorialActive && !tutorialLoading && dashboardTutorialDone && !dismissed;

  useEffect(() => {
    if (!canShow) {
      if (tutorialActive) {
        setShowBanner(false);
      }
      return;
    }

    if (isIOS()) {
      setShowIOSInstructions(true);
      setShowBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [canShow, tutorialActive]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(getDismissKey(user?.id), "true");
      setDismissed(true);
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt, user?.id]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(getDismissKey(user?.id), "true");
    setDismissed(true);
    setShowBanner(false);
  }, [user?.id]);

  if (!showBanner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} />
      <div className="relative glassmorphic rounded-xl p-5 neon-border max-w-sm w-full animate-in zoom-in-95 fade-in duration-300">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center gap-3">
          <img
            src="/icon-192.png"
            alt="LYFEOS"
            className="h-14 w-14 rounded-xl"
          />

          <div>
            <p className="text-lg font-semibold text-foreground leading-tight">
              Install LYFEOS
            </p>
            {showIOSInstructions ? (
              <p className="text-sm text-muted-foreground mt-1.5 flex items-center justify-center gap-1 flex-wrap">
                Tap <Share className="inline h-4 w-4 text-primary" /> Share then
                <span className="font-medium text-foreground">"Add to Home Screen"</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1.5">
                Get the best experience on your device
              </p>
            )}
          </div>

          {!showIOSInstructions && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95 shadow-[0_0_15px_var(--primary-shadow,rgba(0,224,255,0.3))]"
            >
              <Download className="h-4 w-4" />
              Install App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
