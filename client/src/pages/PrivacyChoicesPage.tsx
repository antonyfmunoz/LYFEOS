import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";

export default function PrivacyChoicesPage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to LyfeOS</a>
        <article className="rounded-2xl border border-primary/20 bg-card/60 p-6 shadow-xl sm:p-8">
          <SlidersHorizontal className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">Your Privacy Choices</p>
          <h1 className="mt-2 font-orbitron text-2xl sm:text-3xl">Optional services are your choice</h1>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">Use the Cookie settings control at the bottom-right to enable or keep off optional measurement and error monitoring. Essential local storage remains available to operate LyfeOS.</p>
          <div className="mt-6 rounded-lg border border-primary/10 bg-background/30 p-4 text-sm leading-6 text-muted-foreground">
            A Global Privacy Control browser signal is treated as an opt-out: LyfeOS keeps optional services off while that signal is active. Signed-in users can also revisit Cookie &amp; privacy controls in Profile.
          </div>
        </article>
      </div>
      <CookieConsentBanner />
    </main>
  );
}
