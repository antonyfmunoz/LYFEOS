import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  ArrowLeft, TrendingUp, Target, Zap,
  Calendar, Award, BarChart3, Activity, Flame, Loader2,
  Trophy, Crown, Shield, GripVertical, Milestone
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
        <p key={i} className="text-sm text-primary">
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
        <p key={i} className="text-sm text-primary">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  usePageTitle("Tracker - LYFEOS");
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ['/api/analytics', days],
    queryFn: () => fetch(`/api/analytics?days=${days}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!user,
  });

  const { data: visionGoals } = useQuery<any[]>({
    queryKey: ['/api/vision-goals/all'],
    enabled: !!user,
  });

  type AnalyticsWidgetMeta = {
    id: string;
    title: string;
    icon: ReactNode;
  };

  const [analyticsWidgets, setAnalyticsWidgets] = useState<AnalyticsWidgetMeta[]>([
    { id: 'xp-progression', title: 'XP Progression', icon: <TrendingUp className="h-5 w-5 text-primary" /> },
    { id: 'missions-categories', title: 'Missions & Categories', icon: <Target className="h-5 w-5 text-primary" /> },
    { id: 'difficulty-breakdown', title: 'Difficulty & Breakdown', icon: <Zap className="h-5 w-5 text-primary" /> },
    { id: 'completion-rate', title: 'Completion Rate', icon: <Target className="h-5 w-5 text-primary" /> },
    { id: 'activity-heatmap', title: 'Activity Heatmap', icon: <Activity className="h-5 w-5 text-primary" /> },
    { id: 'weekly-patterns', title: 'Weekly Patterns', icon: <BarChart3 className="h-5 w-5 text-primary" /> },
    { id: 'personal-records', title: 'Personal Records', icon: <Trophy className="h-5 w-5 text-primary" /> },
    { id: 'milestone-analytics', title: 'Objective Analytics', icon: <Milestone className="h-5 w-5 text-primary" /> },
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

  const missionCompletionTrend = analytics?.missionCompletionTrend ?? [];
  const categoryStats = analytics?.categoryStats ?? {};
  const difficultyStats = analytics?.difficultyStats ?? {};
  const summary = analytics?.summary ?? {};
  const weeklyPatterns = analytics?.weeklyPatterns ?? [];
  const streakHistory = analytics?.streakHistory ?? [];
  const personalRecords = analytics?.personalRecords ?? {};
  const tokenEfficiency = analytics?.tokenEfficiency ?? {};

  const categoryData = useMemo(() => Object.entries(categoryStats as Record<string, any>).map(([name, data], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    total: data.total,
    completed: data.completed,
    completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    xp: data.totalXp,
    energy: data.totalEnergy,
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
          <p className="text-muted-foreground">Loading tracker...</p>
        </div>
      </div>
    );
  }

  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'xp-progression':
        return (
          <ChartCard title="XP Progression" icon={<TrendingUp className="h-5 w-5" />}>
            {cumulativeXp.some((d: any) => d.cumXp > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={cumulativeXp}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<CustomTooltipContent />} />
                  <Area type="monotone" dataKey="cumXp" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="Cumulative XP" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState message="No XP data yet. Complete missions to track progression." />}
          </ChartCard>
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
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={220} className="sm:max-w-[50%]">
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
                          <Cell key={i} fill="hsl(var(--primary))" />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3 w-full">
                    {difficultyData.map((d, i) => (
                      <div key={d.rank} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary" />
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
                  {categoryData.map((cat, i) => (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <span className="font-medium">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{cat.completed}/{cat.total} missions</span>
                          <span className="text-primary font-medium">{cat.completionRate}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted/30 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${cat.completionRate}%` }}
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
          <div className="flex flex-col sm:flex-row items-center justify-center py-6 gap-8">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" opacity="0.2" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(summary.completionRate || 0) * 2.64} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-mono font-bold text-primary">{summary.completionRate || 0}%</span>
                <span className="text-xs text-muted-foreground mt-1">overall</span>
              </div>
            </div>
            <div className="space-y-4">
              <StatRow label="Total Missions" value={summary.totalMissions || 0} />
              <StatRow label="Completed" value={summary.completedMissions || 0} />
              <StatRow label="In Progress" value={(summary.totalMissions || 0) - (summary.completedMissions || 0)} />
              <StatRow label="Total XP Earned" value={(summary.totalXpEarned || 0).toLocaleString()} />
            </div>
          </div>
        );
      case 'activity-heatmap':
        if (!streakHistory || streakHistory.length === 0) return null;
        return <ActivityHeatmap streakHistory={streakHistory} />;
      case 'weekly-patterns':
        if (!weeklyPatterns || weeklyPatterns.length === 0) return null;
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
      case 'personal-records':
        if (!personalRecords) return null;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <RecordCard
              icon={<Trophy className="h-6 w-6" />}
              label="Best Day"
              value={`${personalRecords.bestDayMissions || 0} missions`}
              sub={personalRecords.bestDayDate ? formatDate(personalRecords.bestDayDate) : "—"}
            />
            <RecordCard
              icon={<Crown className="h-6 w-6" />}
              label="Best XP Day"
              value={`${(personalRecords.bestDayXp || 0).toLocaleString()} XP`}
              sub="single day record"
            />
            <RecordCard
              icon={<Flame className="h-6 w-6" />}
              label="Longest Streak"
              value={`${personalRecords.longestStreak || 0} days`}
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
              value={`${personalRecords.totalDaysActive || 0}`}
              sub="days with completions"
            />
          </div>
        );
      case 'milestone-analytics': {
        const goals = visionGoals ?? [];
        if (goals.length === 0) return <EmptyState message="No mission objectives yet. Create vision objectives to see analytics." />;
        const categories = ['legacy', '10year', '5year', '18month', '90day'];
        const categoryLabels: Record<string, string> = { legacy: 'Legacy', '10year': '10 Year', '5year': '5 Year', '18month': '18 Month', '90day': '90 Day' };
        const mileCategoryData = categories.map(cat => {
          const catGoals = goals.filter((g: any) => g.category === cat);
          const completed = catGoals.filter((g: any) => g.completed).length;
          return { category: categoryLabels[cat], total: catGoals.length, completed, rate: catGoals.length > 0 ? Math.round((completed / catGoals.length) * 100) : 0 };
        }).filter(c => c.total > 0);

        const totalGoals = goals.length;
        const completedGoals = goals.filter((g: any) => g.completed).length;
        const overallRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

        const recentCompleted = goals
          .filter((g: any) => g.completed && g.completedAt)
          .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
          .slice(0, 5);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Objective Progress" icon={<Milestone className="h-5 w-5" />}>
              <div className="space-y-1 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall completion</span>
                  <span className="text-primary font-mono font-semibold">{completedGoals}/{totalGoals} ({overallRate}%)</span>
                </div>
                <div className="w-full bg-muted/30 h-3 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${overallRate}%` }} />
                </div>
              </div>
              <div className="space-y-3">
                {mileCategoryData.map(cat => (
                  <div key={cat.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{cat.category}</span>
                      <span className="font-mono text-foreground/80">{cat.completed}/{cat.total}</span>
                    </div>
                    <div className="w-full bg-muted/20 h-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${cat.rate}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {mileCategoryData.length > 0 && (
                <ResponsiveContainer width="100%" height={200} className="mt-4">
                  <BarChart data={mileCategoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltipContent />} />
                    <Bar dataKey="total" fill="hsl(var(--muted))" opacity={0.4} radius={[4, 4, 0, 0]} name="Total" />
                    <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Completed" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
            <ChartCard title="Recent Completions" icon={<Trophy className="h-5 w-5" />}>
              {recentCompleted.length > 0 ? (
                <div className="space-y-3">
                  {recentCompleted.map((g: any) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg border border-primary/10 bg-primary/5">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Trophy className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.title}</p>
                        <p className="text-xs text-muted-foreground">{categoryLabels[g.category] || g.category}</p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {new Date(g.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No mission objectives completed yet. Keep working toward your goals!" />
              )}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-background/50 border border-muted/20">
                  <p className="text-2xl font-mono font-bold text-primary">{totalGoals}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/50 border border-muted/20">
                  <p className="text-2xl font-mono font-bold text-primary">{completedGoals}</p>
                  <p className="text-xs text-muted-foreground">Done</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/50 border border-muted/20">
                  <p className="text-2xl font-mono font-bold text-primary">{totalGoals - completedGoals}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </ChartCard>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <Link href="/chronilog" className="inline-flex items-center gap-2 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs rounded-md px-3 py-2 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4" data-tour="tracker-header">
        <div className="flex items-center">
          <BarChart3 className="h-8 w-8 mr-3 text-white" />
          <h1 className="text-3xl font-orbitron text-white">Tracker</h1>
        </div>
        <div className="flex items-center gap-2" data-tour="tracker-period">
          <span className="text-sm text-muted-foreground font-mono">Period:</span>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border ${
                  days === opt.value
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-background/40 border-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-tour="tracker-summary">
        <SummaryCard icon={<Target className="h-5 w-5" />} label="Missions Done" value={summary.completedMissions || 0} sub={`of ${summary.totalMissions || 0}`} />
        <SummaryCard icon={<Award className="h-5 w-5" />} label="XP Earned" value={(summary.totalXpEarned || 0).toLocaleString()} sub={`Level ${summary.currentLevel || 1}`} />
        <SummaryCard icon={<Flame className="h-5 w-5" />} label="Streak" value={`${summary.currentStreak || 0}d`} sub="consecutive" />
        <SummaryCard icon={<Zap className="h-5 w-5" />} label="Efficiency" value={`${tokenEfficiency.efficiency || 0}%`} sub="token usage" />
      </div>

      <div className="space-y-6" data-tour="tracker-widgets">
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
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
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
  );
}

function RecordCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="glassmorphic rounded-xl p-4 border border-primary/20 hover:border-primary/40 transition-colors text-center">
      <div className="flex justify-center text-primary mb-2">{icon}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-mono font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: any; sub: string }) {
  return (
    <div className="glassmorphic rounded-xl p-4 border border-primary/20 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 text-primary mb-2">{icon}<span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span></div>
      <div className="text-2xl font-mono font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glassmorphic rounded-xl p-4 sm:p-6 border border-primary/20">
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
      <span className="text-sm font-mono font-medium text-primary">{value}</span>
    </div>
  );
}
