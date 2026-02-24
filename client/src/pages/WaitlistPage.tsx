import { useState } from "react";
import { useLocation } from "wouter";
import { Rocket, Mail, Loader2, Sparkles, Zap, BarChart3, Shield, Palette, Download, Headphones } from "lucide-react";
import { apiRequest } from "../lib/queryClient";

const FEATURES = [
  { icon: Zap, label: "Unlimited AI Conversations", description: "Chat with NOVA without limits" },
  { icon: BarChart3, label: "Advanced Analytics", description: "Deep insights into your progress" },
  { icon: Headphones, label: "Priority Support", description: "Get help when you need it" },
  { icon: Palette, label: "Custom Themes", description: "Personalize your experience" },
  { icon: Download, label: "Data Export", description: "Export your data anytime" },
  { icon: Shield, label: "Early Access", description: "Be first to try new features" },
];

function EmailOptIn({
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
    <div className="glassmorphic rounded-xl p-8 neon-border">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Rocket className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-orbitron text-primary">Join the Waitlist</h2>
      </div>
      <p className="text-muted-foreground text-center mb-6">
        Be the first to level up when we launch. Enter your email below.
      </p>
      <form onSubmit={onSubmit} className="max-w-md mx-auto space-y-4">
        <div className="relative">
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

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Join the Waitlist
            </>
          )}
        </button>
      </form>
    </div>
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
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <Rocket className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-orbitron font-bold text-foreground">
              LYFE<span className="text-primary">OS</span>
            </h1>
          </div>
          <p className="text-muted-foreground max-w-lg mx-auto">
            The AI-powered life operating system that turns your goals into quests and your habits into superpowers.
          </p>
        </div>

        <div className="mb-10">
          <EmailOptIn
            email={email}
            setEmail={setEmail}
            error={error}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
          />
        </div>

        <div className="glassmorphic rounded-xl p-8 mb-10">
          <h3 className="text-lg font-orbitron text-center mb-6 text-foreground">
            What's Coming in <span className="text-primary">LYFEOS</span>
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, label, description }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-card/50">
                <Icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <EmailOptIn
          email={email}
          setEmail={setEmail}
          error={error}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        />

        <p className="text-xs text-muted-foreground/40 text-center mt-8">
          We respect your privacy. No spam, ever.
        </p>
      </div>
    </div>
  );
}
