import { useMemo, useState } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, ArrowLeft, Calendar, Clock, Bell, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Quest } from "@/lib/types";

interface DayData {
  dayKey: string;
  displayLabel: string;
  missions: Quest[];
}

interface MonthData {
  monthKey: string;
  monthName: string;
  monthNum: number;
  days: DayData[];
}

interface YearData {
  year: string;
  months: MonthData[];
}

function MissionCard({ mission }: { mission: Quest }) {
  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  const adjustedXp = Math.floor(mission.experienceReward * (difficultyMultipliers[mission.difficulty || 'D'] || 1));
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };
  const hasSchedule = mission.startDate || mission.startTime || mission.endDate || mission.endTime;
  
  return (
    <div className="glassmorphic rounded-xl p-4 hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition neon-border">
      <div className="flex items-start">
        <Checkbox 
          className="mt-1 rounded border border-primary/50 data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary"
          checked={true}
          disabled
        />
        <div className="ml-3 flex-grow">
          <div className="flex justify-between items-start">
            <div className="flex-grow">
              <h3 className="font-medium mb-1 text-muted-foreground line-through">
                {mission.title.replace(/^Onboarding:\s*/, '')}
                {mission.notificationEnabled && (
                  <Bell className="inline-block ml-2 h-3 w-3 text-primary opacity-70" />
                )}
              </h3>
              
              {hasSchedule && (
                <div className="flex flex-wrap items-center gap-2 text-xs mb-1 opacity-50">
                  {mission.startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(mission.startDate)}
                      {mission.startTime && (
                        <>
                          <Clock className="h-3 w-3 ml-1" />
                          {formatTime(mission.startTime)}
                        </>
                      )}
                    </span>
                  )}
                  {(mission.endDate || mission.endTime) && (
                    <>
                      <span className="text-primary">→</span>
                      <span className="flex items-center gap-1">
                        {mission.endDate && (
                          <>
                            <Calendar className="h-3 w-3" />
                            {formatDate(mission.endDate)}
                          </>
                        )}
                        {mission.endTime && (
                          <>
                            <Clock className="h-3 w-3 ml-1" />
                            {formatTime(mission.endTime)}
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-primary text-xs font-mono opacity-50">
                -{(((mission.energyCost ?? 0) / 1440) * 100).toFixed(1)}% ET
              </span>
              <span className="text-primary text-xs font-mono opacity-50">
                +{adjustedXp} XP
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm opacity-50">
            {mission.description?.replace(/^Completed onboarding mission "(.+)"$/, 'Completed the "$1" mission') || mission.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MissionArchivePage() {
  usePageTitle('Mission Log');

  const { quests } = useLYFEOS();
  const [, navigate] = useLocation();
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

  const hierarchicalData = useMemo((): YearData[] => {
    const yearMap: { [year: string]: { [monthKey: string]: { [dayKey: string]: Quest[] } } } = {};
    
    archivedMissions.forEach(mission => {
      const completedDate = new Date(mission.completedAt!);
      const year = completedDate.getFullYear().toString();
      const monthNum = completedDate.getMonth();
      const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
      const dayNum = completedDate.getDate();
      const dayKey = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      if (!yearMap[year]) {
        yearMap[year] = {};
      }
      if (!yearMap[year][monthKey]) {
        yearMap[year][monthKey] = {};
      }
      if (!yearMap[year][monthKey][dayKey]) {
        yearMap[year][monthKey][dayKey] = [];
      }
      yearMap[year][monthKey][dayKey].push(mission);
    });
    
    const years: YearData[] = Object.keys(yearMap)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .map(year => {
        const months: MonthData[] = Object.keys(yearMap[year])
          .sort((a, b) => b.localeCompare(a))
          .map(monthKey => {
            const monthNum = parseInt(monthKey.split('-')[1]) - 1;
            const monthName = new Date(parseInt(year), monthNum, 1).toLocaleDateString('en-US', { month: 'long' });
            
            const days: DayData[] = Object.keys(yearMap[year][monthKey])
              .sort((a, b) => b.localeCompare(a))
              .map(dayKey => {
                const [, , dayStr] = dayKey.split('-');
                const dayNum = parseInt(dayStr);
                const sampleDate = new Date(parseInt(year), monthNum, dayNum);
                const weekday = sampleDate.toLocaleDateString('en-US', { weekday: 'long' });
                const displayLabel = `${weekday}, ${monthName} ${dayNum}`;
                
                return {
                  dayKey,
                  displayLabel,
                  missions: yearMap[year][monthKey][dayKey]
                };
              });
            
            return {
              monthKey,
              monthName,
              monthNum,
              days
            };
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
      month.days.forEach(day => {
        count += day.missions.length;
      });
    });
    return count;
  };

  const countMissionsInMonth = (monthData: MonthData) => {
    let count = 0;
    monthData.days.forEach(day => {
      count += day.missions.length;
    });
    return count;
  };

  return (
    <>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Mission Log</h1>
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
                  <div className="glassmorphic rounded-xl p-4 cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition border border-primary/20">
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
                      <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
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
                            <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition border border-primary/15 bg-primary/5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isMonthExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-primary" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                  )}
                                  <h3 className="text-lg font-medium">{monthData.monthName}</h3>
                                </div>
                                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                                  {monthMissionCount} {monthMissionCount === 1 ? 'mission' : 'missions'}
                                </span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="ml-6 mt-2 space-y-2">
                              {monthData.days.map((dayData) => {
                                const isDayExpanded = expandedDays.has(dayData.dayKey);
                                
                                return (
                                  <Collapsible key={dayData.dayKey} open={isDayExpanded} onOpenChange={() => toggleDay(dayData.dayKey)}>
                                    <CollapsibleTrigger asChild>
                                      <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition border border-primary/10 bg-primary/3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            {isDayExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-primary" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-primary" />
                                            )}
                                            <h4 className="text-base">{dayData.displayLabel}</h4>
                                          </div>
                                          <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                                            {dayData.missions.length} {dayData.missions.length === 1 ? 'mission' : 'missions'}
                                          </span>
                                        </div>
                                      </div>
                                    </CollapsibleTrigger>
                                    
                                    <CollapsibleContent>
                                      <div className="ml-6 mt-2 space-y-2">
                                        {dayData.missions.map((mission) => (
                                          <MissionCard key={mission.id} mission={mission} />
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
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Archived Missions Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Complete missions to see them archived here. Missions completed today will appear here tomorrow.
          </p>
        </div>
      )}
    </>
  );
}
