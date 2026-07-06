import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, CheckCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/clerk-react";

export default function ResetPasswordPage() {
  const { signIn, setActive } = useSignIn();
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const accent = null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!code.trim()) {
      setError("Please enter the verification code from your email");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!signIn) {
      setError("Sign-in not available. Please go back and request a new code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
      });

      if (result.status === "needs_new_password") {
        const resetResult = await signIn.resetPassword({
          password: newPassword,
        });

        if (resetResult.status === "complete" && setActive) {
          await setActive({ session: resetResult.createdSessionId });
        }

        setSuccess(true);
      } else {
        setError("Unexpected status. Please try again.");
      }
    } catch (err: any) {
      const clerkError = err.errors?.[0];
      if (clerkError?.code === "form_code_incorrect") {
        setError("Invalid verification code. Please check and try again.");
      } else if (clerkError?.code === "form_code_expired") {
        setError("This code has expired. Please request a new one.");
      } else {
        setError(clerkError?.longMessage || err.message || "Failed to reset password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center pt-[env(safe-area-inset-top)] pb-4">
        <h1 className="text-4xl font-orbitron font-bold mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
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
              <label className="block text-sm text-white">VERIFICATION CODE</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code from email"
                required
                className="w-full bg-transparent rounded-lg p-3 outline-none text-white font-mono tracking-widest"
                style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
              />
            </div>

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
            <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/forgot-password" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
              <span className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Request New Code
              </span>
            </Link></span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
