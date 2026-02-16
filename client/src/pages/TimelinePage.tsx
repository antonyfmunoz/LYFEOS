import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, CalendarClock, ZoomIn, ZoomOut, ChevronDown, ChevronRight, Info, Calendar, Clock, Rocket, Target, CheckSquare, Check } from 'lucide-react';
import { ObsidianMarkdown } from '@/components/ui/obsidian-markdown';
import { Quest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useLYFEOS } from '@/lib/context';
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from '@/lib/authContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

const ONBOARDING_MISSIONS = [
  { id: 0, title: "Access & Quickstart", description: "Log in, explore the dashboard, and complete your first quick mission to get familiar with LYFEOS." },
  { id: 1, title: "Archetype Calibration", description: "Discover your player archetype through a guided assessment to personalize your LYFEOS experience." },
  { id: 2, title: "Identity & Direction", description: "Define your core identity pillars and set your life direction compass." },
  { id: 3, title: "Craft & Mastery", description: "Identify your key skills and craft areas to track mastery progression." },
  { id: 4, title: "Capacity & Constraints", description: "Set your daily energy, attention, and time capacity limits for balanced resource management." },
  { id: 5, title: "Baselines & States", description: "Establish your baseline stats and current life state for accurate tracking." },
  { id: 6, title: "History & Roots", description: "Record your background and personal history to inform your growth trajectory." },
  { id: 7, title: "Systems & Rituals", description: "Set up your daily rituals and recurring systems for consistent progress." },
];

function getOnboardingDescription(title: string, dbDescription: string): string {
  const cleanTitle = title.replace(/^Onboarding:\s*/, '');
  const match = ONBOARDING_MISSIONS.find(m => m.title === cleanTitle);
  return match?.description || dbDescription;
}

interface UserCategoryOption {
  id: number;
  value: string;
  label: string;
  description: string | null;
}

interface VisionGoal {
  id: number;
  userId: number;
  category: string;
  title: string;
  description: string | null;
  rewardText: string | null;
  bonusXp: number;
  completed: boolean;
  completedAt: Date | null;
  displayOrder: number;
  createdAt: Date;
}

type TimelineItemType = 'mission' | 'event';

interface TimelineItem {
  id: string;
  rawDate: Date;
  time: string;
  title: string;
  description: string;
  type: TimelineItemType;
  quest?: Quest;
  visionGoal?: VisionGoal;
}

type ZoomLevel = 'life' | 'year' | 'month' | 'week' | 'day';

const ZOOM_LEVELS: ZoomLevel[] = ['life', 'year', 'month', 'week', 'day'];
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  life: 'Life',
  year: 'Year',
  month: 'Month',
  week: 'Week',
  day: 'Day',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

const difficultyDescriptions: Record<string, string> = {
  S: 'Extreme effort. Multi-day or life-changing.',
  A: 'High effort. Significant commitment.',
  B: 'Moderate effort. Requires focus and planning.',
  C: 'Light effort. Simple but requires attention.',
  D: 'Minimal effort. Quick and easy.',
};

const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
const difficultyOrder: Record<string, number> = { 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'S': 5 };
const reverseOrder: Record<number, string> = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S' };

function formatStatCost(cost: number | null | undefined): string {
  const val = ((cost ?? 0) / 1440) * 100;
  if (!cost || val === 0) return "0%";
  if (val < 1) return val.toFixed(1) + "%";
  return Math.round(val) + "%";
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
  if (firstSentences.length <= 120) return firstSentences.trim() || '';
  return firstSentences.substring(0, 117).trim() + '...';
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const oneDay = 86400000;
  return Math.ceil((diff / oneDay + startOfYear.getDay() + 1) / 7);
}

function getWeekStart(year: number, weekNum: number): Date {
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay();
  const firstMonday = new Date(year, 0, 1 + ((1 - dayOfWeek + 7) % 7));
  const weekStart = new Date(firstMonday);
  weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
  return weekStart;
}

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr === '00:00') return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

interface TimelineNode {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  items: TimelineItem[];
  drillValue?: { year?: number; month?: number; week?: number; day?: number };
}

export default function TimelinePage() {
  usePageTitle('Timeline');

  const [, navigate] = useLocation();
  const { missionPages, events, quests } = useLYFEOS();
  const { user } = useAuth();
  const { data: userCategories = [] } = useQuery<UserCategoryOption[]>({
    queryKey: ['/api/user-categories'],
    enabled: !!user,
  });

  const [activeView, setActiveView] = useState<'history' | 'roadmap'>('history');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('life');
  const [focusYear, setFocusYear] = useState<number | null>(null);
  const [focusMonth, setFocusMonth] = useState<number | null>(null);
  const [focusWeek, setFocusWeek] = useState<number | null>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [expandedInfoIds, setExpandedInfoIds] = useState<Set<string>>(new Set());

  const [rmZoom, setRmZoom] = useState<ZoomLevel>('life');
  const [rmFocusYear, setRmFocusYear] = useState<number | null>(null);
  const [rmFocusMonth, setRmFocusMonth] = useState<number | null>(null);
  const [rmFocusWeek, setRmFocusWeek] = useState<number | null>(null);
  const [rmFocusDay, setRmFocusDay] = useState<number | null>(null);
  const [rmExpandedInfoIds, setRmExpandedInfoIds] = useState<Set<string>>(new Set());
  const [rmActiveMissionsExpanded, setRmActiveMissionsExpanded] = useState<Record<string, boolean>>({});
  const [rmCompletedMissionsExpanded, setRmCompletedMissionsExpanded] = useState<Record<string, boolean>>({});
  
  const { data: visionGoals = [] } = useQuery<VisionGoal[]>({
    queryKey: ['/api/vision-goals/all'],
    enabled: !!user,
  });

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
        description: quest.category === 'onboarding' ? getOnboardingDescription(quest.title, quest.description || '') : (quest.description || ''),
        type: 'mission',
        quest,
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

  const nodes: TimelineNode[] = useMemo(() => {
    if (timelineItems.length === 0) return [];

    switch (zoomLevel) {
      case 'life': {
        const byYear: Record<number, TimelineItem[]> = {};
        timelineItems.forEach(item => {
          const year = item.rawDate.getFullYear();
          if (!byYear[year]) byYear[year] = [];
          byYear[year].push(item);
        });
        return Object.keys(byYear)
          .map(Number)
          .sort((a, b) => b - a)
          .map(year => ({
            key: `year-${year}`,
            label: String(year),
            count: byYear[year].length,
            items: byYear[year],
            drillValue: { year },
          }));
      }

      case 'year': {
        if (focusYear === null) return [];
        const filtered = timelineItems.filter(i => i.rawDate.getFullYear() === focusYear);
        const byMonth: Record<number, TimelineItem[]> = {};
        filtered.forEach(item => {
          const month = item.rawDate.getMonth();
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(item);
        });
        return Object.keys(byMonth)
          .map(Number)
          .sort((a, b) => b - a)
          .map(month => ({
            key: `month-${month}`,
            label: MONTH_FULL[month],
            sublabel: String(focusYear),
            count: byMonth[month].length,
            items: byMonth[month],
            drillValue: { year: focusYear, month },
          }));
      }

      case 'month': {
        if (focusYear === null || focusMonth === null) return [];
        const filtered = timelineItems.filter(i =>
          i.rawDate.getFullYear() === focusYear && i.rawDate.getMonth() === focusMonth
        );
        const byWeek: Record<number, TimelineItem[]> = {};
        filtered.forEach(item => {
          const week = getWeekNumber(item.rawDate);
          if (!byWeek[week]) byWeek[week] = [];
          byWeek[week].push(item);
        });
        const monthStart = new Date(focusYear, focusMonth, 1);
        const monthEnd = new Date(focusYear, focusMonth + 1, 0);
        return Object.keys(byWeek)
          .map(Number)
          .sort((a, b) => b - a)
          .map(week => {
            const rawWeekStart = getWeekStart(focusYear, week);
            const rawWeekEnd = new Date(rawWeekStart);
            rawWeekEnd.setDate(rawWeekEnd.getDate() + 6);
            const clampedStart = rawWeekStart < monthStart ? monthStart : rawWeekStart;
            const clampedEnd = rawWeekEnd > monthEnd ? monthEnd : rawWeekEnd;
            return {
              key: `week-${week}`,
              label: `Week ${week}`,
              sublabel: `${MONTH_NAMES[clampedStart.getMonth()]} ${clampedStart.getDate()} - ${MONTH_NAMES[clampedEnd.getMonth()]} ${clampedEnd.getDate()}`,
              count: byWeek[week].length,
              items: byWeek[week],
              drillValue: { year: focusYear, month: focusMonth, week },
            };
          });
      }

      case 'week': {
        if (focusYear === null || focusMonth === null || focusWeek === null) return [];
        const filtered = timelineItems.filter(i =>
          i.rawDate.getFullYear() === focusYear &&
          i.rawDate.getMonth() === focusMonth &&
          getWeekNumber(i.rawDate) === focusWeek
        );
        const byDay: Record<number, TimelineItem[]> = {};
        filtered.forEach(item => {
          const day = item.rawDate.getDate();
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(item);
        });
        return Object.keys(byDay)
          .map(Number)
          .sort((a, b) => b - a)
          .map(day => {
            const dateObj = new Date(focusYear, focusMonth, day);
            return {
              key: `day-${day}`,
              label: `${DAY_NAMES[dateObj.getDay()]}, ${MONTH_NAMES[focusMonth]} ${day}`,
              count: byDay[day].length,
              items: byDay[day],
              drillValue: { year: focusYear, month: focusMonth, week: focusWeek, day },
            };
          });
      }

      case 'day': {
        if (focusYear === null || focusMonth === null || focusDay === null) return [];
        const filtered = timelineItems.filter(i =>
          i.rawDate.getFullYear() === focusYear &&
          i.rawDate.getMonth() === focusMonth &&
          i.rawDate.getDate() === focusDay
        ).sort((a, b) => a.time.localeCompare(b.time));
        return filtered.map(item => ({
          key: item.id,
          label: item.title,
          sublabel: formatTime(item.time) || undefined,
          count: 0,
          items: [item],
        }));
      }

      default:
        return [];
    }
  }, [timelineItems, zoomLevel, focusYear, focusMonth, focusWeek, focusDay]);

  const roadmapItems: (TimelineItem & { rmType: 'mission' | 'event' | 'milestone' })[] = useMemo(() => {
    if (activeView !== 'roadmap') return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items: (TimelineItem & { rmType: 'mission' | 'event' | 'milestone' })[] = [];

    quests.forEach(quest => {
      if (quest.completed) return;
      if (!quest.endDate) return;
      const [y, m, d] = quest.endDate.split('-').map(Number);
      const dueDate = new Date(y, m - 1, d);
      if (dueDate >= today) {
        items.push({
          id: `rm-quest-${quest.id}`,
          rawDate: dueDate,
          time: quest.endTime || '00:00',
          title: quest.title,
          description: quest.description || '',
          type: 'mission',
          quest,
          rmType: 'mission',
        });
      }
    });

    events.forEach(event => {
      if (!event.date) return;
      const [y, m, d] = event.date.split('-').map(Number);
      const eventDate = new Date(y, m - 1, d);
      if (eventDate >= today) {
        items.push({
          id: `rm-event-${event.id}`,
          rawDate: eventDate,
          time: event.startTime && event.startTime.includes(':') ? event.startTime : '00:00',
          title: event.title,
          description: event.description || '',
          type: 'event',
          rmType: 'event',
        });
      }
    });

    const categoryOffsets: Record<string, number> = {
      '90day': 90,
      '18month': 18 * 30,
      '5year': 5 * 365,
      '10year': 10 * 365,
      'legacy': 20 * 365,
    };

    visionGoals.forEach(goal => {
      if (goal.completed) return;
      const offsetDays = categoryOffsets[goal.category] || 365;
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + offsetDays);
      items.push({
        id: `rm-vision-${goal.id}`,
        rawDate: dueDate,
        time: '00:00',
        title: goal.title,
        description: goal.description || '',
        type: 'event',
        rmType: 'milestone',
        visionGoal: goal,
      });
    });

    return items;
  }, [activeView, quests, events, visionGoals]);

  const roadmapNodes: TimelineNode[] = useMemo(() => {
    if (roadmapItems.length === 0) return [];

    switch (rmZoom) {
      case 'life': {
        const byYear: Record<number, typeof roadmapItems> = {};
        roadmapItems.forEach(item => {
          const year = item.rawDate.getFullYear();
          if (!byYear[year]) byYear[year] = [];
          byYear[year].push(item);
        });
        return Object.keys(byYear)
          .map(Number)
          .sort((a, b) => a - b)
          .map(year => ({
            key: `rm-year-${year}`,
            label: String(year),
            count: byYear[year].length,
            items: byYear[year],
            drillValue: { year },
          }));
      }

      case 'year': {
        if (rmFocusYear === null) return [];
        const filtered = roadmapItems.filter(i => i.rawDate.getFullYear() === rmFocusYear);
        const byMonth: Record<number, typeof roadmapItems> = {};
        filtered.forEach(item => {
          const month = item.rawDate.getMonth();
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(item);
        });
        return Object.keys(byMonth)
          .map(Number)
          .sort((a, b) => a - b)
          .map(month => ({
            key: `rm-month-${month}`,
            label: MONTH_FULL[month],
            sublabel: String(rmFocusYear),
            count: byMonth[month].length,
            items: byMonth[month],
            drillValue: { year: rmFocusYear, month },
          }));
      }

      case 'month': {
        if (rmFocusYear === null || rmFocusMonth === null) return [];
        const filtered = roadmapItems.filter(i =>
          i.rawDate.getFullYear() === rmFocusYear && i.rawDate.getMonth() === rmFocusMonth
        );
        const byWeek: Record<number, typeof roadmapItems> = {};
        filtered.forEach(item => {
          const week = getWeekNumber(item.rawDate);
          if (!byWeek[week]) byWeek[week] = [];
          byWeek[week].push(item);
        });
        const monthStart = new Date(rmFocusYear, rmFocusMonth, 1);
        const monthEnd = new Date(rmFocusYear, rmFocusMonth + 1, 0);
        return Object.keys(byWeek)
          .map(Number)
          .sort((a, b) => a - b)
          .map(week => {
            const rawWeekStart = getWeekStart(rmFocusYear, week);
            const rawWeekEnd = new Date(rawWeekStart);
            rawWeekEnd.setDate(rawWeekEnd.getDate() + 6);
            const clampedStart = rawWeekStart < monthStart ? monthStart : rawWeekStart;
            const clampedEnd = rawWeekEnd > monthEnd ? monthEnd : rawWeekEnd;
            return {
              key: `rm-week-${week}`,
              label: `Week ${week}`,
              sublabel: `${MONTH_NAMES[clampedStart.getMonth()]} ${clampedStart.getDate()} - ${MONTH_NAMES[clampedEnd.getMonth()]} ${clampedEnd.getDate()}`,
              count: byWeek[week].length,
              items: byWeek[week],
              drillValue: { year: rmFocusYear, month: rmFocusMonth, week },
            };
          });
      }

      case 'week': {
        if (rmFocusYear === null || rmFocusMonth === null || rmFocusWeek === null) return [];
        const filtered = roadmapItems.filter(i =>
          i.rawDate.getFullYear() === rmFocusYear &&
          i.rawDate.getMonth() === rmFocusMonth &&
          getWeekNumber(i.rawDate) === rmFocusWeek
        );
        const byDay: Record<number, typeof roadmapItems> = {};
        filtered.forEach(item => {
          const day = item.rawDate.getDate();
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(item);
        });
        return Object.keys(byDay)
          .map(Number)
          .sort((a, b) => a - b)
          .map(day => {
            const dateObj = new Date(rmFocusYear, rmFocusMonth, day);
            return {
              key: `rm-day-${day}`,
              label: `${DAY_NAMES[dateObj.getDay()]}, ${MONTH_NAMES[rmFocusMonth]} ${day}`,
              count: byDay[day].length,
              items: byDay[day],
              drillValue: { year: rmFocusYear, month: rmFocusMonth, week: rmFocusWeek, day },
            };
          });
      }

      case 'day': {
        if (rmFocusYear === null || rmFocusMonth === null || rmFocusDay === null) return [];
        const filtered = roadmapItems.filter(i =>
          i.rawDate.getFullYear() === rmFocusYear &&
          i.rawDate.getMonth() === rmFocusMonth &&
          i.rawDate.getDate() === rmFocusDay
        ).sort((a, b) => a.time.localeCompare(b.time));
        return filtered.map(item => ({
          key: item.id,
          label: item.title,
          sublabel: formatTime(item.time) || undefined,
          count: 0,
          items: [item],
        }));
      }

      default:
        return [];
    }
  }, [roadmapItems, rmZoom, rmFocusYear, rmFocusMonth, rmFocusWeek, rmFocusDay]);

  const handleNodeClick = useCallback((node: TimelineNode) => {
    if (zoomLevel === 'day') return;

    const zoomIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    const nextZoom = ZOOM_LEVELS[zoomIdx + 1];
    if (!nextZoom || !node.drillValue) return;

    if (node.drillValue.year !== undefined) setFocusYear(node.drillValue.year);
    if (node.drillValue.month !== undefined) setFocusMonth(node.drillValue.month);
    if (node.drillValue.week !== undefined) setFocusWeek(node.drillValue.week);
    if (node.drillValue.day !== undefined) setFocusDay(node.drillValue.day);

    setZoomLevel(nextZoom);
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    const zoomIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (zoomIdx <= 0) return;
    const prevZoom = ZOOM_LEVELS[zoomIdx - 1];

    if (prevZoom === 'life') {
      setFocusYear(null);
      setFocusMonth(null);
      setFocusWeek(null);
      setFocusDay(null);
    } else if (prevZoom === 'year') {
      setFocusMonth(null);
      setFocusWeek(null);
      setFocusDay(null);
    } else if (prevZoom === 'month') {
      setFocusWeek(null);
      setFocusDay(null);
    } else if (prevZoom === 'week') {
      setFocusDay(null);
    }

    setZoomLevel(prevZoom);
  }, [zoomLevel]);

  const handleZoomIn = useCallback(() => {
    const zoomIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (zoomIdx >= ZOOM_LEVELS.length - 1) return;
    if (nodes.length > 0 && nodes[0].drillValue) {
      handleNodeClick(nodes[0]);
    }
  }, [zoomLevel, nodes, handleNodeClick]);

  const getBreadcrumb = () => {
    const parts: string[] = [];
    if (focusYear !== null) parts.push(String(focusYear));
    if (focusMonth !== null) parts.push(MONTH_FULL[focusMonth]);
    if (focusWeek !== null) parts.push(`Week ${focusWeek}`);
    if (focusDay !== null && focusMonth !== null) {
      const dateObj = new Date(focusYear!, focusMonth, focusDay);
      parts.push(`${DAY_NAMES[dateObj.getDay()]} ${focusDay}`);
    }
    return parts;
  };

  const breadcrumb = getBreadcrumb();
  const zoomIdx = ZOOM_LEVELS.indexOf(zoomLevel);
  const canZoomIn = zoomIdx < ZOOM_LEVELS.length - 1 && nodes.length > 0;
  const canZoomOut = zoomIdx > 0;

  const handleRmNodeClick = useCallback((node: TimelineNode) => {
    if (rmZoom === 'day') return;
    const idx = ZOOM_LEVELS.indexOf(rmZoom);
    const nextZoom = ZOOM_LEVELS[idx + 1];
    if (!nextZoom || !node.drillValue) return;
    if (node.drillValue.year !== undefined) setRmFocusYear(node.drillValue.year);
    if (node.drillValue.month !== undefined) setRmFocusMonth(node.drillValue.month);
    if (node.drillValue.week !== undefined) setRmFocusWeek(node.drillValue.week);
    if (node.drillValue.day !== undefined) setRmFocusDay(node.drillValue.day);
    setRmZoom(nextZoom);
  }, [rmZoom]);

  const handleRmZoomOut = useCallback(() => {
    const idx = ZOOM_LEVELS.indexOf(rmZoom);
    if (idx <= 0) return;
    const prevZoom = ZOOM_LEVELS[idx - 1];
    if (prevZoom === 'life') { setRmFocusYear(null); setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null); }
    else if (prevZoom === 'year') { setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null); }
    else if (prevZoom === 'month') { setRmFocusWeek(null); setRmFocusDay(null); }
    else if (prevZoom === 'week') { setRmFocusDay(null); }
    setRmZoom(prevZoom);
  }, [rmZoom]);

  const handleRmZoomIn = useCallback(() => {
    const idx = ZOOM_LEVELS.indexOf(rmZoom);
    if (idx >= ZOOM_LEVELS.length - 1) return;
    if (roadmapNodes.length > 0 && roadmapNodes[0].drillValue) {
      handleRmNodeClick(roadmapNodes[0]);
    }
  }, [rmZoom, roadmapNodes, handleRmNodeClick]);

  const rmBreadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (rmFocusYear !== null) parts.push(String(rmFocusYear));
    if (rmFocusMonth !== null) parts.push(MONTH_FULL[rmFocusMonth]);
    if (rmFocusWeek !== null) parts.push(`Week ${rmFocusWeek}`);
    if (rmFocusDay !== null && rmFocusMonth !== null) {
      const dateObj = new Date(rmFocusYear!, rmFocusMonth, rmFocusDay);
      parts.push(`${DAY_NAMES[dateObj.getDay()]} ${rmFocusDay}`);
    }
    return parts;
  }, [rmFocusYear, rmFocusMonth, rmFocusWeek, rmFocusDay]);

  const rmZoomIdx = ZOOM_LEVELS.indexOf(rmZoom);
  const rmCanZoomIn = rmZoomIdx < ZOOM_LEVELS.length - 1 && roadmapNodes.length > 0;
  const rmCanZoomOut = rmZoomIdx > 0;

  const fmtDateShort = (d: Date) => {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  return (
    <div className="pb-20">
      <div className="mb-4">
        <Button
          className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
          size="sm"
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-orbitron mb-1">Timeline</h1>
        <p className="text-muted-foreground">
          {activeView === 'history' ? 'Your complete journey through time' : 'Your path forward'}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          className={`text-sm font-mono px-4 py-2 rounded-full transition-all ${activeView === 'history' ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
          onClick={() => setActiveView('history')}
        >
          History
        </button>
        <button
          className={`text-sm font-mono px-4 py-2 rounded-full transition-all ${activeView === 'roadmap' ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
          onClick={() => setActiveView('roadmap')}
        >
          Roadmap
        </button>
      </div>

      {activeView === 'history' && (
        <>
          <div className="glassmorphic rounded-xl neon-border p-3 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canZoomOut}
                onClick={handleZoomOut}
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 disabled:opacity-30"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canZoomIn}
                onClick={handleZoomIn}
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 disabled:opacity-30"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {ZOOM_LEVELS.map((level, idx) => (
                <div
                  key={level}
                  className={`text-[10px] font-mono px-2 py-1 rounded-full transition-all ${
                    idx === zoomIdx
                      ? 'bg-primary text-primary-foreground'
                      : idx < zoomIdx
                      ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                      : 'bg-muted/30 text-muted-foreground'
                  }`}
                  onClick={() => {
                    if (idx < zoomIdx) {
                      const targetLevel = ZOOM_LEVELS[idx];
                      if (targetLevel === 'life') {
                        setFocusYear(null); setFocusMonth(null); setFocusWeek(null); setFocusDay(null);
                      } else if (targetLevel === 'year') {
                        setFocusMonth(null); setFocusWeek(null); setFocusDay(null);
                      } else if (targetLevel === 'month') {
                        setFocusWeek(null); setFocusDay(null);
                      } else if (targetLevel === 'week') {
                        setFocusDay(null);
                      }
                      setZoomLevel(targetLevel);
                    }
                  }}
                >
                  {ZOOM_LABELS[level]}
                </div>
              ))}
            </div>
          </div>

          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4 text-xs text-muted-foreground font-mono flex-wrap">
              <span
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setZoomLevel('life');
                  setFocusYear(null); setFocusMonth(null); setFocusWeek(null); setFocusDay(null);
                }}
              >
                Life
              </span>
              {breadcrumb.map((part, idx) => (
                <span key={idx} className="flex items-center gap-1.5">
                  <span className="text-primary/40">/</span>
                  <span
                    className={idx < breadcrumb.length - 1 ? 'cursor-pointer hover:text-primary transition-colors' : 'text-foreground'}
                    onClick={() => {
                      if (idx >= breadcrumb.length - 1) return;
                      const targetZoom = ZOOM_LEVELS[idx + 1];
                      if (targetZoom === 'year') {
                        setFocusMonth(null); setFocusWeek(null); setFocusDay(null);
                      } else if (targetZoom === 'month') {
                        setFocusWeek(null); setFocusDay(null);
                      } else if (targetZoom === 'week') {
                        setFocusDay(null);
                      }
                      setZoomLevel(targetZoom);
                    }}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          {nodes.length > 0 ? (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-gradient-to-b from-primary/60 via-primary/30 to-primary/10" />

              <div className="space-y-1">
                {nodes.map((node, idx) => (
                  <div key={node.key} className="relative">
                    <div
                      className={`absolute left-[-19px] top-4 w-3 h-3 rounded-full border-2 border-primary z-10 transition-all ${
                        zoomLevel === 'day'
                          ? 'bg-primary shadow-[0_0_6px_var(--primary-glow-medium)]'
                          : node.count > 0
                          ? 'bg-primary shadow-[0_0_6px_var(--primary-glow-medium)]'
                          : 'bg-background'
                      }`}
                    />

                    {zoomLevel === 'day' ? (() => {
                      const hQuest = node.items[0]?.quest;
                      const hLinkedObjective = hQuest?.visionGoalId
                        ? visionGoals.find(g => g.id === hQuest?.visionGoalId)
                        : null;
                      const hCategoryLabels: Record<string, string> = { legacy: "Legacy", "10year": "10-Year", "5year": "5-Year", "18month": "18-Month", "90day": "90-Day" };
                      const hXpMultiplier = difficultyMultipliers[hQuest?.difficulty || 'D'] || 1;
                      const hAdjustedXp = hQuest ? Math.floor(hQuest.experienceReward * hXpMultiplier) : 0;
                      return (
                        <div className="ml-2 glassmorphic rounded-xl p-4 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border">
                          <div className="flex-grow">
                            <div className="flex justify-between items-start">
                              <h3 className="font-medium text-muted-foreground line-through">
                                {node.label}
                              </h3>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <button
                                  className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedInfoIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(node.key)) next.delete(node.key);
                                      else next.add(node.key);
                                      return next;
                                    });
                                  }}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {hQuest && hQuest.category !== "event" && (
                              <div className="flex items-center gap-3 mt-1 flex-wrap opacity-50">
                                <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(hQuest.attentionCost)} AT</span>
                                <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(hQuest.timeCost)} TT</span>
                                <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(hQuest.energyCost)} EP</span>
                                <span className="text-primary text-xs font-mono whitespace-nowrap">+{hAdjustedXp} XP</span>
                              </div>
                            )}
                            {hQuest && (() => {
                              const q = hQuest;
                              const hasSchedule = q.startDate || q.startTime || q.endDate || q.endTime;
                              if (!hasSchedule) return null;
                              const fmtDate = (ds: string) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
                              const fmtTime = (ts: string) => { const [h, mn] = ts.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${mn} ${hr >= 12 ? 'PM' : 'AM'}`; };
                              return (
                                <div className="flex items-center gap-1 text-xs mt-1 flex-wrap text-muted-foreground">
                                  {q.startDate && <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="h-3 w-3 flex-shrink-0" />{fmtDate(q.startDate)}</span>}
                                  {q.startTime && <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 flex-shrink-0" />{fmtTime(q.startTime)}</span>}
                                  {(q.endDate || q.endTime) && <span className="text-primary flex-shrink-0">→</span>}
                                  {q.endDate && <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="h-3 w-3 flex-shrink-0" />{fmtDate(q.endDate)}</span>}
                                  {q.endTime && <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 flex-shrink-0" />{fmtTime(q.endTime)}</span>}
                                </div>
                              );
                            })()}
                            {expandedInfoIds.has(node.key) && (
                              <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5">
                                {(() => {
                                  const onboardingDesc = hQuest?.category === "onboarding" && hQuest?.title
                                    ? getOnboardingDescription(hQuest.title, hQuest.description || '')
                                    : null;
                                  const displayDesc = onboardingDesc || hQuest?.description || node.items[0]?.description;
                                  return displayDesc ? (
                                    <div className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Mission Description:</span>
                                      <ObsidianMarkdown className="text-xs mt-1 [&_img]:max-w-[200px] [&_img]:rounded [&_p]:m-0">{displayDesc}</ObsidianMarkdown>
                                    </div>
                                  ) : null;
                                })()}
                                {hLinkedObjective && (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Mission Objective — {hCategoryLabels[hLinkedObjective.category] || hLinkedObjective.category} Vision:</span> {hLinkedObjective.title}
                                  </p>
                                )}
                                {hQuest?.category && hQuest.category !== "general" && hQuest.category !== "onboarding" && (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Mission Type — <span className="capitalize">{hQuest.category}</span>:</span> {
                                      categoryDescriptions[hQuest.category] || userCategories.find(uc => uc.value === hQuest?.category)?.description || 'Auto-classified mission category.'
                                    }
                                  </p>
                                )}
                                <p className="text-muted-foreground text-xs">
                                  <span className="text-primary font-mono">Mission Difficulty — Rank {hQuest?.difficulty || 'D'}:</span> {difficultyDescriptions[hQuest?.difficulty || 'D']}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })() : (
                      <div
                        className="ml-2 py-3 px-4 glassmorphic rounded-xl cursor-pointer hover:shadow-[0_0_8px_var(--primary-glow-light)] transition-all group border border-primary/10 hover:border-primary/30"
                        onClick={() => handleNodeClick(node)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-orbitron text-foreground group-hover:text-primary transition-colors">
                              {node.label}
                            </h3>
                            {node.sublabel && (
                              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{node.sublabel}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              {node.count} {node.count === 1 ? 'entry' : 'entries'}
                            </span>
                            <ChevronDown className="h-4 w-4 text-primary/50 group-hover:text-primary transition-colors -rotate-90" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glassmorphic rounded-xl p-8 neon-border text-center">
              <CalendarClock className="h-8 w-8 text-primary/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {zoomLevel === 'life'
                  ? 'No timeline entries yet. Complete missions and create events to build your life timeline.'
                  : 'No entries at this time level. Zoom out to see more.'}
              </p>
            </div>
          )}
        </>
      )}

      {activeView === 'roadmap' && (
        <>
          <div className="glassmorphic rounded-xl neon-border p-3 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!rmCanZoomOut}
                onClick={handleRmZoomOut}
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 disabled:opacity-30"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!rmCanZoomIn}
                onClick={handleRmZoomIn}
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 disabled:opacity-30"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {ZOOM_LEVELS.map((level, idx) => (
                <div
                  key={level}
                  className={`text-[10px] font-mono px-2 py-1 rounded-full transition-all ${
                    idx === rmZoomIdx
                      ? 'bg-primary text-primary-foreground'
                      : idx < rmZoomIdx
                      ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                      : 'bg-muted/30 text-muted-foreground'
                  }`}
                  onClick={() => {
                    if (idx < rmZoomIdx) {
                      const targetLevel = ZOOM_LEVELS[idx];
                      if (targetLevel === 'life') {
                        setRmFocusYear(null); setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null);
                      } else if (targetLevel === 'year') {
                        setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null);
                      } else if (targetLevel === 'month') {
                        setRmFocusWeek(null); setRmFocusDay(null);
                      } else if (targetLevel === 'week') {
                        setRmFocusDay(null);
                      }
                      setRmZoom(targetLevel);
                    }
                  }}
                >
                  {ZOOM_LABELS[level]}
                </div>
              ))}
            </div>
          </div>

          {rmBreadcrumb.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4 text-xs text-muted-foreground font-mono flex-wrap">
              <span
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setRmZoom('life');
                  setRmFocusYear(null); setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null);
                }}
              >
                Life
              </span>
              {rmBreadcrumb.map((part, idx) => (
                <span key={idx} className="flex items-center gap-1.5">
                  <span className="text-primary/40">/</span>
                  <span
                    className={idx < rmBreadcrumb.length - 1 ? 'cursor-pointer hover:text-primary transition-colors' : 'text-foreground'}
                    onClick={() => {
                      if (idx >= rmBreadcrumb.length - 1) return;
                      const targetZoom = ZOOM_LEVELS[idx + 1];
                      if (targetZoom === 'year') {
                        setRmFocusMonth(null); setRmFocusWeek(null); setRmFocusDay(null);
                      } else if (targetZoom === 'month') {
                        setRmFocusWeek(null); setRmFocusDay(null);
                      } else if (targetZoom === 'week') {
                        setRmFocusDay(null);
                      }
                      setRmZoom(targetZoom);
                    }}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
          )}

          {roadmapNodes.length > 0 ? (
            <div className="relative pl-6">
              <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-gradient-to-b from-primary/60 via-primary/30 to-primary/10" />

              <div className="space-y-1">
                {roadmapNodes.map((node) => {
                  const rmItem = node.items[0] as (TimelineItem & { rmType?: string }) | undefined;
                  const itemRmType = rmItem?.rmType || 'mission';

                  return (
                    <div key={node.key} className="relative">
                      <div
                        className={`absolute left-[-19px] top-4 w-3 h-3 rounded-full border-2 border-primary z-10 transition-all ${
                          rmZoom === 'day'
                            ? 'bg-primary shadow-[0_0_6px_var(--primary-glow-medium)]'
                            : node.count > 0
                            ? 'bg-primary shadow-[0_0_6px_var(--primary-glow-medium)]'
                            : 'bg-background'
                        }`}
                      />

                      {rmZoom === 'day' ? (() => {
                        const rmQuest = rmItem?.quest;
                        const rmLinkedObjective = rmQuest?.visionGoalId
                          ? visionGoals.find(g => g.id === rmQuest?.visionGoalId)
                          : null;
                        const rmCategoryLabels: Record<string, string> = { legacy: "Legacy", "10year": "10-Year", "5year": "5-Year", "18month": "18-Month", "90day": "90-Day" };
                        const rmXpMultiplier = difficultyMultipliers[rmQuest?.difficulty || 'D'] || 1;
                        const rmAdjustedXp = rmQuest ? Math.floor(rmQuest.experienceReward * rmXpMultiplier) : 0;

                        if (itemRmType === 'milestone') {
                          const goal = rmItem?.visionGoal;
                          if (!goal) return null;
                          const linkedMissions = quests.filter(q => q.visionGoalId === goal.id);
                          const completedLinked = linkedMissions.filter(q => q.completed);
                          const activeLinked = linkedMissions.filter(q => !q.completed);
                          const totalEP = linkedMissions.reduce((s, m) => s + (m.energyCost || 0), 0);
                          const totalAT = linkedMissions.reduce((s, m) => s + (m.attentionCost || 0), 0);
                          const totalTT = linkedMissions.reduce((s, m) => s + (m.timeCost || 0), 0);
                          const totalXP = linkedMissions.reduce((s, m) => s + Math.floor((m.experienceReward || 0) * (difficultyMultipliers[m.difficulty || 'D'] || 1)), 0) + (goal.bonusXp || 0);

                          let avgDifficulty: string | null = null;
                          if (linkedMissions.length > 0) {
                            const sum = linkedMissions.reduce((acc, m) => acc + (difficultyOrder[m.difficulty || 'D'] || 1), 0);
                            const avg = Math.round(sum / linkedMissions.length);
                            avgDifficulty = reverseOrder[avg] || null;
                          }
                          const uniqueCategories = Array.from(new Set(linkedMissions.map(m => m.category))).filter(c => c !== 'general');

                          const completeGoalMutation = async (goalId: number) => {
                            await apiRequest(`/api/vision-goals/${goalId}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
                            queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
                          };

                          return (
                            <div className="ml-2 glassmorphic rounded-xl p-4 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border">
                              <div className="flex-grow">
                                <div className="flex justify-between items-start">
                                  <h3 className="font-medium">{node.label}</h3>
                                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                    <button
                                      className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRmExpandedInfoIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(node.key)) next.delete(node.key);
                                          else next.add(node.key);
                                          return next;
                                        });
                                      }}
                                    >
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs font-mono text-muted-foreground">
                                  <span className="text-primary/80">-{totalAT} AT</span>
                                  <span className="text-primary/80">-{totalTT} TT</span>
                                  <span className="text-primary/80">-{totalEP} EP</span>
                                  <span className="text-primary/80">+{totalXP} XP</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>Created: {new Date(goal.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {linkedMissions.length} linked mission{linkedMissions.length !== 1 ? 's' : ''} ({activeLinked.length} active, {completedLinked.length} done)
                                </div>
                                {rmExpandedInfoIds.has(node.key) && (
                                  <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5">
                                    <div className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Objective Description:</span>
                                      <ObsidianMarkdown className="text-xs mt-1 [&_img]:max-w-[200px] [&_img]:rounded [&_p]:m-0">{goal.description || "No description"}</ObsidianMarkdown>
                                    </div>
                                    {uniqueCategories.length > 0 && (
                                      <p className="text-muted-foreground text-xs">
                                        <span className="text-primary font-mono">Objective Type:</span> <span className="capitalize">{uniqueCategories.join(', ')}</span>
                                      </p>
                                    )}
                                    <p className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Objective Difficulty:</span> Rank {avgDifficulty || 'D'}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Objective Reward:</span> {goal.rewardText || "No reward set"}
                                    </p>
                                    {activeLinked.length > 0 && (
                                      <div className="border-t border-primary/10 pt-2 mt-1">
                                        <button
                                          className="flex items-center gap-1 w-full text-left"
                                          onClick={(e) => { e.stopPropagation(); setRmActiveMissionsExpanded(prev => ({ ...prev, [node.key]: !prev[node.key] })); }}
                                        >
                                          {rmActiveMissionsExpanded[node.key] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Active Missions ({activeLinked.length})</span>
                                        </button>
                                        {rmActiveMissionsExpanded[node.key] && (
                                          <div className="mt-1 space-y-0.5 pl-4">
                                            {activeLinked.map(m => (
                                              <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                                                <Target className="h-3 w-3 text-primary shrink-0" />
                                                <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                                                <span className="text-xs text-muted-foreground">—</span>
                                                <span className="text-xs text-foreground/70 truncate">{m.title}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {completedLinked.length > 0 && (
                                      <div className="border-t border-primary/10 pt-2 mt-1">
                                        <button
                                          className="flex items-center gap-1 w-full text-left"
                                          onClick={(e) => { e.stopPropagation(); setRmCompletedMissionsExpanded(prev => ({ ...prev, [node.key]: !prev[node.key] })); }}
                                        >
                                          {rmCompletedMissionsExpanded[node.key] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Completed Missions ({completedLinked.length})</span>
                                        </button>
                                        {rmCompletedMissionsExpanded[node.key] && (
                                          <div className="mt-1 space-y-0.5 pl-4">
                                            {completedLinked.map(m => (
                                              <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                                                <Check className="h-3 w-3 text-primary shrink-0" />
                                                <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                                                <span className="text-xs text-muted-foreground">—</span>
                                                <span className="text-xs text-muted-foreground truncate">{m.title}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); completeGoalMutation(goal.id); }}
                                  >
                                    Complete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="ml-2 glassmorphic rounded-xl p-4 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border">
                            <div className="flex-grow">
                              <div className="flex justify-between items-start">
                                <h3 className="font-medium">
                                  {node.label}
                                </h3>
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                  <button
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRmExpandedInfoIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(node.key)) next.delete(node.key);
                                        else next.add(node.key);
                                        return next;
                                      });
                                    }}
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {rmQuest && rmQuest.category !== "event" && (
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(rmQuest.attentionCost)} AT</span>
                                  <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(rmQuest.timeCost)} TT</span>
                                  <span className="text-primary text-xs font-mono whitespace-nowrap">-{formatStatCost(rmQuest.energyCost)} EP</span>
                                  <span className="text-primary text-xs font-mono whitespace-nowrap">+{rmAdjustedXp} XP</span>
                                </div>
                              )}
                              {rmQuest && (() => {
                                const q = rmQuest;
                                const hasSchedule = q.startDate || q.startTime || q.endDate || q.endTime;
                                if (!hasSchedule) return null;
                                const fmtDate = (ds: string) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
                                const fmtTimeLocal = (ts: string) => { const [h, mn] = ts.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${mn} ${hr >= 12 ? 'PM' : 'AM'}`; };
                                return (
                                  <div className="flex items-center gap-1 text-xs mt-1 flex-wrap text-muted-foreground">
                                    {q.startDate && <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="h-3 w-3 flex-shrink-0" />{fmtDate(q.startDate)}</span>}
                                    {q.startTime && <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 flex-shrink-0" />{fmtTimeLocal(q.startTime)}</span>}
                                    {(q.endDate || q.endTime) && <span className="text-primary flex-shrink-0">→</span>}
                                    {q.endDate && <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="h-3 w-3 flex-shrink-0" />{fmtDate(q.endDate)}</span>}
                                    {q.endTime && <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3 flex-shrink-0" />{fmtTimeLocal(q.endTime)}</span>}
                                  </div>
                                );
                              })()}
                              {rmExpandedInfoIds.has(node.key) && (
                                <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5">
                                  {(() => {
                                    const onboardingDesc = rmQuest?.category === "onboarding" && rmQuest?.title
                                      ? getOnboardingDescription(rmQuest.title, rmQuest.description || '')
                                      : null;
                                    const displayDesc = onboardingDesc || rmQuest?.description || node.items[0]?.description;
                                    return displayDesc ? (
                                      <div className="text-muted-foreground text-xs">
                                        <span className="text-primary font-mono">Mission Description:</span>
                                        <ObsidianMarkdown className="text-xs mt-1 [&_img]:max-w-[200px] [&_img]:rounded [&_p]:m-0">{displayDesc}</ObsidianMarkdown>
                                      </div>
                                    ) : null;
                                  })()}
                                  {rmLinkedObjective && (
                                    <p className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Mission Objective — {rmCategoryLabels[rmLinkedObjective.category] || rmLinkedObjective.category} Vision:</span> {rmLinkedObjective.title}
                                    </p>
                                  )}
                                  {rmQuest?.category && rmQuest.category !== "general" && rmQuest.category !== "onboarding" && (
                                    <p className="text-muted-foreground text-xs">
                                      <span className="text-primary font-mono">Mission Type — <span className="capitalize">{rmQuest.category}</span>:</span> {
                                        categoryDescriptions[rmQuest.category] || userCategories.find(uc => uc.value === rmQuest?.category)?.description || 'Auto-classified mission category.'
                                      }
                                    </p>
                                  )}
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Mission Difficulty — Rank {rmQuest?.difficulty || 'D'}:</span> {difficultyDescriptions[rmQuest?.difficulty || 'D']}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })() : (
                        <div
                          className="ml-2 py-3 px-4 glassmorphic rounded-xl cursor-pointer hover:shadow-[0_0_8px_var(--primary-glow-light)] transition-all group border border-primary/10 hover:border-primary/30"
                          onClick={() => handleRmNodeClick(node)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-base font-orbitron text-foreground group-hover:text-primary transition-colors">
                                {node.label}
                              </h3>
                              {node.sublabel && (
                                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{node.sublabel}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {node.count} {node.count === 1 ? 'item' : 'items'}
                              </span>
                              <ChevronDown className="h-4 w-4 text-primary/50 group-hover:text-primary transition-colors -rotate-90" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glassmorphic rounded-xl p-8 neon-border text-center">
              <Rocket className="h-8 w-8 text-primary/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {rmZoom === 'life'
                  ? 'No upcoming items. Set vision goals and schedule missions to build your roadmap.'
                  : 'No items at this time level. Zoom out to see more.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
