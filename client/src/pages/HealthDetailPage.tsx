import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import DailyHealthLog from "@/components/health/DailyHealthLog";
import { useHealthOfflineSync } from "@/hooks/useHealthOfflineSync";
import HealthPreferences from "@/components/health/HealthPreferences";
import { healthTrackingDomains, type HealthTrackingDomain } from "@/components/health/HealthPreferences";
import OfflineHealthQueueStatus from "@/components/health/OfflineHealthQueueStatus";
import { ArrowLeft, Heart, Activity, Target, Flame, Loader2, TrendingUp, Brain, Zap, Smile } from "lucide-react";
import { LineChart, Line, ScatterChart, Scatter, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const NutritionDiary = lazy(() => import("@/components/health/NutritionDiary"));
const WorkoutLog = lazy(() => import("@/components/health/WorkoutLog"));
const BodyProgress = lazy(() => import("@/components/health/BodyProgress"));
const RecoveryLog = lazy(() => import("@/components/health/RecoveryLog"));
const RecoveryRoutines = lazy(() => import("@/components/health/RecoveryRoutines"));
const HealthMetricsLedger = lazy(() => import("@/components/health/HealthMetricsLedger"));
const IngredientScanner = lazy(() => import("@/components/health/IngredientScanner"));
const CapabilityEvidencePanel = lazy(() => import("@/components/health/CapabilityEvidencePanel"));
const SleepLog = lazy(() => import("@/components/health/SleepLog"));
const HealthTimeline = lazy(() => import("@/components/health/HealthTimeline"));
const ExerciseLibrary = lazy(() => import("@/components/health/ExerciseLibrary"));
const TrainingPrograms = lazy(() => import("@/components/health/TrainingPrograms"));
const WorkoutAnalytics = lazy(() => import("@/components/health/WorkoutAnalytics"));
const SupplementSchedules = lazy(() => import("@/components/health/SupplementSchedules"));
const MealPlanner = lazy(() => import("@/components/health/MealPlanner"));
const HealthTrendWorkbench = lazy(() => import("@/components/health/HealthTrendWorkbench"));
const HealthDataRights = lazy(() => import("@/components/health/HealthDataRights"));
const HealthConnections = lazy(() => import("@/components/health/HealthConnections"));
const HealthProgression = lazy(() => import("@/components/health/HealthProgression"));
const HealthAssistant = lazy(() => import("@/components/health/HealthAssistant"));
const ActivitySignals = lazy(() => import("@/components/health/ActivitySignals"));

function DeferredHealthSection({ children, label, targetId }: { children: ReactNode; label: string; targetId?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    if (!target.current || typeof IntersectionObserver === "undefined") { setReady(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setReady(true); observer.disconnect(); } }, { rootMargin: "600px 0px" });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, [ready]);
  return <div ref={target} id={targetId} className="scroll-mt-6">{ready ? <Suspense fallback={<div className="glassmorphic mb-8 min-h-32 rounded-2xl border border-primary/20 p-6 text-sm text-muted-foreground" role="status">Loading {label}…</div>}>{children}</Suspense> : <div className="mb-8 min-h-32" aria-hidden="true" />}</div>;
}

function getStatusBadge(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 75) return { label: "ADVANCED", color: "text-primary", bg: "bg-primary/20 border-primary/30" };
  if (pct >= 40) return { label: "BUILDING", color: "text-primary/80", bg: "bg-primary/15 border-primary/25" };
  return { label: "STARTING", color: "text-muted-foreground", bg: "bg-primary/10 border-primary/20" };
}

function getScoreColor(score: number): string {
  if (score > 7) return "text-primary";
  if (score > 4) return "text-primary/80";
  return "text-muted-foreground";
}

function getScoreBg(score: number): string {
  if (score > 7) return "bg-primary/15";
  if (score > 4) return "bg-primary/10";
  return "bg-primary/5";
}

function getHealthGlow(pct: number): string {
  if (pct >= 75) return "shadow-[0_0_40px_hsl(var(--primary)/0.3)]";
  if (pct >= 40) return "shadow-[0_0_30px_hsl(var(--primary)/0.25)]";
  return "shadow-[0_0_25px_hsl(var(--primary)/0.2)]";
}

function getGradientColors(pct: number): string {
  return "bg-primary";
}

export default function HealthDetailPage() {
  useHealthOfflineSync();
  usePageTitle("Health Points - LYFEOS");
  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);
  const healthProfile = useQuery<{ profile: { trackedDomains?: HealthTrackingDomain[] } | null }>({ queryKey: ["/api/health-fitness/profile"], queryFn: () => apiRequest("/api/health-fitness/profile"), enabled: !!user });

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stat-analytics', { days }],
    queryFn: () => apiRequest(`/api/stat-analytics?days=${days}`),
    enabled: !!user,
    refetchOnMount: 'always',
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
    { name: "Health-category missions", score: activityScore, icon: Target, desc: "Game progress from completed missions" },
    { name: "Mission consistency", score: consistencyScore, icon: Flame, desc: "Game progress from the current streak" },
    { name: "Mission category breadth", score: missionBalanceScore, icon: Activity, desc: "Distribution of recorded mission categories" },
    { name: "Self-reported mood", score: avgMoodPct, icon: Smile, desc: "Average of the mood check-ins you recorded" },
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
        <Link href="/profile" className="inline-flex items-center gap-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs rounded-md px-3 py-2 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="mb-8 flex items-center gap-3">
        <div className="relative">
          <Heart className="h-9 w-9 text-primary animate-pulse" />
          <Heart className="h-9 w-9 text-primary/50 absolute top-0 left-0 opacity-40 animate-pulse" style={{ animationDelay: "0.3s" }} />
        </div>
        <h1 className="text-3xl font-orbitron text-primary">
          Health Points
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

      <DailyHealthLog />

      <HealthPreferences />

      {(healthProfile.data?.profile?.trackedDomains ?? healthTrackingDomains).length ? <nav className="mb-8 flex flex-wrap gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3" aria-label="Selected Health workspace shortcuts">{(healthProfile.data?.profile?.trackedDomains ?? healthTrackingDomains).map((domain) => <a key={domain} href={`#health-section-${domain}`} className="rounded-md border border-primary/20 bg-background/30 px-2 py-1 text-xs capitalize text-primary hover:bg-primary/10">{domain}</a>)}</nav> : <p className="mb-8 rounded-xl border border-muted/20 bg-background/20 p-3 text-xs text-muted-foreground">No Health workspace shortcuts selected. Every workspace remains available below, and you can add shortcuts in Health units &amp; calendar context.</p>}

      <OfflineHealthQueueStatus />

      <DeferredHealthSection label="supplement schedules" targetId="health-section-supplements"><SupplementSchedules /></DeferredHealthSection>

      <DeferredHealthSection label="sleep records" targetId="health-section-sleep"><SleepLog /></DeferredHealthSection>

      <DeferredHealthSection label="health timeline"><HealthTimeline /></DeferredHealthSection>

      <DeferredHealthSection label="activity signals" targetId="health-section-activity"><ActivitySignals /></DeferredHealthSection>

      <DeferredHealthSection label="capability evidence"><CapabilityEvidencePanel /></DeferredHealthSection>

      <DeferredHealthSection label="nutrition diary" targetId="health-section-nutrition"><NutritionDiary /></DeferredHealthSection>

      <DeferredHealthSection label="meal planning" targetId="health-section-planning"><MealPlanner /></DeferredHealthSection>

      <DeferredHealthSection label="ingredient scanner"><IngredientScanner /></DeferredHealthSection>

      <DeferredHealthSection label="exercise library"><ExerciseLibrary /></DeferredHealthSection>

      <DeferredHealthSection label="workout log" targetId="health-section-training"><WorkoutLog /></DeferredHealthSection>

      <DeferredHealthSection label="workout analytics"><WorkoutAnalytics /></DeferredHealthSection>

      <DeferredHealthSection label="training programs"><TrainingPrograms /></DeferredHealthSection>

      <DeferredHealthSection label="body progress" targetId="health-section-body"><BodyProgress /></DeferredHealthSection>

      <DeferredHealthSection label="recovery log" targetId="health-section-recovery"><RecoveryLog /></DeferredHealthSection>
      <DeferredHealthSection label="recovery routines"><RecoveryRoutines /></DeferredHealthSection>

      <DeferredHealthSection label="health metrics" targetId="health-section-metrics"><HealthMetricsLedger /></DeferredHealthSection>

      <DeferredHealthSection label="health trends"><HealthTrendWorkbench /></DeferredHealthSection>

      <DeferredHealthSection label="private health-record assistant"><HealthAssistant /></DeferredHealthSection>

      <DeferredHealthSection label="health progression"><HealthProgression /></DeferredHealthSection>

      <DeferredHealthSection label="health connections" targetId="health-section-connections"><HealthConnections /></DeferredHealthSection>

      <DeferredHealthSection label="health data controls"><HealthDataRights /></DeferredHealthSection>

      <div className={`glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden ${healthGlow}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className={`absolute top-0 left-0 w-full h-1 ${gradientColors}`} />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="font-orbitron text-lg mb-3 text-primary flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Health-point game progress
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                  {healthPct}
                </span>
                <span className="text-2xl text-muted-foreground font-mono">%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.healthPoints.current} / {stats.healthPoints.max} HP
              </p>
              <p className="max-w-md text-xs text-muted-foreground mt-2">HP rewards participation in your LyfeOS system. It is not a measurement, score, diagnosis, or prediction of your health.</p>
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
              className={`h-full rounded-full ${gradientColors} transition-all duration-1000 ease-out`}
              style={{ width: `${healthPct}%` }}
            >
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
              Inputs to this game stat
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
                        className="h-full rounded-full transition-all duration-700 bg-primary"
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
                Recorded mission distribution only; this does not establish a health outcome
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

          {data?.sleepWellnessCorrelation && data.sleepWellnessCorrelation.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Sleep & daily-state observations
                <span className="text-xs text-muted-foreground font-mono ml-2">(past {days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="sleepHours"
                    name="Sleep Hours"
                    type="number"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Sleep Hours", position: "insideBottom", offset: -5, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
                  />
                  <YAxis
                    dataKey="mood"
                    name="Mood"
                    type="number"
                    domain={[0, 10]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Mood", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg px-3 py-2 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">{d.date}</p>
                          <p className="text-sm text-primary">Sleep: {d.sleepHours}h</p>
                          <p className="text-sm text-primary">Mood: {d.mood}/10</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={data.sleepWellnessCorrelation} fill="hsl(var(--primary))" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">These are self-reported observations in your LyfeOS record, not a medical conclusion or evidence that sleep caused a change in mood.</p>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Health planning prompts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-muted/20 bg-background/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-5 w-5 text-primary" />
                  <h3 className="text-white text-sm font-semibold">Maintain Your Streak</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  A streak shows consecutive days with LyfeOS-recorded activity. Complete only missions that are appropriate for you today.
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
                  Completion updates your LyfeOS activity record. It does not measure or determine your health.
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
                  This shows how your recorded activity is distributed across categories; it does not establish a wellness outcome.
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
                  Mood check-ins can help you notice self-reported patterns. They do not diagnose a cause or replace support from a qualified professional.
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
