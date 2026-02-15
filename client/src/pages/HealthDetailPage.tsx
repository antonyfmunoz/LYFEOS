import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import { ArrowLeft, Heart, Activity, Target, Flame, Loader2, TrendingUp, Brain, Zap, Smile } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function getStatusBadge(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 75) return { label: "OPTIMAL", color: "text-primary", bg: "bg-primary/20 border-primary/30" };
  if (pct >= 40) return { label: "MODERATE", color: "text-primary/80", bg: "bg-primary/15 border-primary/25" };
  return { label: "LOW", color: "text-primary/60", bg: "bg-primary/10 border-primary/20" };
}

function getScoreColor(score: number): string {
  if (score > 7) return "text-primary";
  if (score > 4) return "text-primary/80";
  return "text-primary/60";
}

function getScoreBg(score: number): string {
  if (score > 7) return "bg-primary/15";
  if (score > 4) return "bg-primary/10";
  return "bg-primary/5";
}

function getHealthGlow(pct: number): string {
  if (pct >= 75) return "shadow-[0_0_40px_hsl(var(--primary)/0.15)]";
  if (pct >= 40) return "shadow-[0_0_30px_hsl(var(--primary)/0.12)]";
  return "shadow-[0_0_25px_hsl(var(--primary)/0.12)]";
}

function getGradientColors(pct: number): string {
  if (pct >= 75) return "from-primary to-primary/60";
  if (pct >= 40) return "from-primary/80 to-primary/50";
  return "from-primary/60 to-primary/40";
}

export default function HealthDetailPage() {
  usePageTitle("Health Points - LYFEOS");
  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/stat-analytics?days=${days}`],
    enabled: !!user,
  });

  const healthPct = stats.healthPoints.max > 0
    ? Math.round((stats.healthPoints.current / stats.healthPoints.max) * 100)
    : 0;
  const status = getStatusBadge(healthPct);
  const healthGlow = getHealthGlow(healthPct);
  const gradientColors = getGradientColors(healthPct);

  const completedMissions = data?.summary?.completedMissions ?? computedStats?.completedMissions ?? 0;
  const currentStreak = data?.summary?.currentStreak ?? stats.streakDays ?? 0;
  const categoryStats = data?.categoryStats ?? {};
  const avgMoodScore = data?.summary?.avgMoodScore ?? 0;
  const completionRate = data?.summary?.completionRate ?? 0;

  const activityScore = Math.min(Math.round((completedMissions / 10) * 100), 100);
  const consistencyScore = Math.min(Math.round((currentStreak / 30) * 100), 100);
  const missionBalanceScore = Math.min(Math.round((Object.keys(categoryStats).length / 5) * 100), 100);
  const avgMoodPct = Math.min(Math.round((avgMoodScore / 10) * 100), 100);

  const healthMetrics = [
    { name: "Activity Level", score: activityScore, icon: Target, desc: "Based on completed missions" },
    { name: "Consistency", score: consistencyScore, icon: Flame, desc: "Based on current streak" },
    { name: "Mission Balance", score: missionBalanceScore, icon: Activity, desc: "Category diversity" },
    { name: "Average Mood", score: avgMoodPct, icon: Smile, desc: "Mood tracking average" },
  ];

  const moodTrend = data?.moodTrend ?? [];
  const recentMoods = moodTrend.slice(-7);
  const categoryEntries = Object.entries(categoryStats) as [string, any][];
  const maxCategoryCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, v]: [string, any]) => (typeof v === "number" ? v : v?.count ?? v?.completed ?? 0)))
    : 1;

  const dayOptions = [7, 14, 30, 90];

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Player Stats</span>
        </Link>
      </div>

      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Heart className="h-9 w-9 text-primary animate-pulse" />
            <Heart className="h-9 w-9 text-primary/50 absolute top-0 left-0 opacity-40 animate-pulse" style={{ animationDelay: "0.3s" }} />
          </div>
          <h1 className="text-3xl font-orbitron bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            Health Points
          </h1>
        </div>
        <div className="flex items-center gap-1 bg-background/40 rounded-lg border border-muted/30 p-1">
          {dayOptions.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                days === d
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-white hover:bg-muted/20"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className={`glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden ${healthGlow}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${gradientColors}`} />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="font-orbitron text-lg mb-3 text-primary flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Current Health Status
              </h2>
              <div className="flex items-baseline gap-2">
                <span className={`text-7xl font-orbitron font-bold bg-gradient-to-b from-white to-primary/60 bg-clip-text text-transparent leading-none`}>
                  {healthPct}
                </span>
                <span className="text-2xl text-muted-foreground font-mono">%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.healthPoints.current} / {stats.healthPoints.max} HP
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
                  <span className="font-mono text-white text-sm">{currentStreak}d</span>
                </div>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground text-xs">Done:</span>
                  <span className="font-mono text-white text-sm">{completedMissions}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 w-full bg-muted/20 h-4 rounded-full overflow-hidden border border-muted/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${gradientColors} transition-all duration-1000 ease-out relative`}
              style={{ width: `${healthPct}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground font-mono">0 HP</span>
            <span className="text-xs text-primary font-mono">{healthPct}%</span>
            <span className="text-xs text-muted-foreground font-mono">{stats.healthPoints.max} HP</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {moodTrend.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Mood Trends
                <span className="text-xs text-muted-foreground font-mono ml-2">(past {days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={moodTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 10]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.9)",
                      border: "1px solid hsl(var(--primary) / 0.3)",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    labelFormatter={(val: string) => {
                      const d = new Date(val + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mental"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Mental"
                  />
                  <Line
                    type="monotone"
                    dataKey="physical"
                    stroke="hsl(var(--primary) / 0.7)"
                    strokeWidth={2}
                    dot={false}
                    name="Physical"
                  />
                  <Line
                    type="monotone"
                    dataKey="emotional"
                    stroke="hsl(var(--primary) / 0.5)"
                    strokeWidth={2}
                    dot={false}
                    name="Emotional"
                  />
                  <Line
                    type="monotone"
                    dataKey="average"
                    stroke="hsl(var(--primary) / 0.3)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Average"
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-primary rounded" />
                  <span className="text-muted-foreground">Mental</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-primary/70 rounded" />
                  <span className="text-muted-foreground">Physical</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-primary/50 rounded" />
                  <span className="text-muted-foreground">Emotional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-primary/30 rounded border-dashed" />
                  <span className="text-muted-foreground">Average</span>
                </div>
              </div>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Health Components
            </h2>
            <div className="space-y-5">
              {healthMetrics.map((metric) => {
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
                        <span className={`text-lg font-mono font-bold text-primary`}>
                          {metric.score}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          metric.score >= 75 ? "bg-gradient-to-r from-primary to-primary/80" :
                          metric.score >= 40 ? "bg-gradient-to-r from-primary/80 to-primary/60" :
                          "bg-gradient-to-r from-primary/60 to-primary/40"
                        }`}
                        style={{ width: `${metric.score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {recentMoods.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Daily Wellness Breakdown
                <span className="text-xs text-muted-foreground font-mono ml-2">(last 7 entries)</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {recentMoods.map((entry: any, idx: number) => {
                  const dateStr = new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-muted/20 bg-background/30 p-3 hover:border-primary/30 transition-colors"
                    >
                      <p className="text-xs text-muted-foreground font-mono mb-2 text-center">{dateStr}</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">MNT</span>
                          <span className={`text-sm font-mono font-bold ${getScoreColor(entry.mental ?? 0)}`}>
                            {entry.mental ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">PHY</span>
                          <span className={`text-sm font-mono font-bold ${getScoreColor(entry.physical ?? 0)}`}>
                            {entry.physical ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">EMO</span>
                          <span className={`text-sm font-mono font-bold ${getScoreColor(entry.emotional ?? 0)}`}>
                            {entry.emotional ?? "—"}
                          </span>
                        </div>
                      </div>
                      <div className={`mt-2 rounded-md py-1 text-center ${getScoreBg(entry.average ?? 0)}`}>
                        <span className={`text-xs font-mono font-semibold ${getScoreColor(entry.average ?? 0)}`}>
                          avg {entry.average?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {categoryEntries.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-2 text-primary flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Category Balance
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                A balanced distribution across categories contributes to health
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
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
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
              <Heart className="h-5 w-5" />
              Health Recovery Tips
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Maintain Your Streak</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Consistency is key to health recovery. Complete at least one mission daily to keep your streak alive.
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
                  Higher completion rates directly impact your health score. Aim for completing all assigned missions.
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
                  Working across different categories improves your mission balance score and overall wellness.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active categories:</span>
                  <span className="font-mono text-sm text-primary font-bold">{Object.keys(categoryStats).length}</span>
                </div>
              </div>

              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smile className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Track Your Mood</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Regular mood check-ins help you understand patterns and improve your emotional wellness over time.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Avg mood score:</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {avgMoodScore > 0 ? avgMoodScore.toFixed(1) : "—"} / 10
                  </span>
                </div>
              </div>
            </div>
          </div>

          <AIStatTip statType="health" />
        </>
      )}
    </div>
  );
}
