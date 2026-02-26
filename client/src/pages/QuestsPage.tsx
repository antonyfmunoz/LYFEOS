import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import PageTutorial, { TutorialStep } from '@/components/ui/PageTutorial';
import { useTutorialStatus } from '@/hooks/use-tutorial';
import { useWidgetState } from "@/hooks/use-widget-state";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDrag, useDrop } from 'react-dnd';
import update from 'immutability-helper';
import QuestItem, { QUEST_DND_TYPE, DragItem } from "../components/dashboard/QuestItem";

const VISUAL_ITEM_DND_TYPE = 'VISUAL_ITEM';

interface VisualDragItem {
  index: number;
  section: string;
  type: string;
  ritualGroup: string | null;
  missionIds: string[];
}
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextArea } from "@/components/ui/rich-text-toolbar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Zap, Star, Bell, BellOff, BellRing, Edit3, Trash2, X, ChevronDown, ChevronRight, ChevronLeft, Target, Calendar, CalendarDays, LayoutList, Clock, CheckCircle2, GraduationCap, Inbox, Info, Archive, Undo2, Repeat, Loader2, FileText, FolderOpen, Link2, GripVertical, Download, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ObsidianMarkdown } from "@/components/ui/obsidian-markdown";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";
import { useToast } from "@/hooks/use-toast";
import { achievementToast } from "@/lib/gamified-toast";
import { Quest, QuestNotification } from "@/lib/types";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ONBOARDING_MISSIONS = [
  { id: 0, title: "Access & Quickstart", xp: 100, difficulty: "D", duration: 10, energyCost: 10, attentionCost: 10, timeCost: 10, description: "Log in, explore the dashboard, and complete your first quick mission to get familiar with LYFEOS." },
  { id: 1, title: "Archetype Calibration", xp: 150, difficulty: "D", duration: 15, energyCost: 15, attentionCost: 15, timeCost: 15, description: "Discover your player archetype through a guided assessment to personalize your LYFEOS experience." },
  { id: 2, title: "Identity & Direction", xp: 75, difficulty: "D", duration: 8, energyCost: 8, attentionCost: 8, timeCost: 8, description: "Define your core identity pillars and set your life direction compass." },
  { id: 3, title: "Craft & Mastery", xp: 60, difficulty: "D", duration: 6, energyCost: 6, attentionCost: 6, timeCost: 6, description: "Identify your key skills and craft areas to track mastery progression." },
  { id: 4, title: "Capacity & Constraints", xp: 55, difficulty: "D", duration: 6, energyCost: 6, attentionCost: 6, timeCost: 6, description: "Set your daily energy, attention, and time capacity limits for balanced resource management." },
  { id: 5, title: "Baselines & States", xp: 70, difficulty: "D", duration: 7, energyCost: 7, attentionCost: 7, timeCost: 7, description: "Establish your baseline stats and current life state for accurate tracking." },
  { id: 6, title: "History & Roots", xp: 50, difficulty: "D", duration: 5, energyCost: 5, attentionCost: 5, timeCost: 5, description: "Record your background and personal history to inform your growth trajectory." },
  { id: 7, title: "Systems & Rituals", xp: 65, difficulty: "D", duration: 7, energyCost: 7, attentionCost: 7, timeCost: 7, description: "Set up your daily rituals and recurring systems for consistent progress." },
];

interface UserCategoryOption {
  id: number;
  value: string;
  label: string;
  description: string | null;
}

interface MissionFormData {
  title: string;
  description: string;
  experienceReward: number;
  difficulty: string;
  category: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  notifications: QuestNotification[];
  isRitualized: boolean;
  ritualGroup: string;
  repeatFrequency: string;
  repeatInterval: number;
  repeatDays: string[];
  repeatEndDate: string;
  visionGoalId: number | null;
  linkedItems: { type: "document" | "folder"; id: number; title: string }[];
  location: string;
  url: string;
  allDay: boolean;
  missionStatus: string;
}

const defaultFormData: MissionFormData = {
  title: "",
  description: "",
  experienceReward: 10,
  difficulty: "D",
  category: "general",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  notifications: [],
  isRitualized: false,
  ritualGroup: "",
  repeatFrequency: "daily",
  repeatInterval: 1,
  repeatDays: [],
  repeatEndDate: "",
  visionGoalId: null,
  linkedItems: [],
  location: "",
  url: "",
  allDay: false,
  missionStatus: "confirmed",
};

interface VisionGoalOption {
  id: number;
  category: string;
  title: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  legacy: "Legacy",
  "10year": "10-Year",
  "5year": "5-Year",
  "18month": "18-Month",
  "90day": "90-Day",
};

const REPEAT_FREQUENCIES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const DAYS_OF_WEEK = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const DIFFICULTY_RANKS = [
  { value: "D", label: "D — Easy" },
  { value: "C", label: "C — Moderate" },
  { value: "B", label: "B — Hard" },
  { value: "A", label: "A — Very Hard" },
  { value: "S", label: "S — Extreme" },
];

const MISSION_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "health", label: "Health" },
  { value: "career", label: "Career" },
  { value: "learning", label: "Learning" },
  { value: "finance", label: "Finance" },
  { value: "social", label: "Social" },
  { value: "creative", label: "Creative" },
  { value: "mindfulness", label: "Mindfulness" },
  { value: "event", label: "Event" },
];

function DroppableSection({ section, onDropQuest, onDropGroup, children, className }: { section: string; onDropQuest: (item: DragItem, targetSection: string) => void; onDropGroup?: (item: VisualDragItem, targetSection: string) => void; children: React.ReactNode; className?: string }) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: [QUEST_DND_TYPE, VISUAL_ITEM_DND_TYPE],
    canDrop: (item: any) => item.section !== section,
    drop: (item: any) => {
      if (item.section === section) return;
      if (item.type === VISUAL_ITEM_DND_TYPE && onDropGroup) {
        onDropGroup(item as VisualDragItem, section);
      } else if (item.type === QUEST_DND_TYPE) {
        onDropQuest(item as DragItem, section);
      }
    },
    collect: (monitor: any) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });
  drop(dropRef);
  const isActive = isOver && canDrop;
  return (
    <div ref={dropRef} className={`${className || ''} ${isActive ? 'ring-2 ring-primary/60 bg-primary/5 rounded-xl transition-all' : canDrop ? 'ring-1 ring-primary/20 rounded-xl transition-all' : ''}`}>
      {children}
    </div>
  );
}

function DraggableVisualItem({ index, section, ritualGroup, missionIds, onMoveVisualItem, children }: {
  index: number;
  section: string;
  ritualGroup: string | null;
  missionIds: string[];
  onMoveVisualItem: (dragIndex: number, hoverIndex: number, section: string) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop({
    accept: VISUAL_ITEM_DND_TYPE,
    collect(monitor: any) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item: VisualDragItem, monitor: any) {
      if (!ref.current) return;
      if (item.section !== section) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      onMoveVisualItem(dragIndex, hoverIndex, section);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: VISUAL_ITEM_DND_TYPE,
    item: () => ({ index, section, type: VISUAL_ITEM_DND_TYPE, ritualGroup, missionIds }),
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  preview(drop(ref));
  drag(dragHandleRef);

  return (
    <div ref={ref} data-handler-id={handlerId} style={{ opacity: isDragging ? 0.4 : 1 }}>
      {ritualGroup ? (
        <div className="relative">
          <div ref={dragHandleRef} className="absolute left-1 top-2.5 cursor-move z-10">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function QuestsPage() {
  usePageTitle('Missions');
  const [, navigate] = useLocation();
  
  const { quests, toggleQuestCompletion, createQuest, updateQuest, deleteQuest, refetchQuests, activeTimerQuest, missionElapsedTimes, missionBreakTimes, startMissionTimer, resumeMissionTimer, restartMissionTimer, userProfile } = useLYFEOS();
  const { user } = useAuth();
  const { toast } = useToast();
  const pushNotifs = usePushNotifications();
  
  const { data: allVisionGoals = [] } = useQuery<VisionGoalOption[]>({
    queryKey: ['/api/vision-goals/all'],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: userCategoriesFromQuery = [] } = useQuery<UserCategoryOption[]>({
    queryKey: ['/api/user-categories'],
    enabled: !!user,
  });

  const { data: allDocuments = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ['/api/documents'],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: allFolders = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/api/folders'],
    enabled: !!user,
    staleTime: 0,
  });

  interface GoogleStatus { connected: boolean; scope: string | null; connectedAt: string | null; }
  const { data: googleStatus } = useQuery<GoogleStatus>({
    queryKey: ['/api/google/status'],
    enabled: !!user,
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const syncGoogle = async (mode: 'calendar' | 'tasks') => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      if (mode === 'calendar') {
        const res = await apiRequest('/api/google/calendar/sync', { method: 'POST' });
        const result = await res.json();
        const parts: string[] = [];
        if (result.imported > 0) parts.push(`${result.imported} imported`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (result.linkedExisting > 0) parts.push(`${result.linkedExisting} linked`);
        if (result.skipped > 0) parts.push(`${result.skipped} already existed`);
        toast({ title: "Calendar synced", description: parts.join(", ") || "Everything is up to date." });
        queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'quests'] });
      } else {
        const tasksRes = await fetch('/api/google/tasks', { credentials: 'include' });
        if (!tasksRes.ok) throw new Error('Failed to fetch tasks');
        const { tasks } = await tasksRes.json();
        if (!tasks || tasks.length === 0) {
          toast({ title: "No tasks found", description: "Your Google Tasks lists are empty." });
          return;
        }
        const importRes = await apiRequest('/api/google/tasks/import', {
          method: 'POST',
          body: JSON.stringify({ tasks }),
        });
        const result = await importRes.json();
        toast({
          title: "Tasks synced",
          description: `Imported ${result.imported} task${result.imported !== 1 ? 's' : ''}${result.skipped > 0 ? `, ${result.skipped} already existed` : ''}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'quests'] });
      }
    } catch (err) {
      toast({ title: "Sync failed", description: `Could not sync ${mode === 'calendar' ? 'calendar' : 'tasks'}.`, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };


  const [localCategoryOverrides, setLocalCategoryOverrides] = useState<UserCategoryOption[] | null>(null);
  
  const userCategories = localCategoryOverrides ?? userCategoriesFromQuery;
  
  useEffect(() => {
    if (localCategoryOverrides !== null) {
      setLocalCategoryOverrides(null);
    }
  }, [userCategoriesFromQuery]);

  const mergedCategories = useMemo(() => {
    const custom = userCategories.map(c => ({ value: c.value, label: c.label }));
    return [...MISSION_CATEGORIES, ...custom];
  }, [userCategories]);

  interface RitualGroupOption { id: number; value: string; label: string; description?: string | null; }
  const DEFAULT_RITUAL_GROUPS = [
    { value: "morning_routine", label: "Morning Routine" },
    { value: "evening_winddown", label: "Evening Wind-down" },
    { value: "workout", label: "Workout" },
    { value: "weekly_review", label: "Weekly Review" },
    { value: "self_care", label: "Self-Care" },
  ];

  const { data: customRitualGroupsFromQuery = [] } = useQuery<RitualGroupOption[]>({
    queryKey: ['/api/ritual-groups'],
    enabled: !!user,
  });
  const [localRitualGroupOverrides, setLocalRitualGroupOverrides] = useState<RitualGroupOption[] | null>(null);
  const customRitualGroups = localRitualGroupOverrides ?? customRitualGroupsFromQuery;
  useEffect(() => {
    if (localRitualGroupOverrides !== null) setLocalRitualGroupOverrides(null);
  }, [customRitualGroupsFromQuery]);

  const allRitualGroups = useMemo(() => {
    return [...DEFAULT_RITUAL_GROUPS, ...customRitualGroups.map(g => ({ value: g.value, label: g.label }))];
  }, [customRitualGroups]);

  const [customRitualGroupMode, setCustomRitualGroupMode] = useState<'create' | null>(null);
  const [customRitualGroupInput, setCustomRitualGroupInput] = useState("");
  const [isSavingRitualGroup, setIsSavingRitualGroup] = useState(false);
  const [editingRitualGroupId, setEditingRitualGroupId] = useState<number | null>(null);
  const [editRitualGroupInput, setEditRitualGroupInput] = useState("");

  const handleSaveCustomRitualGroup = async (formType: 'create' | 'edit') => {
    const inputValue = customRitualGroupInput.trim();
    if (!inputValue) return;
    setIsSavingRitualGroup(true);
    try {
      const descResult = await apiRequest<{ description: string }>("/api/ritual-groups/generate-description", {
        method: "POST",
        body: JSON.stringify({ groupName: inputValue }),
      });
      const newValue = inputValue.toLowerCase().replace(/\s+/g, '_');
      const created = await apiRequest<RitualGroupOption>("/api/ritual-groups", {
        method: "POST",
        body: JSON.stringify({ value: newValue, label: inputValue, description: descResult.description }),
      });
      const newEntry: RitualGroupOption = created && typeof created === 'object' && 'id' in created
        ? created
        : { id: Date.now(), value: newValue, label: inputValue, description: descResult.description };
      setLocalRitualGroupOverrides([...customRitualGroups, newEntry]);
      if (formType === 'create') {
        setCreateFormData(prev => ({ ...prev, ritualGroup: newValue }));
      } else {
        setEditFormData(prev => ({ ...prev, ritualGroup: newValue }));
      }
      setCustomRitualGroupMode(null);
      setCustomRitualGroupInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/ritual-groups'] });
    } catch (error) {
      console.error("Failed to save ritual group:", error);
      toast({ title: "Failed to create ritual group", variant: "destructive" });
    } finally {
      setIsSavingRitualGroup(false);
    }
  };

  const handleDeleteRitualGroup = async (groupId: number) => {
    try {
      await apiRequest(`/api/ritual-groups/${groupId}`, { method: "DELETE" });
      setLocalRitualGroupOverrides(customRitualGroups.filter(g => g.id !== groupId));
      queryClient.invalidateQueries({ queryKey: ['/api/ritual-groups'] });
    } catch (error) {
      toast({ title: "Failed to delete ritual group", variant: "destructive" });
    }
  };

  const handleRenameRitualGroup = async (formType: 'create' | 'edit') => {
    if (!editingRitualGroupId || !editRitualGroupInput.trim()) return;
    setIsSavingRitualGroup(true);
    try {
      const newLabel = editRitualGroupInput.trim();
      const newValue = newLabel.toLowerCase().replace(/\s+/g, '_');
      const oldGroup = customRitualGroups.find(g => g.id === editingRitualGroupId);
      let newDescription: string | undefined;
      try {
        const descResult = await apiRequest<{ description: string }>("/api/ritual-groups/generate-description", {
          method: "POST",
          body: JSON.stringify({ groupName: newLabel }),
        });
        newDescription = descResult.description;
      } catch {
        newDescription = undefined;
      }
      const patchBody: Record<string, string> = { value: newValue, label: newLabel };
      if (newDescription) patchBody.description = newDescription;
      await apiRequest(`/api/ritual-groups/${editingRitualGroupId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      setLocalRitualGroupOverrides(
        customRitualGroups.map(g => g.id === editingRitualGroupId ? { ...g, value: newValue, label: newLabel, ...(newDescription ? { description: newDescription } : {}) } : g)
      );
      if (formType === 'create' && oldGroup && createFormData.ritualGroup === oldGroup.value) {
        setCreateFormData(prev => ({ ...prev, ritualGroup: newValue }));
      }
      if (formType === 'edit' && oldGroup && editFormData.ritualGroup === oldGroup.value) {
        setEditFormData(prev => ({ ...prev, ritualGroup: newValue }));
      }
      setEditingRitualGroupId(null);
      setEditRitualGroupInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/ritual-groups'] });
    } catch (error) {
      toast({ title: "Failed to rename ritual group", variant: "destructive" });
    } finally {
      setIsSavingRitualGroup(false);
    }
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const makePickerProps = (id: string) => ({
    isOpen: activePickerId === id,
    onOpenChange: (open: boolean) => setActivePickerId(open ? id : null),
  });
  
  const [createFormData, setCreateFormData] = useState<MissionFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<MissionFormData>(defaultFormData);
  
  const [customCategoryMode, setCustomCategoryMode] = useState<'create' | 'edit' | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState("");

  const handleSaveCustomCategory = async (formType: 'create' | 'edit') => {
    const inputValue = customCategoryInput.trim();
    if (!inputValue) return;
    setIsSavingCategory(true);
    try {
      const result = await apiRequest<{ description: string }>("/api/user-categories/generate-description", {
        method: "POST",
        body: JSON.stringify({ categoryName: inputValue }),
      });
      const newValue = inputValue.toLowerCase().replace(/\s+/g, '_');
      const created = await apiRequest<UserCategoryOption>("/api/user-categories", {
        method: "POST",
        body: JSON.stringify({ value: newValue, label: inputValue, description: result.description }),
      });
      const newEntry: UserCategoryOption = created && typeof created === 'object' && 'id' in created
        ? created
        : { id: Date.now(), value: newValue, label: inputValue, description: result.description };
      setLocalCategoryOverrides([...userCategories, newEntry]);
      if (formType === 'create') {
        setCreateFormData(prev => ({ ...prev, category: newValue }));
      } else {
        setEditFormData(prev => ({ ...prev, category: newValue }));
      }
      setCustomCategoryMode(null);
      setCustomCategoryInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/user-categories'] });
    } catch (error) {
      console.error("Failed to save custom category:", error);
      toast({ title: "Failed to create category", variant: "destructive" });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleUpdateCategory = async (formType: 'create' | 'edit') => {
    const inputValue = editCategoryInput.trim();
    if (!inputValue || !editingCategoryId) return;
    setIsSavingCategory(true);
    try {
      const newValue = inputValue.toLowerCase().replace(/\s+/g, '_');
      let newDescription: string | undefined;
      try {
        const descResult = await apiRequest<{ description: string }>("/api/user-categories/generate-description", {
          method: "POST",
          body: JSON.stringify({ categoryName: inputValue }),
        });
        newDescription = descResult.description;
      } catch {
        newDescription = undefined;
      }
      const patchBody: Record<string, string> = { value: newValue, label: inputValue };
      if (newDescription) patchBody.description = newDescription;
      await apiRequest(`/api/user-categories/${editingCategoryId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      setLocalCategoryOverrides(
        userCategories.map(c => c.id === editingCategoryId ? { ...c, value: newValue, label: inputValue, ...(newDescription ? { description: newDescription } : {}) } : c)
      );
      if (formType === 'create') {
        setCreateFormData(prev => ({ ...prev, category: newValue }));
      } else {
        setEditFormData(prev => ({ ...prev, category: newValue }));
      }
      setEditingCategoryId(null);
      setEditCategoryInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/user-categories'] });
      refetchQuests();
    } catch (error) {
      console.error("Failed to update category:", error);
      toast({ title: "Failed to update category", variant: "destructive" });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (categoryId: number, categoryValue: string, formType: 'create' | 'edit') => {
    try {
      await apiRequest(`/api/user-categories/${categoryId}`, { method: "DELETE" });
      setLocalCategoryOverrides(userCategories.filter(c => c.id !== categoryId));
      if (formType === 'create' && createFormData.category === categoryValue) {
        setCreateFormData(prev => ({ ...prev, category: 'general' }));
      }
      if (formType === 'edit' && editFormData.category === categoryValue) {
        setEditFormData(prev => ({ ...prev, category: 'general' }));
      }
      queryClient.invalidateQueries({ queryKey: ['/api/user-categories'] });
      refetchQuests();
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast({ title: "Failed to delete category", variant: "destructive" });
    }
  };
  
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'calendar'>('board');
  const [showCompleted, setShowCompleted] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [todayExpanded, setTodayExpanded] = useWidgetState("quests.today", true);
  const [upcomingExpanded, setUpcomingExpanded] = useWidgetState("quests.upcoming", true);
  const [completedExpanded, setCompletedExpanded] = useWidgetState("quests.completed", true);
  const [inboxExpanded, setInboxExpanded] = useWidgetState("quests.inbox", true);
  const [archivedExpanded, setArchivedExpanded] = useWidgetState("quests.archived", true);
  const [terminatedInfoOpen, setTerminatedInfoOpen] = useState<Record<string | number, boolean>>({});
  const [originalDates, setOriginalDates] = useState<Record<string, { startDate?: string; endDate?: string; startTime?: string; endTime?: string }>>({});

  const MISSIONS_TOUR_STEPS: TutorialStep[] = [
    {
      target: "[data-tour='missions-header']",
      title: "Mission Control",
      description: "This is where you manage all your missions. Missions are tasks that earn you XP and help you level up. Think of them as quests in your personal game.",
      position: "bottom",
    },
    {
      target: "[data-tour='create-mission']",
      title: "Create Missions",
      description: "Tap here to create a new mission. Set a title, description, difficulty, schedule, and even make it a recurring ritual.",
      position: "bottom",
    },
    {
      target: "[data-tour='today-missions']",
      title: "Today's",
      description: "Your active missions for today appear here. Check them off as you complete them to earn XP. You can also start a focus timer on any mission.",
      position: "bottom",
    },
    {
      target: "[data-tour='upcoming-missions']",
      title: "Future",
      description: "Missions scheduled for future dates show up here. They'll automatically move to Today when the day arrives.",
      position: "top",
    },
    {
      target: "[data-tour='completed-missions']",
      title: "Completed",
      description: "Missions you've finished today appear here. Each completed mission earns you XP and contributes to your overall progress and stats.",
      position: "top",
    },
    {
      target: "[data-tour='inbox-missions']",
      title: "Archived",
      description: "Missions created from your to-do ideas. Review and prioritize them, or drag them to Today or Future when you're ready to commit.",
      position: "top",
    },
    {
      target: "[data-tour='terminated-missions']",
      title: "Terminated",
      description: "Deleted missions are held here for 24 hours before being permanently removed. You can restore any terminated mission back to your active list within that window.",
      position: "top",
    },
  ];

  const { showTutorial, markComplete: handleTutorialComplete, skipAll: handleSkipAllTutorials, isLoading: isTutorialLoading } = useTutorialStatus("missions");

  const originalDatesRef = useRef(originalDates);
  originalDatesRef.current = originalDates;

  const [archivedQuests, setArchivedQuests] = useState<Quest[]>([]);
  
  const fetchArchivedQuests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiRequest<Quest[]>("/api/quests/archived");
      setArchivedQuests(data);
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    fetchArchivedQuests();
  }, [fetchArchivedQuests]);

  const handleRestoreMission = useCallback(async (questId: string | number) => {
    try {
      setArchivedQuests(prev => prev.filter(q => String(q.id) !== String(questId)));
      await apiRequest(`/api/quests/${questId}/restore`, { method: "POST" });
      await refetchQuests();
    } catch {
      await fetchArchivedQuests();
      toast({ title: "Failed to restore mission", variant: "destructive" });
    }
  }, [refetchQuests, fetchArchivedQuests, toast]);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const profileLoaded = userProfile !== null;
  const completedOnboardingMissions = userProfile?.completedOnboardingMissions || [];
  const onboardingComplete = userProfile?.onboardingCompleted === true;
  const completedOnboardingTitles = quests
    .filter(q => q.category === 'onboarding' && q.completed)
    .map(q => q.title);
  const allOnboardingDone = completedOnboardingMissions.length >= ONBOARDING_MISSIONS.length &&
    ONBOARDING_MISSIONS.every(m => completedOnboardingMissions.includes(m.id) || completedOnboardingTitles.includes(`Onboarding: ${m.title}`));
  const nextOnboardingMission = profileLoaded && !allOnboardingDone
    ? ONBOARDING_MISSIONS.find(m => 
        !completedOnboardingMissions.includes(m.id) && 
        !completedOnboardingTitles.includes(`Onboarding: ${m.title}`)
      ) || null
    : null;

  const retroFixAttempted = useRef(false);
  useEffect(() => {
    if (retroFixAttempted.current || !user?.id || !profileLoaded || completedOnboardingMissions.length === 0) return;
    retroFixAttempted.current = true;
    (async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const questsRes = await fetch(`/api/users/${user.id}/quests?tz=${encodeURIComponent(tz)}`, { credentials: "include" });
        if (!questsRes.ok) {
          retroFixAttempted.current = false;
          return;
        }
        const questsData = await questsRes.json();
        const allOnboardingQuests = (questsData.quests || []).filter((q: any) => q.category === 'onboarding');

        let changed = false;
        const nowD = new Date();
        const dateStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
        const timeStr = nowD.toTimeString().slice(0, 5);

        for (const m of ONBOARDING_MISSIONS) {
          if (!completedOnboardingMissions.includes(m.id)) continue;
          const expectedTitle = `Onboarding: ${m.title}`;
          const existing = allOnboardingQuests.find((q: any) => q.title === expectedTitle);

          if (existing && existing.completed) continue;

          if (existing && !existing.completed) {
            try {
              await apiRequest(`/api/quests/${existing.id}/toggle`, { method: "POST" });
              changed = true;
            } catch (e) {
              console.error("Failed to toggle existing onboarding quest:", m.title, e);
            }
          } else if (!existing) {
            try {
              const result = await apiRequest("/api/quests", {
                method: "POST",
                body: JSON.stringify({
                  userId: user.id,
                  title: expectedTitle,
                  description: `Completed onboarding mission "${m.title}"`,
                  category: "onboarding",
                  completed: false,
                  experienceReward: m.xp,
                  startDate: dateStr,
                  startTime: timeStr,
                  dueDate: dateStr,
                  endDate: dateStr,
                  endTime: timeStr,
                }),
              });
              if (result?.id) {
                await apiRequest(`/api/quests/${result.id}/toggle`, { method: "POST" });
                changed = true;
              }
            } catch (e) {
              console.error("Failed to create onboarding quest:", m.title, e);
            }
          }
        }

        if (changed) {
          await refetchQuests();
          queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/stats`] });
        }
      } catch (e) {
        console.error("Retro fix failed:", e);
        retroFixAttempted.current = false;
      }
    })();
  }, [user?.id, profileLoaded, completedOnboardingMissions, refetchQuests]);
  
  const { todayMissions, upcomingMissions, completedMissions, inboxMissions } = useMemo(() => {
    const active = quests.filter(q => !q.completed);
    
    const completed = quests.filter(q => {
      if (!q.completed || !q.completedAt) return false;
      const completedDate = new Date(q.completedAt);
      const completedLocalDate = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}-${String(completedDate.getDate()).padStart(2, '0')}`;
      return completedLocalDate === today;
    });
    
    const inboxItems = active.filter(q => q.category === 'todo');

    const todayItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (q.category === 'onboarding') return false;
      if (!q.startDate) return true;
      return q.startDate <= today;
    });
    
    const upcomingItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (q.category === 'onboarding') return false;
      if (!q.startDate) return false;
      return q.startDate > today;
    });
    
    const sortByOrder = (a: Quest, b: Quest) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0);
    return {
      todayMissions: todayItems.sort(sortByOrder),
      upcomingMissions: upcomingItems.sort(sortByOrder),
      completedMissions: completed.sort(sortByOrder),
      inboxMissions: inboxItems.sort(sortByOrder),
    };
  }, [quests, today]);

  const [ritualGroupCollapsed, setRitualGroupCollapsed] = useState<Record<string, boolean>>({});
  const toggleRitualGroupCollapsed = useCallback((key: string) => {
    setRitualGroupCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const groupMissionsByRitual = useCallback((missions: Quest[]) => {
    const grouped: { ritualGroup: string | null; missions: Quest[] }[] = [];
    const groupMap = new Map<string, Quest[]>();
    const ungrouped: Quest[] = [];
    missions.forEach(q => {
      const rg = (q as any).ritualGroup as string | null | undefined;
      if (rg) {
        if (!groupMap.has(rg)) groupMap.set(rg, []);
        groupMap.get(rg)!.push(q);
      } else {
        ungrouped.push(q);
      }
    });
    const insertionOrder: { type: 'group' | 'single'; key: string; idx: number }[] = [];
    const seenGroups = new Set<string>();
    missions.forEach((q, idx) => {
      const rg = (q as any).ritualGroup as string | null | undefined;
      if (rg && !seenGroups.has(rg)) {
        seenGroups.add(rg);
        insertionOrder.push({ type: 'group', key: rg, idx });
      } else if (!rg) {
        insertionOrder.push({ type: 'single', key: q.id, idx });
      }
    });
    return insertionOrder.map(item => {
      if (item.type === 'group') {
        return { ritualGroup: item.key, missions: groupMap.get(item.key)! };
      }
      return { ritualGroup: null, missions: [missions[item.idx]] };
    });
  }, []);

  const getRitualGroupLabel = useCallback((value: string) => {
    const custom = customRitualGroups.find(g => g.value === value);
    if (custom) return custom.label;
    const def = DEFAULT_RITUAL_GROUPS.find(g => g.value === value);
    if (def) return def.label;
    return value.replace(/_/g, ' ');
  }, [customRitualGroups, DEFAULT_RITUAL_GROUPS]);

  const getRitualGroupDateRange = useCallback((missions: Quest[]) => {
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
    let earliestStart: string | null = null;
    let earliestStartTime: string | null = null;
    let latestEnd: string | null = null;
    let latestEndTime: string | null = null;
    missions.forEach((q: any) => {
      if (q.startDate && (!earliestStart || q.startDate < earliestStart)) {
        earliestStart = q.startDate;
        earliestStartTime = q.startTime || null;
      } else if (q.startDate && q.startDate === earliestStart && q.startTime) {
        if (!earliestStartTime || q.startTime < earliestStartTime) earliestStartTime = q.startTime;
      }
      const ed = q.endDate || q.dueDate;
      const et = q.endTime;
      if (ed && (!latestEnd || ed > latestEnd)) {
        latestEnd = ed;
        latestEndTime = et || null;
      } else if (ed && ed === latestEnd && et) {
        if (!latestEndTime || et > latestEndTime) latestEndTime = et;
      }
    });
    if (!earliestStart && !latestEnd) return null;
    return { startDate: earliestStart, startTime: earliestStartTime, endDate: latestEnd, endTime: latestEndTime, formatDate, formatTime };
  }, []);

  const moveMission = useCallback((section: string, dragIndex: number, hoverIndex: number) => {
    const sectionMap: Record<string, Quest[]> = {
      today: todayMissions,
      upcoming: upcomingMissions,
      completed: completedMissions,
      inbox: inboxMissions,
    };
    const missions = sectionMap[section];
    if (!missions) return;
    const reordered = update(missions, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, missions[dragIndex]],
      ],
    });
    const orderedIds = reordered.map(q => q.id);
    apiRequest("/api/quests/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'quests'] });
  }, [todayMissions, upcomingMissions, completedMissions, inboxMissions, user?.id]);

  const moveVisualItem = useCallback((dragIndex: number, hoverIndex: number, section: string) => {
    const sectionMap: Record<string, Quest[]> = {
      today: todayMissions,
      upcoming: upcomingMissions,
      completed: completedMissions,
      inbox: inboxMissions,
    };
    const missions = sectionMap[section];
    if (!missions) return;
    const groups = groupMissionsByRitual(missions);
    if (dragIndex < 0 || dragIndex >= groups.length || hoverIndex < 0 || hoverIndex >= groups.length) return;
    const reorderedGroups = [...groups];
    const [moved] = reorderedGroups.splice(dragIndex, 1);
    reorderedGroups.splice(hoverIndex, 0, moved);
    const newOrder = reorderedGroups.flatMap(g => g.missions);
    const orderedIds = newOrder.map(q => q.id);
    apiRequest("/api/quests/reorder", {
      method: "PATCH",
      body: JSON.stringify({ orderedIds }),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'quests'] });
  }, [todayMissions, upcomingMissions, completedMissions, inboxMissions, user?.id, groupMissionsByRitual]);

  const handleDeleteMission = useCallback(async (quest: Quest) => {
    const questCopy = { ...quest };
    await deleteQuest(quest.id);
    setArchivedQuests(prev => [...prev, { ...questCopy, id: questCopy.id as any, deletedAt: new Date().toISOString() } as any]);
  }, [deleteQuest]);

  const handleCrossSectionDrop = useCallback(async (item: DragItem, targetSection: string) => {
    const quest = item.quest;
    const questId = String(quest.id);
    const fromSection = item.section;

    if (fromSection === targetSection) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const currentSaved = originalDatesRef.current[questId];
    if (!currentSaved) {
      const dateSnapshot = {
        startDate: quest.startDate || '',
        endDate: quest.endDate || '',
        startTime: quest.startTime || '',
        endTime: quest.endTime || '',
      };
      setOriginalDates(prev => ({ ...prev, [questId]: dateSnapshot }));
      originalDatesRef.current = { ...originalDatesRef.current, [questId]: dateSnapshot };
    }

    try {
      if (targetSection === 'today') {
        if (fromSection === 'terminated') {
          await handleRestoreMission(quest.id);
        }
        if (quest.completed) {
          await toggleQuestCompletion(questId);
        }
        await updateQuest(questId, {
          startDate: todayStr,
          endDate: todayStr,
          category: '',
        });
      } else if (targetSection === 'upcoming') {
        const saved = originalDatesRef.current[questId];
        if (fromSection === 'terminated') {
          await handleRestoreMission(quest.id);
        }
        if (quest.completed) {
          await toggleQuestCompletion(questId);
        }
        if (saved && (saved.startDate || saved.endDate)) {
          await updateQuest(questId, {
            startDate: saved.startDate || '',
            endDate: saved.endDate || '',
            startTime: saved.startTime || '',
            endTime: saved.endTime || '',
            category: '',
          });
        } else {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
          await updateQuest(questId, {
            startDate: tomorrowStr,
            category: '',
          });
        }
        setOriginalDates(prev => {
          const next = { ...prev };
          delete next[questId];
          return next;
        });
        originalDatesRef.current = { ...originalDatesRef.current };
        delete originalDatesRef.current[questId];
      } else if (targetSection === 'completed') {
        if (fromSection === 'terminated') {
          await handleRestoreMission(quest.id);
        }
        if (!quest.completed) {
          await toggleQuestCompletion(questId);
        }
      } else if (targetSection === 'inbox') {
        if (fromSection === 'terminated') {
          await handleRestoreMission(quest.id);
        }
        if (quest.completed) {
          await toggleQuestCompletion(questId);
        }
        await updateQuest(questId, {
          category: 'todo',
          startDate: '',
          endDate: '',
          startTime: '',
          endTime: '',
        });
      } else if (targetSection === 'terminated') {
        await handleDeleteMission(quest);
      }
      await refetchQuests();
      await fetchArchivedQuests();
    } catch (err) {
      toast({ title: "Failed to move mission", variant: "destructive" });
    }
  }, [updateQuest, toggleQuestCompletion, handleDeleteMission, handleRestoreMission, refetchQuests, fetchArchivedQuests, toast]);

  const handleCrossSectionGroupDrop = useCallback(async (item: VisualDragItem, targetSection: string) => {
    const { missionIds, section: fromSection } = item;
    if (fromSection === targetSection || !missionIds.length) return;

    const allQuests = [...quests];
    const archivedList = archivedQuests || [];
    const combined = [...allQuests, ...archivedList];
    const groupQuests = combined.filter(q => missionIds.includes(String(q.id)));
    if (!groupQuests.length) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
      for (const quest of groupQuests) {
        const questId = String(quest.id);
        if (targetSection === 'today') {
          if (fromSection === 'terminated') await handleRestoreMission(quest.id);
          if (quest.completed) await toggleQuestCompletion(questId);
          await updateQuest(questId, { startDate: todayStr, endDate: todayStr, category: '' });
        } else if (targetSection === 'upcoming') {
          if (fromSection === 'terminated') await handleRestoreMission(quest.id);
          if (quest.completed) await toggleQuestCompletion(questId);
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
          await updateQuest(questId, { startDate: quest.startDate || tomorrowStr, endDate: quest.endDate || '', category: '' });
        } else if (targetSection === 'completed') {
          if (fromSection === 'terminated') await handleRestoreMission(quest.id);
          if (!quest.completed) await toggleQuestCompletion(questId);
        } else if (targetSection === 'inbox') {
          if (fromSection === 'terminated') await handleRestoreMission(quest.id);
          if (quest.completed) await toggleQuestCompletion(questId);
          await updateQuest(questId, { category: 'todo', startDate: '', endDate: '', startTime: '', endTime: '' });
        } else if (targetSection === 'terminated') {
          await handleDeleteMission(quest);
        }
      }
      await refetchQuests();
      await fetchArchivedQuests();
    } catch (err) {
      toast({ title: "Failed to move group", variant: "destructive" });
    }
  }, [quests, archivedQuests, updateQuest, toggleQuestCompletion, handleDeleteMission, handleRestoreMission, refetchQuests, fetchArchivedQuests, toast]);

  const openEditDialog = (quest: Quest) => {
    setEditingQuest(quest);
    setEditFormData({
      title: quest.title,
      description: quest.description || "",
      experienceReward: quest.experienceReward,
      difficulty: quest.difficulty || "D",
      category: quest.category || "general",
      startDate: quest.startDate || "",
      startTime: quest.startTime || "",
      endDate: quest.endDate || "",
      endTime: quest.endTime || "",
      notifications: quest.notifications || [],
      isRitualized: quest.isRitualized || false,
      ritualGroup: quest.ritualGroup || "",
      repeatFrequency: quest.repeatFrequency || "daily",
      repeatInterval: quest.repeatInterval || 1,
      repeatDays: quest.repeatDays || [],
      repeatEndDate: quest.repeatEndDate || "",
      visionGoalId: quest.visionGoalId || null,
      location: (quest as any).location || "",
      url: (quest as any).url || "",
      allDay: (quest as any).allDay || false,
      missionStatus: (quest as any).missionStatus || "confirmed",
      linkedItems: ((quest.linkedItems as { type: "document" | "folder"; id: number; title: string }[]) || [])
        .filter(item => {
          if (item.type === 'document') return allDocuments.some(d => d.id === item.id);
          if (item.type === 'folder') return allFolders.some(f => f.id === item.id);
          return true;
        })
        .map(item => {
          if (item.type === 'document') {
            const doc = allDocuments.find(d => d.id === item.id);
            return doc ? { ...item, title: doc.title } : item;
          }
          if (item.type === 'folder') {
            const folder = allFolders.find(f => f.id === item.id);
            return folder ? { ...item, title: folder.name } : item;
          }
          return item;
        }),
    });
    setIsEditOpen(true);
  };

  const handleCreateMission = async () => {
    if (!createFormData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: createFormData.title.trim(),
        description: createFormData.description.trim() || "",
        experienceReward: createFormData.experienceReward,
        difficulty: createFormData.difficulty,
        category: createFormData.category,
        startDate: createFormData.startDate || null,
        startTime: createFormData.startTime || null,
        endDate: createFormData.endDate || null,
        endTime: createFormData.endTime || null,
        notificationEnabled: createFormData.notifications.length > 0,
        notificationTime: null,
        notifications: createFormData.notifications,
        isRitualized: createFormData.isRitualized,
        ritualGroup: createFormData.isRitualized && createFormData.ritualGroup.trim() ? createFormData.ritualGroup.trim() : null,
        repeatFrequency: createFormData.isRitualized ? createFormData.repeatFrequency : null,
        repeatInterval: createFormData.isRitualized ? createFormData.repeatInterval : null,
        repeatDays: createFormData.isRitualized && createFormData.repeatFrequency === "weekly" ? createFormData.repeatDays : null,
        repeatEndDate: createFormData.isRitualized && createFormData.repeatEndDate ? createFormData.repeatEndDate : null,
        visionGoalId: createFormData.visionGoalId,
        linkedItems: createFormData.linkedItems.length > 0 ? createFormData.linkedItems : [],
        location: createFormData.location || null,
        url: createFormData.url || null,
        allDay: createFormData.allDay,
        missionStatus: createFormData.missionStatus,
      });
      
      setCreateFormData(defaultFormData);
      setIsCreateOpen(false);
    } catch (error) {
      console.error("Failed to create mission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMission = async () => {
    if (!editingQuest || !editFormData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await updateQuest(editingQuest.id, {
        title: editFormData.title.trim(),
        description: editFormData.description.trim() || "",
        experienceReward: editFormData.experienceReward,
        difficulty: editFormData.difficulty,
        category: editFormData.category,
        startDate: editFormData.startDate || null,
        startTime: editFormData.startTime || null,
        endDate: editFormData.endDate || null,
        endTime: editFormData.endTime || null,
        notificationEnabled: editFormData.notifications.length > 0,
        notificationTime: null,
        notifications: editFormData.notifications,
        isRitualized: editFormData.isRitualized,
        ritualGroup: editFormData.isRitualized && editFormData.ritualGroup.trim() ? editFormData.ritualGroup.trim() : null,
        repeatFrequency: editFormData.isRitualized ? editFormData.repeatFrequency : null,
        repeatInterval: editFormData.isRitualized ? editFormData.repeatInterval : null,
        repeatDays: editFormData.isRitualized && editFormData.repeatFrequency === "weekly" ? editFormData.repeatDays : null,
        repeatEndDate: editFormData.isRitualized && editFormData.repeatEndDate ? editFormData.repeatEndDate : null,
        visionGoalId: editFormData.visionGoalId,
        linkedItems: editFormData.linkedItems.length > 0 ? editFormData.linkedItems : [],
        location: editFormData.location || null,
        url: editFormData.url || null,
        allDay: editFormData.allDay,
        missionStatus: editFormData.missionStatus,
      });
      
      setEditFormData(defaultFormData);
      setEditingQuest(null);
      setIsEditOpen(false);
    } catch (error) {
      console.error("Failed to update mission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartMission = (quest: Quest) => {
    if (activeTimerQuest) {
      toast({ title: "Timer Already Active", description: `End the current timer first.` });
      return;
    }
    startMissionTimer(quest);
  };

  const handleResumeMission = (quest: Quest) => {
    if (activeTimerQuest) {
      toast({ title: "Timer Already Active", description: `End the current timer first.` });
      return;
    }
    resumeMissionTimer(quest);
  };

  const handleDoneMission = (quest: Quest) => {
    toggleQuestCompletion(quest.id);
  };

  const handleUndoMission = (quest: Quest) => {
    toggleQuestCompletion(quest.id);
  };

  const handleDoneGroup = useCallback(async (missions: Quest[]) => {
    const incomplete = missions.filter(q => !q.completed);
    if (!incomplete.length) return;
    try {
      for (const quest of incomplete) {
        await toggleQuestCompletion(quest.id);
      }
      await refetchQuests();
    } catch (err) {
      toast({ title: "Failed to complete group", variant: "destructive" });
    }
  }, [toggleQuestCompletion, refetchQuests, toast]);

  const handleUndoGroup = useCallback(async (missions: Quest[]) => {
    const completed = missions.filter(q => q.completed);
    if (!completed.length) return;
    try {
      for (const quest of completed) {
        await toggleQuestCompletion(quest.id);
      }
      await refetchQuests();
    } catch (err) {
      toast({ title: "Failed to undo group", variant: "destructive" });
    }
  }, [toggleQuestCompletion, refetchQuests, toast]);

  return (
    <div className="pb-20">
      <PageTutorial steps={MISSIONS_TOUR_STEPS} storageKey="missions" isOpen={showTutorial} onComplete={handleTutorialComplete} onSkipAll={handleSkipAllTutorials} userId={user?.id} isLoading={isTutorialLoading} />
      <div className="mb-6 flex items-center justify-between" data-tour="missions-header">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Missions</h1>
          <p className="text-muted-foreground">Complete missions, earn XP,<br className="lg:hidden" /> & reach your goals.</p>
        </div>
        
        <div className="flex items-center gap-2">
          
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setCreateFormData(defaultFormData);
        }}>
          <DialogTrigger asChild>
            <Button data-tour="create-mission" className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs" size="sm">
              Create Mission
            </Button>
          </DialogTrigger>
          <DialogContent 
            className="glassmorphic border-primary/30 w-full max-w-full max-h-full left-0 top-12 h-[calc(100%-6rem)] translate-x-0 translate-y-0 rounded-t-xl rounded-b-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto pb-20 sm:pb-6"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl">Create New Mission</DialogTitle>
              <DialogDescription className="sr-only">Fill out the form to create a new mission</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="create-title">Mission Title <span className="text-primary">*</span></Label>
                <Input
                  id="create-title"
                  placeholder="Enter mission title..."
                  value={createFormData.title}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-background/50 border-primary/30"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="create-description">Description</Label>
                <RichTextArea
                  id="create-description"
                  placeholder="What needs to be done?"
                  value={createFormData.description}
                  onChange={(val) => setCreateFormData(prev => ({ ...prev, description: val }))}
                  textareaClassName="bg-background/50 border-primary/30 min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Difficulty Rank</Label>
                  <Select value={createFormData.difficulty} onValueChange={(val) => setCreateFormData(prev => ({ ...prev, difficulty: val }))}>
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_RANKS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select key={`create-cat-${mergedCategories.map(c => c.value).join(',')}`} value={createFormData.category} onValueChange={(val) => {
                    if (val === "__custom__") {
                      setCustomCategoryMode('create');
                      setCustomCategoryInput("");
                    } else {
                      setCreateFormData(prev => ({ ...prev, category: val }));
                      setCustomCategoryMode(null);
                    }
                    setEditingCategoryId(null);
                    setEditCategoryInput("");
                  }}>
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-48 overflow-y-auto">
                      {mergedCategories.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">+ Add Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {customCategoryMode === 'create' && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="Category name..."
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        className="bg-background/50 border-primary/30 flex-1"
                        disabled={isSavingCategory}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveCustomCategory('create')}
                        disabled={!customCategoryInput.trim() || isSavingCategory}
                      >
                        {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  )}
                  {editingCategoryId && customCategoryMode !== 'create' && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="New category name..."
                        value={editCategoryInput}
                        onChange={(e) => setEditCategoryInput(e.target.value)}
                        className="bg-background/50 border-primary/30 flex-1"
                        disabled={isSavingCategory}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdateCategory('create')}
                        disabled={!editCategoryInput.trim() || isSavingCategory}
                      >
                        {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingCategoryId(null); setEditCategoryInput(""); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {!editingCategoryId && customCategoryMode !== 'create' && (() => {
                    const customCat = userCategories.find(c => c.value === createFormData.category);
                    if (!customCat) return null;
                    return (
                      <div className="mt-1 flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                          onClick={() => { setEditingCategoryId(customCat.id); setEditCategoryInput(customCat.label); }}
                        >
                          <Edit3 className="h-3 w-3" />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 transition-colors"
                          onClick={() => handleDeleteCategory(customCat.id, customCat.value, 'create')}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Link to Mission Objective
                </Label>
                <Select
                  value={createFormData.visionGoalId?.toString() || "none"}
                  onValueChange={(val) => setCreateFormData(prev => ({ ...prev, visionGoalId: val === "none" ? null : parseInt(val) }))}
                >
                  <SelectTrigger className="bg-background/50 border-primary/30">
                    <SelectValue placeholder={allVisionGoals.length > 0 ? "Select objective..." : "None"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{allVisionGoals.length > 0 ? "Select objective..." : "None"}</SelectItem>
                    {["legacy", "10year", "5year", "18month", "90day"].map(cat => {
                      const catGoals = allVisionGoals.filter(g => g.category === cat);
                      if (catGoals.length === 0) return null;
                      return catGoals.map(g => (
                        <SelectItem key={g.id} value={g.id.toString()}>
                          <span className="text-muted-foreground text-xs mr-1">[{CATEGORY_LABELS[cat]}]</span> {g.title}
                        </SelectItem>
                      ));
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Link Documents / Folders
                </Label>
                <Select
                  value="none"
                  onValueChange={(val) => {
                    if (val === "none") return;
                    const [type, idStr] = val.split(":");
                    const id = parseInt(idStr);
                    if (createFormData.linkedItems.some(li => li.type === type && li.id === id)) return;
                    const title = type === "document"
                      ? allDocuments.find(d => d.id === id)?.title || "Untitled"
                      : allFolders.find(f => f.id === id)?.name || "Untitled";
                    setCreateFormData(prev => ({
                      ...prev,
                      linkedItems: [...prev.linkedItems, { type: type as "document" | "folder", id, title }],
                    }));
                  }}
                >
                  <SelectTrigger className="bg-background/50 border-primary/30">
                    <SelectValue placeholder={(allDocuments.length > 0 || allFolders.length > 0) ? "Select document or folder..." : "None"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{(allDocuments.length > 0 || allFolders.length > 0) ? "Select document or folder..." : "None"}</SelectItem>
                    {allDocuments.length > 0 && (
                      <>
                        <SelectItem value="__docs_header" disabled>
                          <span className="font-semibold text-primary">Documents</span>
                        </SelectItem>
                        {allDocuments.map(doc => (
                          <SelectItem key={`document:${doc.id}`} value={`document:${doc.id}`}>
                            <span className="flex items-center gap-1.5">
                              <FileText className="h-3 w-3 text-primary" />
                              {doc.title}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {allFolders.length > 0 && (
                      <>
                        <SelectItem value="__folders_header" disabled>
                          <span className="font-semibold text-primary">Folders</span>
                        </SelectItem>
                        {allFolders.map(folder => (
                          <SelectItem key={`folder:${folder.id}`} value={`folder:${folder.id}`}>
                            <span className="flex items-center gap-1.5">
                              <FolderOpen className="h-3 w-3 text-primary" />
                              {folder.name}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {createFormData.linkedItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {createFormData.linkedItems.map((item, idx) => (
                      <Badge key={`${item.type}-${item.id}`} className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                        {item.type === "document" ? <FileText className="h-3 w-3 text-primary" /> : <FolderOpen className="h-3 w-3 text-primary" />}
                        {item.title}
                        <button
                          type="button"
                          onClick={() => setCreateFormData(prev => ({
                            ...prev,
                            linkedItems: prev.linkedItems.filter((_, i) => i !== idx),
                          }))}
                          className="ml-0.5 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date <span className="text-primary">*</span></Label>
                  <DatePicker
                    value={createFormData.startDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, startDate: date }))}
                    placeholder="Select date"
                    {...makePickerProps('create-start-date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Start Time <span className="text-primary">*</span></Label>
                  <TimePicker
                    value={createFormData.startTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, startTime: time }))}
                    placeholder="Select time"
                    {...makePickerProps('create-start-time')}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Due <span className="text-primary">*</span></Label>
                  <DatePicker
                    value={createFormData.endDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, endDate: date }))}
                    placeholder="Select date"
                    {...makePickerProps('create-end-date')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Time Due <span className="text-primary">*</span></Label>
                  <TimePicker
                    value={createFormData.endTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, endTime: time }))}
                    placeholder="Select time"
                    {...makePickerProps('create-end-time')}
                  />
                </div>
              </div>
              
              <div className="glassmorphic rounded-lg p-4 border border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notification Reminders
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1"
                    onClick={() => setCreateFormData(prev => ({
                      ...prev,
                      notifications: [...prev.notifications, { date: "", time: "" }]
                    }))}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
                
                {createFormData.notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No reminders set. Click "Add" to create one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {createFormData.notifications.map((notification, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-background/30 rounded-lg border border-primary/10">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <DatePicker
                            value={notification.date}
                            onChange={(date) => {
                              const updated = [...createFormData.notifications];
                              updated[index] = { ...updated[index], date };
                              setCreateFormData(prev => ({ ...prev, notifications: updated }));
                            }}
                            placeholder="Date"
                            {...makePickerProps(`create-notif-date-${index}`)}
                          />
                          <TimePicker
                            value={notification.time}
                            onChange={(time) => {
                              const updated = [...createFormData.notifications];
                              updated[index] = { ...updated[index], time };
                              setCreateFormData(prev => ({ ...prev, notifications: updated }));
                            }}
                            placeholder="Time"
                            {...makePickerProps(`create-notif-time-${index}`)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            const updated = createFormData.notifications.filter((_, i) => i !== index);
                            setCreateFormData(prev => ({ ...prev, notifications: updated }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="glassmorphic rounded-lg p-4 border border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-2">
                    <Repeat className="h-4 w-4" />
                    Ritualize (Repeat)
                  </Label>
                  <Switch
                    checked={createFormData.isRitualized}
                    onCheckedChange={(checked) => setCreateFormData(prev => ({ ...prev, isRitualized: checked }))}
                  />
                </div>
                
                {createFormData.isRitualized && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Ritual Group (optional)</Label>
                      <Select
                        value={createFormData.ritualGroup || "__none__"}
                        onValueChange={(val) => {
                          if (val === "__custom__") {
                            setCustomRitualGroupMode('create');
                          } else if (val === "__none__") {
                            setCreateFormData(prev => ({ ...prev, ritualGroup: "" }));
                            setCustomRitualGroupMode(null);
                          } else {
                            setCreateFormData(prev => ({ ...prev, ritualGroup: val }));
                            setCustomRitualGroupMode(null);
                          }
                        }}
                      >
                        <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                          <SelectValue placeholder="Select ritual group..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {allRitualGroups.map(g => (
                            <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                          ))}
                          <SelectItem value="__custom__">+ Add Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                      {customRitualGroupMode === 'create' && (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            placeholder="Group name..."
                            value={customRitualGroupInput}
                            onChange={(e) => setCustomRitualGroupInput(e.target.value)}
                            className="bg-background/50 border-primary/30 flex-1"
                            disabled={isSavingRitualGroup}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveCustomRitualGroup('create')}
                            disabled={!customRitualGroupInput.trim() || isSavingRitualGroup}
                          >
                            {isSavingRitualGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                        </div>
                      )}
                      {editingRitualGroupId && customRitualGroupMode !== 'create' && (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            placeholder="New group name..."
                            value={editRitualGroupInput}
                            onChange={(e) => setEditRitualGroupInput(e.target.value)}
                            className="bg-background/50 border-primary/30 flex-1"
                            disabled={isSavingRitualGroup}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleRenameRitualGroup('create')}
                            disabled={!editRitualGroupInput.trim() || isSavingRitualGroup}
                          >
                            {isSavingRitualGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setEditingRitualGroupId(null); setEditRitualGroupInput(""); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {!customRitualGroupMode && !editingRitualGroupId && createFormData.ritualGroup && (() => {
                        const customGroup = customRitualGroups.find(g => g.value === createFormData.ritualGroup);
                        if (!customGroup) return null;
                        return (
                          <div className="mt-1 flex items-center gap-3">
                            <button
                              type="button"
                              className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                              onClick={() => { setEditingRitualGroupId(customGroup.id); setEditRitualGroupInput(customGroup.label); }}
                            >
                              <Edit3 className="h-3 w-3" /> Rename
                            </button>
                            <button
                              type="button"
                              className="text-xs text-destructive/70 hover:text-destructive flex items-center gap-1 transition-colors"
                              onClick={() => handleDeleteRitualGroup(customGroup.id)}
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Frequency</Label>
                        <Select value={createFormData.repeatFrequency} onValueChange={(val) => setCreateFormData(prev => ({ ...prev, repeatFrequency: val }))}>
                          <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REPEAT_FREQUENCIES.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Every</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            value={createFormData.repeatInterval}
                            onChange={(e) => setCreateFormData(prev => ({ ...prev, repeatInterval: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="bg-background/50 border-primary/30 h-9 w-16"
                          />
                          <span className="text-xs text-muted-foreground">
                            {createFormData.repeatFrequency === "hourly" ? "hr(s)" :
                             createFormData.repeatFrequency === "daily" ? "day(s)" :
                             createFormData.repeatFrequency === "weekly" ? "wk(s)" :
                             createFormData.repeatFrequency === "monthly" ? "mo(s)" : "yr(s)"}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {createFormData.repeatFrequency === "weekly" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Repeat on</Label>
                        <div className="flex gap-1">
                          {DAYS_OF_WEEK.map(day => (
                            <button
                              key={day.value}
                              type="button"
                              className={`text-xs font-mono px-2 py-1.5 rounded border transition-colors ${
                                createFormData.repeatDays.includes(day.value)
                                  ? "bg-primary/30 border-primary text-primary"
                                  : "bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10"
                              }`}
                              onClick={() => {
                                setCreateFormData(prev => ({
                                  ...prev,
                                  repeatDays: prev.repeatDays.includes(day.value)
                                    ? prev.repeatDays.filter(d => d !== day.value)
                                    : [...prev.repeatDays, day.value]
                                }));
                              }}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">End Date (optional)</Label>
                      <DatePicker
                        value={createFormData.repeatEndDate}
                        onChange={(date) => setCreateFormData(prev => ({ ...prev, repeatEndDate: date }))}
                        placeholder="Repeats forever"
                        {...makePickerProps('create-repeat-end')}
                      />
                    </div>
                  </div>
                )}
              </div>

              {createFormData.isRitualized && createFormData.repeatFrequency === "weekly" && createFormData.repeatDays.length === 0 && (
                <p className="text-xs text-destructive">Please select at least one day for weekly repeat.</p>
              )}

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors w-full py-2">
                    <MapPin className="h-3.5 w-3.5" />
                    Event Details
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Location</Label>
                      <Input
                        placeholder="Add location..."
                        value={createFormData.location}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, location: e.target.value }))}
                        className="bg-background/50 border-primary/30 h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">URL / Link</Label>
                      <Input
                        placeholder="https://..."
                        value={createFormData.url}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, url: e.target.value }))}
                        className="bg-background/50 border-primary/30 h-9"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">All Day</Label>
                      <Switch
                        checked={createFormData.allDay}
                        onCheckedChange={(checked) => setCreateFormData(prev => ({ ...prev, allDay: checked }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={createFormData.missionStatus} onValueChange={(v) => setCreateFormData(prev => ({ ...prev, missionStatus: v }))}>
                        <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="tentative">Tentative</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <button 
                onClick={handleCreateMission} 
                className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
                disabled={!createFormData.title.trim() || isSubmitting || (createFormData.isRitualized && createFormData.repeatFrequency === "weekly" && createFormData.repeatDays.length === 0)}
              >
                {isSubmitting ? "Creating..." : "Create Mission"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setEditFormData(defaultFormData);
          setEditingQuest(null);
        }
      }}>
        <DialogContent 
          className="glassmorphic border-primary/30 w-full max-w-full max-h-full left-0 top-12 h-[calc(100%-6rem)] translate-x-0 translate-y-0 rounded-t-xl rounded-b-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto pb-20 sm:pb-6"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Edit Mission
            </DialogTitle>
            <DialogDescription className="sr-only">Edit the details of your mission</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Mission Title <span className="text-primary">*</span></Label>
              <Input
                id="edit-title"
                placeholder="Enter mission title..."
                value={editFormData.title}
                onChange={(e) => setEditFormData(prev => ({ ...prev, title: e.target.value }))}
                className="bg-background/50 border-primary/30"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <RichTextArea
                id="edit-description"
                placeholder="What needs to be done?"
                value={editFormData.description}
                onChange={(val) => setEditFormData(prev => ({ ...prev, description: val }))}
                textareaClassName="bg-background/50 border-primary/30 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty Rank</Label>
                <Select value={editFormData.difficulty} onValueChange={(val) => setEditFormData(prev => ({ ...prev, difficulty: val }))}>
                  <SelectTrigger className="bg-background/50 border-primary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_RANKS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select key={`edit-cat-${mergedCategories.map(c => c.value).join(',')}`} value={editFormData.category} onValueChange={(val) => {
                  if (val === "__custom__") {
                    setCustomCategoryMode('edit');
                    setCustomCategoryInput("");
                  } else {
                    setEditFormData(prev => ({ ...prev, category: val }));
                    setCustomCategoryMode(null);
                  }
                  setEditingCategoryId(null);
                  setEditCategoryInput("");
                }}>
                  <SelectTrigger className="bg-background/50 border-primary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-48 overflow-y-auto">
                    {mergedCategories.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">+ Add Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {customCategoryMode === 'edit' && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      placeholder="Category name..."
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      className="bg-background/50 border-primary/30 flex-1"
                      disabled={isSavingCategory}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveCustomCategory('edit')}
                      disabled={!customCategoryInput.trim() || isSavingCategory}
                    >
                      {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                )}
                {editingCategoryId && customCategoryMode !== 'edit' && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      placeholder="New category name..."
                      value={editCategoryInput}
                      onChange={(e) => setEditCategoryInput(e.target.value)}
                      className="bg-background/50 border-primary/30 flex-1"
                      disabled={isSavingCategory}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleUpdateCategory('edit')}
                      disabled={!editCategoryInput.trim() || isSavingCategory}
                    >
                      {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingCategoryId(null); setEditCategoryInput(""); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {!editingCategoryId && customCategoryMode !== 'edit' && (() => {
                  const customCat = userCategories.find(c => c.value === editFormData.category);
                  if (!customCat) return null;
                  return (
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                        onClick={() => { setEditingCategoryId(customCat.id); setEditCategoryInput(customCat.label); }}
                      >
                        <Edit3 className="h-3 w-3" />
                        Rename
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 transition-colors"
                        onClick={() => handleDeleteCategory(customCat.id, customCat.value, 'edit')}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Link to Mission Objective
              </Label>
              <Select
                value={editFormData.visionGoalId?.toString() || "none"}
                onValueChange={(val) => setEditFormData(prev => ({ ...prev, visionGoalId: val === "none" ? null : parseInt(val) }))}
              >
                <SelectTrigger className="bg-background/50 border-primary/30">
                  <SelectValue placeholder={allVisionGoals.length > 0 ? "Select objective..." : "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{allVisionGoals.length > 0 ? "Select objective..." : "None"}</SelectItem>
                  {["legacy", "10year", "5year", "18month", "90day"].map(cat => {
                    const catGoals = allVisionGoals.filter(g => g.category === cat);
                    if (catGoals.length === 0) return null;
                    return catGoals.map(g => (
                      <SelectItem key={g.id} value={g.id.toString()}>
                        <span className="text-muted-foreground text-xs mr-1">[{CATEGORY_LABELS[cat]}]</span> {g.title}
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link Documents / Folders
              </Label>
              <Select
                value="none"
                onValueChange={(val) => {
                  if (val === "none") return;
                  const [type, idStr] = val.split(":");
                  const id = parseInt(idStr);
                  if (editFormData.linkedItems.some(li => li.type === type && li.id === id)) return;
                  const title = type === "document"
                    ? allDocuments.find(d => d.id === id)?.title || "Untitled"
                    : allFolders.find(f => f.id === id)?.name || "Untitled";
                  setEditFormData(prev => ({
                    ...prev,
                    linkedItems: [...prev.linkedItems, { type: type as "document" | "folder", id, title }],
                  }));
                }}
              >
                <SelectTrigger className="bg-background/50 border-primary/30">
                  <SelectValue placeholder={(allDocuments.length > 0 || allFolders.length > 0) ? "Select document or folder..." : "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{(allDocuments.length > 0 || allFolders.length > 0) ? "Select document or folder..." : "None"}</SelectItem>
                  {allDocuments.length > 0 && (
                    <>
                      <SelectItem value="__docs_header" disabled>
                        <span className="font-semibold text-primary">Documents</span>
                      </SelectItem>
                      {allDocuments.map(doc => (
                        <SelectItem key={`document:${doc.id}`} value={`document:${doc.id}`}>
                          <span className="flex items-center gap-1.5">
                            <FileText className="h-3 w-3 text-primary" />
                            {doc.title}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {allFolders.length > 0 && (
                    <>
                      <SelectItem value="__folders_header" disabled>
                        <span className="font-semibold text-primary">Folders</span>
                      </SelectItem>
                      {allFolders.map(folder => (
                        <SelectItem key={`folder:${folder.id}`} value={`folder:${folder.id}`}>
                          <span className="flex items-center gap-1.5">
                            <FolderOpen className="h-3 w-3 text-primary" />
                            {folder.name}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {editFormData.linkedItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {editFormData.linkedItems.map((item, idx) => (
                    <Badge key={`${item.type}-${item.id}`} className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                      {item.type === "document" ? <FileText className="h-3 w-3 text-primary" /> : <FolderOpen className="h-3 w-3 text-primary" />}
                      {item.title}
                      <button
                        type="button"
                        onClick={() => setEditFormData(prev => ({
                          ...prev,
                          linkedItems: prev.linkedItems.filter((_, i) => i !== idx),
                        }))}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date <span className="text-primary">*</span></Label>
                <DatePicker
                  value={editFormData.startDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, startDate: date }))}
                  placeholder="Select date"
                  {...makePickerProps('edit-start-date')}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Start Time <span className="text-primary">*</span></Label>
                <TimePicker
                  value={editFormData.startTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, startTime: time }))}
                  placeholder="Select time"
                  {...makePickerProps('edit-start-time')}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Due <span className="text-primary">*</span></Label>
                <DatePicker
                  value={editFormData.endDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, endDate: date }))}
                  placeholder="Select date"
                  {...makePickerProps('edit-end-date')}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Time Due <span className="text-primary">*</span></Label>
                <TimePicker
                  value={editFormData.endTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, endTime: time }))}
                  placeholder="Select time"
                  {...makePickerProps('edit-end-time')}
                />
              </div>
            </div>
            
            <div className="glassmorphic rounded-lg p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notification Reminders
                </Label>
                <button
                  type="button"
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1"
                  onClick={() => setEditFormData(prev => ({
                    ...prev,
                    notifications: [...prev.notifications, { date: "", time: "" }]
                  }))}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
              
              {editFormData.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No reminders set. Click "Add" to create one.
                </p>
              ) : (
                <div className="space-y-3">
                  {editFormData.notifications.map((notification, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-background/30 rounded-lg border border-primary/10">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <DatePicker
                          value={notification.date}
                          onChange={(date) => {
                            const updated = [...editFormData.notifications];
                            updated[index] = { ...updated[index], date };
                            setEditFormData(prev => ({ ...prev, notifications: updated }));
                          }}
                          placeholder="Date"
                          {...makePickerProps(`edit-notif-date-${index}`)}
                        />
                        <TimePicker
                          value={notification.time}
                          onChange={(time) => {
                            const updated = [...editFormData.notifications];
                            updated[index] = { ...updated[index], time };
                            setEditFormData(prev => ({ ...prev, notifications: updated }));
                          }}
                          placeholder="Time"
                          {...makePickerProps(`edit-notif-time-${index}`)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const updated = editFormData.notifications.filter((_, i) => i !== index);
                          setEditFormData(prev => ({ ...prev, notifications: updated }));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="glassmorphic rounded-lg p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  Ritualize (Repeat)
                </Label>
                <Switch
                  checked={editFormData.isRitualized}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, isRitualized: checked }))}
                />
              </div>
              
              {editFormData.isRitualized && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ritual Group (optional)</Label>
                    <Select
                      value={editFormData.ritualGroup || "__none__"}
                      onValueChange={(val) => {
                        if (val === "__custom__") {
                          setCustomRitualGroupMode('create');
                        } else if (val === "__none__") {
                          setEditFormData(prev => ({ ...prev, ritualGroup: "" }));
                          setCustomRitualGroupMode(null);
                        } else {
                          setEditFormData(prev => ({ ...prev, ritualGroup: val }));
                          setCustomRitualGroupMode(null);
                        }
                      }}
                    >
                      <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                        <SelectValue placeholder="Select ritual group..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {allRitualGroups.map(g => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">+ Add Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {customRitualGroupMode === 'create' && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Group name..."
                          value={customRitualGroupInput}
                          onChange={(e) => setCustomRitualGroupInput(e.target.value)}
                          className="bg-background/50 border-primary/30 flex-1"
                          disabled={isSavingRitualGroup}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSaveCustomRitualGroup('edit')}
                          disabled={!customRitualGroupInput.trim() || isSavingRitualGroup}
                        >
                          {isSavingRitualGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    )}
                    {editingRitualGroupId && customRitualGroupMode !== 'create' && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="New group name..."
                          value={editRitualGroupInput}
                          onChange={(e) => setEditRitualGroupInput(e.target.value)}
                          className="bg-background/50 border-primary/30 flex-1"
                          disabled={isSavingRitualGroup}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleRenameRitualGroup('edit')}
                          disabled={!editRitualGroupInput.trim() || isSavingRitualGroup}
                        >
                          {isSavingRitualGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingRitualGroupId(null); setEditRitualGroupInput(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {!customRitualGroupMode && !editingRitualGroupId && editFormData.ritualGroup && (() => {
                      const customGroup = customRitualGroups.find(g => g.value === editFormData.ritualGroup);
                      if (!customGroup) return null;
                      return (
                        <div className="mt-1 flex items-center gap-3">
                          <button
                            type="button"
                            className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                            onClick={() => { setEditingRitualGroupId(customGroup.id); setEditRitualGroupInput(customGroup.label); }}
                          >
                            <Edit3 className="h-3 w-3" /> Rename
                          </button>
                          <button
                            type="button"
                            className="text-xs text-destructive/70 hover:text-destructive flex items-center gap-1 transition-colors"
                            onClick={() => handleDeleteRitualGroup(customGroup.id)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Frequency</Label>
                      <Select value={editFormData.repeatFrequency} onValueChange={(val) => setEditFormData(prev => ({ ...prev, repeatFrequency: val }))}>
                        <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REPEAT_FREQUENCIES.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Every</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={editFormData.repeatInterval}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, repeatInterval: Math.max(1, parseInt(e.target.value) || 1) }))}
                          className="bg-background/50 border-primary/30 h-9 w-16"
                        />
                        <span className="text-xs text-muted-foreground">
                          {editFormData.repeatFrequency === "hourly" ? "hr(s)" :
                           editFormData.repeatFrequency === "daily" ? "day(s)" :
                           editFormData.repeatFrequency === "weekly" ? "wk(s)" :
                           editFormData.repeatFrequency === "monthly" ? "mo(s)" : "yr(s)"}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {editFormData.repeatFrequency === "weekly" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Repeat on</Label>
                      <div className="flex gap-1">
                        {DAYS_OF_WEEK.map(day => (
                          <button
                            key={day.value}
                            type="button"
                            className={`text-xs font-mono px-2 py-1.5 rounded border transition-colors ${
                              editFormData.repeatDays.includes(day.value)
                                ? "bg-primary/30 border-primary text-primary"
                                : "bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10"
                            }`}
                            onClick={() => {
                              setEditFormData(prev => ({
                                ...prev,
                                repeatDays: prev.repeatDays.includes(day.value)
                                  ? prev.repeatDays.filter(d => d !== day.value)
                                  : [...prev.repeatDays, day.value]
                              }));
                            }}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">End Date (optional)</Label>
                    <DatePicker
                      value={editFormData.repeatEndDate}
                      onChange={(date) => setEditFormData(prev => ({ ...prev, repeatEndDate: date }))}
                      placeholder="Repeats forever"
                      {...makePickerProps('edit-repeat-end')}
                    />
                  </div>
                </div>
              )}
            </div>

            {editFormData.isRitualized && editFormData.repeatFrequency === "weekly" && editFormData.repeatDays.length === 0 && (
              <p className="text-xs text-destructive">Please select at least one day for weekly repeat.</p>
            )}

            <Collapsible defaultOpen={!!(editFormData.location || editFormData.url || editFormData.allDay || editFormData.missionStatus !== "confirmed")}>
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors w-full py-2">
                  <MapPin className="h-3.5 w-3.5" />
                  Event Details
                  <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Input
                      placeholder="Add location..."
                      value={editFormData.location}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, location: e.target.value }))}
                      className="bg-background/50 border-primary/30 h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">URL / Link</Label>
                    <Input
                      placeholder="https://..."
                      value={editFormData.url}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, url: e.target.value }))}
                      className="bg-background/50 border-primary/30 h-9"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">All Day</Label>
                    <Switch
                      checked={editFormData.allDay}
                      onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, allDay: checked }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={editFormData.missionStatus} onValueChange={(v) => setEditFormData(prev => ({ ...prev, missionStatus: v }))}>
                      <SelectTrigger className="bg-background/50 border-primary/30 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="tentative">Tentative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <button 
              onClick={handleUpdateMission} 
              className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
              disabled={!editFormData.title.trim() || isSubmitting || (editFormData.isRitualized && editFormData.repeatFrequency === "weekly" && editFormData.repeatDays.length === 0)}
            >
              {isSubmitting ? "Updating..." : "Update Mission"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Switcher */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-background/30 border border-primary/20">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
              viewMode === 'list'
                ? 'bg-primary/20 border border-primary/50 text-primary'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
              viewMode === 'calendar'
                ? 'bg-primary/20 border border-primary/50 text-primary'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </button>
        </div>
        {googleStatus?.connected && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:bg-primary/10" onClick={() => syncGoogle('calendar')} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              Sync Calendar
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:bg-primary/10" onClick={() => syncGoogle('tasks')} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              Sync Tasks
            </Button>
          </div>
        )}
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const startDay = firstDayOfMonth.getDay();
        const daysInMonth = lastDayOfMonth.getDate();

        const calendarDays: { date: Date; isCurrentMonth: boolean }[] = [];
        for (let i = startDay - 1; i >= 0; i--) {
          calendarDays.push({ date: new Date(year, month, -i), isCurrentMonth: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
          calendarDays.push({ date: new Date(year, month, d), isCurrentMonth: true });
        }
        const remaining = 7 - (calendarDays.length % 7);
        if (remaining < 7) {
          for (let d = 1; d <= remaining; d++) {
            calendarDays.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
          }
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const allQuests = quests || [];
        const questsByDate = new Map<string, Quest[]>();
        for (const q of allQuests) {
          if (q.startDate && !q.deletedAt) {
            const existing = questsByDate.get(q.startDate) || [];
            existing.push(q);
            questsByDate.set(q.startDate, existing);
          }
        }

        const monthLabel = firstDayOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return (
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between">
              <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-primary/10 transition-colors">
                <ChevronLeft className="h-5 w-5 text-primary" />
              </button>
              <h2 className="text-lg font-orbitron">{monthLabel}</h2>
              <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-primary/10 transition-colors">
                <ChevronRight className="h-5 w-5 text-primary" />
              </button>
            </div>

            <div className="px-3 pb-3">
              <div className="grid grid-cols-7 mb-1">
                {weekDays.map(d => (
                  <div key={d} className="text-center text-[10px] font-mono text-muted-foreground uppercase py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-primary/5 rounded-lg overflow-hidden">
                {calendarDays.map((cell, idx) => {
                  const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
                  const dayQuests = questsByDate.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const maxShow = 3;
                  const overflow = dayQuests.length - maxShow;

                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] sm:min-h-[100px] p-1 bg-background/50 transition-colors hover:bg-primary/5 cursor-pointer ${
                        !cell.isCurrentMonth ? 'opacity-30' : ''
                      }`}
                      onClick={() => {
                        setCreateFormData(prev => ({
                          ...prev,
                          startDate: dateStr,
                          endDate: dateStr,
                        }));
                        setIsCreateOpen(true);
                      }}
                    >
                      <div className={`text-xs font-mono mb-1 ${
                        isToday
                          ? 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center font-bold'
                          : 'text-muted-foreground pl-1'
                      }`}>
                        {cell.date.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayQuests.slice(0, maxShow).map(q => (
                          <div
                            key={q.id}
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer transition-colors ${
                              q.completed
                                ? 'bg-muted/50 text-muted-foreground line-through'
                                : q.externalSource === 'google_calendar'
                                  ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                                  : q.externalSource === 'google_tasks'
                                    ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                                    : 'bg-primary/20 text-primary hover:bg-primary/30'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(q);
                            }}
                            title={`${q.title}${q.startTime ? ` • ${q.startTime}` : ''}${q.location ? ` • ${q.location}` : ''}`}
                          >
                            <span className="hidden sm:inline">{q.title}</span>
                            <span className="sm:hidden">•</span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <div className="text-[9px] text-muted-foreground pl-1">+{overflow} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* List View */}
      {viewMode === 'list' && (<>
      <div data-tour="today-missions">
      <DroppableSection section="today" onDropQuest={handleCrossSectionDrop} onDropGroup={handleCrossSectionGroupDrop} className="mb-6">
      <Collapsible open={todayExpanded} onOpenChange={setTodayExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Today's</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Today's"
                description="Missions scheduled for today or without a specific date. Complete these to earn XP and level up your character."
                additionalInfo="Focus on high-priority missions first to maximize your daily productivity."
                hideMoreDetails
              />
            </div>
            <CollapsibleTrigger asChild>
              <div className="flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-md px-2 py-1">
                {todayExpanded ? (
                  <ChevronDown className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-primary" />
                )}
              </div>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              {nextOnboardingMission && (
                <QuestItem
                  quest={{
                    id: `onboarding-${nextOnboardingMission.id}`,
                    title: nextOnboardingMission.title,
                    description: nextOnboardingMission.description,
                    completed: false,
                    experienceReward: nextOnboardingMission.xp,
                    difficulty: nextOnboardingMission.difficulty,
                    category: "onboarding",
                    energyCost: nextOnboardingMission.energyCost,
                    attentionCost: nextOnboardingMission.attentionCost,
                    timeCost: nextOnboardingMission.timeCost,
                    startDate: "",
                    startTime: "",
                    endDate: "",
                    endTime: "",
                    notificationEnabled: false,
                    isRitualized: false,
                  } as Quest}
                  index={0}
                  section="today"
                  onToggle={() => {}}
                  onStart={() => navigate(`/onboarding?mission=${nextOnboardingMission.id}`)}
                  timerBlocked={!!activeTimerQuest}
                />
              )}
              {todayMissions.length > 0 ? (
                groupMissionsByRitual(todayMissions).map((group, visualIdx) => {
                  const missionIds = group.missions.map(q => String(q.id));
                  if (group.ritualGroup) {
                    const groupKey = `today-${group.ritualGroup}`;
                    const isCollapsed = ritualGroupCollapsed[groupKey] !== false;
                    return (
                      <DraggableVisualItem key={groupKey} index={visualIdx} section="today" ritualGroup={group.ritualGroup} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden pl-5">
                          <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => toggleRitualGroupCollapsed(groupKey)}
                            className="flex-1 px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Repeat className="h-4 w-4 text-primary" />
                              <span className="text-sm font-mono text-primary capitalize">{getRitualGroupLabel(group.ritualGroup)}</span>
                              <span className="text-xs text-muted-foreground ml-1">({group.missions.length})</span>
                              <div className="ml-auto">
                                {isCollapsed ? <ChevronRight className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                              </div>
                            </div>
                            {(() => {
                              const dr = getRitualGroupDateRange(group.missions);
                              if (!dr) return null;
                              return (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-6 flex-wrap">
                                  {dr.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.startDate)}</span>}
                                  {dr.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.startTime)}</span>}
                                  {(dr.endDate || dr.endTime) && <span className="text-primary">→</span>}
                                  {dr.endDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.endDate)}</span>}
                                  {dr.endTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.endTime)}</span>}
                                </div>
                              );
                            })()}
                          </button>
                          </div>
                          {!isCollapsed && (
                            <div className="px-2 pb-2 space-y-2">
                              {group.missions.map((quest, idx) => (
                                <QuestItem
                                  key={quest.id}
                                  quest={quest}
                                  index={idx}
                                  section="today"
                                  onToggle={() => toggleQuestCompletion(quest.id)}
                                  onDelete={() => handleDeleteMission(quest)}
                                  onEdit={() => openEditDialog(quest)}
                                  onStart={() => handleStartMission(quest)}
                                  onResume={() => handleResumeMission(quest)}
                                  onDone={() => handleDoneMission(quest)}
                                  onRestart={restartMissionTimer}
                                  onMoveQuest={(dragIdx, hoverIdx) => moveMission("today", dragIdx, hoverIdx)}
                                  elapsedSeconds={missionElapsedTimes[quest.id]}
                                  breakSeconds={missionBreakTimes[quest.id]}
                                  isTimerActive={activeTimerQuest?.id === quest.id}
                                  timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                                />
                              ))}
                            </div>
                          )}
                          <div className="px-3 pt-2 pb-3">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDoneGroup(group.missions); }}
                              className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                              title="Complete all missions in group"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </DraggableVisualItem>
                    );
                  }
                  return group.missions.map((quest) => (
                    <DraggableVisualItem key={quest.id} index={visualIdx} section="today" ritualGroup={null} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                      <QuestItem
                        quest={quest}
                        index={visualIdx}
                        section="today"
                        onToggle={() => toggleQuestCompletion(quest.id)}
                        onDelete={() => handleDeleteMission(quest)}
                        onEdit={() => openEditDialog(quest)}
                        onStart={() => handleStartMission(quest)}
                        onResume={() => handleResumeMission(quest)}
                        onDone={() => handleDoneMission(quest)}
                        onRestart={restartMissionTimer}
                        onMoveQuest={(dragIdx, hoverIdx) => moveVisualItem(dragIdx, hoverIdx, "today")}
                        elapsedSeconds={missionElapsedTimes[quest.id]}
                        breakSeconds={missionBreakTimes[quest.id]}
                        isTimerActive={activeTimerQuest?.id === quest.id}
                        timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                      />
                    </DraggableVisualItem>
                  ));
                })
              ) : !nextOnboardingMission ? (
                <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                  <span className="material-icons text-3xl text-muted-foreground mb-2">task_alt</span>
                  <p className="text-muted-foreground">No missions for today. Create one to get started!</p>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      </DroppableSection>
      </div>
      
      <div data-tour="upcoming-missions">
      <DroppableSection section="upcoming" onDropQuest={handleCrossSectionDrop} onDropGroup={handleCrossSectionGroupDrop} className="mb-6">
        <Collapsible open={upcomingExpanded} onOpenChange={setUpcomingExpanded}>
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron">Future</h2>
                <StatInfoDialog
                  trigger={
                    <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="Future"
                  description="Missions scheduled for upcoming days. Plan ahead to ensure you're prepared for what's coming."
                  additionalInfo="Review and adjust future missions regularly to keep your schedule aligned with your goals."
                  hideMoreDetails
                />
              </div>
              <CollapsibleTrigger asChild>
                <div className="flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-md px-2 py-1">
                  {upcomingExpanded ? (
                    <ChevronDown className="h-5 w-5 text-primary" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary" />
                  )}
                </div>
              </CollapsibleTrigger>
            </div>
            
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                {upcomingMissions.length > 0 ? (
                  groupMissionsByRitual(upcomingMissions).map((group, visualIdx) => {
                    const missionIds = group.missions.map(q => String(q.id));
                    if (group.ritualGroup) {
                      const groupKey = `upcoming-${group.ritualGroup}`;
                      const isCollapsed = ritualGroupCollapsed[groupKey] !== false;
                      return (
                        <DraggableVisualItem key={groupKey} index={visualIdx} section="upcoming" ritualGroup={group.ritualGroup} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                          <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden pl-5">
                            <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => toggleRitualGroupCollapsed(groupKey)}
                              className="flex-1 px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <Repeat className="h-4 w-4 text-primary" />
                                <span className="text-sm font-mono text-primary capitalize">{getRitualGroupLabel(group.ritualGroup)}</span>
                                <span className="text-xs text-muted-foreground ml-1">({group.missions.length})</span>
                                <div className="ml-auto">
                                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                                </div>
                              </div>
                              {(() => {
                                const dr = getRitualGroupDateRange(group.missions);
                                if (!dr) return null;
                                return (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-6 flex-wrap">
                                    {dr.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.startDate)}</span>}
                                    {dr.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.startTime)}</span>}
                                    {(dr.endDate || dr.endTime) && <span className="text-primary">→</span>}
                                    {dr.endDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.endDate)}</span>}
                                    {dr.endTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.endTime)}</span>}
                                  </div>
                                );
                              })()}
                            </button>
                            </div>
                            {!isCollapsed && (
                              <div className="px-2 pb-2 space-y-2">
                                {group.missions.map((quest, idx) => (
                                  <QuestItem
                                    key={quest.id}
                                    quest={quest}
                                    index={idx}
                                    section="upcoming"
                                    onToggle={() => toggleQuestCompletion(quest.id)}
                                    onDelete={() => handleDeleteMission(quest)}
                                    onEdit={() => openEditDialog(quest)}
                                    onStart={() => handleStartMission(quest)}
                                    onResume={() => handleResumeMission(quest)}
                                    onDone={() => handleDoneMission(quest)}
                                    onRestart={restartMissionTimer}
                                    onMoveQuest={(dragIdx, hoverIdx) => moveMission("upcoming", dragIdx, hoverIdx)}
                                    elapsedSeconds={missionElapsedTimes[quest.id]}
                                    breakSeconds={missionBreakTimes[quest.id]}
                                    isTimerActive={activeTimerQuest?.id === quest.id}
                                    timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                                  />
                                ))}
                              </div>
                            )}
                            <div className="px-3 pt-2 pb-3">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDoneGroup(group.missions); }}
                                className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                title="Complete all missions in group"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        </DraggableVisualItem>
                      );
                    }
                    return group.missions.map((quest) => (
                      <DraggableVisualItem key={quest.id} index={visualIdx} section="upcoming" ritualGroup={null} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                        <QuestItem
                          quest={quest}
                          index={visualIdx}
                          section="upcoming"
                          onToggle={() => toggleQuestCompletion(quest.id)}
                          onDelete={() => handleDeleteMission(quest)}
                          onEdit={() => openEditDialog(quest)}
                          onStart={() => handleStartMission(quest)}
                          onResume={() => handleResumeMission(quest)}
                          onDone={() => handleDoneMission(quest)}
                          onRestart={restartMissionTimer}
                          onMoveQuest={(dragIdx, hoverIdx) => moveVisualItem(dragIdx, hoverIdx, "upcoming")}
                          elapsedSeconds={missionElapsedTimes[quest.id]}
                          breakSeconds={missionBreakTimes[quest.id]}
                          isTimerActive={activeTimerQuest?.id === quest.id}
                          timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                        />
                      </DraggableVisualItem>
                    ));
                  })
                ) : (
                  <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                    <p className="text-muted-foreground">No future missions scheduled. Drag a mission here or create one with a future date!</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </DroppableSection>
      </div>
      

      {/* Completed Missions */}
      <DroppableSection section="completed" onDropQuest={handleCrossSectionDrop} onDropGroup={handleCrossSectionGroupDrop} className="mb-6">
      <Collapsible open={completedExpanded} onOpenChange={setCompletedExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border" data-tour="completed-missions">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Completed</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Completed"
                description="Missions you've finished today. Each completed mission contributes to your XP gains and overall progress."
                additionalInfo="Review your completed missions to celebrate your achievements and identify patterns in your productivity."
                hideMoreDetails
              />
            </div>
            <CollapsibleTrigger asChild>
              <div className="flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-md px-2 py-1">
                {completedExpanded ? (
                  <ChevronDown className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-primary" />
                )}
              </div>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              {completedMissions.length > 0 ? (
                groupMissionsByRitual(completedMissions).map((group, visualIdx) => {
                  const missionIds = group.missions.map(q => String(q.id));
                  if (group.ritualGroup) {
                    const groupKey = `completed-${group.ritualGroup}`;
                    const isCollapsed = ritualGroupCollapsed[groupKey] !== false;
                    return (
                      <DraggableVisualItem key={groupKey} index={visualIdx} section="completed" ritualGroup={group.ritualGroup} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden pl-5">
                          <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => toggleRitualGroupCollapsed(groupKey)}
                            className="flex-1 px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Repeat className="h-4 w-4 text-primary" />
                              <span className="text-sm font-mono text-primary capitalize line-through">{getRitualGroupLabel(group.ritualGroup)}</span>
                              <span className="text-xs text-muted-foreground ml-1">({group.missions.length})</span>
                              <div className="ml-auto">
                                {isCollapsed ? <ChevronRight className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                              </div>
                            </div>
                            {(() => {
                              const dr = getRitualGroupDateRange(group.missions);
                              if (!dr) return null;
                              return (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-6 flex-wrap">
                                  {dr.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.startDate)}</span>}
                                  {dr.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.startTime)}</span>}
                                  {(dr.endDate || dr.endTime) && <span className="text-primary">→</span>}
                                  {dr.endDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.endDate)}</span>}
                                  {dr.endTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.endTime)}</span>}
                                </div>
                              );
                            })()}
                          </button>
                          </div>
                          {!isCollapsed && (
                            <div className="px-2 pb-2 space-y-2">
                              {group.missions.map((quest, idx) => (
                                <QuestItem
                                  key={quest.id}
                                  quest={quest}
                                  index={idx}
                                  section="completed"
                                  onToggle={() => toggleQuestCompletion(quest.id)}
                                  onDelete={() => handleDeleteMission(quest)}
                                  onEdit={() => openEditDialog(quest)}
                                  onUndo={() => handleUndoMission(quest)}
                                  onMoveQuest={(dragIdx, hoverIdx) => moveMission("completed", dragIdx, hoverIdx)}
                                  elapsedSeconds={missionElapsedTimes[quest.id]}
                                  breakSeconds={missionBreakTimes[quest.id]}
                                />
                              ))}
                            </div>
                          )}
                          <div className="px-3 pt-2 pb-3">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleUndoGroup(group.missions); }}
                              className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5"
                              title="Undo all missions in group"
                            >
                              <Undo2 className="h-3 w-3" />
                              Undo
                            </button>
                          </div>
                        </div>
                      </DraggableVisualItem>
                    );
                  }
                  return group.missions.map((quest) => (
                    <DraggableVisualItem key={quest.id} index={visualIdx} section="completed" ritualGroup={null} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                      <QuestItem
                        quest={quest}
                        index={visualIdx}
                        section="completed"
                        onToggle={() => toggleQuestCompletion(quest.id)}
                        onDelete={() => handleDeleteMission(quest)}
                        onEdit={() => openEditDialog(quest)}
                        onUndo={() => handleUndoMission(quest)}
                        onMoveQuest={(dragIdx, hoverIdx) => moveVisualItem(dragIdx, hoverIdx, "completed")}
                        elapsedSeconds={missionElapsedTimes[quest.id]}
                        breakSeconds={missionBreakTimes[quest.id]}
                      />
                    </DraggableVisualItem>
                  ));
                })
              ) : (
                <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                  <p className="text-muted-foreground">No completed missions today yet. Finish a mission to see it here!</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      </DroppableSection>
      
      <div data-tour="inbox-missions">
      <DroppableSection section="inbox" onDropQuest={handleCrossSectionDrop} onDropGroup={handleCrossSectionGroupDrop} className="mb-6">
        <Collapsible open={inboxExpanded} onOpenChange={setInboxExpanded}>
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Inbox className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron">Archived</h2>
                <StatInfoDialog
                  trigger={
                    <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="Archived"
                  description="Missions created from your to-do ideas. Edit to schedule or complete them directly."
                  additionalInfo="These missions were automatically generated from ideas you captured. Review and prioritize them as needed."
                  hideMoreDetails
                />
              </div>
              <CollapsibleTrigger asChild>
                <div className="flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-md px-2 py-1">
                  {inboxExpanded ? (
                    <ChevronDown className="h-5 w-5 text-primary" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary" />
                  )}
                </div>
              </CollapsibleTrigger>
            </div>
            
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                {groupMissionsByRitual(inboxMissions).map((group, visualIdx) => {
                  const missionIds = group.missions.map(q => String(q.id));
                  if (group.ritualGroup) {
                    const groupKey = `inbox-${group.ritualGroup}`;
                    const isCollapsed = ritualGroupCollapsed[groupKey] !== false;
                    return (
                      <DraggableVisualItem key={groupKey} index={visualIdx} section="inbox" ritualGroup={group.ritualGroup} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden pl-5">
                          <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => toggleRitualGroupCollapsed(groupKey)}
                            className="flex-1 px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Repeat className="h-4 w-4 text-primary" />
                              <span className="text-sm font-mono text-primary capitalize">{getRitualGroupLabel(group.ritualGroup)}</span>
                              <span className="text-xs text-muted-foreground ml-1">({group.missions.length})</span>
                              <div className="ml-auto">
                                {isCollapsed ? <ChevronRight className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                              </div>
                            </div>
                            {(() => {
                              const dr = getRitualGroupDateRange(group.missions);
                              if (!dr) return null;
                              return (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-6 flex-wrap">
                                  {dr.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.startDate)}</span>}
                                  {dr.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.startTime)}</span>}
                                  {(dr.endDate || dr.endTime) && <span className="text-primary">→</span>}
                                  {dr.endDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dr.formatDate(dr.endDate)}</span>}
                                  {dr.endTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dr.formatTime(dr.endTime)}</span>}
                                </div>
                              );
                            })()}
                          </button>
                          </div>
                          {!isCollapsed && (
                            <div className="px-2 pb-2 space-y-2">
                              {group.missions.map((quest, idx) => (
                                <QuestItem
                                  key={quest.id}
                                  quest={quest}
                                  index={idx}
                                  section="inbox"
                                  onToggle={() => toggleQuestCompletion(quest.id)}
                                  onDelete={() => handleDeleteMission(quest)}
                                  onEdit={() => openEditDialog(quest)}
                                  onStart={() => handleStartMission(quest)}
                                  onResume={() => handleResumeMission(quest)}
                                  onDone={() => handleDoneMission(quest)}
                                  onRestart={restartMissionTimer}
                                  onMoveQuest={(dragIdx, hoverIdx) => moveMission("inbox", dragIdx, hoverIdx)}
                                  elapsedSeconds={missionElapsedTimes[quest.id]}
                                  breakSeconds={missionBreakTimes[quest.id]}
                                  isTimerActive={activeTimerQuest?.id === quest.id}
                                  timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                                />
                              ))}
                            </div>
                          )}
                          <div className="px-3 pt-2 pb-3">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDoneGroup(group.missions); }}
                              className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                              title="Complete all missions in group"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </DraggableVisualItem>
                    );
                  }
                  return group.missions.map((quest) => (
                    <DraggableVisualItem key={quest.id} index={visualIdx} section="inbox" ritualGroup={null} missionIds={missionIds} onMoveVisualItem={moveVisualItem}>
                      <QuestItem
                        quest={quest}
                        index={visualIdx}
                        section="inbox"
                        onToggle={() => toggleQuestCompletion(quest.id)}
                        onDelete={() => handleDeleteMission(quest)}
                        onEdit={() => openEditDialog(quest)}
                        onStart={() => handleStartMission(quest)}
                        onResume={() => handleResumeMission(quest)}
                        onDone={() => handleDoneMission(quest)}
                        onRestart={restartMissionTimer}
                        onMoveQuest={(dragIdx, hoverIdx) => moveVisualItem(dragIdx, hoverIdx, "inbox")}
                        elapsedSeconds={missionElapsedTimes[quest.id]}
                        breakSeconds={missionBreakTimes[quest.id]}
                        isTimerActive={activeTimerQuest?.id === quest.id}
                        timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                      />
                    </DraggableVisualItem>
                  ));
                })}
                {inboxMissions.length === 0 && (
                  <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                    <p className="text-muted-foreground">No archived missions. Drag a mission here to archive it.</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </DroppableSection>
      </div>

      {/* Terminated Missions - recently deleted, held for 24 hours */}
      <DroppableSection section="terminated" onDropQuest={handleCrossSectionDrop} onDropGroup={handleCrossSectionGroupDrop} className="mb-6">
      <Collapsible open={archivedExpanded} onOpenChange={setArchivedExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border" data-tour="terminated-missions">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Terminated</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Terminated"
                description="Recently deleted missions are held here for 24 hours before being permanently removed."
                additionalInfo="You can restore any terminated mission back to your active list within 24 hours of deletion."
                hideMoreDetails
              />
            </div>
            <CollapsibleTrigger asChild>
              <div className="flex items-center cursor-pointer hover:bg-primary/5 transition-colors rounded-md px-2 py-1">
                {archivedExpanded ? (
                  <ChevronDown className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-primary" />
                )}
              </div>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              {archivedQuests.length > 0 ? (
                archivedQuests.map((quest) => {
                  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
                  const xpMultiplier = difficultyMultipliers[quest.difficulty || 'D'] || 1;
                  const adjustedXp = Math.floor(quest.experienceReward * xpMultiplier);
                  const deletedAt = quest.deletedAt ? new Date(quest.deletedAt) : null;
                  const expiresAt = deletedAt ? new Date(deletedAt.getTime() + 24 * 60 * 60 * 1000) : null;
                  const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))) : 0;
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
                  const hasSchedule = quest.startDate || quest.startTime || quest.endDate || quest.endTime;
                  return (
                    <div 
                      key={quest.id}
                      className="glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border opacity-60"
                    >
                      <div className="flex items-start">
                        <div className="ml-2 flex-grow">
                          <div className="flex justify-between items-start">
                            <h3 className="font-medium line-through text-muted-foreground">{quest.title}</h3>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              <button
                                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors opacity-50 hover:opacity-100"
                                onClick={() => setTerminatedInfoOpen(prev => ({ ...prev, [quest.id]: !prev[quest.id] }))}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors opacity-50 hover:opacity-100"
                                onClick={() => openEditDialog({ ...quest, id: String(quest.id) } as Quest)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {quest.category !== "event" && (
                            <div className="flex items-center gap-3 mt-1 flex-wrap opacity-50">
                              <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.attentionCost ?? 0) / 1440) * 100).toFixed(0)}% AT</span>
                              <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.timeCost ?? 0) / 1440) * 100).toFixed(0)}% TT</span>
                              <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.energyCost ?? 0) / 1440) * 100).toFixed(0)}% EP</span>
                              <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
                              <span className="text-muted-foreground text-xs">{hoursLeft}h left</span>
                            </div>
                          )}
                          {terminatedInfoOpen[quest.id] && (
                            <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 opacity-60 space-y-1.5">
                              {quest.description && (
                                <div className="text-muted-foreground text-xs">
                                  <span className="text-primary font-mono">Mission Description:</span>
                                  <ObsidianMarkdown className="text-xs mt-1 [&_img]:max-w-[200px] [&_img]:rounded [&_p]:m-0">{quest.category === 'onboarding'
                                    ? (ONBOARDING_MISSIONS.find(m => m.title === quest.title.replace(/^Onboarding:\s*/, ''))?.description || quest.description)
                                    : quest.description}</ObsidianMarkdown>
                                </div>
                              )}
                              {(() => {
                                const catLabels: Record<string, string> = { legacy: "Legacy", "10year": "10-Year", "5year": "5-Year", "18month": "18-Month", "90day": "90-Day" };
                                const linkedObj = quest.visionGoalId ? allVisionGoals.find(g => g.id === quest.visionGoalId) : null;
                                return linkedObj ? (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Mission Objective — {catLabels[linkedObj.category] || linkedObj.category} Vision:</span> {linkedObj.title}
                                  </p>
                                ) : null;
                              })()}
                              {(() => {
                                const items = (quest.linkedItems as { type: "document" | "folder"; id: number; title: string }[]) || [];
                                if (items.length === 0) return null;
                                return (
                                  <div className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Linked Items:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {items.map((item) => (
                                        <button
                                          key={`${item.type}-${item.id}`}
                                          type="button"
                                          onClick={() => navigate(item.type === "document" ? `/document-vault?doc=${item.id}` : `/document-vault?folder=${item.id}`)}
                                          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors cursor-pointer"
                                        >
                                          {item.type === "document" ? <FileText className="h-3 w-3 text-primary" /> : <FolderOpen className="h-3 w-3 text-primary" />}
                                          {item.title}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                              {(() => {
                                if (!quest.ritualGroup) return null;
                                const defaultDescriptions: Record<string, string> = {
                                  morning_routine: "Wake-up rituals, journaling, and energizing habits to start the day.",
                                  evening_winddown: "Relaxation routines, reflection, and preparation for restful sleep.",
                                  workout: "Physical training sessions, exercises, and movement-based rituals.",
                                  weekly_review: "Planning, reviewing progress, and setting goals for the week ahead.",
                                  self_care: "Personal wellness, grooming, mental health, and nurturing routines.",
                                };
                                const customGroup = customRitualGroups.find(g => g.value === quest.ritualGroup);
                                const defaultGroup = DEFAULT_RITUAL_GROUPS.find(g => g.value === quest.ritualGroup);
                                const groupLabel = customGroup?.label || defaultGroup?.label || quest.ritualGroup;
                                const groupDesc = customGroup?.description || defaultDescriptions[quest.ritualGroup] || "Custom ritual group for recurring tasks.";
                                return (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Ritual Group — <span className="capitalize">{groupLabel}</span>:</span> {groupDesc}
                                  </p>
                                );
                              })()}
                              {quest.category && quest.category !== "general" && quest.category !== "onboarding" && (
                                <p className="text-muted-foreground text-xs">
                                  <span className="text-primary font-mono">Mission Type — <span className="capitalize">{quest.category}</span>:</span> {
                                    ({
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
                                    } as Record<string, string>)[quest.category] || userCategories.find(uc => uc.value === quest.category)?.description || 'Auto-classified mission category.'
                                  }
                                </p>
                              )}
                              <p className="text-muted-foreground text-xs">
                                <span className="text-primary font-mono">Mission Difficulty — Rank {quest.difficulty || 'D'}:</span> {
                                  quest.difficulty === 'S' ? 'Extreme effort. Multi-day or life-changing.' :
                                  quest.difficulty === 'A' ? 'High effort. Significant commitment.' :
                                  quest.difficulty === 'B' ? 'Moderate effort. Requires focus and planning.' :
                                  quest.difficulty === 'C' ? 'Light effort. Simple but requires attention.' :
                                  'Minimal effort. Quick and easy.'
                                }
                              </p>
                            </div>
                          )}
                          {hasSchedule && (
                            <div className="flex items-center gap-1 text-xs mt-1 flex-wrap opacity-50 text-muted-foreground">
                              {quest.startDate && (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Calendar className="h-3 w-3 flex-shrink-0" />
                                  {formatDate(quest.startDate)}
                                </span>
                              )}
                              {quest.startTime && (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  {formatTime(quest.startTime)}
                                </span>
                              )}
                              {(quest.endDate || quest.endTime) && (
                                <span className="text-primary flex-shrink-0">→</span>
                              )}
                              {quest.endDate && (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Calendar className="h-3 w-3 flex-shrink-0" />
                                  {formatDate(quest.endDate)}
                                </span>
                              )}
                              {quest.endTime && (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  {formatTime(quest.endTime)}
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            className="mt-2 text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5"
                            onClick={() => handleRestoreMission(quest.id)}
                          >
                            <Undo2 className="h-3 w-3" />
                            Restore
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                  <p className="text-muted-foreground">No terminated missions. Deleted missions will appear here for 24 hours.</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      </DroppableSection>
      </>)}
    </div>
  );
}
