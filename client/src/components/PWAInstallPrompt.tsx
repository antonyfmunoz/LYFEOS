import { useState, useEffect, useCallback } from "react";
import { X, Download, Share } from "lucide-react";

const DISMISS_KEY = "lyfeos_pwa_dismiss";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

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

function wasDismissedRecently(): boolean {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedAt = parseInt(dismissed, 10);
  return Date.now() - dismissedAt < SEVEN_DAYS;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone() || !isMobileDevice() || wasDismissedRecently()) return;

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
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowBanner(false);
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 px-3 pb-2 animate-in slide-in-from-bottom-4 duration-300 md:bottom-4">
      <div
        className="mx-auto max-w-md rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[#0d0d14]/95 backdrop-blur-lg shadow-[0_0_20px_rgba(0,229,255,0.15)] p-3"
      >
        <div className="flex items-center gap-3">
          <img
            src="/icon-192.png"
            alt="LYFEOS"
            className="h-10 w-10 rounded-lg shrink-0"
          />

          <div className="flex-1 min-w-0">
            {showIOSInstructions ? (
              <>
                <p className="text-sm font-semibold text-white leading-tight">
                  Install LYFEOS
                </p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                  Tap <Share className="inline h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Share then
                  <span className="font-medium text-white">"Add to Home Screen"</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white leading-tight">
                  Install LYFEOS
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Get the best experience on your device
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!showIOSInstructions && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-bold text-black transition-all hover:brightness-110 active:scale-95 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
            )}

            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
