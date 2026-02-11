import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, CheckCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const token = new URLSearchParams(window.location.search).get("token");

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

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to reset password. The link may have expired.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="text-center mb-8">
          <h1 className="text-4xl text-white font-orbitron mb-2">LYFEOS</h1>
          <p className="text-muted-foreground">Your personal life operating system</p>
        </div>
        <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
          <p className="text-white">Invalid reset link. Please request a new one.</p>
          <span className="text-white auth-link"><Link href="/forgot-password" className="hover:opacity-80 transition">
            <span className="cursor-pointer text-sm">Request New Link</span>
          </Link></span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-white font-orbitron mb-2">LYFEOS</h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>

      {success ? (
        <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md text-center space-y-4"
             style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
          <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
          <h2 className="text-xl font-orbitron text-white">Password Reset!</h2>
          <p className="text-muted-foreground text-sm">
            Your password has been updated successfully. You can now log in with your new password.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 text-sm font-mono px-6 py-2.5 rounded border bg-white/20 border-white/50 text-white hover:bg-white/30 transition-colors inline-flex items-center justify-center gap-2"
          >
            Go to Login
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md"
             style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
          <h2 className="text-xl font-orbitron text-center mb-6 text-white">Set New Password</h2>

          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-muted-foreground">NEW PASSWORD</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-muted-foreground">CONFIRM PASSWORD</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={6}
                className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
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
                  Resetting...
                </>
              ) : (
                "Reset Password"
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
