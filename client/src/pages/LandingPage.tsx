import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../lib/authContext";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Shuffle,
  Frown,
  BrainCircuit,
  Target,
  BarChart3,
  Bot,
  Menu,
  X,
} from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Access", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const PROBLEM_CARDS = [
  {
    icon: <Shuffle className="w-6 h-6" />,
    title: "5 productivity apps, zero integration",
    text: "Notion for notes. Todoist for tasks. Apple Notes for quick capture. Paper journal for reflection. Nothing talks to each other.",
    color: "#ff2d95",
  },
  {
    icon: <Frown className="w-6 h-6" />,
    title: "Goals everywhere, progress nowhere",
    text: "You have goals for work, health, relationships, projects. But they're scattered across apps, notes, and your head.",
    color: "#ff6b2b",
  },
  {
    icon: <BrainCircuit className="w-6 h-6" />,
    title: "You know WHAT you want",
    text: "You're not confused about your goals. You just can't stay organized enough to actually GET there.",
    color: "#ffe03d",
  },
];

const SOLUTION_BLOCKS = [
  {
    icon: <Target className="w-6 h-6" />,
    badge: "Know Yourself",
    text: "Complete 8 missions to calibrate your archetype, values, and vision. LYFEOS generates your Character Affirmation — a synthesis of who you are and what you're building. Not a template. Your identity.",
    placeholder: "Onboarding Start",
    color: "#b44dff",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    badge: "Track Everything",
    text: "8 stats across all life domains: Level/XP, Streak, Efficiency, Energy, Health, Wealth, Time, Attention. One dashboard replaces 5 apps. No context switching. No data silos.",
    placeholder: "Dashboard Stats HUD",
    color: "#00e0ff",
  },
  {
    icon: <Bot className="w-6 h-6" />,
    badge: "AI That Knows You",
    text: "Name your own AI companion. It can use the profile and conversations you choose to keep in LyfeOS, then help you think through missions and execution.",
    placeholder: "AI Chat",
    color: "#39ff14",
  },
];

const STEPS = [
  {
    num: 1,
    title: "Complete 8 Missions",
    text: "90 minutes of focused questions. Map your identity, values, craft, capacity, and vision. No fluff. No busywork.",
    placeholder: "Mission Flow",
    color: "#b44dff",
  },
  {
    num: 2,
    title: "LYFEOS Builds Your System",
    text: "Based on your answers, LYFEOS prepares a personal transformation thread and three editable starter missions aligned to your goals.",
    placeholder: "Character Affirmation",
    color: "#39ff14",
  },
  {
    num: 3,
    title: "Run Your Life from One Dashboard",
    text: "Track 8 stats. Complete missions. Log daily data. Ask your named AI for help. All from one place.",
    placeholder: "Dashboard",
    color: "#00e0ff",
  },
];

const TESTIMONIALS = [
  {
    quote: "Your profile should create a concrete starting point, not disappear into a questionnaire.",
    name: "Product principle",
    title: "Onboarding to execution",
  },
  {
    quote: "Progress should be reviewable through completed missions and reflections, not inferred from an opaque score.",
    name: "Product principle",
    title: "Evidence over automation",
  },
  {
    quote: "The user owns the data, can export it, and can decide what the AI retains.",
    name: "Product principle",
    title: "User control",
  },
];

const FEATURES_LIST = [
  "Complete the 8-mission onboarding flow",
  "Personal transformation thread and starter missions",
  "Dashboard, missions, and daily reflections",
  "Your named AI companion",
  "Portable data export and AI memory controls",
  "Responsive web app access",
];

const FAQ_ITEMS = [
  {
    q: "How is LYFEOS different from Notion?",
    a: "Notion is a blank canvas. LYFEOS is a complete system built around your identity. You spend 90 minutes in onboarding, and the system knows who you are, what you want, and what you're working on. No templates. No empty pages. It's designed for you.",
  },
  {
    q: "Do I need to be a productivity nerd?",
    a: "No. LYFEOS is for anyone who's scattered — not because they're lazy, but because they have goals in multiple domains and no unified system. If you've tried 3+ productivity apps and still feel disorganized, LYFEOS is for you.",
  },
  {
    q: "What if I stop using it?",
    a: "You can export your LyfeOS data from Profile settings at any time. You can also clear chat history, reset the generated AI profile, or permanently delete your account.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your data is encrypted at rest and never shared. We don't sell data. We don't train AI models on your content. Your life OS is yours.",
  },
  {
    q: "Does it work on a phone?",
    a: "The public MVP is a responsive web app. Native mobile applications are not part of this release.",
  },
  {
    q: "Is billing enabled?",
    a: "No. This public-MVP release does not process payments or subscriptions.",
  },
  {
    q: "How does the AI use my information?",
    a: "The assistant can use your LyfeOS profile and saved conversations to provide context. Profile settings let you clear chat history or reset the generated assistant profile.",
  },
];

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-card/50 transition-colors"
      >
        <span className="font-medium text-foreground text-sm sm:text-base">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

const PREVIEW_IMAGES: Record<string, { desktop: string; mobile: string }> = {
  "Onboarding Start": { desktop: "/images/preview-onboarding.png", mobile: "/images/preview-onboarding-mobile.png" },
  "Dashboard Stats HUD": { desktop: "/images/preview-profile-stats.png", mobile: "/images/preview-profile-stats-mobile.png" },
  "Dashboard": { desktop: "/images/preview-dashboard.png", mobile: "/images/preview-dashboard-mobile.png" },
  "Character Affirmation": { desktop: "/images/preview-affirmation.png", mobile: "/images/preview-affirmation-mobile.png" },
  "AI Chat": { desktop: "/images/preview-nova-chat.png", mobile: "/images/preview-nova-chat-mobile.png" },
  "Mission Flow": { desktop: "/images/preview-mission-flow.png", mobile: "/images/preview-mission-flow-mobile.png" },
};

function Placeholder({ label }: { label: string }) {
  const srcs = PREVIEW_IMAGES[label];
  return (
    <>
      {srcs ? (
        <>
          <div className="flex justify-center py-4 md:hidden">
            <div className="max-w-[220px] rounded-lg border border-border/40 bg-card/30 overflow-hidden shadow-lg shadow-primary/10">
              <img src={srcs.mobile} alt={label} className="w-full h-auto block" />
            </div>
          </div>
          <div className="w-full rounded-lg border border-border/40 bg-card/30 overflow-hidden hidden md:block">
            <img src={srcs.desktop} alt={label} className="w-full h-auto" />
          </div>
        </>
      ) : (
        <div className="w-full rounded-lg border border-border/40 bg-card/30 overflow-hidden">
          <div className="w-full aspect-video flex items-center justify-center">
            <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">{label}</span>
          </div>
        </div>
      )}
    </>
  );
}

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ctaHref = isAuthenticated ? "/dashboard" : "/register";
  const ctaLabel = isAuthenticated ? "Go to Dashboard" : "Start Your 7-Day Free Trial";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── HEADER ─── */}
      <header className="z-50 bg-background/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-3 relative">
          <div className="flex items-center justify-between">
            <button
              className="md:hidden p-1.5 text-muted-foreground z-10"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <nav className="hidden md:flex items-center gap-6">
              {NAV_LINKS.map((l) => (
                <button
                  key={l.href}
                  onClick={() => scrollTo(l.href.slice(1))}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center z-10">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-card transition-colors"
                >
                  Login
                </Link>
              )}
            </div>
          </div>

          <div className="text-center mt-3">
            <button onClick={() => scrollTo("hero")}>
              <h1 className="text-4xl font-orbitron font-bold tracking-wider">
                <span className="text-white">LYFE</span><span className="text-primary">OS</span>
              </h1>
            </button>
            <p className="text-muted-foreground text-sm mt-1">Your personal life operating system</p>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-background/95 backdrop-blur-lg px-4 py-3 space-y-2">
            {NAV_LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => {
                  scrollTo(l.href.slice(1));
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section id="hero" className="max-w-6xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
        <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-3 space-y-6 text-center lg:text-left">
            <h1 className="font-orbitron text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
              Stop Juggling 5 Apps.{" "}
              <span className="text-primary">Build Your Life OS.</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Define your ideal self and life in under 90 minutes. Unlock the one system you need to run your entire personal life.
            </p>
            <div className="flex flex-col items-center lg:items-start gap-4">
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-xs text-muted-foreground/70">
                No credit card required &bull; Cancel anytime
              </p>
            </div>
          </div>

          <div className="hidden lg:flex lg:col-span-2 justify-center items-center">
            <div className="relative rounded-2xl overflow-hidden border border-primary/20 shadow-[0_0_30px_rgba(var(--primary-rgb,200,120,50),0.15)]">
              <img
                src="/images/preview-dashboard.png"
                alt="LYFEOS Dashboard Preview"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section>
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-4">
            You're Not Lazy. <span className="text-primary">You're Scattered.</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-lg mx-auto text-sm">
            Sound familiar?
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PROBLEM_CARDS.map((c) => (
              <div
                key={c.title}
                className="glassmorphic rounded-xl p-6 space-y-3 hover:neon-border transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}15`, color: c.color }}>
                  {c.icon}
                </div>
                <h3 className="font-semibold text-foreground">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SOLUTION ─── */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-4">
          One System. Your Identity. Your Goals.{" "}
          <span className="text-primary">Your Daily Actions.</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-lg mx-auto text-sm">
          Everything you need in one place.
        </p>

        <div className="space-y-16">
          {SOLUTION_BLOCKS.map((b, i) => (
            <div
              key={b.badge}
              className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center"
            >
              <div className={`space-y-4 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: `${b.color}15`, borderWidth: 1, borderColor: `${b.color}30` }}>
                  <span style={{ color: b.color }}>{b.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: b.color }}>
                    {b.badge}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed">{b.text}</p>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <div className="md:rounded-xl md:border md:border-border/30 md:bg-card/20 md:p-1">
                  <Placeholder label={b.placeholder} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-14">
            How It <span className="text-primary">Works</span>
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.num} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center font-orbitron text-sm font-bold text-primary shrink-0">
                    {s.num}
                  </div>
                  <h3 className="font-semibold text-foreground text-lg">{s.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                <div className="md:rounded-lg md:border md:border-border/30 md:bg-card/20 md:p-1">
                  <Placeholder label={s.placeholder} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-14">
          What Early Users <span className="text-primary">Say</span>
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="glassmorphic rounded-xl p-6 space-y-4 flex flex-col"
            >
              <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">
                "{t.quote}"
              </p>
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.title}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-2">
            Public MVP <span className="text-primary">Access</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-sm">
            Core functionality is available during the public-MVP period. Billing is not enabled.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Monthly */}
            <div className="rounded-xl border border-border/50 bg-card/40 p-6 space-y-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Public MVP</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">$0</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">No payment or subscription required</p>
              </div>
              <ul className="space-y-2.5">
                {FEATURES_LIST.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref}
                className="block w-full text-center py-3 rounded-lg border border-primary/40 text-primary font-medium text-sm hover:bg-primary/10 transition-colors"
              >
                {ctaLabel}
              </Link>
              <p className="text-center text-xs text-muted-foreground/60">No credit card required</p>
            </div>

            {/* What is intentionally included */}
            <div className="rounded-xl border-2 border-primary/50 bg-card/40 p-6 space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                Current scope
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Built for a complete first loop</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">One focus</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Onboarding, execution, reflection, review, and user control.</p>
              </div>
              <ul className="space-y-2.5">
                {FEATURES_LIST.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref}
                className="block w-full text-center py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                {ctaLabel}
              </Link>
              <p className="text-center text-xs text-muted-foreground/60">No credit card required</p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Payment, subscription management, and native mobile apps are deliberately outside this MVP release.
          </p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-12">
          Frequently Asked <span className="text-primary">Questions</span>
        </h2>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="">
        <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center space-y-6">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold">
            Ready to Stop Being <span className="text-primary">Scattered?</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Build your system, activate one focus, and see the evidence it creates.
          </p>
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-muted-foreground/60">No credit card required</p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Links
              </p>
              <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Login
              </Link>
              <a href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </a>
              <a href="mailto:hello@lyfeos.com" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Connect
              </p>
              <a href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Twitter / X
              </a>
              <a href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                LinkedIn
              </a>
              <a href="mailto:hello@lyfeos.com" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                hello@lyfeos.com
              </a>
            </div>
          </div>

          <div className="mt-10 pt-6 text-center">
            <p className="text-xs text-muted-foreground/50">
              &copy; 2026 LYFEOS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
