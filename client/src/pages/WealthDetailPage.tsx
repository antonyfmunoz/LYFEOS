import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import { ArrowLeft, Coins, Target, Flame, Loader2, TrendingUp, Activity, Zap } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function getStatusBadge(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 75) return { label: "OPTIMAL", color: "text-primary", bg: "bg-primary/20 border-primary/30" };
  if (pct >= 40) return { label: "MODERATE", color: "text-primary/80", bg: "bg-primary/15 border-primary/25" };
  return { label: "LOW", color: "text-muted-foreground", bg: "bg-primary/10 border-primary/20" };
}

function getWealthGlow(pct: number): string {
  if (pct >= 75) return "shadow-[0_0_40px_hsl(var(--primary)/0.3)]";
  if (pct >= 40) return "shadow-[0_0_30px_hsl(var(--primary)/0.25)]";
  return "shadow-[0_0_25px_hsl(var(--primary)/0.2)]";
}

export default function WealthDetailPage() {
  usePageTitle("Wealth Tokens - LYFEOS");
  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stat-analytics', { days }],
    queryFn: () => apiRequest(`/api/stat-analytics?days=${days}`),
    enabled: !!user,
    refetchOnMount: 'always',
  });

  const wealthPct = stats.wealthTokens.max > 0
    ? Math.round((stats.wealthTokens.current / stats.wealthTokens.max) * 100)
    : 0;
  const status = getStatusBadge(wealthPct);
  const wealthGlow = getWealthGlow(wealthPct);

  const completedMissions = data?.summary?.completedMissions ?? computedStats?.completedMissions ?? 0;
  const currentStreak = data?.summary?.currentStreak ?? stats.streakDays ?? 0;
  const completionRate = data?.summary?.completionRate ?? 0;
  const categoryStats = data?.categoryStats ?? {};

  const activityScore = Math.min(Math.round((completedMissions / 10) * 100), 100);
  const consistencyScore = Math.min(Math.round((currentStreak / 30) * 100), 100);
  const missionBalanceScore = Math.min(Math.round((Object.keys(categoryStats).length / 5) * 100), 100);
  const utilizationScore = wealthPct;

  const wealthMetrics = [
    { name: "Resource Activity", score: activityScore, icon: Target, desc: "Based on completed missions" },
    { name: "Consistency", score: consistencyScore, icon: Flame, desc: "Based on current streak" },
    { name: "Diversification", score: missionBalanceScore, icon: Activity, desc: "Category diversity" },
    { name: "Utilization", score: utilizationScore, icon: Zap, desc: "Current wealth usage" },
  ];

  const categoryEntries = Object.entries(categoryStats) as [string, any][];
  const maxCategoryCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, v]: [string, any]) => (typeof v === "number" ? v : v?.count ?? v?.completed ?? 0)))
    : 1;

  const dayOptions = [7, 14, 30, 90];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs rounded-md px-3 py-2 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="mb-8 flex items-center gap-3">
        <div className="relative">
          <Coins className="h-9 w-9 text-primary animate-pulse" />
          <Coins className="h-9 w-9 text-primary/50 absolute top-0 left-0 opacity-40 animate-pulse" style={{ animationDelay: "0.3s" }} />
        </div>
        <h1 className="text-3xl font-orbitron text-primary">
          Wealth Tokens
        </h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-muted-foreground font-mono">Period:</span>
        <div className="flex gap-1">
          {dayOptions.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border ${
                days === d
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-background/40 border-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary/80"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className={`glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden ${wealthGlow}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="font-orbitron text-lg mb-3 text-primary flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Current Wealth Status
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                  {wealthPct}
                </span>
                <span className="text-2xl text-muted-foreground font-mono">%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.wealthTokens.current} / {stats.wealthTokens.max} WT
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className={`px-4 py-2 rounded-full border font-mono text-sm font-semibold tracking-wider ${status.bg} ${status.color}`}>
                {status.label}
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Flame className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground text-xs">Streak:</span>
                  <span className="font-mono text-primary text-sm">{currentStreak}d</span>
                </div>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground text-xs">Done:</span>
                  <span className="font-mono text-primary text-sm">{completedMissions}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 w-full bg-muted/20 h-4 rounded-full overflow-hidden border border-muted/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: `${wealthPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground font-mono">0 WT</span>
            <span className="text-xs text-primary font-mono">{wealthPct}%</span>
            <span className="text-xs text-muted-foreground font-mono">{stats.wealthTokens.max} WT</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Wealth Components
            </h2>
            <div className="space-y-5">
              {wealthMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-white text-sm font-semibold">{metric.name}</h3>
                          <p className="text-xs text-muted-foreground">{metric.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-mono font-bold text-primary">
                          {metric.score}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 bg-primary"
                        style={{ width: `${metric.score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {categoryEntries.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-2 text-primary flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Resource Allocation
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                How your wealth tokens are distributed across mission categories
              </p>
              <div className="space-y-3">
                {categoryEntries.map(([category, value]: [string, any]) => {
                  const count = typeof value === "number" ? value : value?.count ?? value?.completed ?? 0;
                  const pct = maxCategoryCount > 0 ? Math.round((count / maxCategoryCount) * 100) : 0;
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white capitalize">{category}</span>
                        <span className="text-xs font-mono text-muted-foreground">{count} missions</span>
                      </div>
                      <div className="w-full bg-muted/20 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Wealth Growth Tips
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Maintain Your Streak</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Consistency builds wealth over time. Complete at least one mission daily to keep your streak alive and earn bonus tokens.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current streak:</span>
                  <span className="font-mono text-sm text-primary font-bold">{currentStreak} days</span>
                </div>
              </div>

              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Boost Completion Rate</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Higher completion rates directly impact your wealth score. Aim for completing all assigned missions.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Completion rate:</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {completionRate}%
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Diversify Activities</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Balance your missions across different categories to maximize wealth token generation.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Categories active:</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {Object.keys(categoryStats).length}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Track Progress</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Monitor your wealth token trends over time to identify patterns and optimize your strategy.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current wealth:</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {stats.wealthTokens.current} WT
                  </span>
                </div>
              </div>
            </div>
          </div>

          <AIStatTip statType="wealth" />
        </>
      )}
    </div>
  );
}