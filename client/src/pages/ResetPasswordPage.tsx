import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, CheckCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { verifyPasswordResetCode, confirmPasswordReset, firebaseSignInWithEmail } from "@/lib/firebaseAuth";

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
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

  const params = new URLSearchParams(window.location.search);
  const oobCode = params.get("oobCode");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!oobCode) {
      setError("Invalid reset link. Please request a new one.");
      return;
    }

    setIsSubmitting(true);
    try {
      const email = await verifyPasswordResetCode(oobCode);

      await confirmPasswordReset(oobCode, newPassword);

      const credential = await firebaseSignInWithEmail(email, newPassword);
      if (credential) {
        const idToken = await credential.user.getIdToken();
        await fetch("/api/auth/reset-password-firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firebaseIdToken: idToken, newPassword }),
          credentials: "include",
        });
      }

      setSuccess(true);
    } catch (err: any) {
      if (err.code === 'auth/expired-action-code') {
        setError("This reset link has expired. Please request a new one.");
      } else if (err.code === 'auth/invalid-action-code') {
        setError("This reset link is invalid or has already been used.");
      } else {
        setError(err.message || "Failed to reset password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!oobCode) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
        <div className="text-center pt-12 pb-4">
          <h1 className="text-4xl font-orbitron mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
          <p className="text-white">Your personal life operating system</p>
        </div>
        <div className="flex-1 flex items-center w-full justify-center">
        <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
          <p className="text-white">Invalid reset link. Please request a new one.</p>
          <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/forgot-password" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
            <span className="cursor-pointer text-sm">Request New Link</span>
          </Link></span>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center pt-12 pb-4">
        <h1 className="text-4xl font-orbitron mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="flex-1 flex items-center w-full justify-center">
      {success ? (
        <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
          <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
          <h2 className="text-xl font-orbitron" style={{ color: accent?.color || 'white' }}>Password Reset!</h2>
          <p className="text-white text-sm">
            Your password has been updated successfully. You can now log in with your new password.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 text-sm font-mono px-6 py-2.5 rounded border hover:opacity-80 transition-colors inline-flex items-center justify-center gap-2"
            style={{ backgroundColor: accent?.bg20 || 'rgba(255,255,255,0.2)', borderColor: accent?.border50 || 'rgba(255,255,255,0.5)', color: accent?.color || 'white' }}
          >
            Go to Login
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md"
             style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
          <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Set New Password</h2>

          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-white">NEW PASSWORD</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  className="w-full bg-transparent rounded-lg p-3 outline-none text-white pr-10"
                  style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-white">CONFIRM PASSWORD</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={6}
                className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
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
                  Resetting...
                </>
              ) : (
                "Reset Password"
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
