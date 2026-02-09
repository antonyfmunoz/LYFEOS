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
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-3xl font-bold" style={{ color: "var(--primary-hex, #00e0ff)" }}>LYFEOS</h1>
          <p className="text-foreground">Invalid reset link. Please request a new one.</p>
          <Link href="/forgot-password">
            <span className="text-primary hover:underline cursor-pointer text-sm">Request New Link</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold" style={{ color: "var(--primary-hex, #00e0ff)" }}>LYFEOS</h1>
          <p className="text-muted-foreground mt-2 text-sm">Life Operating System</p>
        </div>

        {success ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold text-foreground">Password Reset!</h2>
            <p className="text-muted-foreground text-sm">
              Your password has been updated successfully. You can now log in with your new password.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-8 space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Set new password</h2>
              <p className="text-muted-foreground text-sm mt-1">Choose a strong password for your account.</p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  className="bg-background pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Confirm Password</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={6}
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
                "Reset Password"
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
