import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sendPasswordReset } from "@/lib/firebaseAuth";

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const savedColor = localStorage.getItem('lyfeos-primary-color');
  const accent = useMemo(() => {
    if (!savedColor) return null;
    return {
      color: savedColor,
      border20: hexToRgba(savedColor, 0.2),
      border30: hexToRgba(savedColor, 0.3),
      border50: hexToRgba(savedColor, 0.5),
      bg20: hexToRgba(savedColor, 0.2),
      bg30: hexToRgba(savedColor, 0.3),
      glow: hexToRgba(savedColor, 0.08),
    };
  }, [savedColor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/ensure-firebase-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      await sendPasswordReset(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center pt-12 pb-4">
        <h1 className="text-4xl font-orbitron mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="flex-1 flex items-center w-full justify-center">
      {submitted ? (
        <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
          <Mail className="w-12 h-12 mx-auto" style={{ color: accent?.color || 'white' }} />
          <h2 className="text-xl font-orbitron" style={{ color: accent?.color || 'white' }}>Check your email</h2>
          <p className="text-white text-sm">
            If an account exists with that email, we've sent a password reset link. Check your inbox and spam folder.
          </p>
          <div className="pt-2">
            <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/login" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
              <span className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link></span>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md"
             style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
          <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Reset Password</h2>

          <p className="text-white text-sm text-center mb-6">
            Enter the email address associated with your account and we'll send you a reset link.
          </p>

          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-white">EMAIL</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
                placeholder="your@email.com"
                required
                style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border hover:opacity-80 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: accent?.bg20 || 'rgba(255,255,255,0.2)', borderColor: accent?.border50 || 'rgba(255,255,255,0.5)', color: accent?.color || 'white' }}
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
            <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/login" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
              <span className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </span>
            </Link></span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
