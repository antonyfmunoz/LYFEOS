import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import {
  ArrowLeft, Award, Star, Target, Zap, TrendingUp, Loader2,
  Trophy, BarChart3, Calendar, Swords, FolderOpen
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis,
  Tooltip, CartesianGrid
} from "recharts";

const DIFFICULTY_COLORS: Record<string, string> = {
  D: "hsl(var(--primary) / 0.5)",
  C: "hsl(var(--primary) / 0.65)",
  B: "hsl(var(--primary) / 0.8)",
  A: "hsl(var(--primary) / 0.9)",
  S: "hsl(var(--primary))",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  D: "D-Rank",
  C: "C-Rank",
  B: "B-Rank",
  A: "A-Rank",
  S: "S-Rank",
};

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ExperienceDetailPage() {
  usePageTitle("Experience - LYFEOS");

  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stat-analytics', { days }],
    queryFn: () => fetch(`/api/stat-analytics?days=${days}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!user,
    refetchOnMount: 'always',
  });

  const currentXP = stats.experience.current;
  const maxXP = stats.experience.max;
  const currentLevel = stats.experience.level;
  const xpProgress = maxXP > 0 ? Math.round((currentXP / maxXP) * 100) : 0;

  const completedMissions = computedStats?.completedMissions ?? 0;
  const totalXpFromCompleted = computedStats?.totalXpFromCompleted ?? 0;
  const completionRate = computedStats?.completionRate ?? 0;

  const avgXpPerMission = data?.summary?.avgXpPerMission ?? (completedMissions > 0 ? totalXpFromCompleted / completedMissions : 25);
  const xpToNextLevel = data?.summary?.xpToNextLevel ?? (maxXP - currentXP);
  const estimatedMissionsToLevel = avgXpPerMission > 0 ? Math.ceil(xpToNextLevel / avgXpPerMission) : 0;

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs rounded-md px-3 py-2 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="mb-8 flex items-center gap-3">
        <Award className="h-9 w-9 text-primary" />
        <h1 className="text-3xl font-orbitron text-primary">
          Experience
        </h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-muted-foreground font-mono">Period:</span>
        <div className="flex gap-1">
          {[7, 14, 30, 90].map((d) => (
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

      <div className="glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden shadow-[0_0_30px_hsl(var(--primary)/0.25)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-xs font-mono uppercase tracking-widest text-primary mb-2">Current Level</p>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                {currentLevel}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {currentXP.toLocaleString()} / {maxXP.toLocaleString()} XP
            </p>
          </div>

          <div className="flex-1 max-w-md w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Level {currentLevel}</span>
              <span className="text-sm text-primary font-mono">{xpProgress}%</span>
              <span className="text-sm text-muted-foreground">Level {currentLevel + 1}</span>
            </div>
            <div className="w-full bg-muted/30 h-4 rounded-full overflow-hidden border border-muted/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-out relative"
                style={{ width: `${xpProgress}%` }}
              >
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{xpToNextLevel.toLocaleString()} XP to next level</span>
              <span>~{estimatedMissionsToLevel} missions</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Total XP:</span>
              <span className="font-mono text-primary">{(stats.experience.totalXP ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Done:</span>
              <span className="font-mono text-primary">{completedMissions}</span>
            </div>
            <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Rate:</span>
              <span className="font-mono text-primary">{Math.round(completionRate)}%</span>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {data?.xpTrend?.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                XP History
                <span className="text-xs text-muted-foreground font-mono ml-2">(last {days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.xpTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatShortDate}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.9)",
                      border: "1px solid hsl(var(--primary) / 0.3)",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    labelFormatter={formatShortDate}
                  />
                  <Area
                    type="monotone"
                    dataKey="xp"
                    name="XP Earned"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {data?.topMissions?.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Top Missions by XP
              </h2>
              <div className="space-y-3">
                {data.topMissions.slice(0, 10).map((mission: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-4 rounded-xl border border-muted/20 bg-background/30 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <span className="text-xs font-mono text-primary font-bold">#{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{mission.title}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {mission.category && (
                          <span className="px-1.5 py-0.5 rounded bg-muted/20 border border-muted/20">
                            {mission.category}
                          </span>
                        )}
                        {mission.completedAt && (
                          <span>{formatShortDate(mission.completedAt.split("T")[0])}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {mission.difficulty && (
                        <span
                          className="text-xs font-mono font-bold px-2 py-1 rounded-md border"
                          style={{
                            color: DIFFICULTY_COLORS[mission.difficulty] || "#9ca3af",
                            borderColor: (DIFFICULTY_COLORS[mission.difficulty] || "#9ca3af") + "40",
                            backgroundColor: (DIFFICULTY_COLORS[mission.difficulty] || "#9ca3af") + "15",
                          }}
                        >
                          {mission.difficulty}
                        </span>
                      )}
                      <div className="text-right">
                        <span className="text-lg font-mono font-bold text-primary">+{mission.xp}</span>
                        <span className="text-xs text-muted-foreground ml-1">XP</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data?.difficultyBreakdown && Object.keys(data.difficultyBreakdown).length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Swords className="h-5 w-5" />
                XP by Difficulty
              </h2>
              <div className="space-y-4">
                {["D", "C", "B", "A", "S"].map((rank) => {
                  const entry = data.difficultyBreakdown[rank];
                  if (!entry) return null;
                  const maxXpInBreakdown = Math.max(
                    ...Object.values(data.difficultyBreakdown).map((e: any) => e.totalXp || 0),
                    1
                  );
                  const barPct = Math.round(((entry.totalXp || 0) / maxXpInBreakdown) * 100);
                  return (
                    <div key={rank} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-mono font-bold w-16"
                            style={{ color: DIFFICULTY_COLORS[rank] }}
                          >
                            {DIFFICULTY_LABELS[rank]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.completed}/{entry.total} done
                          </span>
                        </div>
                        <span className="text-sm font-mono text-primary">
                          {(entry.totalXp || 0).toLocaleString()} XP
                        </span>
                      </div>
                      <div className="w-full bg-muted/20 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{
                            width: `${barPct}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data?.categoryStats && Object.keys(data.categoryStats).length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                XP by Category
              </h2>
              <div className="space-y-4">
                {Object.entries(data.categoryStats)
                  .sort((a: any, b: any) => (b[1].totalXp || 0) - (a[1].totalXp || 0))
                  .map(([category, entry]: [string, any]) => {
                    const maxXpInCat = Math.max(
                      ...Object.values(data.categoryStats).map((e: any) => e.totalXp || 0),
                      1
                    );
                    const barPct = Math.round(((entry.totalXp || 0) / maxXpInCat) * 100);
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white capitalize">
                              {category}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {entry.completed}/{entry.total} done
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">
                              {(entry.totalEnergy || 0)} energy
                            </span>
                            <span className="font-mono text-primary">
                              {(entry.totalXp || 0).toLocaleString()} XP
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-muted/20 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-700"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {data?.weekdayPatterns?.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekday Patterns
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.weekdayPatterns} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.9)",
                      border: "1px solid hsl(var(--primary) / 0.3)",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    itemStyle={{ color: "hsl(var(--primary))", fontSize: 13 }}
                  />
                  <Bar dataKey="xp" name="XP Earned" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Level Up Forecast
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-background/40 rounded-xl p-5 border border-muted/20 text-center">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Avg XP / Mission
                </p>
                <span className="text-3xl font-orbitron font-bold text-primary">
                  {Math.round(avgXpPerMission)}
                </span>
                <p className="text-xs text-muted-foreground mt-1">experience points</p>
              </div>

              <div className="bg-background/40 rounded-xl p-5 border border-muted/20 text-center">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  XP to Next Level
                </p>
                <span className="text-3xl font-orbitron font-bold text-primary">
                  {xpToNextLevel.toLocaleString()}
                </span>
                <p className="text-xs text-muted-foreground mt-1">remaining</p>
              </div>

              <div className="bg-background/40 rounded-xl p-5 border border-muted/20 text-center">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Est. Missions
                </p>
                <span className="text-3xl font-orbitron font-bold text-primary">
                  {estimatedMissionsToLevel}
                </span>
                <p className="text-xs text-muted-foreground mt-1">to level {currentLevel + 1}</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-background/30 rounded-xl border border-muted/20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Progress to Level {currentLevel + 1}</span>
                <span className="text-sm font-mono text-primary">{xpProgress}%</span>
              </div>
              <div className="w-full bg-muted/20 h-3 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${xpProgress}%` }}
                >
                </div>
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{currentXP.toLocaleString()} XP earned</span>
                <span>{maxXP.toLocaleString()} XP needed</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-background/30 rounded-lg border border-muted/20">
                <Zap className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Completion Rate</p>
                  <p className="text-sm font-mono text-primary">{Math.round(completionRate)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-background/30 rounded-lg border border-muted/20">
                <Star className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Total XP Earned</p>
                  <p className="text-sm font-mono text-primary">{totalXpFromCompleted.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <AIStatTip statType="experience" />
        </>
      )}
    </div>
  );
}
