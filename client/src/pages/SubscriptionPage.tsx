import { ArrowLeft, Shield } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Billing is intentionally not a product surface until plans, entitlements,
 * merchant obligations, support, and refund handling are all ready. Keeping
 * this route honest prevents stale provider data from becoming a purchase
 * promise the product cannot yet fulfil.
 */
export default function SubscriptionPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button onClick={() => navigate("/dashboard")} className="mb-6 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> <span className="text-sm">Back to Dashboard</span>
        </button>
        <div className="glassmorphic rounded-xl p-8 text-center neon-border">
          <Shield className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-4 font-orbitron text-xl text-foreground">Billing is not available yet</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            LyfeOS is currently available without a payment plan. No charge, checkout, or subscription can be created here.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Any future plan will be introduced only with clear entitlements, support, refund handling, and privacy terms.
          </p>
        </div>
      </div>
    </div>
  );
}
