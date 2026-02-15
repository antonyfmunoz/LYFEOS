import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import { ArrowLeft, BarChart3, CheckCircle, Target, Calendar, Layers, Settings, Loader2, TrendingUp, Zap } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const DAY_OPTIONS = [7, 14, 30, 90];

function getStatusBadge(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "OPTIMAL", color: "text-primary", bg: "bg-primary/20 border-primary/30" };
  if (score >= 50) return { label: "MODERATE", color: "text-primary/80", bg: "bg-primary/15 border-primary/25" };
  return { label: "LOW", color: "text-primary/60", bg: "bg-primary/10 border-primary/20" };
}

export default function EfficiencyDetailPage() {
  usePageTitle("System Efficiency - LYFEOS");

  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stat-analytics', { days }],
    queryFn: () => fetch(`/api/stat-analytics?days=${days}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!user,
    refetchOnMount: 'always',
  });

  const completionRate = data?.summary?.completionRate ?? computedStats?.completionRate ?? 0;
  const categoryStats = data?.categoryStats ?? {};
  const completionTrend = data?.completionTrend ?? [];
  const tokenUtilization = data?.tokenUtilization ?? [];
  const weekdayPatterns = data?.weekdayPatterns ?? [];

  const totalMissions = data?.summary?.totalMissions ?? 0;
  const completedMissionsCount = data?.summary?.completedMissions ?? 0;
  const tokenEfficiency = totalMissions > 0 ? Math.min(Math.round((completedMissionsCount / totalMissions) * 100), 100) : 0;
  const consistencyScore = Math.min(Math.round(((data?.summary?.currentStreak ?? stats.streakDays) / 30) * 100), 100);
  const missionBalanceScore = Math.min(Math.round((Object.keys(categoryStats).length / 5) * 100), 100);
  const systemUsageScore = stats.efficiencyScore;
  const taskCompletionScore = Math.round(completionRate);

  const efficiencyMetrics = [
    { name: "Task Completion", score: taskCompletionScore, icon: CheckCircle, desc: "Mission completion rate" },
    { name: "Token Efficiency", score: tokenEfficiency, icon: Zap, desc: "Energy spent on completed missions" },
    { name: "Consistency", score: consistencyScore, icon: Calendar, desc: "Daily streak consistency" },
    { name: "Mission Balance", score: missionBalanceScore, icon: Layers, desc: "Category diversity" },
    { name: "System Usage", score: systemUsageScore, icon: Settings, desc: "Overall system optimization" },
  ];

  const status = getStatusBadge(stats.efficiencyScore);

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
          <BarChart3 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="text-3xl font-orbitron text-primary">
          System Efficiency
        </h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-muted-foreground font-mono">Period:</span>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setDays(opt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border ${
                days === opt
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-background/40 border-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary/80"
              }`}
            >
              {opt}d
            </button>
          ))}
        </div>
      </div>

      <div className="glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden shadow-[0_0_30px_hsl(var(--primary)/0.25)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-orbitron text-xl text-primary flex items-center gap-2">
              <Target className="h-5 w-5" />
              Overall Efficiency
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-mono border ${status.bg} ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">System Score</p>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                  {stats.efficiencyScore}
                </span>
                <span className="text-2xl text-primary/60 font-mono">%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.efficiencyScore >= 80 ? "Systems operating at peak performance" : stats.efficiencyScore >= 50 ? "Room for improvement detected" : "Systems require attention"}
              </p>
            </div>

            <div className="flex flex-col gap-3 min-w-[220px]">
              <div className="flex items-center gap-2 bg-background/40 rounded-lg px-4 py-3 border border-muted/20">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground text-sm">Target:</span>
                <span className="font-mono text-primary font-semibold">95%</span>
              </div>
              <div className="flex items-center gap-2 bg-background/40 rounded-lg px-4 py-3 border border-muted/20">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground text-sm">Gap:</span>
                <span className="font-mono text-primary font-semibold">{Math.max(95 - stats.efficiencyScore, 0)}%</span>
              </div>
              <div className="flex items-center gap-2 bg-background/40 rounded-lg px-4 py-3 border border-muted/20">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground text-sm">Completion:</span>
                <span className="font-mono text-primary font-semibold">{taskCompletionScore}%</span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground font-mono">Current: {stats.efficiencyScore}%</span>
              <span className="text-xs text-muted-foreground font-mono">Target: 95%</span>
            </div>
            <div className="w-full bg-muted/30 h-3 rounded-full overflow-hidden border border-muted/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                style={{ width: `${stats.efficiencyScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-mono">Analyzing system data...</p>
        </div>
      ) : (
        <>
          {completionTrend.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Completion Rate Trend
                <span className="text-xs text-muted-foreground font-mono ml-2">(last {days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={completionTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val: string) => {
                      const d = new Date(val + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid hsl(var(--primary) / 0.3)", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    labelFormatter={(val: string) => {
                      const d = new Date(val + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {tokenUtilization.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Token Utilization
                <span className="text-xs text-muted-foreground font-mono ml-2">(last {days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={tokenUtilization} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val: string) => {
                      const d = new Date(val + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid hsl(var(--primary) / 0.3)", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    labelFormatter={(val: string) => {
                      const d = new Date(val + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                    }}
                  />
                  <Bar dataKey="used" name="Used" stackId="tokens" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" name="Remaining" stackId="tokens" fill="rgba(255,255,255,0.1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Efficiency Components
            </h2>

            <div className="space-y-5">
              {efficiencyMetrics.map((metric) => {
                return (
                  <div key={metric.name} className="group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <metric.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{metric.name}</h3>
                          <p className="text-xs text-muted-foreground">{metric.desc}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg text-sm font-mono bg-primary/10 text-primary border border-primary/20">
                        {metric.score}%
                      </span>
                    </div>
                    <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                        style={{ width: `${metric.score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Weighted Average</span>
                <span className="text-lg font-mono font-bold text-primary">
                  {Math.round(efficiencyMetrics.reduce((sum, m) => sum + m.score, 0) / efficiencyMetrics.length)}%
                </span>
              </div>
            </div>
          </div>

          {Object.keys(categoryStats).length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Category Performance
              </h2>

              <div className="space-y-4">
                {Object.entries(categoryStats).map(([category, catData]: [string, any]) => {
                  const catCompletionRate = catData.total > 0 ? Math.round((catData.completed / catData.total) * 100) : 0;
                  return (
                    <div key={category} className="p-4 rounded-xl border border-muted/20 bg-background/30 hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <h3 className="text-sm font-semibold text-white capitalize">{category}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-bold text-primary">
                            {catCompletionRate}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${catCompletionRate}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-primary" />
                          <span>{catData.completed}/{catData.total} missions</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-primary/80" />
                          <span>{catData.totalEnergy ?? 0} energy</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-primary" />
                          <span>{catData.totalXp ?? 0} XP</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {weekdayPatterns.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-2 text-primary flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekday Performance
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Identify your most productive days</p>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekdayPatterns} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid hsl(var(--primary) / 0.3)", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    itemStyle={{ fontSize: 13 }}
                  />
                  <Bar dataKey="completed" name="Missions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {(() => {
                  const maxDay = weekdayPatterns.reduce((best: any, cur: any) =>
                    (cur.completed > (best?.completed ?? 0)) ? cur : best, weekdayPatterns[0]);
                  const minDay = weekdayPatterns.reduce((worst: any, cur: any) =>
                    (cur.completed < (worst?.completed ?? Infinity)) ? cur : worst, weekdayPatterns[0]);
                  const totalCompleted = weekdayPatterns.reduce((sum: number, d: any) => sum + (d.completed || 0), 0);
                  const avgPerDay = weekdayPatterns.length > 0 ? (totalCompleted / weekdayPatterns.length).toFixed(1) : "0";

                  return (
                    <>
                      <div className="bg-background/40 rounded-lg px-3 py-2 border border-muted/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Most Productive</p>
                        <p className="text-sm font-mono font-bold text-primary">{maxDay?.day ?? "—"}</p>
                      </div>
                      <div className="bg-background/40 rounded-lg px-3 py-2 border border-muted/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Least Active</p>
                        <p className="text-sm font-mono font-bold text-primary/60">{minDay?.day ?? "—"}</p>
                      </div>
                      <div className="bg-background/40 rounded-lg px-3 py-2 border border-muted/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total</p>
                        <p className="text-sm font-mono font-bold text-primary">{totalCompleted}</p>
                      </div>
                      <div className="bg-background/40 rounded-lg px-3 py-2 border border-muted/20 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg / Day</p>
                        <p className="text-sm font-mono font-bold text-primary">{avgPerDay}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <AIStatTip statType="efficiency" />
        </>
      )}
    </div>
  );
}
