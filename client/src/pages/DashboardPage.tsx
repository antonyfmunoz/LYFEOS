import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  Calendar, BarChart, CalendarDays, Clock, Brain, AlarmClock, 
  MoonStar, Smile, HeartPulse, Book, BookOpen, ListChecks, 
  Zap, Target as TargetIcon, ChevronDown, Check, Search, FileText, Play, Link2,
  Plus, Archive, ChevronUp, Pencil, X, RotateCcw
} from 'lucide-react';
import { useLYFEOS, type ResearchEntry } from '@/lib/context';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { UserStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { CustomTimePicker } from '@/components/ui/custom-time-picker';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import EnhancedMissionWidget from '@/components/dashboard/EnhancedMissionWidget';
import { useToast } from '@/hooks/use-toast';
import { DraggableWidget, DraggableWidgetProps } from '@/components/ui/draggable-widget';
import update from 'immutability-helper';
import { useWidgetState } from '@/hooks/use-widget-state';
import { LevelUpModal } from '@/components/dashboard/LevelUpModal';
import PageTutorial, { TutorialStep } from '@/components/ui/PageTutorial';
import { useTutorialStatus } from '@/hooks/use-tutorial';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { getLocalDateString } from '@/lib/utils';

const DEFAULT_REFLECTION_PROMPTS = {
  wentWell: "What went well today?",
  couldBeBetter: "What could have been better?",
  learned: "What did I learn?"
} as const;

interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  name: string;
  tasks: { id: string; text: string; completed: boolean }[];
}

interface DailyReflection {
  mentalState: number;
  physicalState: number;
  emotionalState: number;
  wakeTime: string;
  sleepTime: string;
  gratitude: string;
  tomorrowGoals: string;
  annualGoals: string;
  thoughts: string;
  contentConsumed: string;
  research: string;
  sourceAuthor: string;
  sourceMaterial: string;
  researchNote: string;
  revisionNote: string;
  executionNote: string;
  todoIdeas: string;
  researchEntries: ResearchEntry[];
  wentWell: string;
  couldBeBetter: string;
  learned: string;
  date: string; // YYYY-MM-DD format
}

interface WidgetData {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen?: boolean;
}

// Helper function to format time (used for wake/sleep time pickers)
function formatTimeForInput(timeStr: string): string {
  const [hour, minute] = timeStr.split(':').map(Number);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

const TIMEZONE_OPTIONS = [
  { label: 'EST', value: 'America/New_York' },
  { label: 'CST', value: 'America/Chicago' },
  { label: 'MST', value: 'America/Denver' },
  { label: 'PST', value: 'America/Los_Angeles' },
  { label: 'GMT', value: 'Europe/London' },
  { label: 'CET', value: 'Europe/Paris' },
  { label: 'JST', value: 'Asia/Tokyo' },
  { label: 'AEST', value: 'Australia/Sydney' },
  { label: 'NZST', value: 'Pacific/Auckland' }
];

function TimezoneSelector({ timezone, setTimezone }: { timezone: string; setTimezone: (tz: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const currentLabel = TIMEZONE_OPTIONS.find(tz => tz.value === timezone)?.label || 'PST';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="ml-3 font-mono text-xs px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors cursor-pointer flex items-center gap-1"
      >
        {currentLabel}
        <ChevronDown className="h-3 w-3" />
      </button>
      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed min-w-[120px] rounded-md border border-primary/30 bg-background shadow-lg glassmorphic"
          style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
        >
          <div className="p-1">
            {TIMEZONE_OPTIONS.map(tz => (
              <button
                key={tz.value}
                onClick={() => { setTimezone(tz.value); setIsOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono rounded flex items-center justify-between transition-colors ${
                  timezone === tz.value
                    ? "bg-primary/20 text-primary"
                    : "text-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                {tz.label}
                {timezone === tz.value && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function PersistentDraggableWidget({ widgetId, ...props }: Omit<DraggableWidgetProps, 'isOpenProp' | 'onOpenChange'> & { widgetId: string }) {
  const [isOpen, setIsOpen] = useWidgetState(widgetId, props.defaultOpen ?? true);
  return <DraggableWidget {...props} isOpenProp={isOpen} onOpenChange={setIsOpen} headerActions={props.headerActions} />;
}

export default function DashboardPage() {
  // Set the page title
  usePageTitle('Dashboard');
  
  useEffect(() => {
    localStorage.setItem("lyfeos-has-seen-dashboard", "true");
  }, []);
  
  const { 
    stats, username, events, updateUserStats, 
    energyLog, updateEnergyLog, resetEnergyLog,
    intentionLog, updateIntentionLog, resetIntentionLog,
    dataLog, updateDataLog, resetDataLog,
    reflectionLog: reflectionLogState, updateReflectionLog: updateReflectionLogState, resetReflectionLog
  } = useLYFEOS();
  const { user, isAuthenticated, registerPreLogoutCallback, unregisterPreLogoutCallback } = useAuth();
  const { toast } = useToast();
  
  // Custom reflection prompts
  const PROMPT_STORAGE_KEY = "lyfeos_pending_prompts";
  const defaultPrompts = DEFAULT_REFLECTION_PROMPTS;
  const { data: profileForPrompts } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated && !!user,
    staleTime: 60000,
  });
  const serverPrompts = profileForPrompts?.customReflectionPrompts || defaultPrompts;
  const [localPromptOverrides, setLocalPromptOverrides] = useState<Record<string, string> | null>(() => {
    try {
      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.type === "custom") return parsed.prompts;
        if (parsed.type === "reset") return { ...DEFAULT_REFLECTION_PROMPTS };
      }
    } catch {}
    return null;
  });
  const reflectionPrompts = localPromptOverrides !== null
    ? { ...defaultPrompts, ...localPromptOverrides }
    : serverPrompts;
  const reflectionPromptsRef = useRef(reflectionPrompts);
  reflectionPromptsRef.current = reflectionPrompts;
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState("");
  const pendingPromptOp = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (localPromptOverrides === null) return;
    const server = profileForPrompts?.customReflectionPrompts;
    try {
      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      if (!stored) {
        setLocalPromptOverrides(null);
        return;
      }
      const pending = JSON.parse(stored);
      if (pending.type === "reset") {
        if (server === null || server === undefined) {
          sessionStorage.removeItem(PROMPT_STORAGE_KEY);
          setLocalPromptOverrides(null);
        }
      } else if (pending.type === "custom" && server) {
        const allMatch = Object.entries(pending.prompts).every(
          ([k, v]) => server[k] === v
        );
        if (allMatch) {
          sessionStorage.removeItem(PROMPT_STORAGE_KEY);
          setLocalPromptOverrides(null);
        }
      }
    } catch {
      sessionStorage.removeItem(PROMPT_STORAGE_KEY);
      setLocalPromptOverrides(null);
    }
  }, [profileForPrompts?.customReflectionPrompts, localPromptOverrides]);

  const saveReflectionPrompt = useCallback(async (field: string, value: string) => {
    if (!value.trim()) return;
    const currentPrompts = reflectionPromptsRef.current;
    const updated = { ...currentPrompts, [field]: value.trim() };
    setLocalPromptOverrides(updated);
    setEditingPrompt(null);
    sessionStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify({ type: "custom", prompts: updated }));
    queryClient.cancelQueries({ queryKey: ["/api/profile"] });
    queryClient.setQueryData(["/api/profile"], (old: any) => ({
      ...old,
      customReflectionPrompts: updated,
    }));
    const op = pendingPromptOp.current.catch(() => {}).then(async () => {
      try {
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ customReflectionPrompts: updated }),
        });
        queryClient.setQueryData(["/api/profile"], (old: any) => ({
          ...old,
          customReflectionPrompts: updated,
        }));
      } catch (e) {
        console.error("Failed to save reflection prompt", e);
        sessionStorage.removeItem(PROMPT_STORAGE_KEY);
        setLocalPromptOverrides(null);
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      }
    });
    pendingPromptOp.current = op;
  }, []);

  const resetReflectionPrompts = useCallback(async () => {
    setLocalPromptOverrides({ ...defaultPrompts });
    sessionStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify({ type: "reset" }));
    queryClient.cancelQueries({ queryKey: ["/api/profile"] });
    queryClient.setQueryData(["/api/profile"], (old: any) => ({
      ...old,
      customReflectionPrompts: null,
    }));
    const op = pendingPromptOp.current.catch(() => {}).then(async () => {
      try {
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ customReflectionPrompts: null }),
        });
        queryClient.setQueryData(["/api/profile"], (old: any) => ({
          ...old,
          customReflectionPrompts: null,
        }));
      } catch (e) {
        console.error("Failed to reset reflection prompts", e);
        sessionStorage.removeItem(PROMPT_STORAGE_KEY);
        setLocalPromptOverrides(null);
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      }
    });
    pendingPromptOp.current = op;
  }, []);

  // Level-up modal state
  const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
  
  const DASHBOARD_TOUR_STEPS: TutorialStep[] = [
    {
      target: "[data-tour='date-header']",
      title: "Your Daily HUD",
      description: "This is your command center. It shows the current date, time, and timezone. You can switch between 12h/24h format and change timezones.",
      position: "bottom",
    },
    {
      target: "[data-tour='sidebar-nav']",
      title: "Navigation Hub",
      description: "Use the sidebar to switch between Dashboard, Missions, AI Assistant, Chronilog (journal), and your Profile. Each section has its own powerful tools.",
      position: "right",
    },
    {
      target: "[data-tour='mobile-nav']",
      title: "Navigation Menu",
      description: "Tap the floating button in the bottom-right corner to expand your navigation menu. From there you can switch between Dashboard, Missions, AI Assistant, Chronilog (journal), and your Profile.",
      position: "left",
    },
    {
      target: "[data-tour='widget-data-entry-log']",
      title: "Data",
      description: "Capture your daily thoughts, information consumed, and ideas here. These entries are automatically saved to your Chronilog journal for future review.",
      position: "bottom",
    },
    {
      target: "[data-tour='widget-research-log']",
      title: "Research",
      description: "Document your research findings, revision summaries, and execution plans. Track the lifecycle of ideas from discovery through implementation.",
      position: "bottom",
    },
    {
      target: "[data-tour='widget-reflection-log']",
      title: "Reflection",
      description: "Reflect on what went well, what could improve, and lessons learned. Daily reflection builds self-awareness and accelerates personal growth.",
      position: "bottom",
    },
    {
      target: "[data-tour='widget-intention-setter']",
      title: "Intention",
      description: "Set your focus and priorities for the day. Clear intentions help direct your energy and attention toward what matters most.",
      position: "bottom",
    },
    {
      target: "[data-tour='widget-energy-log']",
      title: "Energy",
      description: "Track your energy levels, sleep quality, exercise, and mood throughout the day. Understanding your patterns helps optimize your performance.",
      position: "bottom",
    },
  ];

  const { showTutorial, markComplete: handleTutorialComplete, skipAll: handleSkipAllTutorials, isTutorialActive, isLoading: isTutorialLoading } = useTutorialStatus("dashboard");
  
  // Dashboard state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Track the current date for energy log (to detect date changes) - uses local timezone
  const todayDateStr = getLocalDateString();
  const lastLoadedDateRef = useRef<string>(todayDateStr);
  
  // Ref to track current log values for flush save on logout
  // This allows us to access current values without adding them to effect dependencies
  const currentLogsRef = useRef({
    energyLog,
    intentionLog,
    dataLog,
    reflectionLog: reflectionLogState
  });
  
  // Keep the ref updated with latest values
  useEffect(() => {
    currentLogsRef.current = {
      energyLog,
      intentionLog,
      dataLog,
      reflectionLog: reflectionLogState
    };
  }, [energyLog, intentionLog, dataLog, reflectionLogState]);
  
  // Combine all global log contexts into a unified DailyReflection interface
  const reflection: DailyReflection = {
    // Energy log fields
    mentalState: energyLog.mentalState,
    physicalState: energyLog.physicalState,
    emotionalState: energyLog.emotionalState,
    wakeTime: energyLog.wakeTime,
    sleepTime: energyLog.sleepTime,
    // Intention log fields
    gratitude: intentionLog.gratitude,
    tomorrowGoals: intentionLog.tomorrowGoals,
    annualGoals: intentionLog.annualGoals,
    thoughts: intentionLog.thoughts,
    // Data log fields
    contentConsumed: dataLog.contentConsumed,
    research: dataLog.research,
    sourceAuthor: dataLog.sourceAuthor,
    sourceMaterial: dataLog.sourceMaterial,
    researchNote: dataLog.researchNote,
    revisionNote: dataLog.revisionNote,
    executionNote: dataLog.executionNote,
    todoIdeas: dataLog.todoIdeas,
    researchEntries: dataLog.researchEntries,
    // Reflection log fields
    wentWell: reflectionLogState.wentWell,
    couldBeBetter: reflectionLogState.couldBeBetter,
    learned: reflectionLogState.learned,
    date: todayDateStr
  };
  
  // Load today's energy log from the database
  const { data: dailyLogData, isLoading: isLoadingDailyLog, isSuccess: isDailyLogSuccess, refetch: refetchDailyLog } = useQuery({
    queryKey: ['/api/users', user?.id, 'daily-logs', todayDateStr],
    queryFn: async () => {
      if (!user?.id) return undefined;
      const response = await fetch(`/api/users/${user.id}/daily-logs?date=${todayDateStr}`, {
        credentials: 'include'
      });
      // Throw on auth error to distinguish from "no data" state
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      if (!response.ok) {
        throw new Error('Failed to fetch daily log');
      }
      const data = await response.json();
      // Return the log data or an explicit "no_data" marker (confirmed empty)
      return data.logs?.[0] || { _noData: true, _confirmed: true };
    },
    enabled: !!user?.id && isAuthenticated,
    staleTime: 30000,
    refetchOnMount: 'always',
    retry: false // Don't retry on auth errors
  });
  
  // Track which database record has been loaded (fingerprint) - only allow saves for that record
  const loadedRecordFingerprintRef = useRef<string | null>(null);
  
  // Track if user has actually made changes (dirty flag) - prevents saving defaults
  const isDirtyRef = useRef(false);
  
  useLayoutEffect(() => {
    if (!user?.id || energyLog.isLoaded) return;
    const cached = queryClient.getQueryData(['/api/users', user.id, 'daily-logs', todayDateStr]) as any;
    if (cached && !cached._noData) {
      const fp = `record-${cached.id}-${todayDateStr}`;
      loadedRecordFingerprintRef.current = fp;
      isDirtyRef.current = false;
      updateEnergyLog({
        mentalState: cached.mentalState ?? 5,
        physicalState: cached.physicalState ?? 5,
        emotionalState: cached.emotionalState ?? 5,
        wakeTime: cached.wakeTime ?? "06:00",
        sleepTime: cached.sleepTime ?? "22:00",
        isLoaded: true,
        lastPopulatedFingerprint: fp,
      });
      updateIntentionLog({
        gratitude: cached.gratitude ?? "",
        tomorrowGoals: cached.tomorrowGoals ?? "",
        annualGoals: cached.annualGoals ?? "",
        thoughts: cached.thoughts ?? "",
        isLoaded: true,
        lastPopulatedFingerprint: fp,
      });
      updateDataLog({
        contentConsumed: cached.contentConsumed ?? "",
        research: cached.research ?? "",
        sourceAuthor: cached.sourceAuthor ?? "",
        sourceMaterial: cached.sourceMaterial ?? "",
        researchNote: cached.researchNote ?? "",
        revisionNote: cached.revisionNote ?? "",
        executionNote: cached.executionNote ?? "",
        todoIdeas: cached.todoIdeas ?? "",
        researchEntries: (cached.researchEntries as any[]) || [],
        isLoaded: true,
        lastPopulatedFingerprint: fp,
      });
      updateReflectionLogState({
        wentWell: cached.wentWell ?? "",
        couldBeBetter: cached.couldBeBetter ?? "",
        learned: cached.learned ?? "",
        isLoaded: true,
        lastPopulatedFingerprint: fp,
      });
      lastLoadedDateRef.current = todayDateStr;
    }
  }, [user?.id, todayDateStr, energyLog.isLoaded, updateEnergyLog, updateIntentionLog, updateDataLog, updateReflectionLogState]);
  
  // Save daily log mutation (includes energy, intention, data, and reflection fields)
  // NOTE: We intentionally do NOT invalidate the query cache on success.
  // The form state is the source of truth after initial load. Invalidating would
  // cause a refetch that triggers a race condition, resetting values.
  const saveDailyLogMutation = useMutation({
    mutationFn: async (logData: Partial<DailyReflection> & { _expectedFingerprint?: string; _forceSave?: boolean }) => {
      if (!user?.id) throw new Error("User not authenticated");
      const { _expectedFingerprint, _forceSave, ...dataToSend } = logData;
      
      // Safety check 1: never save if we haven't loaded from DB yet
      if (!loadedRecordFingerprintRef.current) {
        console.log("Skipping save - data not yet loaded from database");
        return { skipped: true };
      }
      
      // Safety check 2: fingerprint mismatch (stale data from before a reload)
      if (_expectedFingerprint && _expectedFingerprint !== loadedRecordFingerprintRef.current) {
        console.log("Skipping save - fingerprint mismatch (stale data)");
        return { skipped: true };
      }
      
      // Safety check 3: don't save if user hasn't made any changes (prevents saving defaults)
      // Can be bypassed with _forceSave for pre-logout flush when we know data is valid
      if (!_forceSave && !isDirtyRef.current) {
        console.log("Skipping save - no user changes (not dirty)");
        return { skipped: true };
      }
      
      return apiRequest(`/api/users/${user.id}/daily-logs`, {
        method: 'POST',
        body: JSON.stringify({
          date: todayDateStr,
          ...dataToSend
        })
      });
    }
  });
  
  // Register pre-logout callback to save data BEFORE session is invalidated
  useEffect(() => {
    const flushSaveBeforeLogout = async () => {
      // Cancel any pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Use REF values (always current) to get the latest log data
      const logs = currentLogsRef.current;
      
      // Only save if: all logs were loaded, user made changes, and we have a valid fingerprint
      const hasValidData = logs.energyLog.isLoaded && logs.intentionLog.isLoaded && 
                           logs.dataLog.isLoaded && logs.reflectionLog.isLoaded;
      const hasFingerprint = !!loadedRecordFingerprintRef.current;
      const isDirty = isDirtyRef.current;
      
      if (hasValidData && hasFingerprint && isDirty) {
        const dataToSave: Partial<DailyReflection> & { _expectedFingerprint?: string; _forceSave?: boolean } = {
          wakeTime: logs.energyLog.wakeTime,
          sleepTime: logs.energyLog.sleepTime,
          mentalState: logs.energyLog.mentalState,
          physicalState: logs.energyLog.physicalState,
          emotionalState: logs.energyLog.emotionalState,
          gratitude: logs.intentionLog.gratitude,
          tomorrowGoals: logs.intentionLog.tomorrowGoals,
          annualGoals: logs.intentionLog.annualGoals,
          thoughts: logs.intentionLog.thoughts,
          contentConsumed: logs.dataLog.contentConsumed,
          research: logs.dataLog.research,
          sourceAuthor: logs.dataLog.sourceAuthor,
          sourceMaterial: logs.dataLog.sourceMaterial,
          researchNote: logs.dataLog.researchNote,
          revisionNote: logs.dataLog.revisionNote,
          executionNote: logs.dataLog.executionNote,
          todoIdeas: logs.dataLog.todoIdeas,
          researchEntries: logs.dataLog.researchEntries,
          wentWell: logs.reflectionLog.wentWell,
          couldBeBetter: logs.reflectionLog.couldBeBetter,
          learned: logs.reflectionLog.learned,
          _expectedFingerprint: loadedRecordFingerprintRef.current || undefined,
          _forceSave: true, // Bypass dirty check since we already verified
        };
        console.log("Pre-logout: Flushing save with data:", dataToSave);
        
        // Wait for the mutation to complete to ensure data is saved before logout proceeds
        await saveDailyLogMutation.mutateAsync(dataToSave);
        console.log("Pre-logout: Save completed successfully");
      } else {
        console.log(`Pre-logout: Skipping save - hasValidData: ${hasValidData}, hasFingerprint: ${hasFingerprint}, isDirty: ${isDirty}`);
      }
    };
    
    // Register the callback
    registerPreLogoutCallback(flushSaveBeforeLogout);
    
    // Cleanup: unregister on unmount
    return () => {
      unregisterPreLogoutCallback(flushSaveBeforeLogout);
    };
  }, [registerPreLogoutCallback, unregisterPreLogoutCallback, saveDailyLogMutation]);
  
  // Populate all log states from database when data is loaded
  useEffect(() => {
    // Only run when query has successfully completed (not loading)
    if (isDailyLogSuccess && !isLoadingDailyLog && dailyLogData) {
      const dataFingerprint = dailyLogData._noData 
        ? `nodata-${todayDateStr}` 
        : `record-${dailyLogData.id}-${todayDateStr}`;
      
      const isNovaRefresh = awaitingNovaRefreshRef.current;
      if (isNovaRefresh) {
        awaitingNovaRefreshRef.current = false;
        console.log("NOVA refresh detected - forcing re-populate from DB");
      }
      
      if (!isNovaRefresh && energyLog.lastPopulatedFingerprint === dataFingerprint) {
        return;
      }
      
      console.log("Daily log data loaded:", dailyLogData);
      
      // Cancel any pending debounced save from before load (prevents stale default values from saving)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        console.log("Cancelled pending save before DB hydration");
      }
      
      // Mark which record we loaded - saves will only be allowed for this fingerprint
      loadedRecordFingerprintRef.current = dataFingerprint;
      
      // Check if this is actual data or the "no data" marker
      if (!dailyLogData._noData) {
        // Data exists in database - populate all global contexts and reset dirty flag
        isDirtyRef.current = false;
        updateEnergyLog({
          mentalState: dailyLogData.mentalState ?? 5,
          physicalState: dailyLogData.physicalState ?? 5,
          emotionalState: dailyLogData.emotionalState ?? 5,
          wakeTime: dailyLogData.wakeTime ?? "06:00",
          sleepTime: dailyLogData.sleepTime ?? "22:00",
          isLoaded: true,
          lastPopulatedFingerprint: dataFingerprint,
        });
        updateIntentionLog({
          gratitude: dailyLogData.gratitude ?? "",
          tomorrowGoals: dailyLogData.tomorrowGoals ?? "",
          annualGoals: dailyLogData.annualGoals ?? "",
          thoughts: dailyLogData.thoughts ?? "",
          isLoaded: true,
          lastPopulatedFingerprint: dataFingerprint,
        });
        updateDataLog({
          contentConsumed: dailyLogData.contentConsumed ?? "",
          research: dailyLogData.research ?? "",
          sourceAuthor: dailyLogData.sourceAuthor ?? "",
          sourceMaterial: dailyLogData.sourceMaterial ?? "",
          researchNote: dailyLogData.researchNote ?? "",
          revisionNote: dailyLogData.revisionNote ?? "",
          executionNote: dailyLogData.executionNote ?? "",
          todoIdeas: dailyLogData.todoIdeas ?? "",
          researchEntries: (dailyLogData.researchEntries as any[]) || [],
          isLoaded: true,
          lastPopulatedFingerprint: dataFingerprint,
        });
        updateReflectionLogState({
          wentWell: dailyLogData.wentWell ?? "",
          couldBeBetter: dailyLogData.couldBeBetter ?? "",
          learned: dailyLogData.learned ?? "",
          isLoaded: true,
          lastPopulatedFingerprint: dataFingerprint,
        });
      } else {
        // No data in DB - mark all as loaded but check if user already typed content locally
        const hasLocalEdits = 
          dataLog.todoIdeas !== "" || dataLog.contentConsumed !== "" || dataLog.researchNote !== "" ||
          dataLog.revisionNote !== "" || dataLog.executionNote !== "" || dataLog.sourceAuthor !== "" ||
          dataLog.sourceMaterial !== "" || dataLog.research !== "" ||
          intentionLog.gratitude !== "" || intentionLog.tomorrowGoals !== "" ||
          intentionLog.annualGoals !== "" || intentionLog.thoughts !== "" ||
          reflectionLogState.wentWell !== "" || reflectionLogState.couldBeBetter !== "" ||
          reflectionLogState.learned !== "" ||
          (energyLog.wakeTime !== "" && energyLog.wakeTime !== "06:00") ||
          (energyLog.sleepTime !== "" && energyLog.sleepTime !== "22:00") ||
          energyLog.mentalState !== 5 || energyLog.physicalState !== 5 || energyLog.emotionalState !== 5;
        
        if (hasLocalEdits) {
          isDirtyRef.current = true;
          console.log("Preserving local edits that were entered before DB load");
        } else {
          isDirtyRef.current = false;
        }
        
        updateEnergyLog({ isLoaded: true, lastPopulatedFingerprint: dataFingerprint });
        updateIntentionLog({ isLoaded: true, lastPopulatedFingerprint: dataFingerprint });
        updateDataLog({ isLoaded: true, lastPopulatedFingerprint: dataFingerprint });
        updateReflectionLogState({ isLoaded: true, lastPopulatedFingerprint: dataFingerprint });
      }
      lastLoadedDateRef.current = todayDateStr;
    }
  }, [dailyLogData, todayDateStr, isDailyLogSuccess, isLoadingDailyLog, energyLog.lastPopulatedFingerprint, updateEnergyLog, updateIntentionLog, updateDataLog, updateReflectionLogState]);
  
  useEffect(() => {
    const handler = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      awaitingNovaRefreshRef.current = true;
      isDirtyRef.current = false;
      refetchDailyLog();
    };
    window.addEventListener("nova-daily-log-updated", handler);
    return () => window.removeEventListener("nova-daily-log-updated", handler);
  }, [refetchDailyLog]);

  // Track previous auth state to detect login events
  // Initialize with current auth state to avoid false "login" detection on component remount
  const wasAuthenticatedRef = useRef<boolean | null>(null);
  
  // Reset all logs and refetch when authentication state changes
  useEffect(() => {
    // On first render, just capture current state without treating it as a login
    if (wasAuthenticatedRef.current === null) {
      wasAuthenticatedRef.current = isAuthenticated;
      // If already authenticated on mount, the useQuery will handle data loading
      return;
    }
    
    // Detect transition from not authenticated to authenticated (login)
    if (isAuthenticated && !wasAuthenticatedRef.current && user?.id) {
      // Reset all global log contexts so new data will populate
      resetEnergyLog();
      resetIntentionLog();
      resetDataLog();
      resetReflectionLog();
      // Direct refetch when user becomes authenticated (more reliable than invalidate)
      refetchDailyLog();
    }
    // When user logs out - just reset contexts (save is handled by pre-logout callback)
    if (!isAuthenticated && wasAuthenticatedRef.current) {
      // Cancel any pending debounced save (save already happened in pre-logout callback)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Reset loaded record fingerprint - next login needs fresh data before saving
      loadedRecordFingerprintRef.current = null;
      // Reset dirty flag - new session starts fresh
      isDirtyRef.current = false;
      
      // Reset the contexts after logout
      resetEnergyLog();
      resetIntentionLog();
      resetDataLog();
      resetReflectionLog();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, user?.id, refetchDailyLog, resetEnergyLog, resetIntentionLog, resetDataLog, resetReflectionLog]);
  
  // Reset all log data when day changes
  useEffect(() => {
    if (lastLoadedDateRef.current !== todayDateStr) {
      // New day detected - reset all logs via global context
      resetEnergyLog();
      resetIntentionLog();
      resetDataLog();
      resetReflectionLog();
      // Reset loaded record fingerprint - new day needs fresh data before saving
      loadedRecordFingerprintRef.current = null;
      // Reset dirty flag - new day starts fresh
      isDirtyRef.current = false;
      lastLoadedDateRef.current = todayDateStr;
      // Invalidate to reload from server for the new day
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'daily-logs'] });
    }
  }, [todayDateStr, user?.id, resetEnergyLog, resetIntentionLog, resetDataLog, resetReflectionLog]);
  
  // Format current date 
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Format time
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
    timeZone: timezone
  });
  
  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Midnight rollover detection (checks every 30 seconds)
  useEffect(() => {
    const midnightCheck = setInterval(() => {
      const newDateStr = getLocalDateString();
      if (lastLoadedDateRef.current !== newDateStr) {
        setCurrentDate(new Date());
        resetEnergyLog();
        resetIntentionLog();
        resetDataLog();
        resetReflectionLog();
        loadedRecordFingerprintRef.current = null;
        isDirtyRef.current = false;
        lastLoadedDateRef.current = newDateStr;
        queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'daily-logs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'stats'] });
        toast({
          title: "New day started!",
          description: stats?.streakDays ? `Current streak: ${stats.streakDays} days. Keep going!` : "Your daily logs have been refreshed.",
        });
      }
    }, 30000);
    return () => clearInterval(midnightCheck);
  }, [user?.id, stats?.streakDays, toast, resetEnergyLog, resetIntentionLog, resetDataLog, resetReflectionLog]);
  
  // Watch for level-up changes
  useEffect(() => {
    // If showLevelUp is true, display the LevelUpModal
    if (stats?.experience?.showLevelUp) {
      setIsLevelUpModalOpen(true);
    }
  }, [stats?.experience?.showLevelUp]);
  
  // Debounce timer ref for daily log saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blurSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSavePromiseRef = useRef<Promise<void> | null>(null);
  const awaitingNovaRefreshRef = useRef(false);
  
  const isAllLogsLoaded = energyLog.isLoaded && intentionLog.isLoaded && dataLog.isLoaded && reflectionLogState.isLoaded;

  const latestLogsRef = useRef({ energyLog, intentionLog, dataLog, reflectionLogState });
  latestLogsRef.current = { energyLog, intentionLog, dataLog, reflectionLogState };

  const buildSavePayload = useCallback((): Partial<DailyReflection> => {
    const { energyLog: e, intentionLog: i, dataLog: d, reflectionLogState: r } = latestLogsRef.current;
    return {
      wakeTime: e.wakeTime,
      sleepTime: e.sleepTime,
      mentalState: e.mentalState,
      physicalState: e.physicalState,
      emotionalState: e.emotionalState,
      gratitude: i.gratitude,
      tomorrowGoals: i.tomorrowGoals,
      annualGoals: i.annualGoals,
      thoughts: i.thoughts,
      contentConsumed: d.contentConsumed,
      research: d.research,
      sourceAuthor: d.sourceAuthor,
      sourceMaterial: d.sourceMaterial,
      researchNote: d.researchNote,
      revisionNote: d.revisionNote,
      executionNote: d.executionNote,
      todoIdeas: d.todoIdeas,
      researchEntries: d.researchEntries,
      wentWell: r.wentWell,
      couldBeBetter: r.couldBeBetter,
      learned: r.learned,
    };
  }, []);

  useEffect(() => {
    if (isAllLogsLoaded && isDirtyRef.current && !saveTimeoutRef.current) {
      console.log("Logs loaded with pending local edits - scheduling save");
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        const currentFingerprint = loadedRecordFingerprintRef.current;
        saveDailyLogMutation.mutate({ ...buildSavePayload(), _expectedFingerprint: currentFingerprint || undefined });
      }, 500);
    }
  }, [isAllLogsLoaded, buildSavePayload, saveDailyLogMutation]);

  useEffect(() => {
    const flushHandler = async (event: Event) => {
      const onComplete = (event as CustomEvent)?.detail?.onComplete;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (pendingSavePromiseRef.current) {
        try {
          await pendingSavePromiseRef.current;
        } catch (_) {}
      }
      if (isDirtyRef.current && isAllLogsLoaded) {
        const currentFingerprint = loadedRecordFingerprintRef.current;
        try {
          await saveDailyLogMutation.mutateAsync({ ...buildSavePayload(), _expectedFingerprint: currentFingerprint || undefined });
        } catch (e) {
          console.error("Flush save failed:", e);
        }
      }
      onComplete?.();
    };
    window.addEventListener("nova-flush-pending-save", flushHandler);
    return () => window.removeEventListener("nova-flush-pending-save", flushHandler);
  }, [saveDailyLogMutation, isAllLogsLoaded, buildSavePayload]);

  // Define field categories
  const energyLogFields = ['mentalState', 'physicalState', 'emotionalState', 'wakeTime', 'sleepTime'];
  const intentionLogFields = ['gratitude', 'tomorrowGoals', 'annualGoals', 'thoughts'];
  const dataLogFields = ['contentConsumed', 'research', 'sourceAuthor', 'sourceMaterial', 'researchNote', 'revisionNote', 'executionNote', 'todoIdeas'];
  const reflectionLogFields = ['wentWell', 'couldBeBetter', 'learned'];
  
  // Update reflection and auto-save all fields
  // Uses a short setTimeout to let React flush state updates before reading latestLogsRef
  const handleBlurSave = useCallback(() => {
    if (!isDirtyRef.current || !isAllLogsLoaded) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (blurSaveTimeoutRef.current) {
      clearTimeout(blurSaveTimeoutRef.current);
    }
    blurSaveTimeoutRef.current = setTimeout(() => {
      blurSaveTimeoutRef.current = null;
      const currentFingerprint = loadedRecordFingerprintRef.current;
      const savePromise = saveDailyLogMutation.mutateAsync({ ...buildSavePayload(), _expectedFingerprint: currentFingerprint || undefined })
        .catch(e => console.error("Blur save failed:", e))
        .finally(() => {
          if (pendingSavePromiseRef.current === savePromise) {
            pendingSavePromiseRef.current = null;
          }
        });
      pendingSavePromiseRef.current = savePromise;
    }, 50);
  }, [isAllLogsLoaded, buildSavePayload, saveDailyLogMutation]);

  const updateReflection = (field: keyof DailyReflection, value: any) => {
    // Update the appropriate global context based on field type
    if (energyLogFields.includes(field)) {
      updateEnergyLog({ [field]: value });
    } else if (intentionLogFields.includes(field)) {
      updateIntentionLog({ [field]: value });
    } else if (dataLogFields.includes(field)) {
      updateDataLog({ [field]: value });
    } else if (reflectionLogFields.includes(field)) {
      updateReflectionLogState({ [field]: value });
    }
    
    // Mark as dirty - user made a change, so saves are now allowed
    isDirtyRef.current = true;
    
    // Debounce-save to database only if all logs are loaded to prevent partial data overwrites
    if (isAllLogsLoaded) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Build the updated data object with all fields, applying the new value
      const updatedData: Partial<DailyReflection> = {
        // Energy log fields
        wakeTime: field === 'wakeTime' ? value : energyLog.wakeTime,
        sleepTime: field === 'sleepTime' ? value : energyLog.sleepTime,
        mentalState: field === 'mentalState' ? value : energyLog.mentalState,
        physicalState: field === 'physicalState' ? value : energyLog.physicalState,
        emotionalState: field === 'emotionalState' ? value : energyLog.emotionalState,
        // Intention log fields
        gratitude: field === 'gratitude' ? value : intentionLog.gratitude,
        tomorrowGoals: field === 'tomorrowGoals' ? value : intentionLog.tomorrowGoals,
        annualGoals: field === 'annualGoals' ? value : intentionLog.annualGoals,
        thoughts: field === 'thoughts' ? value : intentionLog.thoughts,
        // Data log fields
        contentConsumed: field === 'contentConsumed' ? value : dataLog.contentConsumed,
        research: field === 'research' ? value : dataLog.research,
        sourceAuthor: field === 'sourceAuthor' ? value : dataLog.sourceAuthor,
        sourceMaterial: field === 'sourceMaterial' ? value : dataLog.sourceMaterial,
        researchNote: field === 'researchNote' ? value : dataLog.researchNote,
        revisionNote: field === 'revisionNote' ? value : dataLog.revisionNote,
        executionNote: field === 'executionNote' ? value : dataLog.executionNote,
        todoIdeas: field === 'todoIdeas' ? value : dataLog.todoIdeas,
        researchEntries: dataLog.researchEntries,
        // Reflection log fields
        wentWell: field === 'wentWell' ? value : reflectionLogState.wentWell,
        couldBeBetter: field === 'couldBeBetter' ? value : reflectionLogState.couldBeBetter,
        learned: field === 'learned' ? value : reflectionLogState.learned,
      };
      
      // Capture current fingerprint to validate at save time
      const currentFingerprint = loadedRecordFingerprintRef.current;
      
      // Debounce save (500ms delay)
      saveTimeoutRef.current = setTimeout(() => {
        saveDailyLogMutation.mutate({ ...updatedData, _expectedFingerprint: currentFingerprint || undefined });
      }, 500);
    }
  };
  
  const [expandedArchivedEntries, setExpandedArchivedEntries] = useState(false);
  const [collapsedNotes, setCollapsedNotes] = useState<Record<string, boolean>>({});
  const toggleNoteCollapse = (noteKey: string) => setCollapsedNotes(prev => ({ ...prev, [noteKey]: !prev[noteKey] }));

  const handleNewResearchEntry = useCallback(() => {
    if (!isAllLogsLoaded || !loadedRecordFingerprintRef.current) {
      toast({ title: "Please wait", description: "Your data is still loading. Try again in a moment.", variant: "destructive" });
      return;
    }

    const hasContent = dataLog.sourceAuthor.trim() || dataLog.sourceMaterial.trim() || 
      dataLog.researchNote.trim() || dataLog.revisionNote.trim() || dataLog.executionNote.trim();
    
    if (!hasContent) {
      toast({ title: "Nothing to save", description: "Fill in at least one research field before creating a new entry.", variant: "destructive" });
      return;
    }

    const newEntry: ResearchEntry = {
      sourceAuthor: dataLog.sourceAuthor,
      sourceMaterial: dataLog.sourceMaterial,
      researchNote: dataLog.researchNote,
      revisionNote: dataLog.revisionNote,
      executionNote: dataLog.executionNote,
      savedAt: new Date().toISOString(),
    };

    const updatedEntries = [...dataLog.researchEntries, newEntry];

    updateDataLog({
      researchEntries: updatedEntries,
      sourceAuthor: "",
      sourceMaterial: "",
      researchNote: "",
      revisionNote: "",
      executionNote: "",
    });

    isDirtyRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (blurSaveTimeoutRef.current) {
      clearTimeout(blurSaveTimeoutRef.current);
      blurSaveTimeoutRef.current = null;
    }

    const currentFingerprint = loadedRecordFingerprintRef.current;
    const saveData = {
      ...buildSavePayload(),
      researchEntries: updatedEntries,
      sourceAuthor: "",
      sourceMaterial: "",
      researchNote: "",
      revisionNote: "",
      executionNote: "",
      _expectedFingerprint: currentFingerprint || undefined,
    };
    
    saveDailyLogMutation.mutate(saveData);
  }, [dataLog, updateDataLog, buildSavePayload, saveDailyLogMutation, toast, isAllLogsLoaded]);

  // Render state selector (1-10 scale)
  const renderStateSelector = (
    state: number,
    onChange: (value: number) => void,
    label: string,
    icon: React.ReactNode
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm flex items-center text-primary/60">
          {icon}
          <span className="ml-2">{label}</span>
        </label>
        <span className="text-primary font-mono">{state}/10</span>
      </div>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <Button
            key={num}
            type="button"
            size="sm"
            variant="ghost"
            className={`p-0 w-7 h-7 rounded-md hover:bg-primary/15 hover:text-primary active:bg-primary/20 focus:bg-primary/15 focus-visible:ring-primary/30 ${
              num === state
                ? "bg-primary/15 text-primary border border-primary/50"
                : "text-foreground"
            }`}
            onClick={() => onChange(num)}
          >
            {num}
          </Button>
        ))}
      </div>
    </div>
  );
  
  // Widget metadata interface (without content - content is rendered dynamically)
  interface WidgetMeta {
    id: string;
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
    infoDescription?: string;
  }

  // Define widgets for drag and drop functionality (metadata only)
  const [widgets, setWidgets] = useState<WidgetMeta[]>([
    {
      id: 'data-entry-log',
      title: "Data",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Capture your daily thoughts, information consumed, and ideas. These entries are saved to your journal and can be reviewed in the Chronilog."
    },
    {
      id: 'research-log',
      title: "Research",
      icon: <Search className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Document your research findings, revision summaries, and execution plans. Track the lifecycle of ideas from discovery through implementation."
    },
    {
      id: 'reflection-log',
      title: "Reflection",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Reflect on what went well, what could improve, and lessons learned. Daily reflection builds self-awareness and accelerates growth."
    },
    {
      id: 'intention-setter',
      title: "Intention",
      icon: <TargetIcon className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Set your focus and priorities for the day. Clear intentions help direct your energy and attention toward what matters most."
    },
    {
      id: 'energy-log',
      title: "Energy",
      icon: <Brain className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Track your energy levels, sleep, exercise, and mood throughout the day. Understanding your patterns helps optimize your performance."
    }
  ]);

  // Render widget content dynamically based on id
  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'reflection-log': {
        const promptFields = [
          { key: "wentWell", icon: Smile, placeholder: "Capture your wins, positive moments, and things you're proud of..." },
          { key: "couldBeBetter", icon: TargetIcon, placeholder: "Areas for improvement, challenges faced, or things to do differently..." },
          { key: "learned", icon: Brain, placeholder: "Key insights, lessons, or realizations from today..." },
        ];
        return (
          <div className="space-y-4">
            {promptFields.map(({ key, icon: Icon, placeholder }) => (
              <div key={key} className="space-y-2">
                <div className="text-sm flex items-center text-primary/60">
                  <Icon className="h-4 w-4 text-primary" />
                  {editingPrompt === key ? (
                    <div className="ml-2 flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editingPromptValue}
                        onChange={(e) => setEditingPromptValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveReflectionPrompt(key, editingPromptValue);
                          if (e.key === 'Escape') setEditingPrompt(null);
                        }}
                        autoFocus
                        className="bg-transparent border border-primary/30 rounded px-2 py-0.5 text-sm text-foreground outline-none focus:border-primary/60 flex-1 min-w-0"
                      />
                      <button
                        onClick={() => saveReflectionPrompt(key, editingPromptValue)}
                        className="p-1 text-[#36F1CD] hover:bg-[#36F1CD]/10 rounded transition-colors"
                        title="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingPrompt(null)}
                        className="p-1 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="ml-2">{reflectionPrompts[key as keyof typeof reflectionPrompts] || defaultPrompts[key as keyof typeof defaultPrompts]}</span>
                      <button
                        onClick={() => {
                          setEditingPrompt(key);
                          setEditingPromptValue(reflectionPrompts[key as keyof typeof reflectionPrompts] || defaultPrompts[key as keyof typeof defaultPrompts]);
                        }}
                        className="ml-1.5 p-1 text-muted-foreground/50 hover:text-primary rounded transition-colors"
                        title="Edit prompt"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                <MarkdownEditor
                  placeholder={placeholder}
                  value={(reflection as any)[key]}
                  onChange={(value) => updateReflection(key as keyof DailyReflection, value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              </div>
            ))}
          </div>
        );
      }
      case 'data-entry-log':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <Brain className="h-4 w-4 text-primary" />
                <span className="ml-2">Today's Thoughts</span>
              </label>
              <MarkdownEditor
                placeholder="Capture your thoughts, ideas and discoveries here..."
                value={reflection.thoughts}
                onChange={(value) => updateReflection("thoughts", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <Book className="h-4 w-4 text-primary" />
                <span className="ml-2">Information Consumed</span>
              </label>
              <MarkdownEditor
                placeholder="Articles, books, or videos you consumed today..."
                value={reflection.contentConsumed}
                onChange={(value) => updateReflection("contentConsumed", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="ml-2">To-Do Ideas</span>
              </label>
              <MarkdownEditor
                placeholder="Things you want to remember to do later..."
                value={reflection.todoIdeas}
                onChange={(value) => updateReflection("todoIdeas", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
          </div>
        );
      case 'research-log':
        return (
          <div className="space-y-4">
            {dataLog.researchEntries.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setExpandedArchivedEntries(!expandedArchivedEntries)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">
                      {dataLog.researchEntries.length} saved {dataLog.researchEntries.length === 1 ? 'entry' : 'entries'} today
                    </span>
                  </div>
                  {expandedArchivedEntries ? (
                    <ChevronUp className="h-4 w-4 text-primary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-primary" />
                  )}
                </button>
                
                {expandedArchivedEntries && (
                  <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                    {dataLog.researchEntries.map((entry, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-primary/10 bg-card/50 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-primary">Entry #{idx + 1}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {entry.sourceAuthor && (
                          <div className="text-xs"><span className="text-muted-foreground">Author:</span> <span className="text-foreground">{entry.sourceAuthor}</span></div>
                        )}
                        {entry.sourceMaterial && (
                          <div className="text-xs"><span className="text-muted-foreground">Source:</span> <span className="text-foreground">{entry.sourceMaterial}</span></div>
                        )}
                        {entry.researchNote && (
                          <div className="text-xs"><span className="text-muted-foreground">Research:</span> <span className="text-foreground line-clamp-2">{entry.researchNote}</span></div>
                        )}
                        {entry.revisionNote && (
                          <div className="text-xs"><span className="text-muted-foreground">Revision:</span> <span className="text-foreground line-clamp-2">{entry.revisionNote}</span></div>
                        )}
                        {entry.executionNote && (
                          <div className="text-xs"><span className="text-muted-foreground">Execution:</span> <span className="text-foreground line-clamp-2">{entry.executionNote}</span></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {dataLog.researchEntries.length > 0 
                  ? `Entry #${dataLog.researchEntries.length + 1}` 
                  : "Current Entry"}
              </span>
              <button
                onClick={handleNewResearchEntry}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Entry
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="ml-2">Source Author</span>
              </label>
              <input
                type="text"
                placeholder="Author name..."
                value={reflection.sourceAuthor}
                onChange={(e) => updateReflection("sourceAuthor", e.target.value)}
                onBlur={handleBlurSave}
                className="w-full bg-background/50 border border-primary/20 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="ml-2">Source Material</span>
              </label>
              <input
                type="text"
                placeholder="URL, book title, article, video, or reference..."
                value={reflection.sourceMaterial}
                onChange={(e) => updateReflection("sourceMaterial", e.target.value)}
                onBlur={handleBlurSave}
                className="w-full bg-background/50 border border-primary/20 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => toggleNoteCollapse('researchNote')}
                className="text-sm flex items-center text-primary/60 w-full cursor-pointer hover:text-primary transition-colors"
              >
                <Search className="h-4 w-4 text-primary" />
                <span className="ml-2 flex-1 text-left">Research Note</span>
                {collapsedNotes.researchNote ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronUp className="h-4 w-4 text-primary" />}
              </button>
              {!collapsedNotes.researchNote && (
                <MarkdownEditor
                  placeholder="Document your research findings, observations, and raw notes..."
                  value={reflection.researchNote}
                  onChange={(value) => updateReflection("researchNote", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              )}
            </div>
            
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => toggleNoteCollapse('revisionNote')}
                className="text-sm flex items-center text-primary/60 w-full cursor-pointer hover:text-primary transition-colors"
              >
                <FileText className="h-4 w-4 text-primary" />
                <span className="ml-2 flex-1 text-left">Summary Note</span>
                {collapsedNotes.revisionNote ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronUp className="h-4 w-4 text-primary" />}
              </button>
              {!collapsedNotes.revisionNote && (
                <MarkdownEditor
                  placeholder="Summarize key takeaways, revise earlier findings, and consolidate insights..."
                  value={reflection.revisionNote}
                  onChange={(value) => updateReflection("revisionNote", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              )}
            </div>
            
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => toggleNoteCollapse('executionNote')}
                className="text-sm flex items-center text-primary/60 w-full cursor-pointer hover:text-primary transition-colors"
              >
                <Play className="h-4 w-4 text-primary" />
                <span className="ml-2 flex-1 text-left">Execution Note</span>
                {collapsedNotes.executionNote ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronUp className="h-4 w-4 text-primary" />}
              </button>
              {!collapsedNotes.executionNote && (
                <MarkdownEditor
                  placeholder="Plan next steps, action items, and implementation details..."
                  value={reflection.executionNote}
                  onChange={(value) => updateReflection("executionNote", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              )}
            </div>
          </div>
        );
      case 'intention-setter':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <Smile className="h-4 w-4 text-primary" />
                <span className="ml-2">Gratitude</span>
              </label>
              <div className="flex flex-col space-y-2">
                <MarkdownEditor
                  placeholder="What three things are you most grateful for today?"
                  value={reflection.gratitude}
                  onChange={(value) => updateReflection("gratitude", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="ml-2">Tomorrow's Goals</span>
              </label>
              <div className="flex flex-col space-y-2">
                <MarkdownEditor
                  placeholder="What three things do you want to accomplish tomorrow?"
                  value={reflection.tomorrowGoals}
                  onChange={(value) => updateReflection("tomorrowGoals", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-primary/60">
                <TargetIcon className="h-4 w-4 text-primary" />
                <span className="ml-2">Annual Goals</span>
              </label>
              <div className="flex flex-col space-y-2">
                <MarkdownEditor
                  placeholder="What are your three big targets for the year?"
                  value={reflection.annualGoals}
                  onChange={(value) => updateReflection("annualGoals", value)}
                  onBlur={handleBlurSave}
                  minHeight="80px"
                />
              </div>
            </div>
          </div>
        );
      case 'energy-log':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <AlarmClock className="h-4 w-4 text-primary/70" />
                  <span>Wake Time</span>
                </label>
                <CustomTimePicker
                  value={reflection.wakeTime}
                  onChange={(value) => updateReflection("wakeTime", value)}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <MoonStar className="h-4 w-4 text-primary/70" />
                  <span>Sleep Time</span>
                </label>
                <CustomTimePicker
                  value={reflection.sleepTime}
                  onChange={(value) => updateReflection("sleepTime", value)}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="border-t border-primary/10 pt-4 mb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderStateSelector(
                  reflection.mentalState,
                  (value) => updateReflection("mentalState", value),
                  "Mental State",
                  <Brain className="h-4 w-4 text-primary" />
                )}
                
                {renderStateSelector(
                  reflection.physicalState,
                  (value) => updateReflection("physicalState", value),
                  "Physical State",
                  <HeartPulse className="h-4 w-4 text-primary" />
                )}
                
                {renderStateSelector(
                  reflection.emotionalState,
                  (value) => updateReflection("emotionalState", value),
                  "Emotional State",
                  <Smile className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex items-center justify-end text-sm mt-3">
                <span className="text-muted-foreground mr-2">Daily Total:</span>
                <span className="text-primary font-mono">
                  {Math.round(((reflection.mentalState + reflection.physicalState + reflection.emotionalState) / 30) * 100)}%
                </span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };
  
  const { data: widgetLayouts } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/widget-layouts'],
    enabled: !!user,
  });

  useEffect(() => {
    if (!widgetLayouts?.dashboard) return;
    const savedOrder = widgetLayouts.dashboard;
    setWidgets(prev => {
      const ordered: WidgetMeta[] = [];
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

  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    const prevWidgets = widgetsRef.current;
    const newWidgets = update(prevWidgets, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, prevWidgets[dragIndex]],
      ],
    });
    setWidgets(newWidgets);
    widgetsRef.current = newWidgets;
    const newOrder = newWidgets.map(w => w.id);
    apiRequest('/api/widget-layouts', {
      method: 'PUT',
      body: JSON.stringify({ page: 'dashboard', order: newOrder }),
    }).catch(() => {});
    queryClient.setQueryData<Record<string, string[]>>(['/api/widget-layouts'], (old) => ({
      ...old,
      dashboard: newOrder,
    }));
  }, []);

  return (
      <div className="dashboard-container pb-20">
        <PageTutorial steps={DASHBOARD_TOUR_STEPS} storageKey="dashboard" isOpen={showTutorial} onComplete={handleTutorialComplete} onSkipAll={handleSkipAllTutorials} userId={user?.id} isLoading={isTutorialLoading} />
        
        {/* Level-up modal - shows when user levels up */}
        <LevelUpModal 
          level={stats.experience.level} 
          primaryColor={stats.primaryColor}
          isOpen={isLevelUpModalOpen}
          onClose={() => {
            // Reset the level-up modal state
            setIsLevelUpModalOpen(false);
            
            // Update stats to turn off the showLevelUp flag so it doesn't show again
            if (stats?.experience?.showLevelUp) {
              // Create an updated copy of stats with showLevelUp set to false
              const updatedStats = {
                ...stats,
                experience: {
                  ...stats.experience,
                  showLevelUp: false
                }
              };
              updateUserStats(updatedStats);
            }
          }}
        />
        
        {/* Date Header - Cinematic HUD Style */}
        <section className="mb-6" data-tour="date-header">
          <div className="glassmorphic rounded-xl p-3 neon-border">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div className="flex items-center">
                <CalendarDays className="h-5 w-5 text-primary mr-2" />
                <h1 className="text-xl sm:text-2xl font-orbitron text-primary">{formattedDate}</h1>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <Clock className="h-4 w-4 text-primary/60 mr-2" />
                <span className="text-primary/60 font-mono">{formattedTime}</span>
                
                <TimezoneSelector timezone={timezone} setTimezone={setTimezone} />
                
                <button 
                  onClick={() => setTimeFormat(prev => prev === '12h' ? '24h' : '12h')}
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                >
                  {timeFormat === '12h' ? '24h' : '12h'}
                </button>
              </div>
            </div>
          </div>
        </section>
        
        {/* Draggable Widget Sections */}
        {widgets.map((widget, index) => (
          <div key={widget.id} data-tour={`widget-${widget.id}`}>
            <PersistentDraggableWidget
              widgetId={`dashboard.${widget.id}`}
              id={widget.id}
              index={index}
              title={widget.title}
              icon={widget.icon}
              moveWidget={moveWidget}
              defaultOpen={widget.defaultOpen}
              infoDescription={widget.infoDescription}
              headerActions={widget.id === 'reflection-log' && (
                reflectionPrompts.wentWell !== defaultPrompts.wentWell ||
                reflectionPrompts.couldBeBetter !== defaultPrompts.couldBeBetter ||
                reflectionPrompts.learned !== defaultPrompts.learned
              ) ? (
                <button
                  onClick={resetReflectionPrompts}
                  className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  title="Reset prompts to defaults"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : undefined}
            >
              {renderWidgetContent(widget.id)}
            </PersistentDraggableWidget>
          </div>
        ))}

        <PWAInstallPrompt tutorialActive={isTutorialActive} tutorialLoading={isTutorialLoading} />
      </div>
  );
}