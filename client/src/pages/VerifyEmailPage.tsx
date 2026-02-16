import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { applyVerificationCode } from "@/lib/firebaseAuth";
import { auth } from "@/lib/firebase";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const oobCode = params.get("oobCode");

      if (!oobCode) {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          await firebaseUser.reload();
        }
        if (firebaseUser?.emailVerified) {
          fetch("/api/auth/sync-email-verified", {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
          setStatus("success");
          setMessage("Your email has been verified successfully!");
        } else {
          setStatus("error");
          setMessage("No verification code provided. Please use the link from your email.");
        }
        return;
      }

      try {
        await applyVerificationCode(oobCode);
        await fetch("/api/auth/sync-email-verified", {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        setStatus("success");
        setMessage("Your email has been verified successfully!");
      } catch (err: any) {
        if (err.code === 'auth/expired-action-code') {
          setMessage("This verification link has expired. Please request a new one.");
        } else if (err.code === 'auth/invalid-action-code') {
          setMessage("This verification link is invalid or has already been used.");
        } else {
          setMessage("Verification failed. Please try again.");
        }
        setStatus("error");
      }
    };
    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary-hex, #00e0ff)" }}>LYFEOS</h1>

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
            <button
              onClick={() => navigate("/login")}
              className="px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: "var(--primary-hex, #00e0ff)", color: "#0a0a1a" }}
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
