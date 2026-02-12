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
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const PROBLEM_CARDS = [
  {
    icon: <Shuffle className="w-6 h-6" />,
    title: "5 productivity apps, zero integration",
    text: "Notion for notes. Todoist for tasks. Apple Notes for quick capture. Paper journal for reflection. Nothing talks to each other.",
  },
  {
    icon: <Frown className="w-6 h-6" />,
    title: "Goals everywhere, progress nowhere",
    text: "You have goals for work, health, relationships, projects. But they're scattered across apps, notes, and your head.",
  },
  {
    icon: <BrainCircuit className="w-6 h-6" />,
    title: "You know WHAT you want",
    text: "You're not confused about your goals. You just can't stay organized enough to actually GET there.",
  },
];

const SOLUTION_BLOCKS = [
  {
    icon: <Target className="w-6 h-6" />,
    badge: "Know Yourself",
    text: "Complete 8 missions to calibrate your archetype, values, and vision. LYFEOS generates your Character Affirmation — a 300-word synthesis of who you are and what you're building. Not a template. Your identity.",
    placeholder: "Character Affirmation",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    badge: "Track Everything",
    text: "8 stats across all life domains: Level/XP, Streak, Efficiency, Energy, Health, Wealth, Time, Attention. One dashboard replaces 5 apps. No context switching. No data silos.",
    placeholder: "Dashboard Stats HUD",
  },
  {
    icon: <Bot className="w-6 h-6" />,
    badge: "AI That Knows You",
    text: "NOVA isn't ChatGPT with a prompt. It has read your entire profile: your values, goals, patterns, and constraints. It creates missions, updates your logs, and helps you execute — based on who you actually are.",
    placeholder: "NOVA Chat",
  },
];

const STEPS = [
  {
    num: 1,
    title: "Complete 8 Missions",
    text: "90 minutes of focused questions. Map your identity, values, craft, capacity, and vision. No fluff. No busywork.",
    placeholder: "Mission Flow",
  },
  {
    num: 2,
    title: "LYFEOS Builds Your System",
    text: "Based on your answers, NOVA generates your Character Affirmation and populates your dashboard with missions aligned to your goals.",
    placeholder: "Character Affirmation",
  },
  {
    num: 3,
    title: "Run Your Life from One Dashboard",
    text: "Track 8 stats. Complete missions. Log daily data. Ask NOVA for help. All from one place. No more context switching.",
    placeholder: "Dashboard",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I spent $5,000 on coaching last year. LYFEOS gives me 80% of the same clarity for $29/month. The Character Affirmation alone is worth 3 coaching sessions.",
    name: "Alex M.",
    title: "Product Manager, SF",
  },
  {
    quote:
      "I've tried Notion, Todoist, Things, and Obsidian. LYFEOS is the first system that actually knows me. It's not a blank canvas — it's a system built around who I am.",
    name: "Jordan K.",
    title: "Entrepreneur, NYC",
  },
  {
    quote:
      "My 8-year-old can now explain my core values and 5-year vision. That's how clear LYFEOS made my goals. It's not just organization — it's self-knowledge.",
    name: "Sam L.",
    title: "Creative Director, London",
  },
];

const FEATURES_LIST = [
  "Complete 8-Mission Awakening Protocol",
  "Full Dashboard (7 Logs, 8 Stats)",
  "NOVA AI Assistant (Unlimited)",
  "Unlimited Mission Creation",
  "Character Affirmation Generation",
  "Web App Access",
  "Mobile Apps (Coming Q3 2026)",
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
    a: "You can export all your data anytime. Your missions, logs, and profile are yours. We're month-to-month — cancel whenever. But most users stick because it becomes their second brain.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your data is encrypted at rest and never shared. We don't sell data. We don't train AI models on your content. Your life OS is yours.",
  },
  {
    q: "When is the mobile app coming?",
    a: "Native iOS and Android apps launch Q3 2026. Beta users get early access. The web app works on mobile browsers now (responsive design), but native apps will add quick-capture features.",
  },
  {
    q: "Can I switch between monthly and annual?",
    a: "Yes. You can upgrade to annual anytime to get the discount. If you downgrade from annual to monthly, you'll keep annual access until your billing period ends.",
  },
  {
    q: "What happens after the 7-day trial?",
    a: "After 7 days, you'll be charged for your chosen plan (monthly or annual). You can cancel anytime during the trial with no charge.",
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

const PREVIEW_IMAGES: Record<string, string> = {
  "Dashboard Preview": "/images/preview-dashboard.png",
  "Dashboard Stats HUD": "/images/preview-dashboard.png",
  "Dashboard": "/images/preview-dashboard.png",
  "Character Affirmation": "/images/preview-affirmation.png",
  "NOVA Chat": "/images/preview-nova-chat.png",
  "Mission Flow": "/images/preview-mission-flow.png",
};

function Placeholder({ label }: { label: string }) {
  const src = PREVIEW_IMAGES[label];
  return (
    <div className="w-full rounded-lg border border-border/40 bg-card/30 overflow-hidden">
      {src ? (
        <img src={src} alt={label} className="w-full h-auto block" />
      ) : (
        <div className="w-full aspect-video flex items-center justify-center">
          <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">{label}</span>
        </div>
      )}
    </div>
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
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg">
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
          <div className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-lg px-4 py-3 space-y-2">
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
          <div className="lg:col-span-3 space-y-6">
            <h1 className="font-orbitron text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
              Stop Juggling 5 Apps.{" "}
              <span className="text-primary">Build Your Life OS.</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              90 minutes to define who you are and what you're building. $29/month to run your entire life.
            </p>
            <div className="flex flex-col items-center sm:items-start gap-4">
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

          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border/40 bg-card/30 p-1">
              <Placeholder label="Dashboard Preview" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section className="bg-card/20">
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
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
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
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <span className="text-primary">{b.icon}</span>
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    {b.badge}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed">{b.text}</p>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <div className="rounded-xl border border-border/30 bg-card/20 p-1">
                  <Placeholder label={b.placeholder} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="bg-card/20">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-14">
            How It <span className="text-primary">Works</span>
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.num} className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center font-orbitron text-sm font-bold text-primary">
                  {s.num}
                </div>
                <h3 className="font-semibold text-foreground text-lg">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                <div className="rounded-lg border border-border/30 bg-card/20 p-1">
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
      <section id="pricing" className="bg-card/20">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold text-center mb-2">
            Simple, Transparent <span className="text-primary">Pricing</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-sm">
            One plan. Everything included. Cancel anytime.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Monthly */}
            <div className="rounded-xl border border-border/50 bg-card/40 p-6 space-y-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Monthly</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">$29</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Billed monthly</p>
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

            {/* Annual */}
            <div className="rounded-xl border-2 border-primary/50 bg-card/40 p-6 space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                2 Months Free
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Annual</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">$290</span>
                  <span className="text-muted-foreground text-sm">/year</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  $24.17/month &bull; Save $58
                </p>
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
            Cancel anytime. Full refund within 30 days.
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
            90 minutes to build your system. $29/month or $290/year to run your life.
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
