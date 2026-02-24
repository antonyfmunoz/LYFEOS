import { useState } from "react";
import { useLocation } from "wouter";
import { Rocket, Mail, Loader2, Sparkles, Zap, BarChart3, Shield } from "lucide-react";
import { apiRequest } from "../lib/queryClient";

const FEATURES = [
  { icon: Zap, label: "AI-Powered Life Management" },
  { icon: BarChart3, label: "Gamified Productivity Tracking" },
  { icon: Sparkles, label: "XP, Levels & Achievement System" },
  { icon: Shield, label: "Smart Goal & Mission Planning" },
];

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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <Rocket className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-orbitron font-bold text-foreground">
              LYFE<span className="text-primary">OS</span>
            </h1>
          </div>
          <p className="text-lg text-muted-foreground mb-2">
            Your Life. Gamified.
          </p>
          <p className="text-sm text-muted-foreground/70">
            The AI-powered life operating system that turns your goals into quests and your habits into superpowers.
          </p>
        </div>

        <div className="glassmorphic rounded-xl p-8 mb-8">
          <h2 className="text-lg font-orbitron text-center mb-2 text-foreground">
            Join the <span className="text-primary">Waitlist</span>
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Be the first to level up when we launch.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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

        <div className="space-y-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card/30">
              <Icon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/40 text-center mt-8">
          We respect your privacy. No spam, ever.
        </p>
      </div>
    </div>
  );
}
