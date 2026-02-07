import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, CalendarClock, Milestone, CalendarDays, ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLYFEOS } from '@/lib/context';
import { usePageTitle } from '@/hooks/use-page-title';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type TimelineItemType = 'mission' | 'event';

interface TimelineItem {
  id: string;
  rawDate: Date;
  time: string;
  title: string;
  description: string;
  type: TimelineItemType;
}

function getDescriptionFromContent(content: string): string {
  if (!content) return '';
  const cleanContent = content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[\-\*]\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '');
  const sentences = cleanContent.split(/[.!?]+/);
  const firstSentences = sentences.slice(0, 2).join('. ');
  if (firstSentences.length <= 150) {
    return firstSentences.trim() || '';
  }
  return firstSentences.substring(0, 147).trim() + '...';
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const oneDay = 86400000;
  return Math.ceil((diff / oneDay + startOfYear.getDay() + 1) / 7);
}

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr === '00:00') return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

interface DayGroup {
  dayKey: string;
  dayLabel: string;
  dayNum: number;
  items: TimelineItem[];
}

interface WeekGroup {
  weekNum: number;
  weekLabel: string;
  days: DayGroup[];
}

interface MonthGroup {
  monthKey: string;
  monthName: string;
  monthNum: number;
  weeks: WeekGroup[];
  totalItems: number;
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
  totalItems: number;
}

export default function TimelinePage() {
  usePageTitle('Timeline');

  const [, navigate] = useLocation();
  const { missionPages, events, quests } = useLYFEOS();

  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };
  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleWeek = (key: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    missionPages.forEach(page => {
      const d = new Date(page.createdAt);
      items.push({
        id: `mission-page-${page.id}`,
        rawDate: d,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        title: page.title,
        description: getDescriptionFromContent(page.content),
        type: 'mission',
      });
    });

    quests.forEach(quest => {
      if (!quest.completed || !quest.completedAt) return;
      const d = new Date(quest.completedAt);
      items.push({
        id: `mission-${quest.id}`,
        rawDate: d,
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        title: quest.title.replace(/^Onboarding:\s*/, ''),
        description: quest.description || '',
        type: 'mission',
      });
    });

    events.forEach(event => {
      const dateParts = event.date ? event.date.split('-').map(Number) : [];
      const d = dateParts.length === 3
        ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
        : new Date(event.startTime);
      items.push({
        id: `event-${event.id}`,
        rawDate: d,
        time: event.startTime && event.startTime.includes(':') ? event.startTime : '00:00',
        title: event.title,
        description: event.description || '',
        type: 'event',
      });
    });

    return items;
  }, [missionPages, events, quests]);

  const hierarchicalData: YearGroup[] = useMemo(() => {
    if (timelineItems.length === 0) return [];

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const yearMap: Record<number, Record<string, Record<string, Record<string, TimelineItem[]>>>> = {};

    timelineItems.forEach(item => {
      const d = item.rawDate;
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthKey = `${year}-${month}`;
      const weekNum = getWeekNumber(d);
      const weekKey = `${year}-W${weekNum}`;
      const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!yearMap[year]) yearMap[year] = {};
      if (!yearMap[year][monthKey]) yearMap[year][monthKey] = {};
      if (!yearMap[year][monthKey][weekKey]) yearMap[year][monthKey][weekKey] = {};
      if (!yearMap[year][monthKey][weekKey][dayKey]) yearMap[year][monthKey][weekKey][dayKey] = [];
      yearMap[year][monthKey][weekKey][dayKey].push(item);
    });

    const years: YearGroup[] = Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => b - a)
      .map(year => {
        const monthEntries = yearMap[year];
        let yearTotal = 0;

        const months: MonthGroup[] = Object.keys(monthEntries)
          .sort((a, b) => {
            const aNum = parseInt(a.split('-')[1]);
            const bNum = parseInt(b.split('-')[1]);
            return bNum - aNum;
          })
          .map(monthKey => {
            const weekEntries = monthEntries[monthKey];
            const monthNum = parseInt(monthKey.split('-')[1]);
            let monthTotal = 0;

            const weeks: WeekGroup[] = Object.keys(weekEntries)
              .sort((a, b) => {
                const aW = parseInt(a.split('W')[1]);
                const bW = parseInt(b.split('W')[1]);
                return bW - aW;
              })
              .map(weekKey => {
                const dayEntries = weekEntries[weekKey];
                const weekNum = parseInt(weekKey.split('W')[1]);

                const days: DayGroup[] = Object.keys(dayEntries)
                  .sort((a, b) => b.localeCompare(a))
                  .map(dayKey => {
                    const dayItems = dayEntries[dayKey]
                      .sort((a, b) => {
                        if (a.time < b.time) return -1;
                        if (a.time > b.time) return 1;
                        return 0;
                      });

                    monthTotal += dayItems.length;

                    const parts = dayKey.split('-').map(Number);
                    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    const dayName = dayNames[dateObj.getDay()];
                    const monthName = monthNames[dateObj.getMonth()];

                    return {
                      dayKey,
                      dayLabel: `${dayName}, ${monthName} ${parts[2]}`,
                      dayNum: parts[2],
                      items: dayItems,
                    };
                  });

                return {
                  weekNum,
                  weekLabel: `Week ${weekNum}`,
                  days,
                };
              });

            yearTotal += monthTotal;

            return {
              monthKey,
              monthName: monthNames[monthNum],
              monthNum,
              weeks,
              totalItems: monthTotal,
            };
          });

        return {
          year,
          months,
          totalItems: yearTotal,
        };
      });

    return years;
  }, [timelineItems]);

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
        <h1 className="text-2xl font-orbitron mb-1">Timeline</h1>
        <p className="text-[#7DAAB2]">Your complete journey through time</p>
      </div>

      {hierarchicalData.length > 0 ? (
        <div className="space-y-3">
          {hierarchicalData.map(yearGroup => (
            <Collapsible
              key={yearGroup.year}
              open={expandedYears.has(yearGroup.year)}
              onOpenChange={() => toggleYear(yearGroup.year)}
            >
              <CollapsibleTrigger asChild>
                <div className="glassmorphic rounded-xl p-4 neon-border cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition flex items-center gap-3">
                  {expandedYears.has(yearGroup.year) ? (
                    <ChevronDown className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                  <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-lg font-orbitron text-[#D6F4FF]">{yearGroup.year}</span>
                  <span className="ml-auto text-xs text-primary font-mono">
                    {yearGroup.totalItems} {yearGroup.totalItems === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-4 mt-2 space-y-2">
                  {yearGroup.months.map(monthGroup => (
                    <Collapsible
                      key={monthGroup.monthKey}
                      open={expandedMonths.has(monthGroup.monthKey)}
                      onOpenChange={() => toggleMonth(monthGroup.monthKey)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="glassmorphic rounded-lg p-3 cursor-pointer hover:shadow-[0_0_5px_rgba(0,224,255,0.2)] transition flex items-center gap-3">
                          {expandedMonths.has(monthGroup.monthKey) ? (
                            <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                          <CalendarClock className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm font-medium text-[#D6F4FF]">{monthGroup.monthName}</span>
                          <span className="ml-auto text-xs text-primary font-mono">
                            {monthGroup.totalItems} {monthGroup.totalItems === 1 ? 'entry' : 'entries'}
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-4 mt-2 space-y-2">
                          {monthGroup.weeks.map(weekGroup => (
                            <Collapsible
                              key={`${monthGroup.monthKey}-W${weekGroup.weekNum}`}
                              open={expandedWeeks.has(`${monthGroup.monthKey}-W${weekGroup.weekNum}`)}
                              onOpenChange={() => toggleWeek(`${monthGroup.monthKey}-W${weekGroup.weekNum}`)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="rounded-lg p-2.5 cursor-pointer hover:bg-primary/5 transition flex items-center gap-3 border border-primary/10">
                                  {expandedWeeks.has(`${monthGroup.monthKey}-W${weekGroup.weekNum}`) ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  )}
                                  <span className="text-xs font-mono text-[#7DAAB2]">{weekGroup.weekLabel}</span>
                                  <span className="ml-auto text-[10px] text-primary/70 font-mono">
                                    {weekGroup.days.reduce((sum, d) => sum + d.items.length, 0)} {weekGroup.days.reduce((sum, d) => sum + d.items.length, 0) === 1 ? 'entry' : 'entries'}
                                  </span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="pl-4 mt-1.5 space-y-1.5">
                                  {weekGroup.days.map(dayGroup => (
                                    <Collapsible
                                      key={dayGroup.dayKey}
                                      open={expandedDays.has(dayGroup.dayKey)}
                                      onOpenChange={() => toggleDay(dayGroup.dayKey)}
                                    >
                                      <CollapsibleTrigger asChild>
                                        <div className="rounded-lg p-2 cursor-pointer hover:bg-primary/5 transition flex items-center gap-2 border border-primary/5">
                                          {expandedDays.has(dayGroup.dayKey) ? (
                                            <ChevronDown className="h-3 w-3 text-primary flex-shrink-0" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
                                          )}
                                          <span className="text-xs text-[#D6F4FF]">{dayGroup.dayLabel}</span>
                                          <span className="ml-auto text-[10px] text-primary/70 font-mono">
                                            {dayGroup.items.length}
                                          </span>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="pl-3 mt-1 space-y-1.5 relative">
                                          <div className="absolute left-1 top-0 bottom-0 w-px bg-primary/20" />
                                          {dayGroup.items.map(item => (
                                            <div
                                              key={item.id}
                                              className="pl-4 py-2 rounded-lg bg-background/10 border border-primary/10 hover:border-primary/30 transition-all"
                                            >
                                              <div className="flex items-start gap-2">
                                                <div className="mt-0.5 flex-shrink-0">
                                                  {item.type === 'mission' ? (
                                                    <Milestone className="h-3.5 w-3.5 text-primary" />
                                                  ) : (
                                                    <CalendarDays className="h-3.5 w-3.5 text-primary" />
                                                  )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2">
                                                    {item.time && item.time !== '00:00' && (
                                                      <span className="text-[10px] font-mono text-primary/70">{formatTime(item.time)}</span>
                                                    )}
                                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">
                                                      {item.type}
                                                    </span>
                                                  </div>
                                                  <h4 className="text-sm font-medium text-foreground mt-0.5 truncate">{item.title}</h4>
                                                  {item.description && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : (
        <div className="glassmorphic rounded-xl p-8 neon-border text-center">
          <CalendarClock className="h-8 w-8 text-primary/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No timeline entries yet. Complete missions and create events to build your life timeline.</p>
        </div>
      )}
    </div>
  );
}
