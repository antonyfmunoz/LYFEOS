import { ArrowLeft, ShieldCheck } from "lucide-react";

const dataCategories = [
  ["Account and contact information", "Email address, username, profile fields, and authentication-provider reference.", "Create and secure an account; provide the service."],
  ["Personal workspace content", "Goals, reflections, missions, documents, messages, planning records, and AI-context records you choose to store.", "Provide the private workspace and owner-requested features."],
  ["Health and fitness information", "Nutrition, workout, body, sleep, recovery, activity, and source-provenance records you enter or connect.", "Provide the Health features you request. See the separate Consumer Health Data Notice."],
  ["Financial information", "Manual balances, transactions, budgets, and financial goals.", "Provide the private finance features you request."],
  ["Technical and operational information", "Session state, request identifiers, security and error-monitoring records, and limited device/browser information.", "Keep LyfeOS secure, diagnose faults, and prevent abuse."],
  ["Optional product measurement", "A random analytics subject and coarse product events such as an app area viewed or a mission milestone.", "Improve LyfeOS only when both browser-level optional services and in-product analytics are enabled."],
] as const;

const providers = [
  "Clerk for authentication when you use a Clerk-backed sign-in method.",
  "Sentry for optional error monitoring after browser-level optional-service permission.",
  "PostHog for optional, separately enabled product analytics. Content, messages, mission text, Health records, profile fields, and journal text are excluded from those events.",
  "Google or another connected provider only when you explicitly connect it and enable a scoped capability.",
] as const;

export default function ConsumerPrivacyNoticePage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to LyfeOS
        </a>
        <article className="rounded-2xl border border-primary/20 bg-card/60 p-6 shadow-xl sm:p-8">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">LyfeOS privacy notice</p>
          <h1 className="mt-2 font-orbitron text-2xl sm:text-3xl">U.S. Privacy Notice</h1>
          <p className="mt-2 text-xs text-muted-foreground">Last updated October 14, 2026</p>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            This notice describes LyfeOS&apos;s current U.S. product behavior. It applies to visitors and users in every U.S. state. State privacy laws may apply only when their statutory thresholds or data definitions are met; LyfeOS provides these choices nationally rather than requiring you to identify your state.
          </p>

          <section className="mt-8" aria-labelledby="collection-heading">
            <h2 id="collection-heading" className="text-lg font-semibold text-foreground">What we collect and why</h2>
            <div className="mt-3 space-y-3">
              {dataCategories.map(([label, examples, purpose]) => <div key={label} className="rounded-lg border border-primary/10 bg-background/30 p-4 text-sm">
                <h3 className="font-medium text-foreground">{label}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground"><span className="text-foreground">Examples:</span> {examples}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground"><span className="text-foreground">Purpose:</span> {purpose}</p>
              </div>)}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="sources-heading">
            <h2 id="sources-heading" className="text-lg font-semibold text-foreground">Sources, retention, and service providers</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">We receive information directly from you, from your use of LyfeOS, and from a connected provider only after you authorize that connection. Owner-authored records generally remain until you delete the record or account; operational records are short-lived; provider-held records follow the provider&apos;s own lifecycle.</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              {providers.map((provider) => <li key={provider} className="rounded-lg border border-primary/10 bg-background/30 px-4 py-3">{provider}</li>)}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="choices-heading">
            <h2 id="choices-heading" className="text-lg font-semibold text-foreground">Your privacy choices and rights</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li><a className="text-primary underline" href="/privacy-choices">Manage browser-level optional services</a>. A Global Privacy Control signal keeps optional measurement and error monitoring off.</li>
              <li>Signed-in users can export or delete their LyfeOS account data from Profile. Health data has its own export and deletion controls in Profile.</li>
              <li>You may ask to know, correct, delete, or access your personal information; ask to opt out of targeted advertising or sale/sharing where applicable; or appeal a privacy-rights decision by emailing <a className="text-primary underline" href="mailto:hello@lyfeos.com?subject=Privacy%20rights%20request">hello@lyfeos.com</a>. Include enough information to locate and verify the request, but do not email health, financial, or other sensitive record content.</li>
              <li>LyfeOS does not discriminate against you for exercising privacy rights. We do not run targeted advertising in LyfeOS. If that practice changes, we will update this notice and the available opt-out controls before the change.</li>
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="health-heading">
            <h2 id="health-heading" className="text-lg font-semibold text-foreground">Health data</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Health and fitness information can be sensitive even when it is not HIPAA protected health information. Read the separate <a className="text-primary underline" href="/health-privacy">Consumer Health Data Notice</a> for the Health-specific categories, purposes, and rights path.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
