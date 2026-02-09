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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold" style={{ color: "var(--primary-hex, #00e0ff)" }}>LYFEOS</h1>
          <p className="text-muted-foreground mt-2 text-sm">Life Operating System</p>
        </div>

        {submitted ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
            <Mail className="w-12 h-12 mx-auto text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
            <p className="text-muted-foreground text-sm">
              If an account exists with that email, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <Link href="/login">
              <span className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer mt-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-8 space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Reset your password</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Enter the email address associated with your account and we'll send you a reset link.
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="bg-background"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "Send Reset Link"
              )}
            </button>

            <div className="text-center">
              <Link href="/login">
                <span className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
