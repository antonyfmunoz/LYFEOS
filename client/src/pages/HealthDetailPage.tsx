import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import DailyHealthLog from "@/components/health/DailyHealthLog";
import { useHealthOfflineSync } from "@/hooks/useHealthOfflineSync";
import OfflineHealthQueueStatus from "@/components/health/OfflineHealthQueueStatus";
import { ArrowLeft, Award, Heart, Activity, Target, Flame, Loader2, TrendingUp, Brain, Zap, Smile } from "lucide-react";
import { LineChart, Line, ScatterChart, Scatter, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { DeferredFeatureChunkBoundary } from "@/components/DeferredFeature";
import { withChunkLoadTimeout } from "@/lib/runtimeRecovery";

function lazyHealthFeature<Component extends ComponentType<any>>(loader: () => Promise<{ default: Component }>) {
  return lazy(() => withChunkLoadTimeout(loader));
}

const NutritionDiary = lazyHealthFeature(() => import("@/components/health/NutritionDiary"));
const WorkoutLog = lazyHealthFeature(() => import("@/components/health/WorkoutLog"));
const BodyProgress = lazyHealthFeature(() => import("@/components/health/BodyProgress"));
const RecoveryLog = lazyHealthFeature(() => import("@/components/health/RecoveryLog"));
const RecoveryRoutines = lazyHealthFeature(() => import("@/components/health/RecoveryRoutines"));
const HealthMetricsLedger = lazyHealthFeature(() => import("@/components/health/HealthMetricsLedger"));
const IngredientScanner = lazyHealthFeature(() => import("@/components/health/IngredientScanner"));
const GroceryIntelligence = lazyHealthFeature(() => import("@/components/health/GroceryIntelligence"));
const FoodCompass = lazyHealthFeature(() => import("@/components/health/FoodCompass"));
const SleepLog = lazyHealthFeature(() => import("@/components/health/SleepLog"));
const ExerciseLibrary = lazyHealthFeature(() => import("@/components/health/ExerciseLibrary"));
const TrainingPrograms = lazyHealthFeature(() => import("@/components/health/TrainingPrograms"));
const SupplementSchedules = lazyHealthFeature(() => import("@/components/health/SupplementSchedules"));
const MealPlanner = lazyHealthFeature(() => import("@/components/health/MealPlanner"));

function DeferredHealthSection({ children, label, targetId }: { children: ReactNode; label: string; targetId?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    // A below-the-fold module must not begin its first dynamic import while
    // the user is intentionally offline. It has no usable response to show,
    // and React caches a rejected lazy import for the rest of the document.
    // Keep the section dormant and let the normal intersection check load it
    // once the browser reconnects.
    if (ready || !isOnline) return;
    // The browser resolves an initial fragment before React has rendered this
    // deferred target. Honour a direct workspace link immediately rather than
    // leaving its placeholder dormant until the user scrolls.
    if (targetId && window.location.hash === `#${targetId}`) { setReady(true); return; }
    if (!target.current || typeof IntersectionObserver === "undefined") { setReady(true); return; }
    let observer: IntersectionObserver | null = null;
    const activateWhenNear = () => {
      const element = target.current;
      if (!element || !navigator.onLine) return;
      const bounds = element.getBoundingClientRect();
      if (bounds.top <= window.innerHeight + 600 && bounds.bottom >= -600) {
        observer?.disconnect();
        setReady(true);
      }
    };
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && navigator.onLine) {
        setReady(true);
        observer?.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(target.current);
    // Health scrolls inside RootLayout's main region. Keep an explicit
    // proximity fallback so programmatic deep links and nested scrolling
    // activate a deferred workspace even when an embedded browser misses an
    // IntersectionObserver update.
    const scrollRoot = document.getElementById("main-content");
    scrollRoot?.addEventListener("scroll", activateWhenNear, { passive: true });
    // `scrollIntoView` can select an ancestor other than the expected main
    // region in embedded browsers. A capture listener sees that scroll too,
    // so a directly selected workspace never remains a blank placeholder.
    document.addEventListener("scroll", activateWhenNear, { capture: true, passive: true });
    window.addEventListener("resize", activateWhenNear, { passive: true });
    requestAnimationFrame(activateWhenNear);
    return () => {
      observer?.disconnect();
      scrollRoot?.removeEventListener("scroll", activateWhenNear);
      document.removeEventListener("scroll", activateWhenNear, true);
      window.removeEventListener("resize", activateWhenNear);
    };
  }, [isOnline, ready]);
  return <div ref={target} id={targetId} className="scroll-mt-6">{ready ? <DeferredFeatureChunkBoundary fallback={<div className="glassmorphic mb-8 min-h-32 rounded-2xl border border-destructive/30 p-6 text-sm" role="alert"><p className="font-medium">The {label} workspace could not load.</p><p className="mt-1 text-xs text-muted-foreground">Other Health workspaces remain available. Reload the latest LyfeOS version to retry this workspace.</p><button type="button" className="mt-3 rounded-md border border-primary/30 px-3 py-1.5 text-xs text-primary" onClick={() => window.location.reload()}>Reload LyfeOS</button></div>}><Suspense fallback={<div className="glassmorphic mb-8 min-h-32 rounded-2xl border border-primary/20 p-6 text-sm text-muted-foreground" role="status">Loading {label}…</div>}>{children}</Suspense></DeferredFeatureChunkBoundary> : <div className="mb-8 min-h-32" aria-hidden="true" />}</div>;
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

type HealthPracticeProgression = {
  practiceXp: number;
  rank: { level: number; name: string; minimumXp: number };
  nextRank: { level: number; name: string; minimumXp: number } | null;
  badges: Array<{ key: string }>;
  disclosure: string;
};

type HealthLogSection = "records" | "nourishment" | "movement" | "recovery";
type HealthLogTool = "daily-check-in" | "body-progress" | "metrics" | "supplements" | "nutrition-diary" | "meal-planning" | "ingredient-review" | "grocery-intelligence" | "food-compass" | "exercise-library" | "workout-log" | "training-programs" | "sleep-log" | "recovery-log" | "recovery-routines";

const healthLogSections: Array<{ id: HealthLogSection; title: string; description: string }> = [
  { id: "records", title: "Records", description: "Daily state, measurements, and health metrics you choose to keep." },
  { id: "nourishment", title: "Nourishment", description: "Food, hydration, supplements, planning, and ingredient review." },
  { id: "movement", title: "Movement", description: "Training records, programs, and exercise reference material." },
  { id: "recovery", title: "Recovery", description: "Sleep, restorative practices, and recovery observations." },
];

export default function HealthDetailPage({ view = "status" }: { view?: "status" | "log" }) {
  useHealthOfflineSync();
  usePageTitle(view === "log" ? "Health Log" : "Health");
  const { user } = useAuth();
  const { stats, computedStats } = useLYFEOS();
  const [days, setDays] = useState(30);
  const [activeHealthLogSection, setActiveHealthLogSection] = useState<HealthLogSection | null>(null);
  const [activeHealthLogTool, setActiveHealthLogTool] = useState<HealthLogTool | null>(null);
  const [importedNutritionFoodId, setImportedNutritionFoodId] = useState<number | null>(null);
  const [manualNutritionFoodRequest, setManualNutritionFoodRequest] = useState<{ name: string } | null>(null);
  const healthProgression = useQuery<{ progression: HealthPracticeProgression }>({
    queryKey: ["/api/health-progression"],
    // The home surface only needs the current ledger snapshot. Reconciliation
    // already runs after factual Health mutations, while the deferred
    // progression workspace deliberately performs its explicit reconciliation
    // when a user opens it. Avoid replaying the complete evidence ledger as
    // part of every Health-page load.
    queryFn: () => apiRequest("/api/health-progression"),
    enabled: !!user,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!importedNutritionFoodId && !manualNutritionFoodRequest) return;
    document.getElementById("health-section-nutrition")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [importedNutritionFoodId, manualNutritionFoodRequest]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/stat-analytics', { days }],
    queryFn: () => apiRequest(`/api/stat-analytics?days=${days}`),
    enabled: !!user,
    refetchOnMount: 'always',
  });

  const recordedPractice = healthProgression.data?.progression;
  const healthPct = recordedPractice?.nextRank
    ? Math.max(0, Math.min(100, Math.round(((recordedPractice.practiceXp - recordedPractice.rank.minimumXp) / (recordedPractice.nextRank.minimumXp - recordedPractice.rank.minimumXp)) * 100)))
    : recordedPractice ? 100 : 0;
  const completedMissions = data?.summary?.completedMissions ?? computedStats?.completedMissions ?? 0;
  const currentStreak = data?.summary?.currentStreak ?? stats.streakDays ?? 0;
  const categoryStats = data?.categoryStats ?? {};
  const avgMoodScore = data?.summary?.avgMoodScore ?? 0;
  const completionRate = data?.summary?.completionRate ?? 0;
  const sleepWellnessDataQuality = data?.sleepWellnessDataQuality ?? { observations: 0, availableDays: days, coveragePercent: 0, level: "insufficient", readyToExplore: false, note: "At least five complete daily records are needed before LyfeOS shows an observed pattern." };

  const activityScore = Math.min(Math.round((completedMissions / 10) * 100), 100);
  const consistencyScore = Math.min(Math.round((currentStreak / 30) * 100), 100);
  const categoryCount = (value: unknown) => typeof value === "number" ? value : (value as { count?: number; completed?: number } | undefined)?.count ?? (value as { completed?: number } | undefined)?.completed ?? 0;
  const categoryEntries = (Object.entries(categoryStats) as [string, unknown][]).filter(([, value]) => categoryCount(value) > 0);
  const missionBalanceScore = Math.min(Math.round((categoryEntries.length / 5) * 100), 100);
  const avgMoodPct = Math.min(Math.round((avgMoodScore / 10) * 100), 100);
  const moodTrend = data?.moodTrend ?? [];

  const healthMetrics = [
    { name: "Health-category missions", score: activityScore, icon: Target, desc: "Game progress from completed missions" },
    { name: "Mission consistency", score: consistencyScore, icon: Flame, desc: "Game progress from the current streak" },
    { name: "Mission category breadth", score: missionBalanceScore, icon: Activity, desc: "Distribution of recorded mission categories" },
    {
      name: "Self-reported mood",
      score: avgMoodPct,
      icon: Smile,
      desc: moodTrend.length > 0 ? "Average of the mood check-ins you recorded" : "No mood check-ins recorded for this period",
      valueLabel: moodTrend.length > 0 ? `${avgMoodPct}%` : "Not recorded",
      unavailable: moodTrend.length === 0,
    },
  ];

  const recentMoods = moodTrend.slice(-7);
  const maxCategoryCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, value]) => categoryCount(value)))
    : 1;

  const dayOptions = [7, 14, 30, 90];

  const healthLogTools = activeHealthLogSection === "records" ? [
    { id: "daily-check-in" as const, title: "Daily check-in", description: "Hydration, daily state, and the records used across LyfeOS." },
    { id: "body-progress" as const, title: "Body progress", description: "Record and correct your chosen body measurements." },
    { id: "metrics" as const, title: "Health metrics", description: "Maintain your private metric ledger." },
  ] : activeHealthLogSection === "nourishment" ? [
    { id: "nutrition-diary" as const, title: "Nutrition diary", description: "Log food and review your saved history." },
    { id: "supplements" as const, title: "Supplement schedules", description: "Plan and log supplement routines." },
    { id: "meal-planning" as const, title: "Meal planning", description: "Plan meals from your own record." },
    { id: "ingredient-review" as const, title: "Ingredient review", description: "Review a product before you decide to save it." },
    { id: "grocery-intelligence" as const, title: "Grocery intelligence", description: "Private planning support, never a purchase or inventory claim." },
    { id: "food-compass" as const, title: "Food Compass", description: "Public local-food discovery with source disclosure." },
  ] : activeHealthLogSection === "movement" ? [
    { id: "workout-log" as const, title: "Workout log", description: "Record completed training and its supporting details." },
    { id: "training-programs" as const, title: "Training programs", description: "Organize a training plan without creating a second mission system." },
    { id: "exercise-library" as const, title: "Exercise library", description: "Browse and maintain exercise reference material." },
  ] : activeHealthLogSection === "recovery" ? [
    { id: "sleep-log" as const, title: "Sleep log", description: "The same daily sleep and wake record used on Dashboard, plus detailed sessions." },
    { id: "recovery-log" as const, title: "Recovery log", description: "Record restorative activities and observations." },
    { id: "recovery-routines" as const, title: "Recovery routines", description: "Keep chosen recovery practices and their history." },
  ] : [];

  const openHealthLogSection = (section: HealthLogSection) => { setActiveHealthLogSection(section); setActiveHealthLogTool(null); };
  const healthLogWorkspace = (() => {
    switch (activeHealthLogTool) {
      case "daily-check-in": return <DailyHealthLog />;
      case "body-progress": return <DeferredHealthSection label="body progress" targetId="health-section-body"><BodyProgress /></DeferredHealthSection>;
      case "metrics": return <DeferredHealthSection label="health metrics" targetId="health-section-metrics"><HealthMetricsLedger /></DeferredHealthSection>;
      case "supplements": return <DeferredHealthSection label="supplement schedules" targetId="health-section-supplements"><SupplementSchedules /></DeferredHealthSection>;
      case "nutrition-diary": return <DeferredHealthSection label="nutrition diary" targetId="health-section-nutrition"><NutritionDiary importedFoodId={importedNutritionFoodId} onImportedFoodHandled={() => setImportedNutritionFoodId(null)} manualFoodRequest={manualNutritionFoodRequest} onManualFoodHandled={() => setManualNutritionFoodRequest(null)} /></DeferredHealthSection>;
      case "meal-planning": return <DeferredHealthSection label="meal planning" targetId="health-section-planning"><MealPlanner /></DeferredHealthSection>;
      case "ingredient-review": return <DeferredHealthSection label="ingredient scanner" targetId="health-section-ingredient-review"><IngredientScanner onCatalogFoodImported={setImportedNutritionFoodId} onManualFoodRequested={(name) => setManualNutritionFoodRequest({ name })} /></DeferredHealthSection>;
      case "grocery-intelligence": return <DeferredHealthSection label="grocery intelligence"><GroceryIntelligence /></DeferredHealthSection>;
      case "food-compass": return <DeferredHealthSection label="Food Compass local discovery" targetId="health-section-food-compass"><FoodCompass /></DeferredHealthSection>;
      case "exercise-library": return <DeferredHealthSection label="exercise library"><ExerciseLibrary /></DeferredHealthSection>;
      case "workout-log": return <DeferredHealthSection label="workout log" targetId="health-section-training"><WorkoutLog /></DeferredHealthSection>;
      case "training-programs": return <DeferredHealthSection label="training programs"><TrainingPrograms /></DeferredHealthSection>;
      case "sleep-log": return <DeferredHealthSection label="sleep records" targetId="health-section-sleep"><SleepLog /></DeferredHealthSection>;
      case "recovery-log": return <DeferredHealthSection label="recovery log" targetId="health-section-recovery"><RecoveryLog /></DeferredHealthSection>;
      case "recovery-routines": return <DeferredHealthSection label="recovery routines"><RecoveryRoutines /></DeferredHealthSection>;
      default: return null;
    }
  })();

  if (view === "log") {
    return (
      <div className="health-page mx-auto max-w-5xl py-8 px-4" data-testid="health-log-page">
        <div className="mb-6">
          <Link href="/chronilog" className="inline-flex items-center gap-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs rounded-md px-3 py-2 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Heart className="h-9 w-9 text-primary" />
              <div>
                <h1 className="text-3xl font-orbitron text-primary">Health Log</h1>
                <p className="mt-1 text-sm text-muted-foreground">Your private record of nourishment, movement, recovery, and health records.</p>
              </div>
            </div>
            <Link href="/health" className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary hover:bg-primary/20">View Health stats</Link>
          </div>
        </div>

        {activeHealthLogTool ? <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button type="button" onClick={() => setActiveHealthLogTool(null)} className="text-xs text-primary hover:underline">← Back to {healthLogSections.find((section) => section.id === activeHealthLogSection)?.title}</button><h2 className="mt-2 font-orbitron text-xl text-primary">{healthLogTools.find((tool) => tool.id === activeHealthLogTool)?.title}</h2></div><Link href="/tracker" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Explore in Tracker</Link></div>
          <OfflineHealthQueueStatus />
          {healthLogWorkspace}
        </> : activeHealthLogSection ? <>
          <div className="mb-5"><button type="button" onClick={() => setActiveHealthLogSection(null)} className="text-xs text-primary hover:underline">← All Health Log areas</button><h2 className="mt-2 font-orbitron text-xl text-primary">{healthLogSections.find((section) => section.id === activeHealthLogSection)?.title}</h2><p className="mt-1 text-sm text-muted-foreground">Choose a focused workspace. Charts and relationships remain in Tracker.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{healthLogTools.map((tool) => <button key={tool.id} type="button" onClick={() => setActiveHealthLogTool(tool.id)} className="rounded-xl border border-primary/15 bg-card/40 p-4 text-left transition-colors hover:border-primary/45 hover:bg-primary/5"><h3 className="text-sm font-medium text-foreground">{tool.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p><span className="mt-3 inline-block text-xs text-primary">Open →</span></button>)}</div>
        </> : <>
          <div className="grid gap-3 sm:grid-cols-2">{healthLogSections.map((section) => <button key={section.id} type="button" onClick={() => openHealthLogSection(section.id)} className="rounded-xl border border-primary/15 bg-card/40 p-5 text-left transition-colors hover:border-primary/45 hover:bg-primary/5"><h2 className="font-orbitron text-lg text-primary">{section.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.description}</p><span className="mt-4 inline-block text-xs text-primary">Open {section.title} →</span></button>)}</div>
          <section className="mt-6 rounded-xl border border-primary/15 bg-primary/5 p-4"><h2 className="font-orbitron text-base text-primary">System views and settings</h2><p className="mt-1 text-sm text-muted-foreground">Tracker shows patterns and progress. Profile owns health preferences, connected services, and data controls.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/tracker" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Open Tracker</Link><Link href="/profile#health-settings" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Health settings & privacy</Link></div></section>
        </>}
      </div>
    );
  }

  const recordedCheckIns = moodTrend.length;
  const averageMood = recordedCheckIns > 0 ? moodTrend.reduce((total: number, entry: { average?: number }) => total + (entry.average ?? 0), 0) / recordedCheckIns : null;

  // Health is deliberately a status surface. The workspaces that create and
  // correct records live in Health Log; Tracker owns cross-domain analysis.
  return (
    <div className="health-page mx-auto max-w-5xl px-4 py-8" data-testid="health-page">
      <div className="mb-6">
        <Link href="/profile" className="inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary/20 px-3 py-2 font-mono text-xs text-primary transition-colors hover:bg-primary/30">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heart className="h-9 w-9 text-primary" />
          <div><h1 className="font-orbitron text-3xl text-primary">Health</h1><p className="mt-1 text-sm text-muted-foreground">Current records and selected self-reported trends.</p></div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-muted/20 bg-background/40 p-1" aria-label="Health status period">
          {dayOptions.map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${days === d ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-primary"}`}>{d}d</button>)}
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="font-orbitron text-lg text-primary">Health status</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add, correct, or review entries in Health Log. Use Tracker for longer-term patterns and relationships; neither view makes a medical conclusion.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Link href="/health-log" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Open Health Log</Link><Link href="/tracker" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Open Tracker</Link></div>
      </section>

      <section className="glassmorphic mb-6 rounded-2xl border border-primary/30 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-orbitron text-lg text-primary"><Activity className="h-5 w-5" />Records progress</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Progress reflects the factual or self-reported records you choose to keep. It is not a health score, diagnosis, or prediction.</p></div><span className="font-mono text-2xl font-bold text-primary">{healthPct}%</span></div>
        <div className="mt-5 h-3 overflow-hidden rounded-full border border-muted/10 bg-muted/20"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${healthPct}%` }} /></div>
        <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground"><span>{recordedPractice ? `Level ${recordedPractice.rank.level} · ${recordedPractice.rank.name}` : "No record milestone yet"}</span><span>{recordedPractice?.nextRank ? `${Math.max(0, recordedPractice.nextRank.minimumXp - recordedPractice.practiceXp)} records to next milestone` : "Current milestone reached"}</span></div>
      </section>

      {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : <>
        <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Current health record summary">
          <div className="rounded-xl border border-primary/15 bg-card/40 p-4"><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Average self-report</p><p className="mt-2 font-mono text-2xl text-primary">{averageMood === null ? "—" : `${averageMood.toFixed(1)} / 10`}</p><p className="mt-1 text-xs text-muted-foreground">From the check-ins in this period</p></div>
          <div className="rounded-xl border border-primary/15 bg-card/40 p-4"><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Check-ins</p><p className="mt-2 font-mono text-2xl text-primary">{recordedCheckIns}</p><p className="mt-1 text-xs text-muted-foreground">Recorded in the last {days} days</p></div>
          <div className="rounded-xl border border-primary/15 bg-card/40 p-4"><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Sleep observations</p><p className="mt-2 font-mono text-2xl text-primary">{sleepWellnessDataQuality.coveragePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{sleepWellnessDataQuality.observations}/{sleepWellnessDataQuality.availableDays} complete days</p></div>
        </section>

        {moodTrend.length > 0 ? <section className="glassmorphic mb-6 rounded-2xl border border-primary/30 p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="flex items-center gap-2 font-orbitron text-lg text-primary"><TrendingUp className="h-5 w-5" />Self-reported state</h2><span className="font-mono text-xs text-muted-foreground">Past {days} days</span></div><p className="mt-1 text-sm text-muted-foreground">Mental, physical, and emotional check-ins are shown separately so a single average never hides the record.</p><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={moodTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 10]} /><Tooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid hsl(var(--primary) / 0.3)", borderRadius: 8 }} labelFormatter={(value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} /><Line type="monotone" dataKey="mental" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Mental" /><Line type="monotone" dataKey="physical" stroke="hsl(var(--primary) / 0.7)" strokeWidth={2} dot={false} name="Physical" /><Line type="monotone" dataKey="emotional" stroke="hsl(var(--primary) / 0.5)" strokeWidth={2} dot={false} name="Emotional" /></LineChart></ResponsiveContainer></div></section> : <section className="mb-6 rounded-xl border border-dashed border-primary/25 bg-card/30 p-5"><h2 className="font-orbitron text-lg text-primary">No self-reported trend yet</h2><p className="mt-1 text-sm text-muted-foreground">When you add a daily check-in in Health Log, the selected period will show the records here. Missing days remain missing.</p><Link href="/health-log" className="mt-3 inline-block text-xs text-primary hover:underline">Open daily check-in →</Link></section>}

        <section className="rounded-xl border border-primary/15 bg-card/40 p-4"><h2 className="font-orbitron text-base text-primary">Explore carefully</h2><p className="mt-1 text-sm text-muted-foreground">Tracker can compare your chosen records across time and domains, with coverage and uncertainty visible. It does not infer causation from a pattern.</p><Link href="/tracker" className="mt-3 inline-block text-xs text-primary hover:underline">Explore body analysis in Tracker →</Link></section>
      </>}
    </div>
  );

  /* Legacy Health status layout removed from the rendered app. */
  /*
  return (
    <div className="health-page mx-auto max-w-5xl py-8 px-4" data-testid="health-page">
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
          Health
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

      <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="font-orbitron text-lg text-primary">Health status</h2>
        <p className="mt-1 text-sm text-muted-foreground">A focused view of your current records and selected trends. Use Health Log to add or review records, and Tracker to explore patterns.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Link href="/health-log" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Open Health Log</Link><Link href="/tracker" className="rounded-md border border-primary/30 px-3 py-2 text-xs text-primary hover:bg-primary/10">Open Tracker</Link></div>
      </div>

      <div className="glassmorphic relative mb-8 overflow-hidden rounded-2xl border border-primary/30 p-8">
        <div className="absolute left-0 top-0 h-1 w-full bg-primary" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="font-orbitron text-lg mb-3 text-primary flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Recorded practice progression
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                  {recordedPractice?.practiceXp ?? 0}
                </span>
                <span className="text-2xl text-muted-foreground font-mono">XP</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {recordedPractice ? `Level ${recordedPractice.rank.level} · ${recordedPractice.rank.name}` : "Reconciling your recorded practice…"}
              </p>
              <p className="max-w-md text-xs text-muted-foreground mt-2">{recordedPractice?.disclosure || "Only factual or self-reported records you choose to save can earn practice XP. This is not a measurement, score, diagnosis, or prediction of your health."}</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="px-4 py-2 rounded-full border border-primary/30 bg-primary/20 font-mono text-sm font-semibold tracking-wider text-primary">
                {recordedPractice?.rank.name || "OBSERVER"}
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground text-xs">Badges:</span>
                  <span className="font-mono text-primary text-sm">{recordedPractice?.badges.length ?? 0}</span>
                </div>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground text-xs">Next:</span>
                  <span className="font-mono text-primary text-sm">{recordedPractice?.nextRank ? `${recordedPractice.nextRank.minimumXp - recordedPractice.practiceXp} XP` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 w-full bg-muted/20 h-4 rounded-full overflow-hidden border border-muted/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: `${healthPct}%` }}
            >
            </div>
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground font-mono">{recordedPractice?.rank.minimumXp ?? 0} XP</span>
            <span className="text-xs text-primary font-mono">{healthPct}%</span>
            <span className="text-xs text-muted-foreground font-mono">{recordedPractice?.nextRank ? `${recordedPractice.nextRank.minimumXp} XP` : "highest rank"}</span>
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
                        <span className={`text-lg font-mono font-bold ${metric.unavailable ? "text-muted-foreground" : "text-primary"}`}>
                          {metric.valueLabel ?? `${metric.score}%`}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden">
                      {!metric.unavailable && <div
                        className="h-full rounded-full transition-all duration-700 bg-primary"
                        style={{ width: `${metric.score}%` }}
                      />}
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
                {categoryEntries.map(([category, value]) => {
                  const count = categoryCount(value);
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

          {sleepWellnessDataQuality.observations > 0 && !sleepWellnessDataQuality.readyToExplore ? <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" role="status"><h2 className="font-orbitron text-lg text-primary flex items-center gap-2"><Heart className="h-5 w-5" />Sleep & daily-state observations</h2><p className="mt-2 text-sm text-muted-foreground">{sleepWellnessDataQuality.note}</p><p className="mt-1 text-xs text-muted-foreground">{sleepWellnessDataQuality.observations}/{sleepWellnessDataQuality.availableDays} complete days · {sleepWellnessDataQuality.coveragePercent}% coverage. Missing days remain missing.</p></div> : null}
          {data?.sleepWellnessCorrelation && sleepWellnessDataQuality.readyToExplore && data.sleepWellnessCorrelation.length > 0 && (
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 font-mono uppercase tracking-[0.08em] text-primary">{sleepWellnessDataQuality.level} data</span><span>{sleepWellnessDataQuality.observations}/{sleepWellnessDataQuality.availableDays} complete days · {sleepWellnessDataQuality.coveragePercent}% coverage</span></div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{sleepWellnessDataQuality.note} These are self-reported observations in your LyfeOS record, not a medical conclusion or evidence that sleep caused a change in mood. Use the private Trend Workbench below when you want a bounded association and uncertainty calculation.</p>
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
                  <span className="font-mono text-sm text-primary font-bold">{categoryEntries.length}</span>
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
  */
}
