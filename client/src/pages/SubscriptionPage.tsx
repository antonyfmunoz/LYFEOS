import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/authContext";
import { apiRequest } from "../lib/queryClient";
import { useLocation } from "wouter";
import { Zap, Shield, BarChart3, Palette, Download, Headphones, Check, Crown, Loader2, ArrowLeft } from "lucide-react";

interface Price {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
  active: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, string> | null;
  prices: Price[];
}

const PRO_FEATURES = [
  { icon: Zap, label: "Unlimited AI Conversations", description: "Chat with NOVA without limits" },
  { icon: BarChart3, label: "Advanced Analytics", description: "Deep insights into your progress" },
  { icon: Headphones, label: "Priority Support", description: "Get help when you need it" },
  { icon: Palette, label: "Custom Themes", description: "Personalize your experience" },
  { icon: Download, label: "Data Export", description: "Export your data anytime" },
  { icon: Shield, label: "Early Access", description: "Be first to try new features" },
];

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"month" | "year">("month");

  const searchParams = new URLSearchParams(window.location.search);
  const isSuccess = searchParams.get("success") === "true";
  const isCanceled = searchParams.get("canceled") === "true";

  const { data: productsData, isLoading: productsLoading } = useQuery<{ data: Product[] }>({
    queryKey: ["/api/stripe/products"],
  });

  const { data: subscriptionData, isLoading: subLoading } = useQuery<{ subscription: any }>({
    queryKey: ["/api/stripe/subscription"],
    enabled: !!user,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      return apiRequest<{ url: string }>("/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ priceId }),
      });
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ url: string }>("/api/stripe/portal", {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const products = productsData?.data || [];
  const proProduct = products.find(
    (p: Product) => p.metadata?.tier === "pro"
  ) || products[0];
  const subscription = subscriptionData?.subscription;
  const isSubscribed = subscription && subscription.status === "active";

  const monthlyPrice = proProduct?.prices?.find(
    (p: Price) => p.recurring?.interval === "month"
  );
  const yearlyPrice = proProduct?.prices?.find(
    (p: Price) => p.recurring?.interval === "year"
  );
  const selectedPrice = billingPeriod === "month" ? monthlyPrice : yearlyPrice;

  const monthlyCost = monthlyPrice ? (monthlyPrice.unit_amount / 100).toFixed(2) : "9.99";
  const yearlyCost = yearlyPrice ? (yearlyPrice.unit_amount / 100).toFixed(2) : "79.99";
  const yearlyMonthlyCost = yearlyPrice ? (yearlyPrice.unit_amount / 100 / 12).toFixed(2) : "6.67";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Dashboard</span>
        </button>

        {isSuccess && (
          <div className="mb-6 p-4 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span className="font-medium">Welcome to LYFEOS Pro! Your subscription is now active.</span>
            </div>
          </div>
        )}

        {isCanceled && (
          <div className="mb-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
            <span>Checkout was canceled. You can try again whenever you're ready.</span>
          </div>
        )}

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <Crown className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-orbitron font-bold text-foreground">
              LYFEOS <span className="text-primary">PRO</span>
            </h1>
          </div>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Supercharge your life operating system with unlimited AI, advanced analytics, and premium features.
          </p>
        </div>

        {isSubscribed ? (
          <div className="glassmorphic rounded-xl p-8 neon-border text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Crown className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-orbitron text-primary">Active Subscription</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              You're currently on the LYFEOS Pro plan. Manage your billing and subscription below.
            </p>
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {portalMutation.isPending ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</span>
              ) : (
                "Manage Subscription"
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-8">
              <div className="inline-flex rounded-lg border border-border p-1 bg-card">
                <button
                  onClick={() => setBillingPeriod("month")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("year")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "year"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Yearly
                  <span className="ml-1 text-xs text-green-400">Save 33%</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-10">
              <div className="rounded-xl border border-border p-6 bg-card">
                <h3 className="text-lg font-orbitron mb-2 text-foreground">Free</h3>
                <div className="text-3xl font-bold text-foreground mb-1">$0</div>
                <p className="text-sm text-muted-foreground mb-6">Forever free</p>
                <ul className="space-y-3 mb-6">
                  {["Basic mission tracking", "Daily stats", "Limited AI chats", "Standard themes"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-muted-foreground/50" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full py-3 rounded-lg border border-border text-muted-foreground text-sm font-medium"
                >
                  Current Plan
                </button>
              </div>

              <div className="rounded-xl border-2 border-primary p-6 bg-card relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
                  PRO
                </div>
                <h3 className="text-lg font-orbitron mb-2 text-foreground">Pro</h3>
                <div className="text-3xl font-bold text-foreground mb-1">
                  ${billingPeriod === "month" ? monthlyCost : yearlyMonthlyCost}
                  <span className="text-base font-normal text-muted-foreground">/mo</span>
                </div>
                {billingPeriod === "year" && (
                  <p className="text-sm text-muted-foreground mb-1">
                    ${yearlyCost} billed annually
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-6">
                  {billingPeriod === "month" ? "Billed monthly" : "Best value"}
                </p>
                <ul className="space-y-3 mb-6">
                  {PRO_FEATURES.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-2 text-sm text-foreground">
                      <Icon className="w-4 h-4 text-primary" />
                      {label}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    if (selectedPrice) {
                      checkoutMutation.mutate(selectedPrice.id);
                    }
                  }}
                  disabled={checkoutMutation.isPending || productsLoading || !selectedPrice}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {checkoutMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                    </span>
                  ) : productsLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                    </span>
                  ) : (
                    "Upgrade to Pro"
                  )}
                </button>
              </div>
            </div>

            <div className="glassmorphic rounded-xl p-8">
              <h3 className="text-lg font-orbitron text-center mb-6 text-foreground">
                Everything in <span className="text-primary">Pro</span>
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PRO_FEATURES.map(({ icon: Icon, label, description }) => (
                  <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-card/50">
                    <Icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
