import { useState } from "react";
import { useLYFEOS } from "@/lib/context";
import { StatType } from "@/lib/types";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import { ArrowLeft, Clock, Zap, Lightbulb, TrendingUp, TrendingDown, Loader2, BrainCircuit, Target, Award } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface StatDetailPageProps {
  stat: StatType;
}

const STAT_CONFIGS = {
  energy: {
    title: "Energy Points",
    icon: Zap,
    color: "#F97316",
    statKey: "energyPoints" as const,
  },
  time: {
    title: "Time Tokens",
    icon: Clock,
    color: "#22D3EE",
    statKey: "timeTokens" as const,
  },
  attention: {
    title: "Attention Tokens",
    icon: BrainCircuit,
    color: "#6366F1",
    statKey: "attentionTokens" as const,
  },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  D: "#60a5fa",
  C: "#34d399",
  B: "#fbbf24",
  A: "#f97316",
  S: "#ef4444",
};

const DIFFICULTY_ORDER = ["D", "C", "B", "A", "S"];

const DAY_OPTIONS = [7, 14, 30, 90];

export default function StatDetailPage({ stat }: StatDetailPageProps) {
  const [days, setDays] = useState(30);
  const { stats } = useLYFEOS();
  const { user } = useAuth();

  const config = STAT_CONFIGS[stat as keyof typeof STAT_CONFIGS];
  if (!config) return null;

  const Icon = config.icon;
  const statValues = stats[config.statKey];
  const current = statValues.current;
  const max = statValues.max;
  const percentage = max > 0 ? (current / max) * 100 : 0;

  usePageTitle(config.title);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/stat-analytics?days=${days}`],
    enabled: !!user,
  });

  const summary = data?.summary || {};
  const energyTrend = data?.energyTrend || [];
  const tokenUtilization = data?.tokenUtilization || [];
  const difficultyBreakdown = data?.difficultyBreakdown || {};
  const categoryStats = data?.categoryStats || {};
  const weekdayPatterns = data?.weekdayPatterns || [];
  const topMissions = data?.topMissions || [];

  const statusLabel = percentage > 70 ? "OPTIMAL" : percentage > 30 ? "MODERATE" : "LOW";
  const statusBg = percentage > 70 ? "bg-emerald-500/20" : percentage > 30 ? "bg-amber-500/20" : "bg-red-500/20";
  const statusText = percentage > 70 ? "text-emerald-400" : percentage > 30 ? "text-amber-400" : "text-red-400";

  const gradientId = `stat-gradient-${stat}`;
  const barGradientId = `bar-gradient-${stat}`;

  const avgEnergy = summary.totalMissions > 0
    ? Math.round((summary.totalEnergySpent || 0) / summary.totalMissions)
    : 0;

  const tips = stat === "energy"
    ? [
        { title: "Energy Cycling", desc: `You average ${avgEnergy} EP per mission. Schedule demanding tasks during peak hours.` },
        { title: "Strategic Recovery", desc: "Take 10-minute breaks between high-cost missions to regenerate energy faster." },
        { title: "Batch Low-Cost Tasks", desc: "Group D-rank missions together to preserve energy for harder challenges." },
        { title: "Streak Power", desc: `${summary.currentStreak || 0}-day streak active. Consistent effort compounds energy efficiency over time.` },
      ]
    : stat === "time"
    ? [
        { title: "Time Blocking", desc: `With ${current}/${max} tokens remaining, allocate blocks for deep work sessions.` },
        { title: "Pomodoro Method", desc: "Work in focused 25-minute intervals with 5-minute breaks for optimal token usage." },
        { title: "Priority Stacking", desc: "Complete high-value missions first when your time pool is fullest." },
        { title: "Daily Cadence", desc: `${summary.currentStreak || 0}-day streak. Consistent daily mission completion optimizes time allocation.` },
      ]
    : [
        { title: "Single-Tasking", desc: `Averaging ${avgEnergy} AT per mission. Focus fully on one task before switching.` },
        { title: "Digital Minimalism", desc: "Eliminate notifications during focus sessions to preserve attention tokens." },
        { title: "Context Switching", desc: "Each task switch costs 2-3 attention tokens. Batch similar work together." },
        { title: "Focus Streaks", desc: `${summary.currentStreak || 0}-day streak active. Sustained focus builds stronger attention capacity.` },
      ];

  const maxCategoryEnergy = Math.max(
    ...Object.values(categoryStats).map((c: any) => c.totalEnergy || 0),
    1
  );

  const sortedMissions = [...topMissions].sort((a: any, b: any) => (b.energy || 0) - (a.energy || 0)).slice(0, 8);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/dashboard" className="mr-3 inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
          <h1 className="text-2xl font-orbitron" style={{ color: config.color }}>{config.title}</h1>
        </div>
        <div className="flex items-center gap-1 bg-background/40 rounded-lg border border-primary/20 p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                days === d
                  ? "text-white font-semibold"
                  : "text-muted-foreground hover:text-white"
              }`}
              style={days === d ? { backgroundColor: `${config.color}33`, color: config.color } : {}}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${config.color}08, transparent, ${config.color}05)` }} />
        <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${config.color}, ${config.color}66)` }} />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${config.color}20` }}>
              <Icon className="w-8 h-8" style={{ color: config.color }} />
            </div>
            <div className="flex-1">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <h2 className="text-4xl font-orbitron font-bold">
                    {stat === "time" ? (
                      <>{current}<span className="text-lg text-muted-foreground">/{max}</span></>
                    ) : (
                      <>{Math.round(percentage)}<span className="text-lg text-muted-foreground">%</span></>
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stat === "energy" ? "Current cognitive capacity" : stat === "time" ? "Unallocated time remaining" : "Focus allocation capacity"}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-md text-xs font-mono ${statusBg} ${statusText}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden bg-muted/30">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${percentage}%`, background: `linear-gradient(90deg, ${config.color}, ${config.color}aa)` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-primary/20">
          <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
            <Target className="h-4 w-4" style={{ color: config.color }} />
            <div>
              <p className="text-xs text-muted-foreground">Total Missions</p>
              <p className="font-mono text-white text-sm">{summary.totalMissions || 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
            <Zap className="h-4 w-4" style={{ color: config.color }} />
            <div>
              <p className="text-xs text-muted-foreground">Energy Spent</p>
              <p className="font-mono text-white text-sm">{summary.totalEnergySpent || 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
            <TrendingUp className="h-4 w-4" style={{ color: config.color }} />
            <div>
              <p className="text-xs text-muted-foreground">Streak</p>
              <p className="font-mono text-white text-sm">{summary.currentStreak || 0} days</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: config.color }} />
        </div>
      ) : (
        <>
          {energyTrend.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 flex items-center gap-2" style={{ color: config.color }}>
                <TrendingUp className="h-5 w-5" />
                Token Usage Trend
                <span className="text-xs text-muted-foreground font-mono ml-2">({days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={energyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={config.color} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: `1px solid ${config.color}44`, borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    itemStyle={{ color: config.color, fontSize: 13 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="energyUsed"
                    name="Tokens Used"
                    stroke={config.color}
                    fill={`url(#${gradientId})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {tokenUtilization.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 flex items-center gap-2" style={{ color: config.color }}>
                <Award className="h-5 w-5" />
                Token Utilization
                <span className="text-xs text-muted-foreground font-mono ml-2">({days} days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tokenUtilization} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id={barGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.color} />
                      <stop offset="100%" stopColor={`${config.color}88`} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: `1px solid ${config.color}44`, borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                  />
                  <Bar dataKey="used" name="Used" stackId="a" fill={`url(#${barGradientId})`} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" name="Remaining" stackId="a" fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {Object.keys(difficultyBreakdown).length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-6 flex items-center gap-2" style={{ color: config.color }}>
                <Target className="h-5 w-5" />
                Mission Cost by Difficulty
              </h2>
              <div className="space-y-4">
                {DIFFICULTY_ORDER.filter((rank) => difficultyBreakdown[rank]).map((rank) => {
                  const d = difficultyBreakdown[rank];
                  const pct = d.total > 0 ? (d.completed / d.total) * 100 : 0;
                  return (
                    <div key={rank} className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-orbitron font-bold text-sm border"
                        style={{ borderColor: `${DIFFICULTY_COLORS[rank]}44`, backgroundColor: `${DIFFICULTY_COLORS[rank]}15`, color: DIFFICULTY_COLORS[rank] }}
                      >
                        {rank}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">{d.completed}/{d.total} completed</span>
                          <span className="text-xs font-mono" style={{ color: DIFFICULTY_COLORS[rank] }}>{d.totalXp} XP</span>
                        </div>
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-muted/20">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: DIFFICULTY_COLORS[rank] }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(categoryStats).length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-6 flex items-center gap-2" style={{ color: config.color }}>
                <Award className="h-5 w-5" />
                Category Breakdown
              </h2>
              <div className="space-y-3">
                {Object.entries(categoryStats)
                  .sort(([, a]: any, [, b]: any) => (b.totalEnergy || 0) - (a.totalEnergy || 0))
                  .map(([category, data]: [string, any]) => {
                    const barWidth = maxCategoryEnergy > 0 ? ((data.totalEnergy || 0) / maxCategoryEnergy) * 100 : 0;
                    return (
                      <div key={category} className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground w-28 truncate capitalize">{category}</span>
                        <div className="flex-1 h-6 rounded-md overflow-hidden bg-muted/15 relative">
                          <div
                            className="h-full rounded-md transition-all duration-700 flex items-center px-2"
                            style={{ width: `${Math.max(barWidth, 5)}%`, backgroundColor: `${config.color}44` }}
                          >
                            <span className="text-[10px] font-mono text-white whitespace-nowrap">
                              {data.totalEnergy} cost · {data.completed}/{data.total}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-mono w-14 text-right" style={{ color: config.color }}>{data.totalXp} XP</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {weekdayPatterns.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 flex items-center gap-2" style={{ color: config.color }}>
                <Clock className="h-5 w-5" />
                Weekday Patterns
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekdayPatterns} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: `1px solid ${config.color}44`, borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    itemStyle={{ color: config.color, fontSize: 13 }}
                  />
                  <Bar
                    dataKey={stat === "energy" ? "energy" : "missions"}
                    name={stat === "energy" ? "Energy" : "Missions"}
                    fill={config.color}
                    radius={[4, 4, 0, 0]}
                    opacity={0.85}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {sortedMissions.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 flex items-center gap-2" style={{ color: config.color }}>
                <TrendingDown className="h-5 w-5" />
                Top Missions by Cost
              </h2>
              <div className="space-y-2">
                {sortedMissions.map((mission: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-xl border border-muted/20 bg-background/30 hover:border-primary/30 transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-orbitron text-xs font-bold border"
                      style={{
                        borderColor: `${DIFFICULTY_COLORS[mission.difficulty] || config.color}44`,
                        backgroundColor: `${DIFFICULTY_COLORS[mission.difficulty] || config.color}15`,
                        color: DIFFICULTY_COLORS[mission.difficulty] || config.color,
                      }}
                    >
                      {mission.difficulty || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{mission.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{mission.category || "general"}</span>
                        {mission.completedAt && (
                          <>
                            <span>·</span>
                            <span>{new Date(mission.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="font-mono text-sm font-bold" style={{ color: config.color }}>{mission.energy}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">XP</p>
                        <p className="font-mono text-sm text-emerald-400">{mission.xp}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-xl font-orbitron mb-4" style={{ color: config.color }}>
              {stat === "energy" ? "Energy Recovery Tips" : stat === "time" ? "Time Management Tips" : "Focus Enhancement Tips"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tips.map((tip, i) => (
                <div key={i} className="glassmorphic rounded-2xl p-4 border border-primary/30">
                  <div className="flex items-start">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${config.color}20` }}
                    >
                      <Lightbulb className="w-4 h-4" style={{ color: config.color }} />
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">{tip.title}</h3>
                      <p className="text-sm text-muted-foreground">{tip.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AIStatTip statType={stat} />
        </>
      )}
    </>
  );
}
