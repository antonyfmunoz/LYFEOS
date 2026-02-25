import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Shuffle,
  Frown,
  BrainCircuit,
  Target,
  BarChart3,
  Bot,
  Mail,
  Loader2,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "../lib/queryClient";

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
    text: "NOVA isn't ChatGPT with a prompt. It has read your entire profile: your values, goals, patterns, and constraints. It creates missions, updates your logs, and helps you execute — based on who you actually are.",
    placeholder: "NOVA Chat",
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
    text: "Based on your answers, NOVA generates your Character Affirmation and populates your dashboard with missions aligned to your goals.",
    placeholder: "Character Affirmation",
    color: "#39ff14",
  },
  {
    num: 3,
    title: "Run Your Life from One Dashboard",
    text: "Track 8 stats. Complete missions. Log daily data. Ask NOVA for help. All from one place. No more context switching.",
    placeholder: "Dashboard",
    color: "#00e0ff",
  },
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
];

const PREVIEW_IMAGES: Record<string, { desktop: string; mobile: string }> = {
  "Onboarding Start": { desktop: "/images/preview-onboarding.png", mobile: "/images/preview-onboarding.png" },
  "Dashboard Stats HUD": { desktop: "/images/preview-profile-stats.png", mobile: "/images/preview-profile-stats-mobile.png" },
  "Dashboard": { desktop: "/images/preview-dashboard.png", mobile: "/images/preview-dashboard-mobile.png" },
  "Character Affirmation": { desktop: "/images/preview-affirmation.png", mobile: "/images/preview-affirmation-mobile.png" },
  "NOVA Chat": { desktop: "/images/preview-nova-chat.png", mobile: "/images/preview-nova-chat-mobile.png" },
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

function WaitlistForm({
  email,
  setEmail,
  error,
  isSubmitting,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  error: string;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto lg:mx-0">
      <div className="relative flex-1 w-full">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="w-full pl-11 pr-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          disabled={isSubmitting}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 w-full sm:w-auto justify-center"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Joining...
          </>
        ) : (
          <>
            Join the Waitlist
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
      {error && (
        <p className="text-sm text-red-400 w-full text-center sm:text-left">{error}</p>
      )}
    </form>
  );
}

export default function WaitlistPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      navigate("/waitlist/thank-you");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── BRANDING ─── */}
      <div className="text-center pt-8 pb-2">
        <h1 className="text-4xl font-orbitron font-bold tracking-wider">
          <span className="text-white">LYFE</span><span className="text-primary">OS</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Your personal life operating system</p>
      </div>

      {/* ─── HERO ─── */}
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
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
              <WaitlistForm
                email={email}
                setEmail={setEmail}
                error={error}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
              />
              <p className="text-xs text-muted-foreground/70">
                Join the waitlist &bull; Be first to get access
              </p>
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
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
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
      <section>
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

      {/* ─── FAQ ─── */}
      <section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
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
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center space-y-6">
          <h2 className="font-orbitron text-2xl sm:text-3xl font-bold">
            Ready to Stop Being <span className="text-primary">Scattered?</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Be the first to know when LYFEOS launches. Join the waitlist today.
          </p>
          <div className="flex justify-center">
            <WaitlistForm
              email={email}
              setEmail={setEmail}
              error={error}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            />
          </div>
          <p className="text-xs text-muted-foreground/60">No spam, ever. We respect your privacy.</p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="font-orbitron text-lg font-bold tracking-wider mb-2">
            <span className="text-white">LYFE</span><span className="text-primary">OS</span>
          </p>
          <p className="text-xs text-muted-foreground/50">
            &copy; {new Date().getFullYear()} LYFEOS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
