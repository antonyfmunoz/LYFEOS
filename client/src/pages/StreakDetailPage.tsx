import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import AIStatTip from "@/components/stats/AIStatTip";
import {
  ArrowLeft, Flame, Trophy, CheckCircle2, Calendar, Target,
  Zap, Star, Crown, Shield, Award, TrendingUp, Loader2,
  Repeat, Clock, BarChart3
} from "lucide-react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid
} from "recharts";

const MILESTONES = [
  { days: 3, title: "Spark Ignited", icon: Zap, reward: "+10 XP" },
  { days: 7, title: "Weekly Warrior", icon: Shield, reward: "+25 XP" },
  { days: 14, title: "Fortnightly Focus", icon: Target, reward: "+50 XP" },
  { days: 30, title: "Monthly Master", icon: Award, reward: "+100 XP" },
  { days: 60, title: "Dual Moon Champion", icon: Star, reward: "+250 XP" },
  { days: 100, title: "Century Club", icon: Crown, reward: "+500 XP" },
  { days: 200, title: "Legendary Grinder", icon: Trophy, reward: "+1000 XP" },
  { days: 365, title: "Annual Achiever", icon: Flame, reward: "+2000 XP" },
];

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getHeatColor(count: number): string {
  if (count === 0) return "bg-muted/20";
  if (count === 1) return "bg-primary/20";
  if (count === 2) return "bg-primary/40";
  if (count <= 4) return "bg-primary/60";
  return "bg-primary";
}

function getHeatBorder(count: number): string {
  if (count === 0) return "border-transparent";
  if (count === 1) return "border-primary/20";
  if (count === 2) return "border-primary/30";
  if (count <= 4) return "border-primary/40";
  return "border-primary/50";
}

function getStreakEmoji(streak: number): string {
  if (streak >= 365) return "LEGENDARY";
  if (streak >= 100) return "EPIC";
  if (streak >= 30) return "BLAZING";
  if (streak >= 7) return "ON FIRE";
  if (streak >= 3) return "WARMING UP";
  return "START";
}

function getStreakGlow(streak: number): string {
  if (streak >= 100) return "shadow-[0_0_60px_hsl(var(--primary)/0.4)]";
  if (streak >= 30) return "shadow-[0_0_40px_hsl(var(--primary)/0.3)]";
  if (streak >= 7) return "shadow-[0_0_30px_hsl(var(--primary)/0.25)]";
  if (streak >= 3) return "shadow-[0_0_20px_hsl(var(--primary)/0.2)]";
  return "shadow-[0_0_15px_hsl(var(--primary)/0.15)]";
}

export default function StreakDetailPage() {
  usePageTitle("Streaks - LYFEOS");
  const { user } = useAuth();
  const { stats } = useLYFEOS();
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const { data: streakData, isLoading } = useQuery<any>({
    queryKey: ["/api/streaks"],
    enabled: !!user,
    refetchOnMount: 'always',
  });

  const nextMilestone = useMemo(() => {
    return MILESTONES.find(m => stats.streakDays < m.days) || MILESTONES[MILESTONES.length - 1];
  }, [stats.streakDays]);

  const prevMilestone = useMemo(() => {
    const idx = MILESTONES.findIndex(m => stats.streakDays < m.days);
    return idx > 0 ? MILESTONES[idx - 1] : null;
  }, [stats.streakDays]);

  const progressPct = useMemo(() => {
    const from = prevMilestone?.days || 0;
    const to = nextMilestone.days;
    return Math.min(Math.round(((stats.streakDays - from) / (to - from)) * 100), 100);
  }, [stats.streakDays, nextMilestone, prevMilestone]);

  const heatmapWeeks = useMemo(() => {
    if (!streakData?.heatmap) return [];
    const days = streakData.heatmap as { date: string; count: number }[];
    const weeks: { date: string; count: number }[][] = [];
    let currentWeek: { date: string; count: number }[] = [];
    const firstDay = new Date(days[0]?.date + "T00:00:00");
    const startDow = firstDay.getDay();
    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ date: "", count: -1 });
    }
    for (const day of days) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push({ date: "", count: -1 });
      weeks.push(currentWeek);
    }
    return weeks;
  }, [streakData?.heatmap]);

  const monthMarkers = useMemo(() => {
    if (!streakData?.heatmap) return [];
    const days = streakData.heatmap as { date: string; count: number }[];
    const markers: { label: string; weekIndex: number }[] = [];
    let weekIdx = 0;
    const firstDay = new Date(days[0]?.date + "T00:00:00");
    const startDow = firstDay.getDay();
    let dayCounter = startDow;
    let lastMonth = -1;
    for (const day of days) {
      const month = new Date(day.date + "T00:00:00").getMonth();
      const currentWeekIdx = Math.floor(dayCounter / 7);
      if (month !== lastMonth) {
        markers.push({ label: MONTH_LABELS[month], weekIndex: currentWeekIdx });
        lastMonth = month;
      }
      dayCounter++;
    }
    return markers;
  }, [streakData?.heatmap]);

  const streakLevel = getStreakEmoji(stats.streakDays);
  const streakGlow = getStreakGlow(stats.streakDays);

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
          <Flame className="h-9 w-9 text-primary animate-pulse" />
          <Flame className="h-9 w-9 text-primary/50 absolute top-0 left-0 opacity-50 animate-pulse" style={{ animationDelay: "0.3s" }} />
        </div>
        <h1 className="text-3xl font-orbitron text-primary">
          Streak Tracker
        </h1>
      </div>

      <div className={`glassmorphic rounded-2xl p-8 mb-8 border border-primary/30 relative overflow-hidden ${streakGlow}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-xs font-mono uppercase tracking-widest text-primary mb-2">{streakLevel}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-orbitron font-bold text-primary leading-none">
                {stats.streakDays}
              </span>
              <span className="text-2xl text-muted-foreground font-mono">days</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Current login streak</p>
          </div>

          <div className="flex flex-col items-center gap-3 min-w-[200px]">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{prevMilestone?.title || "Start"}</span>
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-primary font-semibold">{nextMilestone.title}</span>
            </div>
            <div className="w-full bg-muted/30 h-3 rounded-full overflow-hidden border border-muted/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between w-full text-xs text-muted-foreground">
              <span>{prevMilestone?.days || 0} days</span>
              <span className="text-primary font-mono">{progressPct}%</span>
              <span>{nextMilestone.days} days</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {streakData && (
              <>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Trophy className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Best:</span>
                  <span className="font-mono text-primary">{streakData.longestStreak} days</span>
                </div>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Active:</span>
                  <span className="font-mono text-primary">{streakData.activeDays} days</span>
                </div>
                <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2 border border-muted/20">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Done:</span>
                  <span className="font-mono text-primary">{streakData.totalCompleted}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30 relative">
            <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Activity Heatmap
              <span className="text-xs text-muted-foreground font-mono ml-2">(past 365 days)</span>
            </h2>

            <div className="overflow-x-auto pb-2 relative" onMouseLeave={() => setHoveredDay(null)}>
              <div className="flex gap-px sm:gap-0.5">
                <div className="flex flex-col gap-px sm:gap-0.5 mr-1 text-[8px] sm:text-[10px] text-muted-foreground font-mono pt-4 sm:pt-5">
                  <div className="h-[10px] sm:h-[13px]"></div>
                  <div className="h-[10px] sm:h-[13px] flex items-center">Mon</div>
                  <div className="h-[10px] sm:h-[13px]"></div>
                  <div className="h-[10px] sm:h-[13px] flex items-center">Wed</div>
                  <div className="h-[10px] sm:h-[13px]"></div>
                  <div className="h-[10px] sm:h-[13px] flex items-center">Fri</div>
                  <div className="h-[10px] sm:h-[13px]"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex gap-px sm:gap-0.5 mb-1 text-[8px] sm:text-[10px] text-muted-foreground font-mono relative" style={{ height: '14px' }}>
                    {monthMarkers.map((m, i) => (
                      <div
                        key={i}
                        className="absolute whitespace-nowrap"
                        style={{ left: `${(m.weekIndex / (heatmapWeeks.length || 1)) * 100}%` }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-px sm:gap-0.5 relative">
                    {heatmapWeeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-px sm:gap-0.5">
                        {week.map((day, di) => (
                          <div
                            key={`${wi}-${di}`}
                            className={`w-[5px] h-[5px] sm:w-[10px] sm:h-[10px] md:w-[13px] md:h-[13px] rounded-[1px] sm:rounded-[2px] border transition-all duration-150 ${
                              day.count === -1
                                ? "opacity-0"
                                : `${getHeatColor(day.count)} ${getHeatBorder(day.count)} hover:ring-1 hover:ring-primary/50 cursor-pointer`
                            }`}
                            onMouseEnter={(e) => {
                              if (day.count !== -1) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const tooltipX = Math.min(rect.left, window.innerWidth - 200);
                                setHoveredDay({ date: day.date, count: day.count, x: tooltipX, y: rect.top });
                              }
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {hoveredDay && (
                <div
                  className="fixed z-50 bg-card/95 backdrop-blur border border-primary/30 rounded-lg px-3 py-2 shadow-xl pointer-events-none max-w-[200px]"
                  style={{ left: Math.min(hoveredDay.x, window.innerWidth - 210), top: hoveredDay.y - 50 }}
                >
                  <p className="text-xs text-muted-foreground">
                    {new Date(hoveredDay.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="text-sm font-mono text-primary">
                    {hoveredDay.count} mission{hoveredDay.count !== 1 ? "s" : ""} completed
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 5].map(n => (
                  <div key={n} className={`w-[10px] h-[10px] sm:w-[13px] sm:h-[13px] rounded-[2px] border ${getHeatColor(n)} ${getHeatBorder(n)}`} />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>

          {streakData?.weeklyActivity?.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Weekly Activity
                <span className="text-xs text-muted-foreground font-mono ml-2">(last 30 days)</span>
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={streakData.weeklyActivity} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid hsl(var(--primary) / 0.3)", borderRadius: 8 }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    itemStyle={{ color: "hsl(var(--primary))", fontSize: 13 }}
                  />
                  <Bar dataKey="missions" name="Missions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
            <h2 className="font-orbitron text-lg mb-6 text-primary flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Streak Milestones
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {MILESTONES.map((milestone) => {
                const achieved = stats.streakDays >= milestone.days;
                const Icon = milestone.icon;
                const isNext = milestone === nextMilestone && !achieved;
                return (
                  <div
                    key={milestone.days}
                    className={`relative rounded-xl p-4 border transition-all duration-300 ${
                      achieved
                        ? "border-primary/40 bg-primary/5"
                        : isNext
                        ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                        : "border-muted/30 bg-muted/5 opacity-60"
                    }`}
                  >
                    {achieved && (
                      <div className="absolute -top-2 -right-2">
                        <CheckCircle2 className="h-5 w-5 text-primary drop-shadow-lg" />
                      </div>
                    )}
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                        achieved ? "bg-gradient-to-br from-primary/30 to-primary/10" : "bg-muted/20"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${achieved ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <h3 className={`text-sm font-semibold mb-1 ${achieved ? "text-white" : "text-muted-foreground"}`}>
                      {milestone.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-2">{milestone.days} days</p>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                      achieved ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground"
                    }`}>
                      {milestone.reward}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {streakData?.habitStreaks?.length > 0 && (
            <div className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30">
              <h2 className="font-orbitron text-lg mb-4 text-primary flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                Habit Streaks
              </h2>
              <p className="text-sm text-muted-foreground mb-4">Track your recurring mission consistency</p>

              <div className="space-y-3">
                {streakData.habitStreaks.map((habit: any) => {
                  const streakPct = Math.min(habit.totalInstances > 0 ? Math.round((habit.totalCompleted / habit.totalInstances) * 100) : 0, 100);
                  return (
                    <div
                      key={habit.id}
                      className="flex items-center gap-4 p-4 rounded-xl border border-muted/20 bg-background/30 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex-shrink-0 relative">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          habit.currentStreak > 0 ? "bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30" : "bg-primary/10 border border-primary/20"
                        }`}>
                          {habit.currentStreak > 0 ? (
                            <Flame className="h-6 w-6 text-primary" />
                          ) : (
                            <Clock className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        {habit.currentStreak >= 3 && (
                          <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {habit.currentStreak}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-white truncate">{habit.title}</h3>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                            {habit.frequency}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{habit.totalCompleted}/{habit.totalInstances} done</span>
                          <span className="text-primary font-mono">{streakPct}%</span>
                        </div>
                        <div className="w-full bg-muted/20 h-1.5 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              habit.currentStreak > 0
                                ? "bg-primary"
                                : "bg-muted-foreground/30"
                            }`}
                            style={{ width: `${streakPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-mono font-bold ${habit.currentStreak > 0 ? "text-primary" : "text-muted-foreground"}`}>
                            {habit.currentStreak}
                          </span>
                          <span className="text-xs text-muted-foreground">day streak</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AIStatTip statType="streak" />
        </>
      )}
    </div>
  );
}
