import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  Calendar, BarChart, CalendarDays, Clock, Brain, AlarmClock, 
  MoonStar, Smile, HeartPulse, Book, BookOpen, ListChecks, 
  Zap, Target as TargetIcon, ChevronDown, Check, Search, FileText, Play, Link2
} from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { UserStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { CustomTimePicker } from '@/components/ui/custom-time-picker';
import EnhancedMissionWidget from '@/components/dashboard/EnhancedMissionWidget';
import { DailyInitModal } from '@/components/dailyInit/DailyInitModal';
import { useToast } from '@/hooks/use-toast';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import { DraggableWidget, DraggableWidgetProps } from '@/components/ui/draggable-widget';
import update from 'immutability-helper';
import { useWidgetState } from '@/hooks/use-widget-state';
import { LevelUpModal } from '@/components/dashboard/LevelUpModal';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { getLocalDateString } from '@/lib/utils';

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
  return <DraggableWidget {...props} isOpenProp={isOpen} onOpenChange={setIsOpen} />;
}

export default function DashboardPage() {
  // Set the page title
  usePageTitle('Dashboard');
  
  const { 
    stats, username, events, updateUserStats, 
    energyLog, updateEnergyLog, resetEnergyLog,
    intentionLog, updateIntentionLog, resetIntentionLog,
    dataLog, updateDataLog, resetDataLog,
    reflectionLog: reflectionLogState, updateReflectionLog: updateReflectionLogState, resetReflectionLog
  } = useLYFEOS();
  const { user, isAuthenticated, registerPreLogoutCallback, unregisterPreLogoutCallback } = useAuth();
  const { toast } = useToast();
  
  // Level-up modal state
  const [isLevelUpModalOpen, setIsLevelUpModalOpen] = useState(false);
  
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
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false // Don't retry on auth errors
  });
  
  // Track which database record has been loaded (fingerprint) - only allow saves for that record
  const loadedRecordFingerprintRef = useRef<string | null>(null);
  
  // Track if user has actually made changes (dirty flag) - prevents saving defaults
  const isDirtyRef = useRef(false);
  
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
  
  // Watch for level-up changes
  useEffect(() => {
    // If showLevelUp is true, display the LevelUpModal
    if (stats?.experience?.showLevelUp) {
      setIsLevelUpModalOpen(true);
    }
  }, [stats?.experience?.showLevelUp]);
  
  // Debounce timer ref for daily log saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const handleBlurSave = useCallback(() => {
    if (!isDirtyRef.current || !isAllLogsLoaded) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const currentFingerprint = loadedRecordFingerprintRef.current;
    const savePromise = saveDailyLogMutation.mutateAsync({ ...buildSavePayload(), _expectedFingerprint: currentFingerprint || undefined })
      .catch(e => console.error("Blur save failed:", e))
      .finally(() => {
        if (pendingSavePromiseRef.current === savePromise) {
          pendingSavePromiseRef.current = null;
        }
      });
    pendingSavePromiseRef.current = savePromise;
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
  
  // Render state selector (1-10 scale)
  const renderStateSelector = (
    state: number,
    onChange: (value: number) => void,
    label: string,
    icon: React.ReactNode
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm flex items-center text-[#7DAAB2]">
          {icon}
          <span className="ml-2">{label}</span>
        </label>
        <span className="text-[#D6F4FF] font-mono">{state}/10</span>
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
      title: "Daily Data Log",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Capture your daily thoughts, information consumed, and ideas. These entries are saved to your journal and can be reviewed in the Chronilog."
    },
    {
      id: 'research-log',
      title: "Daily Research Log",
      icon: <Search className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Document your research findings, revision summaries, and execution plans. Track the lifecycle of ideas from discovery through implementation."
    },
    {
      id: 'reflection-log',
      title: "Daily Reflection Log",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Reflect on what went well, what could improve, and lessons learned. Daily reflection builds self-awareness and accelerates growth."
    },
    {
      id: 'intention-setter',
      title: "Daily Intention Log",
      icon: <TargetIcon className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Set your focus and priorities for the day. Clear intentions help direct your energy and attention toward what matters most."
    },
    {
      id: 'energy-log',
      title: "Daily Energy Log",
      icon: <Brain className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Track your energy levels, sleep, exercise, and mood throughout the day. Understanding your patterns helps optimize your performance."
    }
  ]);

  // Render widget content dynamically based on id
  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'reflection-log':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Smile className="h-4 w-4 text-primary" />
                <span className="ml-2">What went well today?</span>
              </label>
              <MarkdownEditor
                placeholder="Capture your wins, positive moments, and things you're proud of..."
                value={reflection.wentWell}
                onChange={(value) => updateReflection("wentWell", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <TargetIcon className="h-4 w-4 text-primary" />
                <span className="ml-2">What could have been better?</span>
              </label>
              <MarkdownEditor
                placeholder="Areas for improvement, challenges faced, or things to do differently..."
                value={reflection.couldBeBetter}
                onChange={(value) => updateReflection("couldBeBetter", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Brain className="h-4 w-4 text-primary" />
                <span className="ml-2">What did I learn?</span>
              </label>
              <MarkdownEditor
                placeholder="Key insights, lessons, or realizations from today..."
                value={reflection.learned}
                onChange={(value) => updateReflection("learned", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
          </div>
        );
      case 'data-entry-log':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
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
                <label className="text-sm flex items-center text-[#7DAAB2]">
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
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="ml-2">To-Do Ideas</span>
              </label>
              <MarkdownEditor
                placeholder="Things you want to remember to do later..."
                value={reflection.todoIdeas}
                onChange={(value) => updateReflection("todoIdeas", value)}
                onBlur={handleBlurSave}
                minHeight="60px"
              />
            </div>
          </div>
        );
      case 'research-log':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
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
              <label className="text-sm flex items-center text-[#7DAAB2]">
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
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Search className="h-4 w-4 text-primary" />
                <span className="ml-2">Research Note</span>
              </label>
              <MarkdownEditor
                placeholder="Document your research findings, observations, and raw notes..."
                value={reflection.researchNote}
                onChange={(value) => updateReflection("researchNote", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <FileText className="h-4 w-4 text-primary" />
                <span className="ml-2">Revision & Summary Note</span>
              </label>
              <MarkdownEditor
                placeholder="Summarize key takeaways, revise earlier findings, and consolidate insights..."
                value={reflection.revisionNote}
                onChange={(value) => updateReflection("revisionNote", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <Play className="h-4 w-4 text-primary" />
                <span className="ml-2">Execution Note</span>
              </label>
              <MarkdownEditor
                placeholder="Plan next steps, action items, and implementation details..."
                value={reflection.executionNote}
                onChange={(value) => updateReflection("executionNote", value)}
                onBlur={handleBlurSave}
                minHeight="80px"
              />
            </div>
          </div>
        );
      case 'intention-setter':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
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
              <label className="text-sm flex items-center text-[#7DAAB2]">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="ml-2">Tomorrow's Goals</span>
              </label>
              <div className="flex flex-col space-y-2">
                <MarkdownEditor
                  placeholder="What three things do you want to accomplish tomorrow?"
                  value={reflection.tomorrowGoals}
                  onChange={(value) => updateReflection("tomorrowGoals", value)}
                  onBlur={handleBlurSave}
                  minHeight="60px"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm flex items-center text-[#7DAAB2]">
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
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <AlarmClock className="h-4 w-4 text-primary" />
                  <span className="ml-2">Wake Time</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 w-full">
                    <AlarmClock className="h-4 w-4 text-primary/70" />
                    <CustomTimePicker
                      value={reflection.wakeTime}
                      onChange={(value) => updateReflection("wakeTime", value)}
                      className="flex-grow"
                    />
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm flex items-center text-[#7DAAB2]">
                  <MoonStar className="h-4 w-4 text-primary" />
                  <span className="ml-2">Sleep Time</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 w-full">
                    <MoonStar className="h-4 w-4 text-primary/70" />
                    <CustomTimePicker
                      value={reflection.sleepTime}
                      onChange={(value) => updateReflection("sleepTime", value)}
                      className="flex-grow"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border-t border-primary/10 pt-4 mb-2">
              <div className="flex items-center justify-between text-sm mb-3">
                <label className="flex items-center text-[#7DAAB2] font-bold">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="ml-2">Energy Recap</span>
                </label>
                <div className="flex items-center">
                  <span className="text-[#7DAAB2] mr-2">Daily Total:</span>
                  <span className="text-[#D6F4FF] font-mono">
                    {Math.round(((reflection.mentalState + reflection.physicalState + reflection.emotionalState) / 30) * 100)}%
                  </span>
                </div>
              </div>
              
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
            </div>
          </div>
        );
      default:
        return null;
    }
  };
  
  // Callback for widget drag and drop reordering
  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgets((prevWidgets) => 
      update(prevWidgets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevWidgets[dragIndex]],
        ],
      })
    );
  }, []);

  return (
      <div className="dashboard-container pb-20">
        <DailyInitModal />
        
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
        <section className="mb-6">
          <div className="glassmorphic rounded-xl p-3 neon-border">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div className="flex items-center">
                <CalendarDays className="h-5 w-5 text-primary mr-2" />
                <h1 className="text-xl sm:text-2xl font-orbitron text-[#D6F4FF]">{formattedDate}</h1>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
                <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
                
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
          <PersistentDraggableWidget
            key={widget.id}
            widgetId={`dashboard.${widget.id}`}
            id={widget.id}
            index={index}
            title={widget.title}
            icon={widget.icon}
            moveWidget={moveWidget}
            defaultOpen={widget.defaultOpen}
            infoDescription={widget.infoDescription}
          >
            {renderWidgetContent(widget.id)}
          </PersistentDraggableWidget>
        ))}
      </div>
  );
}