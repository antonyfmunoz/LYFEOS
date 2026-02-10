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
    <div className="dark-theme min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'hsl(0 0% 7%)' }}>
      <div className="text-center mb-8">
        <h1 className="text-4xl text-white font-orbitron mb-2">LYFEOS</h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>

      {submitted ? (
        <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
          <Mail className="w-12 h-12 mx-auto text-white" />
          <h2 className="text-xl font-orbitron text-white">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            If an account exists with that email, we've sent a password reset link. Check your inbox and spam folder.
          </p>
          <div className="pt-2">
            <span className="text-white auth-link"><Link href="/login" className="hover:opacity-80 transition">
              <span className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link></span>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md"
             style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
          <h2 className="text-xl font-orbitron text-center mb-6 text-white">Reset Password</h2>

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
                className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
                placeholder="your@email.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-white/20 border-white/50 text-white hover:bg-white/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
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
            <span className="text-white auth-link"><Link href="/login" className="hover:opacity-80 transition">
              <span className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link></span>
          </div>
        </div>
      )}
    </div>
  );
}
