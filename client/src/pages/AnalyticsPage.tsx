import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import {
  ArrowLeft, TrendingUp, Target, Brain, Zap, Heart,
  Calendar, Award, BarChart3, Activity, Flame, Loader2
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart,
  Cell, PieChart, Pie, Legend
} from "recharts";

const RANGE_OPTIONS = [
  { label: "7D", value: 7 },
  { label: "14D", value: 14 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  S: "#ef4444",
  A: "#f97316",
  B: "#eab308",
  C: "#22c55e",
  D: "#6366f1",
};

const CATEGORY_COLORS = [
  "#00e0ff", "#8b5cf6", "#f97316", "#22c55e", "#ef4444",
  "#eab308", "#ec4899", "#06b6d4", "#14b8a6", "#a855f7",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{formatDate(label)}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  usePageTitle("Analytics - LYFEOS");
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: [`/api/analytics?days=${days}`],
    enabled: !!user,
  });

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const { moodTrends, missionCompletionTrend, categoryStats, difficultyStats, summary } = analytics;

  const categoryData = Object.entries(categoryStats as Record<string, any>).map(([name, data], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    total: data.total,
    completed: data.completed,
    completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    xp: data.totalXp,
    energy: data.totalEnergy,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const difficultyData = Object.entries(difficultyStats as Record<string, any>)
    .sort((a, b) => {
      const order = ["S", "A", "B", "C", "D"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([rank, data]) => ({
      rank,
      total: data.total,
      completed: data.completed,
      completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      fill: DIFFICULTY_COLORS[rank] || "#6366f1",
    }));

  const radarData = categoryData.map(c => ({
    category: c.name,
    completion: c.completionRate,
    missions: Math.min(c.total * 10, 100),
  }));

  const cumulativeXp = missionCompletionTrend.reduce((acc: any[], day: any, i: number) => {
    const prev = i > 0 ? acc[i - 1].cumXp : 0;
    acc.push({ ...day, cumXp: prev + day.xpEarned });
    return acc;
  }, []);

  return (
    <div className="mx-auto max-w-6xl py-8 px-4">
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <BarChart3 className="h-8 w-8 mr-3 text-primary" />
          <h1 className="text-3xl font-orbitron">Analytics</h1>
        </div>
        <div className="flex gap-1 bg-card/30 backdrop-blur border border-primary/20 rounded-lg p-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard icon={<Target className="h-5 w-5" />} label="Missions Done" value={summary.completedMissions} sub={`of ${summary.totalMissions}`} />
        <SummaryCard icon={<Award className="h-5 w-5" />} label="XP Earned" value={summary.totalXpEarned.toLocaleString()} sub={`Level ${summary.currentLevel}`} />
        <SummaryCard icon={<Flame className="h-5 w-5" />} label="Streak" value={`${summary.currentStreak}d`} sub="consecutive" />
        <SummaryCard icon={<Brain className="h-5 w-5" />} label="Avg Mood" value={summary.avgMoodScore} sub={`${summary.daysTracked} days tracked`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Mood Trends" icon={<Activity className="h-5 w-5" />}>
          {moodTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={moodTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltipContent />} />
                <Line type="monotone" dataKey="mental" stroke="#6366f1" strokeWidth={2} dot={false} name="Mental" />
                <Line type="monotone" dataKey="physical" stroke="#22c55e" strokeWidth={2} dot={false} name="Physical" />
                <Line type="monotone" dataKey="emotional" stroke="#f97316" strokeWidth={2} dot={false} name="Emotional" />
                <Line type="monotone" dataKey="average" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} name="Average" strokeDasharray="5 5" />
                <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No mood data yet. Complete daily check-ins to see trends." />}
        </ChartCard>

        <ChartCard title="XP Progression" icon={<TrendingUp className="h-5 w-5" />}>
          {cumulativeXp.some((d: any) => d.cumXp > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={cumulativeXp}>
                <defs>
                  <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltipContent />} />
                <Area type="monotone" dataKey="cumXp" stroke="hsl(var(--primary))" fill="url(#xpGradient)" strokeWidth={2} name="Cumulative XP" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No XP data yet. Complete missions to track progression." />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Daily Mission Completions" icon={<Target className="h-5 w-5" />}>
          {missionCompletionTrend.some((d: any) => d.completed > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={missionCompletionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltipContent />} />
                <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Completed" opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No completed missions yet. Start completing missions to see trends." />}
        </ChartCard>

        <ChartCard title="Category Balance" icon={<BarChart3 className="h-5 w-5" />}>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="hsl(var(--muted))" opacity={0.3} />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Completion %" dataKey="completion" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No category data yet. Create missions across different categories." />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Difficulty Distribution" icon={<Zap className="h-5 w-5" />}>
          {difficultyData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie
                    data={difficultyData}
                    dataKey="total"
                    nameKey="rank"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {difficultyData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {difficultyData.map(d => (
                  <div key={d.rank} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-sm font-medium">Rank {d.rank}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-muted-foreground">{d.completed}/{d.total}</span>
                      <span className="text-xs text-primary ml-2">({d.completionRate}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState message="No mission data yet." />}
        </ChartCard>

        <ChartCard title="Category Breakdown" icon={<Calendar className="h-5 w-5" />}>
          {categoryData.length > 0 ? (
            <div className="space-y-4">
              {categoryData.map(cat => (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.fill }} />
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{cat.completed}/{cat.total} missions</span>
                      <span className="text-primary font-medium">{cat.completionRate}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${cat.completionRate}%`, backgroundColor: cat.fill }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No category data yet." />}
        </ChartCard>
      </div>

      <ChartCard title="Completion Rate" icon={<Heart className="h-5 w-5" />}>
        <div className="flex items-center justify-center py-6">
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" opacity="0.2" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${summary.completionRate * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-mono font-bold text-primary">{summary.completionRate}%</span>
              <span className="text-xs text-muted-foreground mt-1">overall</span>
            </div>
          </div>
          <div className="ml-10 space-y-4">
            <StatRow label="Total Missions" value={summary.totalMissions} />
            <StatRow label="Completed" value={summary.completedMissions} />
            <StatRow label="In Progress" value={summary.totalMissions - summary.completedMissions} />
            <StatRow label="Total XP Earned" value={summary.totalXpEarned.toLocaleString()} />
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: any; sub: string }) {
  return (
    <div className="glassmorphic rounded-xl p-4 border border-primary/20 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 text-primary mb-2">{icon}<span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span></div>
      <div className="text-2xl font-mono font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glassmorphic rounded-xl p-6 border border-primary/20">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary">{icon}</span>
        <h2 className="font-orbitron text-lg text-primary">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[200px]">
      <p className="text-sm text-muted-foreground text-center max-w-xs">{message}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between gap-8">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}
