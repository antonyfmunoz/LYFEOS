import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  ArrowLeft, TrendingUp, Target, Brain, Zap, Heart,
  Calendar, Award, BarChart3, Activity, Flame, Loader2,
  Trophy, Crown, Shield, GripVertical
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart,
  Cell, PieChart, Pie, Legend, ScatterChart, Scatter
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

function GenericTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
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

  type AnalyticsWidgetMeta = {
    id: string;
    title: string;
    icon: React.ReactNode;
  };

  const [analyticsWidgets, setAnalyticsWidgets] = useState<AnalyticsWidgetMeta[]>([
    { id: 'mood-xp', title: 'Mood & XP Trends', icon: <Activity className="h-5 w-5 text-primary" /> },
    { id: 'missions-categories', title: 'Missions & Categories', icon: <Target className="h-5 w-5 text-primary" /> },
    { id: 'difficulty-breakdown', title: 'Difficulty & Breakdown', icon: <Zap className="h-5 w-5 text-primary" /> },
    { id: 'completion-rate', title: 'Completion Rate', icon: <Heart className="h-5 w-5 text-primary" /> },
    { id: 'activity-heatmap', title: 'Activity Heatmap', icon: <Activity className="h-5 w-5 text-primary" /> },
    { id: 'weekly-patterns', title: 'Weekly Patterns', icon: <BarChart3 className="h-5 w-5 text-primary" /> },
    { id: 'token-wellness', title: 'Token & Wellness', icon: <Zap className="h-5 w-5 text-primary" /> },
    { id: 'personal-records', title: 'Personal Records', icon: <Trophy className="h-5 w-5 text-primary" /> },
  ]);

  const { data: widgetLayouts } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/widget-layouts'],
    enabled: !!user,
  });

  useEffect(() => {
    if (!widgetLayouts?.analytics) return;
    const savedOrder = widgetLayouts.analytics;
    setAnalyticsWidgets(prev => {
      const ordered: AnalyticsWidgetMeta[] = [];
      for (const id of savedOrder) {
        const widget = prev.find(w => w.id === id);
        if (widget) ordered.push(widget);
      }
      for (const widget of prev) {
        if (!ordered.find(w => w.id === widget.id)) ordered.push(widget);
      }
      if (ordered.every((w, i) => w.id === prev[i]?.id)) return prev;
      return ordered;
    });
  }, [widgetLayouts]);

  const analyticsWidgetsRef = useRef(analyticsWidgets);
  analyticsWidgetsRef.current = analyticsWidgets;

  const moveAnalyticsWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    const prev = analyticsWidgetsRef.current;
    const newWidgets = update(prev, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, prev[dragIndex]],
      ],
    });
    setAnalyticsWidgets(newWidgets);
    analyticsWidgetsRef.current = newWidgets;
    const newOrder = newWidgets.map(w => w.id);
    apiRequest('/api/widget-layouts', {
      method: 'PUT',
      body: JSON.stringify({ page: 'analytics', order: newOrder }),
    }).catch(() => {});
    queryClient.setQueryData<Record<string, string[]>>(['/api/widget-layouts'], (old) => ({
      ...old,
      analytics: newOrder,
    }));
  }, []);

  const moodTrends = analytics?.moodTrends ?? [];
  const missionCompletionTrend = analytics?.missionCompletionTrend ?? [];
  const categoryStats = analytics?.categoryStats ?? {};
  const difficultyStats = analytics?.difficultyStats ?? {};
  const summary = analytics?.summary ?? {};
  const weeklyPatterns = analytics?.weeklyPatterns ?? [];
  const streakHistory = analytics?.streakHistory ?? [];
  const personalRecords = analytics?.personalRecords ?? {};
  const tokenEfficiency = analytics?.tokenEfficiency ?? [];
  const sleepWellnessCorrelation = analytics?.sleepWellnessCorrelation ?? [];

  const categoryData = useMemo(() => Object.entries(categoryStats as Record<string, any>).map(([name, data], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    total: data.total,
    completed: data.completed,
    completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    xp: data.totalXp,
    energy: data.totalEnergy,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  })), [categoryStats]);

  const difficultyData = useMemo(() => Object.entries(difficultyStats as Record<string, any>)
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
    })), [difficultyStats]);

  const radarData = useMemo(() => categoryData.map(c => ({
    category: c.name,
    completion: c.completionRate,
    missions: Math.min(c.total * 10, 100),
  })), [categoryData]);

  const cumulativeXp = useMemo(() => missionCompletionTrend.reduce((acc: any[], day: any, i: number) => {
    const prev = i > 0 ? acc[i - 1].cumXp : 0;
    acc.push({ ...day, cumXp: prev + day.xpEarned });
    return acc;
  }, []), [missionCompletionTrend]);

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

  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'mood-xp':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        );
      case 'missions-categories':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        );
      case 'difficulty-breakdown':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        );
      case 'completion-rate':
        return (
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
        );
      case 'activity-heatmap':
        if (!streakHistory) return null;
        return <ActivityHeatmap streakHistory={streakHistory} />;
      case 'weekly-patterns':
        if (!weeklyPatterns) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Weekly Productivity" icon={<BarChart3 className="h-5 w-5" />}>
              {weeklyPatterns.some((d: any) => d.missions > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={weeklyPatterns}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<GenericTooltip />} />
                    <Bar dataKey="missions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Missions" opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState message="No weekly pattern data yet." />}
            </ChartCard>
            <ChartCard title="Weekly XP Distribution" icon={<Award className="h-5 w-5" />}>
              {weeklyPatterns.some((d: any) => d.xp > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={weeklyPatterns} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="hsl(var(--muted))" opacity={0.3} />
                    <PolarAngleAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <Radar name="XP" dataKey="xp" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : <EmptyState message="No XP data yet." />}
            </ChartCard>
          </div>
        );
      case 'token-wellness':
        if (!tokenEfficiency) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Token Efficiency" icon={<Zap className="h-5 w-5" />}>
              <div className="flex items-center justify-center py-6">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" opacity="0.2" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${tokenEfficiency.efficiency * 2.64} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-mono font-bold text-primary">{tokenEfficiency.efficiency}%</span>
                    <span className="text-xs text-muted-foreground mt-1">efficiency</span>
                  </div>
                </div>
                <div className="ml-10 space-y-4">
                  <StatRow label="Total Energy" value={tokenEfficiency.totalEnergyCost.toLocaleString()} />
                  <StatRow label="Completed Energy" value={tokenEfficiency.completedEnergyCost.toLocaleString()} />
                  <StatRow label="Efficiency" value={`${tokenEfficiency.efficiency}%`} />
                </div>
              </div>
            </ChartCard>
            {sleepWellnessCorrelation && sleepWellnessCorrelation.length > 0 ? (
              <ChartCard title="Sleep & Wellness" icon={<Heart className="h-5 w-5" />}>
                <ResponsiveContainer width="100%" height={250}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                    <XAxis dataKey="sleepHours" name="Sleep Hours" type="number" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Sleep Hours", position: "insideBottom", offset: -5, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }} />
                    <YAxis dataKey="mood" name="Mood" type="number" domain={[0, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Mood", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }} />
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
                    <Scatter data={sleepWellnessCorrelation} fill="hsl(var(--primary))" fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            ) : (
              <ChartCard title="Sleep & Wellness" icon={<Heart className="h-5 w-5" />}>
                <EmptyState message="No sleep & wellness data yet. Log your sleep and mood in daily check-ins." />
              </ChartCard>
            )}
          </div>
        );
      case 'personal-records':
        if (!personalRecords) return null;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <RecordCard
              icon={<Trophy className="h-6 w-6" />}
              label="Best Day"
              value={`${personalRecords.bestDayMissions} missions`}
              sub={personalRecords.bestDayDate ? formatDate(personalRecords.bestDayDate) : "—"}
            />
            <RecordCard
              icon={<Crown className="h-6 w-6" />}
              label="Best XP Day"
              value={`${personalRecords.bestDayXp.toLocaleString()} XP`}
              sub="single day record"
            />
            <RecordCard
              icon={<Flame className="h-6 w-6" />}
              label="Longest Streak"
              value={`${personalRecords.longestStreak} days`}
              sub="consecutive active"
            />
            <RecordCard
              icon={<Shield className="h-6 w-6" />}
              label="Highest Rank"
              value={personalRecords.highestDifficulty ? `Rank ${personalRecords.highestDifficulty}` : "—"}
              sub="completed"
            />
            <RecordCard
              icon={<Calendar className="h-6 w-6" />}
              label="Active Days"
              value={`${personalRecords.totalDaysActive}`}
              sub="days with completions"
            />
          </div>
        );
      default:
        return null;
    }
  };

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

      <div className="space-y-6">
        {analyticsWidgets.map((widget, index) => {
          const content = renderWidgetContent(widget.id);
          if (!content) return null;
          return (
            <CollapsibleWidget
              key={widget.id}
              id={widget.id}
              index={index}
              title={widget.title}
              icon={widget.icon}
              moveWidget={moveAnalyticsWidget}
            >
              {content}
            </CollapsibleWidget>
          );
        })}
      </div>
    </div>
  );
}

function ActivityHeatmap({ streakHistory }: { streakHistory: { date: string; count: number }[] }) {
  const { weeks, monthLabels } = useMemo(() => {
    if (!streakHistory || streakHistory.length === 0) return { weeks: [], monthLabels: [] };

    const sorted = [...streakHistory].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = new Date(sorted[0].date + "T00:00:00");
    const startDow = firstDate.getDay();

    const cells: { date: string; count: number; dow: number }[] = [];
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: "", count: -1, dow: i });
    }
    sorted.forEach(d => {
      const dt = new Date(d.date + "T00:00:00");
      cells.push({ date: d.date, count: d.count, dow: dt.getDay() });
    });

    const wks: { date: string; count: number; dow: number }[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      wks.push(cells.slice(i, i + 7));
    }
    while (wks.length > 0 && wks[wks.length - 1].length < 7) {
      const last = wks[wks.length - 1];
      while (last.length < 7) last.push({ date: "", count: -1, dow: last.length });
    }

    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = "";
    wks.forEach((week, wi) => {
      const validDay = week.find(d => d.date);
      if (validDay) {
        const dt = new Date(validDay.date + "T00:00:00");
        const month = dt.toLocaleDateString("en-US", { month: "short" });
        if (month !== lastMonth) {
          labels.push({ label: month, weekIndex: wi });
          lastMonth = month;
        }
      }
    });

    return { weeks: wks, monthLabels: labels };
  }, [streakHistory]);

  if (weeks.length === 0) return null;

  function getColor(count: number): string {
    if (count < 0) return "transparent";
    if (count === 0) return "hsl(var(--muted) / 0.2)";
    if (count <= 2) return "hsl(var(--primary) / 0.3)";
    if (count <= 4) return "hsl(var(--primary) / 0.6)";
    return "hsl(var(--primary) / 0.9)";
  }

  return (
    <div className="glassmorphic rounded-xl p-6 border border-primary/20 mb-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="font-orbitron text-lg text-primary">Activity Heatmap</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="flex gap-0.5 mb-1 ml-8">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground"
                style={{ position: "relative", left: `${m.weekIndex * 14}px` }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="flex gap-0.5">
            <div className="flex flex-col gap-0.5 mr-1">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} className="w-6 h-[12px] text-[9px] text-muted-foreground flex items-center justify-end pr-1">{i % 2 === 1 ? d : ""}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className="w-[12px] h-[12px] rounded-[2px] transition-colors"
                    style={{ backgroundColor: getColor(day.count) }}
                    title={day.date ? `${day.date}: ${day.count} missions` : ""}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-3 ml-8">
            <span className="text-[10px] text-muted-foreground mr-1">Less</span>
            {[0, 1, 3, 5].map((v, i) => (
              <div key={i} className="w-[12px] h-[12px] rounded-[2px]" style={{ backgroundColor: getColor(v) }} />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="glassmorphic rounded-xl p-4 border border-primary/20 hover:border-primary/40 transition-colors text-center">
      <div className="flex justify-center text-primary mb-2">{icon}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-mono font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
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
