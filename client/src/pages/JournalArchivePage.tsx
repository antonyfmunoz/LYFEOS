import { useState, useMemo } from 'react';
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Archive, Calendar, ChevronDown, ChevronRight, ArrowLeft, Sun, Moon, Brain, Heart, Zap, BookOpen, Target, Lightbulb, CheckCircle, AlertCircle, GraduationCap, Search, FileText, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLocalDateString } from "@/lib/utils";

interface DailyLog {
  id: number;
  userId: number;
  date: string;
  wakeTime: string | null;
  sleepTime: string | null;
  mentalState: number | null;
  physicalState: number | null;
  emotionalState: number | null;
  gratitude: string | null;
  tomorrowGoals: string | null;
  annualGoals: string | null;
  thoughts: string | null;
  contentConsumed: string | null;
  research: string | null;
  researchNote: string | null;
  revisionNote: string | null;
  executionNote: string | null;
  todoIdeas: string | null;
  wentWell: string | null;
  couldBeBetter: string | null;
  learned: string | null;
  createdAt: string;
}

interface DayData {
  dayKey: string;
  displayLabel: string;
  log: DailyLog;
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

function LogCard({ log }: { log: DailyLog }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatTime12Hour = (time: string | null) => {
    if (!time) return '--:--';
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const hasContent = (log: DailyLog) => {
    return log.wakeTime || log.sleepTime || log.mentalState || log.physicalState || 
           log.emotionalState || log.gratitude || log.tomorrowGoals || log.annualGoals ||
           log.thoughts || log.contentConsumed || log.research || log.researchNote || log.revisionNote || log.executionNote || log.todoIdeas ||
           log.wentWell || log.couldBeBetter || log.learned;
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div className="glassmorphic rounded-xl p-3 cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition border border-primary/10 bg-primary/3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-primary" />
              )}
              <div>
                <h4 className="text-base">
                  {parseLocalDate(log.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h4>
                <div className="flex items-center gap-4 text-xs text-[#7DAAB2] mt-1">
                  <span className="flex items-center gap-1">
                    <Sun className="h-3 w-3" /> {formatTime12Hour(log.wakeTime)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Moon className="h-3 w-3" /> {formatTime12Hour(log.sleepTime)}
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <Brain className="h-3 w-3" /> {log.mentalState ?? '-'}/10
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <Zap className="h-3 w-3" /> {log.physicalState ?? '-'}/10
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    <Heart className="h-3 w-3" /> {log.emotionalState ?? '-'}/10
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="ml-6 mt-2 p-4 glassmorphic rounded-xl border border-primary/10 space-y-4 bg-background/30">
          {(log.gratitude || log.tomorrowGoals || log.annualGoals) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                <Target className="h-4 w-4" /> Daily Intentions
              </h4>
              {log.gratitude && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Gratitude</p>
                  <p className="text-sm whitespace-pre-wrap">{log.gratitude}</p>
                </div>
              )}
              {log.tomorrowGoals && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Tomorrow's Goals</p>
                  <p className="text-sm whitespace-pre-wrap">{log.tomorrowGoals}</p>
                </div>
              )}
              {log.annualGoals && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Annual Goals</p>
                  <p className="text-sm whitespace-pre-wrap">{log.annualGoals}</p>
                </div>
              )}
            </div>
          )}
          
          {(log.thoughts || log.contentConsumed || log.research || log.todoIdeas) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Daily Data & Thoughts
              </h4>
              {log.thoughts && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Thoughts</p>
                  <p className="text-sm whitespace-pre-wrap">{log.thoughts}</p>
                </div>
              )}
              {log.contentConsumed && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Information Consumed</p>
                  <p className="text-sm whitespace-pre-wrap">{log.contentConsumed}</p>
                </div>
              )}
              {log.research && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Research</p>
                  <p className="text-sm whitespace-pre-wrap">{log.research}</p>
                </div>
              )}
              {log.todoIdeas && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Todo Ideas</p>
                  <p className="text-sm whitespace-pre-wrap">{log.todoIdeas}</p>
                </div>
              )}
            </div>
          )}
          
          {(log.researchNote || log.revisionNote || log.executionNote) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                <Search className="h-4 w-4" /> Daily Research Log
              </h4>
              {log.researchNote && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Research Note</p>
                  <p className="text-sm whitespace-pre-wrap">{log.researchNote}</p>
                </div>
              )}
              {log.revisionNote && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Revision & Summary Note</p>
                  <p className="text-sm whitespace-pre-wrap">{log.revisionNote}</p>
                </div>
              )}
              {log.executionNote && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1">Execution Note</p>
                  <p className="text-sm whitespace-pre-wrap">{log.executionNote}</p>
                </div>
              )}
            </div>
          )}
          
          {(log.wentWell || log.couldBeBetter || log.learned) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                <Lightbulb className="h-4 w-4" /> Daily Reflection
              </h4>
              {log.wentWell && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-400" /> What Went Well
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{log.wentWell}</p>
                </div>
              )}
              {log.couldBeBetter && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-400" /> Could Be Better
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{log.couldBeBetter}</p>
                </div>
              )}
              {log.learned && (
                <div className="pl-6">
                  <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                    <GraduationCap className="h-3 w-3 text-blue-400" /> What I Learned
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{log.learned}</p>
                </div>
              )}
            </div>
          )}
          
          {!hasContent(log) && (
            <p className="text-sm text-[#7DAAB2] italic text-center py-4">
              No detailed entries for this day
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function JournalArchivePage() {
  usePageTitle('Journal Log');
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const { data: logsData, isLoading } = useQuery<{ logs: DailyLog[] }>({
    queryKey: ['/api/users', user?.id, 'daily-logs', 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}/daily-logs`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch daily logs');
      return response.json();
    },
    enabled: !!user?.id,
  });

  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const hierarchicalData = useMemo((): YearData[] => {
    if (!logsData?.logs) return [];
    
    const today = getLocalDateString();
    const yearMap: { [year: string]: { [monthKey: string]: { [dayKey: string]: DailyLog } } } = {};
    
    logsData.logs.filter(log => log.date !== today).forEach(log => {
      const date = parseLocalDate(log.date);
      const year = date.getFullYear().toString();
      const monthNum = date.getMonth();
      const monthKey = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
      const dayNum = date.getDate();
      const dayKey = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      if (!yearMap[year]) {
        yearMap[year] = {};
      }
      if (!yearMap[year][monthKey]) {
        yearMap[year][monthKey] = {};
      }
      yearMap[year][monthKey][dayKey] = log;
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
                  log: yearMap[year][monthKey][dayKey]
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
  }, [logsData?.logs]);

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

  const countEntriesInYear = (yearData: YearData) => {
    let count = 0;
    yearData.months.forEach(month => {
      count += month.days.length;
    });
    return count;
  };

  const countEntriesInMonth = (monthData: MonthData) => {
    return monthData.days.length;
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
        <h1 className="text-2xl font-orbitron mb-1">Journal Log</h1>
        <p className="text-[#7DAAB2]">Your daily logs organized by date - energy, intentions, data, and reflections</p>
      </div>
      
      {isLoading ? (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20">
          <div className="animate-pulse text-primary">Loading your journal entries...</div>
        </div>
      ) : hierarchicalData.length > 0 ? (
        <div className="space-y-3">
          {hierarchicalData.map((yearData) => {
            const isYearExpanded = expandedYears.has(yearData.year);
            const yearEntryCount = countEntriesInYear(yearData);
            
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
                        {yearEntryCount} {yearEntryCount === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    {yearData.months.map((monthData) => {
                      const isMonthExpanded = expandedMonths.has(monthData.monthKey);
                      const monthEntryCount = countEntriesInMonth(monthData);
                      
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
                                  {monthEntryCount} {monthEntryCount === 1 ? 'entry' : 'entries'}
                                </span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="ml-6 mt-2 space-y-2">
                              {monthData.days.map((dayData) => (
                                <LogCard key={dayData.dayKey} log={dayData.log} />
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
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Journal Entries Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your journey by filling out your daily logs on the dashboard.
            They will be automatically archived here.
          </p>
          <Button 
            onClick={() => navigate('/dashboard')}
            className="bg-primary/10 hover:bg-primary hover:text-background border border-primary/50"
          >
            Go to Dashboard
          </Button>
        </div>
      )}
    </>
  );
}
