import { useState } from "react";
import { readCookieConsent, saveCookieConsent } from "@/lib/cookieConsent";

export function CookieConsentBanner() {
  const [consent, setConsent] = useState(readCookieConsent);

  if (consent) return null;

  const choose = (value: "accepted" | "rejected") => {
    saveCookieConsent(value);
    setConsent(value);
  };

  return (
    <section aria-label="Cookie choices" role="dialog" aria-modal="false" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-xl border border-border/80 bg-background p-4 shadow-2xl sm:bottom-5 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">Your privacy choices</h2>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">LyfeOS uses essential storage to keep the site working. With your permission, we also enable optional analytics and error monitoring to improve LyfeOS. No optional tracking or third-party services load until you accept.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => choose("rejected")} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-card">Reject optional</button>
          <button type="button" onClick={() => choose("accepted")} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Accept</button>
        </div>
      </div>
    </section>
  );
}
