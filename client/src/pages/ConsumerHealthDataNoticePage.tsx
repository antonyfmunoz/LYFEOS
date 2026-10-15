import { ArrowLeft, HeartPulse } from "lucide-react";

export default function ConsumerHealthDataNoticePage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to LyfeOS
        </a>
        <article className="rounded-2xl border border-primary/20 bg-card/60 p-6 shadow-xl sm:p-8">
          <HeartPulse className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">LyfeOS Health</p>
          <h1 className="mt-2 font-orbitron text-2xl sm:text-3xl">Consumer Health Data Notice</h1>
          <p className="mt-2 text-xs text-muted-foreground">Last updated October 14, 2026</p>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">This notice describes consumer health data LyfeOS processes when you use the Health features. It is separate from the U.S. Privacy Notice because health-related information can receive additional protection under state law.</p>

          <section className="mt-8" aria-labelledby="health-collect-heading">
            <h2 id="health-collect-heading" className="text-lg font-semibold text-foreground">Consumer health data we may collect</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Information you enter or choose to connect, including nutrition, meals, training, body measurements, sleep, recovery, activity, symptoms or observations, health goals, supplements, laboratory-related observations, and source provenance. We collect it to provide the Health feature you request, show your own records, and support the settings and rights controls you use.</p>
          </section>

          <section className="mt-8" aria-labelledby="health-use-heading">
            <h2 id="health-use-heading" className="text-lg font-semibold text-foreground">Use, sharing, and retention</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Health records are private to the signed-in owner unless you use a specific sharing or connection control. LyfeOS does not use Health record content in optional product analytics. Records remain until you selectively delete Health data or delete your account. A connected provider receives only the data and scope you explicitly authorize; that provider&apos;s retention is governed by its own policy.</p>
          </section>

          <section className="mt-8" aria-labelledby="health-rights-heading">
            <h2 id="health-rights-heading" className="text-lg font-semibold text-foreground">Your choices and rights</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Signed-in users can download Health data, delete Health data, and revoke supported Health connections from Profile.</li>
              <li>To ask about access, deletion, correction, or another consumer-health-data right, email <a className="text-primary underline" href="mailto:hello@lyfeos.com?subject=Consumer%20health%20data%20request">hello@lyfeos.com</a>. Do not include health-record content in the email; we will use a safer verification path when needed.</li>
              <li>LyfeOS does not sell consumer health data or use it for targeted advertising. We will obtain any additional consent required before collecting or sharing consumer health data for a new purpose.</li>
            </ul>
          </section>
        </article>
      </div>
    </main>
  );
}
