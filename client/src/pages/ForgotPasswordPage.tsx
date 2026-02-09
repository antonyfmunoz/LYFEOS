import { useState } from "react";
import { Link } from "wouter";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-foreground">OS</span></h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>

      {submitted ? (
        <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40 text-center space-y-4"
             style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
          <Mail className="w-12 h-12 mx-auto text-primary" />
          <h2 className="text-xl font-orbitron text-foreground">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            If an account exists with that email, we've sent a password reset link. Check your inbox and spam folder.
          </p>
          <div className="pt-2">
            <Link href="/login">
              <span className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40"
             style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
          <h2 className="text-xl font-orbitron text-center mb-6 text-foreground">Reset Password</h2>

          <p className="text-muted-foreground text-sm text-center mb-6">
            Enter the email address associated with your account and we'll send you a reset link.
          </p>

          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-muted-foreground">EMAIL</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
                placeholder="your@email.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login">
              <span className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
