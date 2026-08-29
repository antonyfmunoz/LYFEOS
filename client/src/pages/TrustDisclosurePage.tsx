import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";

const privacyFacts = [
  "Personal records are private to the signed-in owner unless the owner uses a specific sharing control.",
  "Health, finance, private messages, evidence, AI memory, and record text are excluded from product analytics.",
  "Product analytics is off by default and can be enabled or withdrawn from Profile only after the provider passes LyfeOS privacy checks.",
  "Profile includes account export and deletion controls. A connected provider may retain its own copy under that provider's rules.",
  "LyfeOS records source and revision history where needed for truthful correction, reversal, security, and recovery behavior.",
] as const;

export default function TrustDisclosurePage() {
  const [location] = useLocation();
  const privacy = location === "/privacy";
  usePageTitle(privacy ? "Privacy disclosure" : "Beta access disclosure");

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link href="/register" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to registration
        </Link>

        <article className="rounded-2xl border border-primary/20 bg-card/60 p-6 shadow-xl sm:p-8">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">LyfeOS trust disclosure</p>
          <h1 className="mt-2 font-orbitron text-2xl sm:text-3xl">
            {privacy ? "How LyfeOS handles your data today" : "Beta access—not finalized legal terms"}
          </h1>

          {privacy ? (
            <>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                This page is a factual summary of current product behavior. It is not a lawyer-approved privacy policy and does not replace rights that apply where you live.
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
                {privacyFacts.map((fact) => <li key={fact} className="rounded-lg border border-primary/10 bg-background/30 px-4 py-3">{fact}</li>)}
              </ul>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">
                The signed-in Profile shows the detailed data-rights contract, provider boundaries, export controls, scoped deletion controls, and analytics consent state implemented by this release.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                LyfeOS does not currently publish approved consumer Terms of Service. Registration provides beta access to the product; no paid plan, checkout, subscription, certification, or professional service is being offered through this application.
              </p>
              <div className="mt-6 space-y-3 rounded-xl border border-primary/15 bg-background/30 p-4 text-sm leading-6 text-muted-foreground">
                <p>LyfeOS records and visualizes information you enter. It does not diagnose, treat, certify competence, grant authority, or replace medical, legal, financial, or other qualified professional judgment.</p>
                <p>High-risk actions remain yours. Review source information, stop conditions, evidence, and uncertainty before acting.</p>
                <p>A lawyer-approved agreement, support commitment, refund policy, and paid entitlement contract must be published before LyfeOS presents a commercial offer.</p>
              </div>
            </>
          )}

          <nav aria-label="Trust disclosures" className="mt-8 flex flex-wrap gap-3 border-t border-primary/10 pt-5 text-sm">
            <Link href="/privacy" className="text-primary hover:underline">Privacy disclosure</Link>
            <Link href="/terms" className="text-primary hover:underline">Beta access disclosure</Link>
          </nav>
        </article>
      </div>
    </main>
  );
}
