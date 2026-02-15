import { useMemo, useState } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { useAuth } from "@/lib/authContext";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Calendar, Clock, Bell, ChevronRight, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Quest } from "@/lib/types";

const ONBOARDING_MISSIONS = [
  { title: "Access & Quickstart", description: "Log in, explore the dashboard, and complete your first quick mission to get familiar with LYFEOS." },
  { title: "Archetype Calibration", description: "Discover your player archetype through a guided assessment to personalize your LYFEOS experience." },
  { title: "Identity & Direction", description: "Define your core identity pillars and set your life direction compass." },
  { title: "Craft & Mastery", description: "Identify your key skills and craft areas to track mastery progression." },
  { title: "Capacity & Constraints", description: "Set your daily energy, attention, and time capacity limits for balanced resource management." },
  { title: "Baselines & States", description: "Establish your baseline stats and current life state for accurate tracking." },
  { title: "History & Roots", description: "Record your background and personal history to inform your growth trajectory." },
  { title: "Systems & Rituals", description: "Set up your daily rituals and recurring systems for consistent progress." },
];

const categoryDescriptions: Record<string, string> = {
  work: 'Professional tasks, projects, and job-related responsibilities.',
  health: 'Medical care, wellness checkups, and overall well-being.',
  fitness: 'Exercise, workouts, physical training, and movement goals.',
  finance: 'Budgeting, saving, investing, and money management.',
  learning: 'Education, studying, courses, and skill development.',
  creative: 'Art, music, writing, design, and creative expression.',
  social: 'Relationships, events, gatherings, and interpersonal connections.',
  personal: 'Self-care, errands, and individual life management.',
  mindset: 'Mental health, meditation, mindfulness, and inner growth.',
  career: 'Long-term professional growth, networking, and advancement.',
  nutrition: 'Meal planning, diet, cooking, and food choices.',
  recovery: 'Rest, rehabilitation, stress relief, and recharging.',
  planning: 'Strategy, organization, scheduling, and goal-setting.',
  spiritual: 'Faith, purpose, reflection, and spiritual practices.',
  household: 'Home maintenance, cleaning, chores, and living space.',
  event: 'Scheduled occasions, celebrations, and milestone events.',
};

interface DayData {
  dayKey: string;
  displayLabel: string;
  missions: Quest[];
}

interface WeekData {
  weekKey: string;
  weekLabel: string;
  weekNum: number;
  days: DayData[];
}

interface MonthData {
  monthKey: string;
  monthName: string;
  monthNum: number;
  weeks: WeekData[];
}

interface YearData {
  year: string;
  months: MonthData[];
}

function getWeekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstDay.getDay();
  return Math.ceil((date.getDate() + firstDayOfWeek) / 7);
}

interface VisionGoalOption { id: number; category: string; title: string; }
const categoryLabelsMap: Record<string, string> = { legacy: "Legacy", "10year": "10-Year", "5year": "5-Year", "18month": "18-Month", "90day": "90-Day" };

function MissionCard({ mission, visionGoals }: { mission: Quest; visionGoals: VisionGoalOption[] }) {
  const [showDescription, setShowDescription] = useState(false);
  const { title, description, energyCost, attentionCost, timeCost, experienceReward, startDate, startTime, endDate, endTime, notificationEnabled, difficulty, category, visionGoalId } = mission;
  const linkedObjective = visionGoalId ? visionGoals.find(g => g.id === visionGoalId) : null;
  
  const difficultyStyle = "bg-primary/20 border-primary/50 text-primary";
  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  const xpMultiplier = difficultyMultipliers[difficulty || 'D'] || 1;
  const adjustedXp = Math.floor(experienceReward * xpMultiplier);

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };
  const hasSchedule = startDate || startTime || endDate || endTime;
  
  return (
    <div className="glassmorphic rounded-xl p-4 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border">
      <div className="flex-grow">
        <div className="flex justify-between items-start">
          <h3 className="font-medium text-muted-foreground line-through">
            {title.replace(/^Onboarding:\s*/, '')}
            {notificationEnabled && (
              <Bell className="inline-block ml-2 h-3 w-3 text-primary opacity-70" />
            )}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {category && category !== "general" && category !== "onboarding" && (
              <span className={`text-[10px] font-mono h-6 px-1.5 inline-flex items-center justify-center rounded border ${difficultyStyle} opacity-50 capitalize`}>
                {category}
              </span>
            )}
            <span className={`text-[10px] font-mono h-6 w-6 inline-flex items-center justify-center rounded border ${difficultyStyle} opacity-50`}>
              {difficulty || 'D'}
            </span>
            <button
              className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowDescription(!showDescription);
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap opacity-50">
          <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((energyCost ?? 0) / 1440) * 100).toFixed(1)}% ET</span>
          <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((attentionCost ?? 0) / 1440) * 100).toFixed(1)}% AT</span>
          <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((timeCost ?? 0) / 1440) * 100).toFixed(1)}% TT</span>
          <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
        </div>
        {hasSchedule && (
          <div className="flex items-center gap-1 text-xs mt-1 flex-wrap text-muted-foreground opacity-50">
            {startDate && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                {formatDate(startDate)}
              </span>
            )}
            {startTime && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Clock className="h-3 w-3 flex-shrink-0" />
                {formatTime(startTime)}
              </span>
            )}
            {(endDate || endTime) && (
              <span className="text-primary flex-shrink-0">→</span>
            )}
            {endDate && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                {formatDate(endDate)}
              </span>
            )}
            {endTime && (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Clock className="h-3 w-3 flex-shrink-0" />
                {formatTime(endTime)}
              </span>
            )}
          </div>
        )}
        {showDescription && (
          <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5 opacity-50">
            {description && (
              <p className="text-muted-foreground text-xs">
                <span className="text-primary font-mono">Mission Description:</span> {category === 'onboarding'
                  ? (ONBOARDING_MISSIONS.find(m => m.title === title.replace(/^Onboarding:\s*/, ''))?.description || description)
                  : description}
              </p>
            )}
            {linkedObjective && (
              <p className="text-muted-foreground text-xs">
                <span className="text-primary font-mono">Mission Objective — {categoryLabelsMap[linkedObjective.category] || linkedObjective.category} Vision:</span> {linkedObjective.title}
              </p>
            )}
            {category && category !== "general" && category !== "onboarding" && (
              <p className="text-muted-foreground text-xs">
                <span className="text-primary font-mono">Mission Type — <span className="capitalize">{category}</span>:</span> {
                  categoryDescriptions[category] || 'Auto-classified mission category.'
                }
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              <span className="text-primary font-mono">Mission Difficulty — Rank {difficulty || 'D'}:</span> {
                (difficulty || 'D') === 'S' ? 'Extreme effort. Multi-day or life-changing.' :
                (difficulty || 'D') === 'A' ? 'High effort. Significant commitment.' :
                (difficulty || 'D') === 'B' ? 'Moderate effort. Requires focus and planning.' :
                (difficulty || 'D') === 'C' ? 'Light effort. Simple but requires attention.' :
                'Minimal effort. Quick and easy.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MissionArchivePage() {
  usePageTitle('Missions');

  const { quests } = useLYFEOS();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: allVisionGoals = [] } = useQuery<VisionGoalOption[]>({
    queryKey: ['/api/vision-goals/all'],
    enabled: !!user,
  });
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const archivedMissions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return quests
      .filter(quest => {
        if (!quest.completed || !quest.completedAt) return false;
        const completedDate = new Date(quest.completedAt);
        completedDate.setHours(0, 0, 0, 0);
        return completedDate < today;
      })
      .sort((a, b) => {
        const dateA = new Date(a.completedAt!);
        const dateB = new Date(b.completedAt!);
        return dateB.getTime() - dateA.getTime();
      });
  }, [quests]);

  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const hierarchicalData = useMemo((): YearData[] => {
    const yearMap: { [year: string]: { [monthKey: string]: { [weekKey: string]: { [dayKey: string]: Quest[] } } } } = {};
    
    archivedMissions.forEach(mission => {
      const completedDate = new Date(mission.completedAt!);
      const year = completedDate.getFullYear().toString();
      const monthNum = completedDate.getMonth();
      const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
      const dayNum = completedDate.getDate();
      const dayKey = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const weekNum = getWeekOfMonth(completedDate);
      const weekKey = `${monthKey}-W${weekNum}`;
      
      if (!yearMap[year]) yearMap[year] = {};
      if (!yearMap[year][monthKey]) yearMap[year][monthKey] = {};
      if (!yearMap[year][monthKey][weekKey]) yearMap[year][monthKey][weekKey] = {};
      if (!yearMap[year][monthKey][weekKey][dayKey]) yearMap[year][monthKey][weekKey][dayKey] = [];
      yearMap[year][monthKey][weekKey][dayKey].push(mission);
    });
    
    const years: YearData[] = Object.keys(yearMap)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .map(year => {
        const months: MonthData[] = Object.keys(yearMap[year])
          .sort((a, b) => b.localeCompare(a))
          .map(monthKey => {
            const monthNum = parseInt(monthKey.split('-')[1]) - 1;
            const monthName = new Date(parseInt(year), monthNum, 1).toLocaleDateString('en-US', { month: 'long' });
            
            const weeks: WeekData[] = Object.keys(yearMap[year][monthKey])
              .sort((a, b) => b.localeCompare(a))
              .map(weekKey => {
                const weekNum = parseInt(weekKey.split('-W')[1]);
                const days: DayData[] = Object.keys(yearMap[year][monthKey][weekKey])
                  .sort((a, b) => b.localeCompare(a))
                  .map(dayKey => {
                    const [, , dayStr] = dayKey.split('-');
                    const dayNum = parseInt(dayStr);
                    const sampleDate = new Date(parseInt(year), monthNum, dayNum);
                    const weekday = sampleDate.toLocaleDateString('en-US', { weekday: 'long' });
                    const displayLabel = `${weekday}, ${monthName} ${dayNum}`;
                    return { dayKey, displayLabel, missions: yearMap[year][monthKey][weekKey][dayKey] };
                  });
                return { weekKey, weekLabel: `Week ${weekNum}`, weekNum, days };
              });
            
            return { monthKey, monthName, monthNum, weeks };
          });
        
        return { year, months };
      });
    
    return years;
  }, [archivedMissions]);

  const toggleYear = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekKey)) {
        next.delete(weekKey);
      } else {
        next.add(weekKey);
      }
      return next;
    });
  };

  const toggleDay = (dayKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  const countMissionsInYear = (yearData: YearData) => {
    let count = 0;
    yearData.months.forEach(month => {
      month.weeks.forEach(week => {
        week.days.forEach(day => {
          count += day.missions.length;
        });
      });
    });
    return count;
  };

  const countMissionsInMonth = (monthData: MonthData) => {
    let count = 0;
    monthData.weeks.forEach(week => {
      week.days.forEach(day => {
        count += day.missions.length;
      });
    });
    return count;
  };

  const countMissionsInWeek = (weekData: WeekData) => {
    let count = 0;
    weekData.days.forEach(day => {
      count += day.missions.length;
    });
    return count;
  };

  return (
    <div className="pb-20">
      <div className="mb-4">
        <Button 
          variant="ghost" 
          className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Missions</h1>
        <p className="text-[#7DAAB2]">Review your completed missions from previous days</p>
      </div>
      
      {hierarchicalData.length > 0 ? (
        <div className="space-y-3">
          {hierarchicalData.map((yearData) => {
            const isYearExpanded = expandedYears.has(yearData.year);
            const yearMissionCount = countMissionsInYear(yearData);
            
            return (
              <Collapsible key={yearData.year} open={isYearExpanded} onOpenChange={() => toggleYear(yearData.year)}>
                <CollapsibleTrigger asChild>
                  <div className="glassmorphic rounded-xl p-4 cursor-pointer hover:shadow-[0_0_5px_var(--primary-glow-light)] transition border border-primary/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isYearExpanded ? (
                          <ChevronDown className="h-5 w-5 text-primary" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-primary" />
                        )}
                        <Calendar className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-orbitron">{yearData.year}</h2>
                      </div>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {yearMissionCount} {yearMissionCount === 1 ? 'mission' : 'missions'}
                      </span>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    {yearData.months.map((monthData) => {
                      const isMonthExpanded = expandedMonths.has(monthData.monthKey);
                      const monthMissionCount = countMissionsInMonth(monthData);
                      
                      return (
                        <Collapsible key={monthData.monthKey} open={isMonthExpanded} onOpenChange={() => toggleMonth(monthData.monthKey)}>
                          <CollapsibleTrigger asChild>
                            <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_var(--primary-glow-light)] transition border border-primary/15 bg-primary/5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isMonthExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-primary" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                  )}
                                  <h3 className="text-lg font-medium">{monthData.monthName}</h3>
                                </div>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                  {monthMissionCount} {monthMissionCount === 1 ? 'mission' : 'missions'}
                                </span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="ml-6 mt-2 space-y-2">
                              {monthData.weeks.map((weekData) => {
                                const isWeekExpanded = expandedWeeks.has(weekData.weekKey);
                                const weekMissionCount = countMissionsInWeek(weekData);
                                
                                return (
                                  <Collapsible key={weekData.weekKey} open={isWeekExpanded} onOpenChange={() => toggleWeek(weekData.weekKey)}>
                                    <CollapsibleTrigger asChild>
                                      <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_var(--primary-glow-light)] transition border border-primary/10 bg-primary/3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            {isWeekExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-primary" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-primary" />
                                            )}
                                            <h4 className="text-base">{weekData.weekLabel}</h4>
                                          </div>
                                          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                            {weekMissionCount} {weekMissionCount === 1 ? 'mission' : 'missions'}
                                          </span>
                                        </div>
                                      </div>
                                    </CollapsibleTrigger>
                                    
                                    <CollapsibleContent>
                                      <div className="ml-6 mt-2 space-y-2">
                                        {weekData.days.map((dayData) => {
                                          const isDayExpanded = expandedDays.has(dayData.dayKey);
                                          
                                          return (
                                            <Collapsible key={dayData.dayKey} open={isDayExpanded} onOpenChange={() => toggleDay(dayData.dayKey)}>
                                              <CollapsibleTrigger asChild>
                                                <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_var(--primary-glow-light)] transition border border-primary/5 bg-primary/2">
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                      {isDayExpanded ? (
                                                        <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                                      ) : (
                                                        <ChevronRight className="h-3.5 w-3.5 text-primary" />
                                                      )}
                                                      <h5 className="text-sm">{dayData.displayLabel}</h5>
                                                    </div>
                                                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                      {dayData.missions.length} {dayData.missions.length === 1 ? 'mission' : 'missions'}
                                                    </span>
                                                  </div>
                                                </div>
                                              </CollapsibleTrigger>
                                              
                                              <CollapsibleContent>
                                                <div className="ml-6 mt-2 space-y-2">
                                                  {dayData.missions.map((mission) => (
                                                    <MissionCard key={mission.id} mission={mission} visionGoals={allVisionGoals} />
                                                  ))}
                                                </div>
                                              </CollapsibleContent>
                                            </Collapsible>
                                          );
                                        })}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Archived Missions Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Complete missions to see them archived here. Missions completed today will appear here tomorrow.
          </p>
        </div>
      )}
    </div>
  );
}
