import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  hasGlobalPrivacyControl,
  hasOptionalCookieConsent,
  readCookieConsent,
  saveCookieConsent,
} from "@/lib/cookieConsent";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

export default function CookieSettings() {
  const [choice, setChoice] = useState(readCookieConsent);
  const [globalPrivacyControl, setGlobalPrivacyControl] = useState(hasGlobalPrivacyControl);

  useEffect(() => {
    const sync = () => {
      setChoice(readCookieConsent());
      setGlobalPrivacyControl(hasGlobalPrivacyControl());
    };
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
  }, []);

  const setOptionalServices = (enabled: boolean) => {
    saveCookieConsent(enabled ? "accepted" : "rejected");
    setChoice(enabled ? "accepted" : "rejected");
  };

  const optionalServicesEnabled = hasOptionalCookieConsent();

  return (
    <section className="mb-4 rounded-lg border border-primary/10 bg-background/40 p-4" aria-labelledby="cookie-settings-heading">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        <Label id="cookie-settings-heading" className="text-sm text-foreground">Cookie & privacy controls</Label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Essential local storage keeps LyfeOS functioning. Optional measurement and error monitoring stay off unless you enable them here. This choice applies to this browser and device.
      </p>
      <div className="flex items-center justify-between gap-4 rounded-lg bg-card/50 p-3">
        <div>
          <p className="text-sm text-foreground">Optional measurement and error monitoring</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {globalPrivacyControl
              ? "Your browser's Global Privacy Control signal is active, so optional services are off. Turn off that browser signal before enabling optional services."
              : optionalServicesEnabled
                ? "Enabled. You can withdraw this choice at any time."
                : "Disabled. No optional analytics or error-monitoring service is loaded."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOptionalServices(!optionalServicesEnabled)}
          disabled={globalPrivacyControl}
          className={`relative h-5 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${optionalServicesEnabled ? "bg-primary/30" : "bg-card"}`}
          aria-checked={optionalServicesEnabled}
          aria-label="Enable optional measurement and error monitoring"
          role="switch"
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${optionalServicesEnabled ? "left-5 bg-primary" : "left-0.5 bg-muted-foreground"}`} />
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        LyfeOS honors a Global Privacy Control browser signal by keeping optional services off. This control does not replace account-data rights, which are available below.
      </p>
      {choice === null ? <p className="mt-2 text-[11px] text-muted-foreground">No optional-services choice has been saved on this device yet.</p> : null}
    </section>
  );
}
