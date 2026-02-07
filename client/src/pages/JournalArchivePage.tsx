import { useState, useMemo } from 'react';
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Archive, Calendar, ChevronDown, ChevronRight, ArrowLeft, BookOpen, Target, Brain, CheckCircle, AlertCircle, GraduationCap, Search } from "lucide-react";
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
  sourceAuthor: string | null;
  sourceMaterial: string | null;
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

interface LogField {
  label: string;
  value: string | null;
  labelIcon?: React.ReactNode;
}

function LogSection({ icon: Icon, title, fields }: { icon: any; title: string; fields: LogField[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-card/40 rounded px-1 py-0.5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
        )}
        <Icon className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-medium text-primary">{title}</h4>
      </div>
      {isExpanded && (
        <div className="space-y-3 pl-2">
          {fields.map(({ label, value, labelIcon }) => (
            <div key={label} className="pl-6">
              <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                {labelIcon}
                {label}
              </p>
              {value ? (
                <p className="text-sm whitespace-pre-wrap">{value}</p>
              ) : (
                <p className="text-sm text-muted-foreground/40 italic">--</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
              <h4 className="text-base">
                {parseLocalDate(log.date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h4>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="ml-6 mt-2 p-4 glassmorphic rounded-xl border border-primary/10 space-y-4 bg-background/30">
          <LogSection
            icon={BookOpen}
            title="Daily Data Log"
            fields={[
              { label: 'Thoughts', value: log.thoughts },
              { label: 'Information Consumed', value: log.contentConsumed },
              { label: 'Research', value: log.research },
              { label: 'Todo Ideas', value: log.todoIdeas },
            ]}
          />

          <LogSection
            icon={Search}
            title="Daily Research Log"
            fields={[
              { label: 'Source Author', value: log.sourceAuthor },
              { label: 'Source Material', value: log.sourceMaterial },
              { label: 'Research Note', value: log.researchNote },
              { label: 'Revision & Summary Note', value: log.revisionNote },
              { label: 'Execution Note', value: log.executionNote },
            ]}
          />

          <LogSection
            icon={Calendar}
            title="Daily Reflection Log"
            fields={[
              { label: 'What Went Well', value: log.wentWell, labelIcon: <CheckCircle className="h-3 w-3 text-primary" /> },
              { label: 'Could Be Better', value: log.couldBeBetter, labelIcon: <AlertCircle className="h-3 w-3 text-primary" /> },
              { label: 'What I Learned', value: log.learned, labelIcon: <GraduationCap className="h-3 w-3 text-primary" /> },
            ]}
          />

          <LogSection
            icon={Target}
            title="Daily Intention Log"
            fields={[
              { label: 'Gratitude', value: log.gratitude },
              { label: "Tomorrow's Goals", value: log.tomorrowGoals },
              { label: 'Annual Goals', value: log.annualGoals },
            ]}
          />

          <LogSection
            icon={Brain}
            title="Daily Energy Log"
            fields={[
              { label: 'Wake Time', value: formatTime12Hour(log.wakeTime) === '--:--' ? null : formatTime12Hour(log.wakeTime) },
              { label: 'Sleep Time', value: formatTime12Hour(log.sleepTime) === '--:--' ? null : formatTime12Hour(log.sleepTime) },
              { label: 'Mental State', value: log.mentalState != null ? `${log.mentalState}/10` : null },
              { label: 'Physical State', value: log.physicalState != null ? `${log.physicalState}/10` : null },
              { label: 'Emotional State', value: log.emotionalState != null ? `${log.emotionalState}/10` : null },
            ]}
          />
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
          className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
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
