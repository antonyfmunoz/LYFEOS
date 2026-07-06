import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSignUp, useUser } from "@clerk/clerk-react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"input" | "loading" | "success" | "error">("input");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [, navigate] = useLocation();
  const { signUp, setActive } = useSignUp();
  const { user } = useUser();

  const handleVerify = async () => {
    if (!code.trim()) {
      setMessage("Please enter the verification code.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      if (signUp && signUp.status !== "complete") {
        const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
        if (result.status === "complete" && setActive) {
          await setActive({ session: result.createdSessionId });
        }
        setStatus("success");
        setMessage("Your email has been verified successfully!");
      } else if (user?.primaryEmailAddress) {
        await user.primaryEmailAddress.attemptVerification({ code: code.trim() });
        setStatus("success");
        setMessage("Your email has been verified successfully!");
      } else {
        setStatus("error");
        setMessage("No pending verification found. You may already be verified.");
      }
    } catch (err: any) {
      const clerkError = err.errors?.[0];
      if (clerkError?.code === "form_code_incorrect") {
        setMessage("Invalid verification code. Please check and try again.");
      } else if (clerkError?.code === "verification_expired") {
        setMessage("This verification code has expired. Please request a new one.");
      } else {
        setMessage(clerkError?.longMessage || err.message || "Verification failed. Please try again.");
      }
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary-hex, #00e0ff)" }}>LYFEOS</h1>

        {status === "input" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">Enter the verification code sent to your email.</p>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="text-center font-mono text-lg tracking-widest"
            />
            <button
              onClick={handleVerify}
              className="px-6 py-3 rounded-lg font-semibold text-sm transition-colors w-full"
              style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
            >
              Verify Email
            </button>
          </div>
        )}

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <p className="text-lg text-foreground">{message}</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="w-16 h-16 mx-auto text-red-500" />
            <p className="text-lg text-foreground">{message}</p>
            <div className="space-y-2">
              <button
                onClick={() => { setStatus("input"); setMessage(""); }}
                className="px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
                style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
              >
                Try Again
              </button>
              <button
                onClick={() => navigate("/login")}
                className="block mx-auto px-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
