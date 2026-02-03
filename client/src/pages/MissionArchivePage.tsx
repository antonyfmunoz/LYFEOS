import { useMemo, useState } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, ArrowLeft, Calendar, Clock, Bell, Eye, EyeOff, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Quest } from "@/lib/types";

const mockArchivedMissions: Quest[] = [
  {
    id: "mock-1",
    title: "Complete quarterly report",
    description: "Finish and submit the Q4 2025 financial report",
    category: "work",
    completed: true,
    completedAt: "2026-01-28T14:30:00.000Z",
    energyCost: 3,
    experienceReward: 50,
    startDate: "2026-01-28",
    startTime: "09:00",
    endDate: "2026-01-28",
    endTime: "14:00",
    notificationEnabled: true,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-2",
    title: "Morning workout routine",
    description: "45-minute cardio and strength training session",
    category: "health",
    completed: true,
    completedAt: "2026-01-28T07:45:00.000Z",
    energyCost: 2,
    experienceReward: 25,
    startDate: "2026-01-28",
    startTime: "06:00",
    endDate: null,
    endTime: null,
    notificationEnabled: false,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-3",
    title: "Review project proposals",
    description: "Evaluate and provide feedback on 3 new project proposals",
    category: "work",
    completed: true,
    completedAt: "2026-01-15T16:00:00.000Z",
    energyCost: 2,
    experienceReward: 30,
    startDate: "2026-01-15",
    startTime: "13:00",
    endDate: "2026-01-15",
    endTime: "16:00",
    notificationEnabled: true,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-4",
    title: "Weekly meal prep",
    description: "Prepare healthy meals for the upcoming week",
    category: "personal",
    completed: true,
    completedAt: "2026-01-15T12:30:00.000Z",
    energyCost: 2,
    experienceReward: 20,
    startDate: "2026-01-15",
    startTime: "10:00",
    endDate: null,
    endTime: null,
    notificationEnabled: false,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-5",
    title: "Year-end team celebration",
    description: "Organize and host the annual team celebration event",
    category: "work",
    completed: true,
    completedAt: "2025-12-20T18:00:00.000Z",
    energyCost: 4,
    experienceReward: 75,
    startDate: "2025-12-20",
    startTime: "15:00",
    endDate: "2025-12-20",
    endTime: "18:00",
    notificationEnabled: true,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-6",
    title: "Complete online certification",
    description: "Finish final exam for cloud architecture certification",
    category: "learning",
    completed: true,
    completedAt: "2025-12-20T11:30:00.000Z",
    energyCost: 3,
    experienceReward: 100,
    startDate: "2025-12-20",
    startTime: "09:00",
    endDate: "2025-12-20",
    endTime: "11:30",
    notificationEnabled: false,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-7",
    title: "Holiday shopping",
    description: "Buy gifts for family and friends",
    category: "personal",
    completed: true,
    completedAt: "2025-12-15T16:45:00.000Z",
    energyCost: 2,
    experienceReward: 15,
    startDate: "2025-12-15",
    startTime: "14:00",
    endDate: null,
    endTime: null,
    notificationEnabled: false,
    notificationTime: null,
    dueDate: null,
    notifications: []
  },
  {
    id: "mock-8",
    title: "Annual health checkup",
    description: "Complete yearly physical examination",
    category: "health",
    completed: true,
    completedAt: "2025-12-10T10:00:00.000Z",
    energyCost: 1,
    experienceReward: 20,
    startDate: "2025-12-10",
    startTime: "09:00",
    endDate: "2025-12-10",
    endTime: "10:00",
    notificationEnabled: true,
    notificationTime: null,
    dueDate: null,
    notifications: []
  }
];

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
                {mission.title}
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
              <span className="text-red-400 text-xs font-mono opacity-50">
                -{mission.energyCost} EP
              </span>
              <span className="text-primary text-xs font-mono opacity-50">
                +{mission.experienceReward} XP
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm opacity-50">
            {mission.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MissionArchivePage() {
  usePageTitle('Mission Archive');

  const { quests } = useLYFEOS();
  const [, navigate] = useLocation();
  const [showMockData, setShowMockData] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const archivedMissions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const realMissions = quests
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
    
    if (showMockData) {
      return [...realMissions, ...mockArchivedMissions].sort((a, b) => {
        const dateA = new Date(a.completedAt!);
        const dateB = new Date(b.completedAt!);
        return dateB.getTime() - dateA.getTime();
      });
    }
    
    return realMissions;
  }, [quests, showMockData]);

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
      
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Mission Archive</h1>
          <p className="text-[#7DAAB2]">Review your completed missions from previous days</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMockData(!showMockData)}
          className="flex items-center gap-2 text-xs border-primary/30 hover:bg-primary/10"
        >
          {showMockData ? (
            <>
              <EyeOff className="h-3 w-3" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Show Preview
            </>
          )}
        </Button>
      </div>
      
      {showMockData && (
        <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
          <span className="text-primary font-medium">Preview Mode:</span>{" "}
          <span className="text-[#7DAAB2]">Showing sample missions from January and December to demonstrate the archive layout.</span>
        </div>
      )}
      
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
