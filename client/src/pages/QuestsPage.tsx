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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Zap, Star, Bell, BellOff, BellRing, Edit3, Trash2, X, ChevronDown, ChevronRight, ChevronLeft, Target, Calendar, CalendarDays, LayoutList, Clock, CheckCircle2, GraduationCap, Inbox, Info, Archive, Undo2, Repeat, Loader2, FileText, FolderOpen, Link2, GripVertical, Download, MapPin, Users, Columns3, Search, SlidersHorizontal, ArrowUpDown, Check, MoreVertical, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MissionView } from "@shared/schema";
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

const PRIMARY_CATEGORY_COLOR = { bg: 'bg-primary/15', text: 'text-primary', border: 'border-primary/40' };

function getCategoryColor(_category: string | undefined) {
  return PRIMARY_CATEGORY_COLOR;
}

function formatDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterDifficulties, setFilterDifficulties] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date-newest' | 'date-oldest' | 'title-az' | 'title-za' | 'cost-high' | 'cost-low' | 'difficulty-high' | 'difficulty-low'>('date-newest');
  const [showListCompleted, setShowListCompleted] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const [calendarZoom, setCalendarZoom] = useState<'year' | 'month' | 'week' | 'day'>('month');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.getFullYear(), now.getMonth(), diff);
  });
  const [calendarDay, setCalendarDay] = useState(() => new Date());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [todayExpanded, setTodayExpanded] = useWidgetState("quests.today", true);
  const [upcomingExpanded, setUpcomingExpanded] = useWidgetState("quests.upcoming", true);
  const [completedExpanded, setCompletedExpanded] = useWidgetState("quests.completed", true);
  const [inboxExpanded, setInboxExpanded] = useWidgetState("quests.inbox", true);
  const [archivedExpanded, setArchivedExpanded] = useWidgetState("quests.archived", true);
  const [terminatedInfoOpen, setTerminatedInfoOpen] = useState<Record<string | number, boolean>>({});
  const [originalDates, setOriginalDates] = useState<Record<string, { startDate?: string; endDate?: string; startTime?: string; endTime?: string }>>({});

  const { data: customViews = [], refetch: refetchViews } = useQuery<MissionView[]>({
    queryKey: ['/api/mission-views'],
    enabled: !!user,
  });
  const [activeCustomViewId, setActiveCustomViewId] = useState<number | null>(null);
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [isEditViewOpen, setIsEditViewOpen] = useState(false);
  const [editingView, setEditingView] = useState<MissionView | null>(null);
  const [createViewName, setCreateViewName] = useState('');
  const [createViewType, setCreateViewType] = useState<'board' | 'list' | 'calendar'>('board');
  const [createViewColumns, setCreateViewColumns] = useState<{ id: string; title: string; order: number }[]>([
    { id: 'todo', title: 'To Do', order: 0 },
    { id: 'in-progress', title: 'In Progress', order: 1 },
    { id: 'done', title: 'Done', order: 2 },
  ]);
  const [createViewFilterCategories, setCreateViewFilterCategories] = useState<string[]>([]);
  const [createViewFilterDifficulties, setCreateViewFilterDifficulties] = useState<string[]>([]);
  const [editViewName, setEditViewName] = useState('');
  const [editViewFilterCategories, setEditViewFilterCategories] = useState<string[]>([]);
  const [editViewFilterDifficulties, setEditViewFilterDifficulties] = useState<string[]>([]);
  const [editViewColumns, setEditViewColumns] = useState<{ id: string; title: string; order: number }[]>([]);
  const [isViewSubmitting, setIsViewSubmitting] = useState(false);
  const [newColumnInput, setNewColumnInput] = useState('');
  const [editNewColumnInput, setEditNewColumnInput] = useState('');
  const [renamingTabViewId, setRenamingTabViewId] = useState<number | null>(null);
  const [renameTabInput, setRenameTabInput] = useState('');

  const activeCustomView = useMemo(() => {
    if (!activeCustomViewId) return null;
    return customViews.find(v => v.id === activeCustomViewId) || null;
  }, [activeCustomViewId, customViews]);

  const handleCreateView = async () => {
    if (!createViewName.trim() || !user) return;
    setIsViewSubmitting(true);
    try {
      const viewData: any = {
        userId: user.id,
        name: createViewName.trim(),
        viewType: createViewType,
        filters: {
          categories: createViewFilterCategories.length > 0 ? createViewFilterCategories : undefined,
          difficulty: createViewFilterDifficulties.length > 0 ? createViewFilterDifficulties : undefined,
        },
        columns: createViewType === 'board' ? createViewColumns : [],
      };
      const result = await apiRequest<MissionView>('/api/mission-views', {
        method: 'POST',
        body: JSON.stringify(viewData),
      });
      await refetchViews();
      if (result?.id) setActiveCustomViewId(result.id);
      setIsCreateViewOpen(false);
      setCreateViewName('');
      setCreateViewType('board');
      setCreateViewColumns([
        { id: 'todo', title: 'To Do', order: 0 },
        { id: 'in-progress', title: 'In Progress', order: 1 },
        { id: 'done', title: 'Done', order: 2 },
      ]);
      setCreateViewFilterCategories([]);
      setCreateViewFilterDifficulties([]);
    } catch (error) {
      toast({ title: 'Failed to create view', variant: 'destructive' });
    } finally {
      setIsViewSubmitting(false);
    }
  };

  const handleUpdateView = async () => {
    if (!editingView || !editViewName.trim()) return;
    setIsViewSubmitting(true);
    try {
      await apiRequest(`/api/mission-views/${editingView.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editViewName.trim(),
          filters: {
            categories: editViewFilterCategories.length > 0 ? editViewFilterCategories : undefined,
            difficulty: editViewFilterDifficulties.length > 0 ? editViewFilterDifficulties : undefined,
          },
          columns: editingView.viewType === 'board' ? editViewColumns : editingView.columns,
        }),
      });
      await refetchViews();
      setIsEditViewOpen(false);
      setEditingView(null);
    } catch (error) {
      toast({ title: 'Failed to update view', variant: 'destructive' });
    } finally {
      setIsViewSubmitting(false);
    }
  };

  const handleDeleteView = async (viewId: number) => {
    try {
      await apiRequest(`/api/mission-views/${viewId}`, { method: 'DELETE' });
      if (activeCustomViewId === viewId) setActiveCustomViewId(null);
      await refetchViews();
    } catch (error) {
      toast({ title: 'Failed to delete view', variant: 'destructive' });
    }
  };

  const handleRenameTabView = async (viewId: number) => {
    if (!renameTabInput.trim()) return;
    try {
      await apiRequest(`/api/mission-views/${viewId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameTabInput.trim() }),
      });
      await refetchViews();
      setRenamingTabViewId(null);
      setRenameTabInput('');
    } catch (error) {
      toast({ title: 'Failed to rename view', variant: 'destructive' });
    }
  };

  const openEditViewDialog = (view: MissionView) => {
    setEditingView(view);
    setEditViewName(view.name);
    const filters = (view.filters || {}) as any;
    setEditViewFilterCategories(filters.categories || []);
    setEditViewFilterDifficulties(filters.difficulty || []);
    setEditViewColumns(((view.columns || []) as any[]).map((c: any, i: number) => ({
      id: c.id || `col-${i}`,
      title: c.title || '',
      order: c.order ?? i,
    })));
    setIsEditViewOpen(true);
  };

  const applyViewFilters = useCallback((missions: Quest[], view: MissionView): Quest[] => {
    let result = missions;
    const filters = (view.filters || {}) as any;
    if (filters.categories?.length > 0) {
      result = result.filter(m => filters.categories.includes(m.category || 'general'));
    }
    if (filters.difficulty?.length > 0) {
      result = result.filter(m => filters.difficulty.includes(m.difficulty || 'D'));
    }
    if (filters.dateRange?.from) {
      result = result.filter(m => (m.startDate || '') >= filters.dateRange.from);
    }
    if (filters.dateRange?.to) {
      result = result.filter(m => (m.startDate || '') <= filters.dateRange.to);
    }
    return result;
  }, []);

  const handleMoveToViewColumn = useCallback(async (questId: number, viewId: number, column: string) => {
    try {
      await apiRequest(`/api/quests/${questId}/view-column`, {
        method: 'PATCH',
        body: JSON.stringify({ viewId, viewColumn: column }),
      });
      await refetchQuests();
    } catch {
      toast({ title: 'Failed to move mission', variant: 'destructive' });
    }
  }, [refetchQuests, toast]);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCategories.length > 0) count++;
    if (filterDifficulties.length > 0) count++;
    if (filterStatus.length > 0) count++;
    if (filterDateFrom || filterDateTo) count++;
    return count;
  }, [filterCategories, filterDifficulties, filterStatus, filterDateFrom, filterDateTo]);

  const DIFFICULTY_ORDER: Record<string, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };

  const applySearchAndFilters = useCallback((missions: Quest[]): Quest[] => {
    let result = missions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => m.title.toLowerCase().includes(q));
    }
    if (filterCategories.length > 0) {
      result = result.filter(m => filterCategories.includes(m.category || 'general'));
    }
    if (filterDifficulties.length > 0) {
      result = result.filter(m => filterDifficulties.includes(m.difficulty || 'D'));
    }
    if (filterStatus.length > 0) {
      result = result.filter(m => {
        if (filterStatus.includes('active') && !m.completed) return true;
        if (filterStatus.includes('completed') && m.completed) return true;
        return false;
      });
    }
    if (filterDateFrom) {
      result = result.filter(m => (m.startDate || '') >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter(m => (m.startDate || '') <= filterDateTo);
    }
    return result;
  }, [searchQuery, filterCategories, filterDifficulties, filterStatus, filterDateFrom, filterDateTo]);

  const applySorting = useCallback((missions: Quest[]): Quest[] => {
    const sorted = [...missions];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'date-newest': return (b.startDate || '').localeCompare(a.startDate || '');
        case 'date-oldest': return (a.startDate || '').localeCompare(b.startDate || '');
        case 'title-az': return a.title.localeCompare(b.title);
        case 'title-za': return b.title.localeCompare(a.title);
        case 'cost-high': return ((b.energyCost || 0) + (b.attentionCost || 0) + (b.timeCost || 0)) - ((a.energyCost || 0) + (a.attentionCost || 0) + (a.timeCost || 0));
        case 'cost-low': return ((a.energyCost || 0) + (a.attentionCost || 0) + (a.timeCost || 0)) - ((b.energyCost || 0) + (b.attentionCost || 0) + (b.timeCost || 0));
        case 'difficulty-high': return (DIFFICULTY_ORDER[b.difficulty || 'D'] || 0) - (DIFFICULTY_ORDER[a.difficulty || 'D'] || 0);
        case 'difficulty-low': return (DIFFICULTY_ORDER[a.difficulty || 'D'] || 0) - (DIFFICULTY_ORDER[b.difficulty || 'D'] || 0);
        default: return 0;
      }
    });
    return sorted;
  }, [sortBy]);

  const filteredTodayMissions = useMemo(() => applySearchAndFilters(todayMissions), [todayMissions, applySearchAndFilters]);
  const filteredUpcomingMissions = useMemo(() => applySearchAndFilters(upcomingMissions), [upcomingMissions, applySearchAndFilters]);
  const filteredCompletedMissions = useMemo(() => applySearchAndFilters(completedMissions), [completedMissions, applySearchAndFilters]);
  const filteredInboxMissions = useMemo(() => applySearchAndFilters(inboxMissions), [inboxMissions, applySearchAndFilters]);

  const listViewMissions = useMemo(() => {
    const allActive = quests.filter(q => !q.completed && !q.deletedAt && q.category !== 'onboarding');
    const allCompleted = quests.filter(q => q.completed && !q.deletedAt);
    let pool = showListCompleted ? [...allActive, ...allCompleted] : allActive;
    pool = applySearchAndFilters(pool);
    pool = applySorting(pool);
    pool.sort((a, b) => {
      const dateA = a.startDate || '9999-12-31';
      const dateB = b.startDate || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.startTime || '99:99';
      const timeB = b.startTime || '99:99';
      return timeA.localeCompare(timeB);
    });
    return pool;
  }, [quests, showListCompleted, applySearchAndFilters, applySorting]);

  const listViewGrouped = useMemo(() => {
    const groups: { label: string; dateKey: string; missions: Quest[] }[] = [];
    const groupMap = new Map<string, Quest[]>();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    for (const mission of listViewMissions) {
      const dateKey = mission.startDate || 'unscheduled';
      if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
      groupMap.get(dateKey)!.push(mission);
    }

    const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
      if (a === 'unscheduled') return 1;
      if (b === 'unscheduled') return -1;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      let label: string;
      if (key === 'unscheduled') {
        label = 'Unscheduled';
      } else if (key === todayStr) {
        label = 'Today';
      } else if (key === tomorrowStr) {
        label = 'Tomorrow';
      } else {
        const [y, m, d] = key.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      groups.push({ label, dateKey: key, missions: groupMap.get(key)! });
    }
    return groups;
  }, [listViewMissions]);

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

      {/* View Switcher + Search + Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background/30 border border-primary/20">
            <button
              onClick={() => { setViewMode('board'); setActiveCustomViewId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                viewMode === 'board' && !activeCustomViewId
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </button>
            <button
              onClick={() => { setViewMode('list'); setActiveCustomViewId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                viewMode === 'list' && !activeCustomViewId
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => { setViewMode('calendar'); setActiveCustomViewId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                viewMode === 'calendar' && !activeCustomViewId
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

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search missions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-8 text-xs bg-background/50 border-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-primary/30 bg-background/50 relative">
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-4" align="start">
              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Category</Label>
                <div className="flex flex-wrap gap-1.5">
                  {mergedCategories.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setFilterCategories(prev =>
                        prev.includes(cat.value) ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                      )}
                      className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors ${
                        filterCategories.includes(cat.value)
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Difficulty</Label>
                <div className="flex gap-1.5">
                  {['S', 'A', 'B', 'C', 'D'].map(d => (
                    <button
                      key={d}
                      onClick={() => setFilterDifficulties(prev =>
                        prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                      )}
                      className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                        filterDifficulties.includes(d)
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Status</Label>
                <div className="flex gap-1.5">
                  {[{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }].map(s => (
                    <button
                      key={s.value}
                      onClick={() => setFilterStatus(prev =>
                        prev.includes(s.value) ? prev.filter(x => x !== s.value) : [...prev, s.value]
                      )}
                      className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                        filterStatus.includes(s.value)
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Date Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker
                    value={filterDateFrom}
                    onChange={(date) => setFilterDateFrom(date)}
                    placeholder="From"
                    {...makePickerProps('filter-date-from')}
                  />
                  <DatePicker
                    value={filterDateTo}
                    onChange={(date) => setFilterDateTo(date)}
                    placeholder="To"
                    {...makePickerProps('filter-date-to')}
                  />
                </div>
              </div>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setFilterCategories([]);
                    setFilterDifficulties([]);
                    setFilterStatus([]);
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs border-primary/30 bg-background/50">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                Sort
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              {[
                { value: 'date-newest' as const, label: 'Date (Newest)' },
                { value: 'date-oldest' as const, label: 'Date (Oldest)' },
                { value: 'title-az' as const, label: 'Title (A-Z)' },
                { value: 'title-za' as const, label: 'Title (Z-A)' },
                { value: 'cost-high' as const, label: 'Cost (High)' },
                { value: 'cost-low' as const, label: 'Cost (Low)' },
                { value: 'difficulty-high' as const, label: 'Difficulty (High)' },
                { value: 'difficulty-low' as const, label: 'Difficulty (Low)' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSortBy(opt.value); setSortPopoverOpen(false); }}
                  className={`w-full text-left text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-2 ${
                    sortBy === opt.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {sortBy === opt.value && <Check className="h-3 w-3" />}
                  <span className={sortBy === opt.value ? '' : 'ml-5'}>{opt.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Custom Views Tabs */}
        {customViews.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => { setActiveCustomViewId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
                !activeCustomViewId
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent'
              }`}
            >
              <Eye className="h-3 w-3" />
              Default
            </button>
            {customViews.map(view => (
              <div key={view.id} className="flex items-center group">
                {renamingTabViewId === view.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={renameTabInput}
                      onChange={(e) => setRenameTabInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameTabView(view.id);
                        if (e.key === 'Escape') { setRenamingTabViewId(null); setRenameTabInput(''); }
                      }}
                      className="h-6 text-xs w-24 bg-background/50 border-primary/30"
                      autoFocus
                    />
                    <button onClick={() => handleRenameTabView(view.id)} className="text-primary hover:text-primary/80">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => { setRenamingTabViewId(null); setRenameTabInput(''); }} className="text-muted-foreground hover:text-primary">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setActiveCustomViewId(view.id);
                        setViewMode(view.viewType as 'board' | 'list' | 'calendar');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-md text-xs font-mono transition-colors whitespace-nowrap ${
                        activeCustomViewId === view.id
                          ? 'bg-primary/20 border border-r-0 border-primary/50 text-primary'
                          : 'text-muted-foreground hover:text-primary hover:bg-primary/10 border border-r-0 border-transparent'
                      }`}
                    >
                      {view.viewType === 'board' && <Columns3 className="h-3 w-3" />}
                      {view.viewType === 'list' && <LayoutList className="h-3 w-3" />}
                      {view.viewType === 'calendar' && <CalendarDays className="h-3 w-3" />}
                      {view.name}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={`px-1 py-1.5 rounded-r-md text-xs transition-colors ${
                          activeCustomViewId === view.id
                            ? 'bg-primary/20 border border-l-0 border-primary/50 text-primary'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10 border border-l-0 border-transparent opacity-0 group-hover:opacity-100'
                        }`}>
                          <MoreVertical className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-36">
                        <DropdownMenuItem onClick={() => { setRenamingTabViewId(view.id); setRenameTabInput(view.name); }}>
                          <Edit3 className="h-3 w-3 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditViewDialog(view)}>
                          <SlidersHorizontal className="h-3 w-3 mr-2" />
                          Edit Filters
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteView(view.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
            <button
              onClick={() => setIsCreateViewOpen(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap border border-dashed border-primary/20"
            >
              <Plus className="h-3 w-3" />
              View
            </button>
          </div>
        )}
        {customViews.length === 0 && (
          <div className="flex items-center">
            <button
              onClick={() => setIsCreateViewOpen(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap border border-dashed border-primary/20"
            >
              <Plus className="h-3 w-3" />
              Custom View
            </button>
          </div>
        )}
      </div>

      {/* Create Custom View Dialog */}
      <Dialog open={isCreateViewOpen} onOpenChange={setIsCreateViewOpen}>
        <DialogContent className="glassmorphic border-primary/30 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-orbitron text-lg">Create Custom View</DialogTitle>
            <DialogDescription className="sr-only">Create a new custom mission view</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>View Name</Label>
              <Input
                placeholder="e.g. Work Tasks, Health Board..."
                value={createViewName}
                onChange={(e) => setCreateViewName(e.target.value)}
                className="bg-background/50 border-primary/30"
              />
            </div>
            <div className="space-y-2">
              <Label>View Type</Label>
              <div className="flex gap-2">
                {([
                  { value: 'board' as const, icon: Columns3, label: 'Board' },
                  { value: 'list' as const, icon: LayoutList, label: 'List' },
                  { value: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setCreateViewType(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono transition-colors flex-1 justify-center ${
                      createViewType === opt.value
                        ? 'bg-primary/20 border border-primary/50 text-primary'
                        : 'bg-background/30 border border-primary/20 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    <opt.icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {createViewType === 'board' && (
              <div className="space-y-2">
                <Label>Board Columns</Label>
                <div className="space-y-1">
                  {createViewColumns.map((col, idx) => (
                    <div key={col.id} className="flex items-center gap-2">
                      <Input
                        value={col.title}
                        onChange={(e) => {
                          const updated = [...createViewColumns];
                          updated[idx] = { ...updated[idx], title: e.target.value };
                          setCreateViewColumns(updated);
                        }}
                        className="bg-background/50 border-primary/30 h-8 text-xs flex-1"
                      />
                      {createViewColumns.length > 1 && (
                        <button
                          onClick={() => setCreateViewColumns(createViewColumns.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New column name..."
                    value={newColumnInput}
                    onChange={(e) => setNewColumnInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newColumnInput.trim()) {
                        setCreateViewColumns([...createViewColumns, {
                          id: newColumnInput.trim().toLowerCase().replace(/\s+/g, '-'),
                          title: newColumnInput.trim(),
                          order: createViewColumns.length,
                        }]);
                        setNewColumnInput('');
                      }
                    }}
                    className="bg-background/50 border-primary/30 h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    disabled={!newColumnInput.trim()}
                    onClick={() => {
                      if (newColumnInput.trim()) {
                        setCreateViewColumns([...createViewColumns, {
                          id: newColumnInput.trim().toLowerCase().replace(/\s+/g, '-'),
                          title: newColumnInput.trim(),
                          order: createViewColumns.length,
                        }]);
                        setNewColumnInput('');
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Filter by Category (optional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {mergedCategories.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setCreateViewFilterCategories(prev =>
                      prev.includes(cat.value) ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                    )}
                    className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors ${
                      createViewFilterCategories.includes(cat.value)
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Filter by Difficulty (optional)</Label>
              <div className="flex gap-1.5">
                {['S', 'A', 'B', 'C', 'D'].map(d => (
                  <button
                    key={d}
                    onClick={() => setCreateViewFilterDifficulties(prev =>
                      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                    )}
                    className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                      createViewFilterDifficulties.includes(d)
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleCreateView}
              disabled={!createViewName.trim() || isViewSubmitting}
              className="w-full bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
            >
              {isViewSubmitting ? 'Creating...' : 'Create View'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Custom View Dialog */}
      <Dialog open={isEditViewOpen} onOpenChange={(open) => { setIsEditViewOpen(open); if (!open) setEditingView(null); }}>
        <DialogContent className="glassmorphic border-primary/30 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-orbitron text-lg">Edit View</DialogTitle>
            <DialogDescription className="sr-only">Edit custom view settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>View Name</Label>
              <Input
                value={editViewName}
                onChange={(e) => setEditViewName(e.target.value)}
                className="bg-background/50 border-primary/30"
              />
            </div>
            {editingView?.viewType === 'board' && (
              <div className="space-y-2">
                <Label>Board Columns</Label>
                <div className="space-y-1">
                  {editViewColumns.map((col, idx) => (
                    <div key={col.id} className="flex items-center gap-2">
                      <Input
                        value={col.title}
                        onChange={(e) => {
                          const updated = [...editViewColumns];
                          updated[idx] = { ...updated[idx], title: e.target.value };
                          setEditViewColumns(updated);
                        }}
                        className="bg-background/50 border-primary/30 h-8 text-xs flex-1"
                      />
                      {editViewColumns.length > 1 && (
                        <button
                          onClick={() => setEditViewColumns(editViewColumns.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New column name..."
                    value={editNewColumnInput}
                    onChange={(e) => setEditNewColumnInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editNewColumnInput.trim()) {
                        setEditViewColumns([...editViewColumns, {
                          id: editNewColumnInput.trim().toLowerCase().replace(/\s+/g, '-'),
                          title: editNewColumnInput.trim(),
                          order: editViewColumns.length,
                        }]);
                        setEditNewColumnInput('');
                      }
                    }}
                    className="bg-background/50 border-primary/30 h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    disabled={!editNewColumnInput.trim()}
                    onClick={() => {
                      if (editNewColumnInput.trim()) {
                        setEditViewColumns([...editViewColumns, {
                          id: editNewColumnInput.trim().toLowerCase().replace(/\s+/g, '-'),
                          title: editNewColumnInput.trim(),
                          order: editViewColumns.length,
                        }]);
                        setEditNewColumnInput('');
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Filter by Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {mergedCategories.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setEditViewFilterCategories(prev =>
                      prev.includes(cat.value) ? prev.filter(c => c !== cat.value) : [...prev, cat.value]
                    )}
                    className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors ${
                      editViewFilterCategories.includes(cat.value)
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Filter by Difficulty</Label>
              <div className="flex gap-1.5">
                {['S', 'A', 'B', 'C', 'D'].map(d => (
                  <button
                    key={d}
                    onClick={() => setEditViewFilterDifficulties(prev =>
                      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                    )}
                    className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                      editViewFilterDifficulties.includes(d)
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background/30 border-primary/20 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleUpdateView}
              disabled={!editViewName.trim() || isViewSubmitting}
              className="w-full bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
            >
              {isViewSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom View Rendering */}
      {activeCustomView && (() => {
        const allMissions = (quests || []).filter(q => !q.deletedAt);
        let viewMissions = applyViewFilters(allMissions, activeCustomView);
        viewMissions = applySearchAndFilters(viewMissions);

        if (activeCustomView.viewType === 'board') {
          const columns = ((activeCustomView.columns || []) as any[]).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          const missionsByColumn = new Map<string, Quest[]>();
          for (const col of columns) {
            missionsByColumn.set(col.id, []);
          }
          const uncategorized: Quest[] = [];
          for (const m of viewMissions) {
            if (m.viewId === activeCustomView.id && m.viewColumn && missionsByColumn.has(m.viewColumn)) {
              missionsByColumn.get(m.viewColumn)!.push(m);
            } else {
              uncategorized.push(m);
            }
          }
          if (uncategorized.length > 0 && columns.length > 0) {
            const firstCol = columns[0];
            missionsByColumn.get(firstCol.id)!.push(...uncategorized);
          }

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {columns.map((col: any) => {
                  const colMissions = missionsByColumn.get(col.id) || [];
                  return (
                    <div key={col.id} className="glassmorphic rounded-xl neon-border overflow-hidden">
                      <div className="p-3 border-b border-primary/10 flex items-center justify-between">
                        <h3 className="text-sm font-orbitron text-primary">{col.title}</h3>
                        <Badge variant="outline" className="text-[10px] border-primary/30">{colMissions.length}</Badge>
                      </div>
                      <div className="p-2 space-y-1.5 min-h-[100px]">
                        {colMissions.map(mission => {
                          const catColor = getCategoryColor(mission.category);
                          return (
                            <div
                              key={mission.id}
                              className={`${catColor.bg} border ${catColor.border} rounded-lg p-2.5 cursor-pointer hover:brightness-110 transition-all`}
                              onClick={() => openEditDialog(mission)}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={mission.completed}
                                  onCheckedChange={() => toggleQuestCompletion(mission.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <span className={`text-xs font-medium truncate ${mission.completed ? 'line-through text-muted-foreground' : ''}`}>
                                  {mission.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                                <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-primary/20 text-muted-foreground">
                                  {mission.difficulty || 'D'}
                                </span>
                                <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-0.5">
                                  <Zap className="h-2 w-2" />{mission.energyCost}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {colMissions.length === 0 && (
                          <div className="text-center py-6 text-muted-foreground text-xs">No missions</div>
                        )}
                      </div>
                      <div className="p-2 border-t border-primary/10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-[10px] font-mono text-muted-foreground hover:text-primary flex items-center gap-1 w-full justify-center py-1">
                              <MoreVertical className="h-3 w-3" />
                              Column Options
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="w-36">
                            {viewMissions.filter(m => !(m.viewId === activeCustomView.id && m.viewColumn === col.id)).length > 0 && (
                              <>
                                {viewMissions
                                  .filter(m => !(m.viewId === activeCustomView.id && m.viewColumn === col.id))
                                  .slice(0, 5)
                                  .map(m => (
                                    <DropdownMenuItem key={m.id} onClick={() => handleMoveToViewColumn(m.id as number, activeCustomView.id, col.id)}>
                                      <Plus className="h-3 w-3 mr-2" />
                                      {m.title.length > 20 ? m.title.slice(0, 20) + '...' : m.title}
                                    </DropdownMenuItem>
                                  ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (activeCustomView.viewType === 'list') {
          const sorted = applySorting(viewMissions);
          sorted.sort((a, b) => {
            const dateA = a.startDate || '9999-12-31';
            const dateB = b.startDate || '9999-12-31';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            const timeA = a.startTime || '99:99';
            const timeB = b.startTime || '99:99';
            return timeA.localeCompare(timeB);
          });
          const groupMap = new Map<string, Quest[]>();
          const nowD = new Date();
          const todayStr2 = formatDateStr(nowD);
          const tmrw = new Date(nowD);
          tmrw.setDate(tmrw.getDate() + 1);
          const tomorrowStr2 = formatDateStr(tmrw);
          for (const mission of sorted) {
            const dateKey = mission.startDate || 'unscheduled';
            if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
            groupMap.get(dateKey)!.push(mission);
          }
          const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
            if (a === 'unscheduled') return 1;
            if (b === 'unscheduled') return -1;
            return a.localeCompare(b);
          });
          const groups = sortedKeys.map(key => {
            let label: string;
            if (key === 'unscheduled') label = 'Unscheduled';
            else if (key === todayStr2) label = 'Today';
            else if (key === tomorrowStr2) label = 'Tomorrow';
            else {
              const [y, m, d] = key.split('-').map(Number);
              const date = new Date(y, m - 1, d);
              label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            }
            return { label, dateKey: key, missions: groupMap.get(key)! };
          });

          return (
            <div className="space-y-4">
              {groups.length > 0 ? groups.map(group => (
                <div key={group.dateKey}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-orbitron text-primary">{group.label}</h3>
                    <div className="flex-1 h-px bg-primary/20" />
                  </div>
                  <div className="space-y-3">
                    {group.missions.map((mission, idx) => (
                      <QuestItem
                        key={mission.id}
                        quest={mission}
                        index={idx}
                        section="custom-list"
                        onToggle={() => toggleQuestCompletion(mission.id)}
                        onDelete={() => handleDeleteMission(mission)}
                        onEdit={() => openEditDialog(mission)}
                        onStart={() => handleStartMission(mission)}
                        onResume={() => handleResumeMission(mission)}
                        onDone={() => handleDoneMission(mission)}
                        onRestart={restartMissionTimer}
                        elapsedSeconds={missionElapsedTimes[mission.id]}
                        breakSeconds={missionBreakTimes[mission.id]}
                        isTimerActive={activeTimerQuest?.id === mission.id}
                        timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== mission.id}
                      />
                    ))}
                  </div>
                </div>
              )) : (
                <div className="glassmorphic rounded-xl p-8 text-center neon-border">
                  <p className="text-muted-foreground">No missions in this view{searchQuery ? ' matching your search' : ''}.</p>
                </div>
              )}
            </div>
          );
        }

        if (activeCustomView.viewType === 'calendar') {
          const questsByDate = new Map<string, Quest[]>();
          for (const q of viewMissions) {
            if (q.startDate) {
              const existing = questsByDate.get(q.startDate) || [];
              existing.push(q);
              questsByDate.set(q.startDate, existing);
            }
          }
          const todayStr3 = formatDateStr(new Date());
          const year = calendarMonth.getFullYear();
          const month = calendarMonth.getMonth();
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const calDays: (number | null)[] = [];
          for (let i = 0; i < firstDay; i++) calDays.push(null);
          for (let d = 1; d <= daysInMonth; d++) calDays.push(d);

          return (
            <div className="space-y-4">
              <div className="glassmorphic rounded-xl neon-border overflow-hidden">
                <div className="p-3 flex items-center justify-between border-b border-primary/10">
                  <button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="text-primary hover:bg-primary/10 rounded p-1">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h3 className="text-sm font-orbitron text-primary">
                    {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                  <button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="text-primary hover:bg-primary/10 rounded p-1">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-[10px] font-mono text-muted-foreground text-center py-2 border-b border-primary/5">{d}</div>
                  ))}
                  {calDays.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} className="min-h-[70px] border-b border-r border-primary/5" />;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayMissions = questsByDate.get(dateStr) || [];
                    const isToday = dateStr === todayStr3;
                    return (
                      <div
                        key={dateStr}
                        className={`min-h-[70px] border-b border-r border-primary/5 p-1 cursor-pointer hover:bg-primary/5 transition-colors ${isToday ? 'bg-primary/10' : ''}`}
                        onClick={() => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
                      >
                        <span className={`text-[10px] font-mono ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{day}</span>
                        <div className="space-y-0.5 mt-0.5">
                          {dayMissions.slice(0, 3).map(m => {
                            const catColor = getCategoryColor(m.category);
                            return (
                              <div key={m.id} className={`text-[8px] px-1 py-0.5 rounded truncate ${catColor.bg} ${catColor.text} border ${catColor.border}`}>
                                {m.startTime && <span className="font-mono mr-0.5">{m.startTime}</span>}
                                {m.title}
                              </div>
                            );
                          })}
                          {dayMissions.length > 3 && (
                            <div className="text-[8px] text-primary font-mono text-center">+{dayMissions.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selectedDate && (() => {
                const dayMissions = questsByDate.get(selectedDate) || [];
                const [sy, sm, sd] = selectedDate.split('-').map(Number);
                const selDate = new Date(sy, sm - 1, sd);
                return (
                  <div className="glassmorphic rounded-xl neon-border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-orbitron text-primary">
                        {selDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h3>
                      <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-primary">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {dayMissions.length > 0 ? (
                      <div className="space-y-1.5">
                        {dayMissions.map(m => (
                          <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary/5 cursor-pointer" onClick={() => openEditDialog(m)}>
                            <Checkbox checked={m.completed} onCheckedChange={() => toggleQuestCompletion(m.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4" />
                            <span className={`text-xs flex-1 ${m.completed ? 'line-through text-muted-foreground' : ''}`}>{m.title}</span>
                            {m.startTime && <span className="text-[10px] font-mono text-muted-foreground">{m.startTime}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">No missions scheduled</p>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        }

        return null;
      })()}

      {/* Calendar View */}
      {!activeCustomView && viewMode === 'calendar' && (() => {
        const allQuests = applySearchAndFilters((quests || []).filter(q => !q.deletedAt));
        const questsByDate = new Map<string, Quest[]>();
        for (const q of allQuests) {
          if (q.startDate) {
            const existing = questsByDate.get(q.startDate) || [];
            existing.push(q);
            questsByDate.set(q.startDate, existing);
          }
        }

        const nowDate = new Date();
        const todayStr = formatDateStr(nowDate);
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const HOURS = Array.from({ length: 24 }, (_, i) => i);

        const calNavPrev = () => {
          if (calendarZoom === 'year') setCalendarYear(y => y - 1);
          else if (calendarZoom === 'month') setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
          else if (calendarZoom === 'week') setCalendarWeekStart(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
          else setCalendarDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
        };
        const calNavNext = () => {
          if (calendarZoom === 'year') setCalendarYear(y => y + 1);
          else if (calendarZoom === 'month') setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
          else if (calendarZoom === 'week') setCalendarWeekStart(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
          else setCalendarDay(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
        };
        const calNavToday = () => {
          const n = new Date();
          setCalendarYear(n.getFullYear());
          setCalendarMonth(new Date(n.getFullYear(), n.getMonth(), 1));
          const dayOfWeek = n.getDay();
          setCalendarWeekStart(new Date(n.getFullYear(), n.getMonth(), n.getDate() - dayOfWeek));
          setCalendarDay(n);
        };

        let calTitle = '';
        if (calendarZoom === 'year') calTitle = String(calendarYear);
        else if (calendarZoom === 'month') calTitle = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        else if (calendarZoom === 'week') {
          const weekEnd = new Date(calendarWeekStart.getFullYear(), calendarWeekStart.getMonth(), calendarWeekStart.getDate() + 6);
          calTitle = `${calendarWeekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } else {
          calTitle = calendarDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }

        const renderChip = (q: Quest, compact?: boolean) => {
          const colors = q.completed
            ? { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-muted' }
            : getCategoryColor(q.category);
          return (
            <div
              key={q.id}
              className={`${colors.bg} ${colors.text} text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate cursor-pointer transition-colors border ${colors.border} hover:brightness-125 ${q.completed ? 'line-through' : ''}`}
              onClick={(e) => { e.stopPropagation(); openEditDialog(q); }}
              title={`${q.title}${q.startTime ? ` • ${q.startTime}` : ''}${q.location ? ` • ${q.location}` : ''}`}
            >
              {compact ? '' : (q.startTime ? `${q.startTime} ` : '')}{compact ? '•' : q.title}
            </div>
          );
        };

        const buildMonthGrid = (yr: number, mo: number) => {
          const first = new Date(yr, mo, 1);
          const last = new Date(yr, mo + 1, 0);
          const startDay = first.getDay();
          const daysInMonth = last.getDate();
          const cells: { date: Date; isCurrentMonth: boolean }[] = [];
          for (let i = startDay - 1; i >= 0; i--) cells.push({ date: new Date(yr, mo, -i), isCurrentMonth: false });
          for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(yr, mo, d), isCurrentMonth: true });
          const rem = 7 - (cells.length % 7);
          if (rem < 7) for (let d = 1; d <= rem; d++) cells.push({ date: new Date(yr, mo + 1, d), isCurrentMonth: false });
          return cells;
        };

        return (
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <button onClick={calNavPrev} className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-primary/10 transition-colors">
                  <ChevronLeft className="h-5 w-5 text-primary" />
                </button>
                <button onClick={calNavNext} className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-primary/10 transition-colors">
                  <ChevronRight className="h-5 w-5 text-primary" />
                </button>
                <button onClick={calNavToday} className="text-xs font-mono px-2 py-1 rounded border border-primary/30 hover:bg-primary/10 transition-colors ml-1">
                  Today
                </button>
                <h2 className="text-lg font-orbitron ml-3">{calTitle}</h2>
              </div>
              <div className="flex rounded-lg border border-primary/30 overflow-hidden">
                {(['year', 'month', 'week', 'day'] as const).map(z => (
                  <button
                    key={z}
                    onClick={() => setCalendarZoom(z)}
                    className={`text-[11px] font-mono px-3 py-1.5 transition-colors capitalize ${
                      calendarZoom === z ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-3">
              {calendarZoom === 'year' && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 12 }, (_, mo) => {
                    const monthName = new Date(calendarYear, mo, 1).toLocaleDateString(undefined, { month: 'short' });
                    const cells = buildMonthGrid(calendarYear, mo);
                    return (
                      <div
                        key={mo}
                        className="cursor-pointer hover:bg-primary/5 rounded-lg p-2 transition-colors border border-transparent hover:border-primary/20"
                        onClick={() => {
                          setCalendarMonth(new Date(calendarYear, mo, 1));
                          setCalendarZoom('month');
                        }}
                      >
                        <div className="text-xs font-mono text-primary mb-1 text-center">{monthName}</div>
                        <div className="grid grid-cols-7 gap-px">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <div key={i} className="text-[8px] text-muted-foreground text-center">{d}</div>
                          ))}
                          {cells.map((cell, idx) => {
                            const ds = formatDateStr(cell.date);
                            const hasQuests = questsByDate.has(ds) && (questsByDate.get(ds)!.length > 0);
                            const isT = ds === todayStr;
                            return (
                              <div key={idx} className={`text-[8px] text-center relative ${!cell.isCurrentMonth ? 'opacity-20' : ''}`}>
                                <span className={isT ? 'bg-primary text-primary-foreground rounded-full w-4 h-4 inline-flex items-center justify-center text-[7px] font-bold' : ''}>
                                  {cell.date.getDate()}
                                </span>
                                {hasQuests && cell.isCurrentMonth && (
                                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {calendarZoom === 'month' && (() => {
                const yr = calendarMonth.getFullYear();
                const mo = calendarMonth.getMonth();
                const cells = buildMonthGrid(yr, mo);
                return (
                  <>
                    <div className="grid grid-cols-7 mb-1">
                      {weekDays.map(d => (
                        <div key={d} className="text-center text-[10px] font-mono text-muted-foreground uppercase py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-primary/5 rounded-lg overflow-hidden">
                      {cells.map((cell, idx) => {
                        const dateStr = formatDateStr(cell.date);
                        const dayQuests = questsByDate.get(dateStr) || [];
                        const isToday = dateStr === todayStr;
                        const maxShow = 3;
                        const overflow = dayQuests.length - maxShow;
                        return (
                          <div
                            key={idx}
                            className={`min-h-[80px] sm:min-h-[100px] p-1 bg-background/50 transition-colors hover:bg-primary/5 cursor-pointer ${
                              !cell.isCurrentMonth ? 'opacity-30' : ''
                            } ${selectedDate === formatDateStr(cell.date) ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                            onClick={() => {
                              const ds = formatDateStr(cell.date);
                              setSelectedDate(prev => prev === ds ? null : ds);
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
                              {dayQuests.slice(0, maxShow).map(q => renderChip(q, false))}
                              {overflow > 0 && (
                                <div className="text-[9px] text-muted-foreground pl-1">+{overflow} more</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {calendarZoom === 'week' && (() => {
                const weekDates = Array.from({ length: 7 }, (_, i) =>
                  new Date(calendarWeekStart.getFullYear(), calendarWeekStart.getMonth(), calendarWeekStart.getDate() + i)
                );
                const currentHour = nowDate.getHours();
                const currentMinute = nowDate.getMinutes();

                return (
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-primary/10">
                        <div className="text-[10px] text-muted-foreground p-1" />
                        {weekDates.map((d, i) => {
                          const ds = formatDateStr(d);
                          const isT = ds === todayStr;
                          return (
                            <div
                              key={i}
                              className={`text-center p-2 border-l border-primary/10 cursor-pointer hover:bg-primary/5 transition-colors ${isT ? 'bg-primary/5' : ''} ${selectedDate === ds ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                              onClick={() => { setSelectedDate(prev => prev === ds ? null : ds); }}
                            >
                              <div className="text-[10px] font-mono text-muted-foreground uppercase">{weekDays[d.getDay()]}</div>
                              <div className={`text-sm font-mono mt-0.5 ${isT ? 'bg-primary text-primary-foreground w-7 h-7 rounded-full inline-flex items-center justify-center font-bold' : ''}`}>
                                {d.getDate()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-primary/10">
                        <div className="text-[9px] text-muted-foreground p-1 text-right pr-2">All day</div>
                        {weekDates.map((d, i) => {
                          const ds = formatDateStr(d);
                          const dayQ = (questsByDate.get(ds) || []).filter(q => q.allDay || !q.startTime);
                          return (
                            <div key={i} className="border-l border-primary/10 p-0.5 min-h-[28px] space-y-0.5">
                              {dayQ.slice(0, 2).map(q => renderChip(q))}
                              {dayQ.length > 2 && <div className="text-[8px] text-muted-foreground px-1">+{dayQ.length - 2}</div>}
                            </div>
                          );
                        })}
                      </div>

                      <div className="relative max-h-[600px] overflow-y-auto">
                        {HOURS.map(h => (
                          <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-primary/5 min-h-[48px]">
                            <div className="text-[9px] text-muted-foreground text-right pr-2 pt-0.5 font-mono">
                              {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                            </div>
                            {weekDates.map((d, i) => {
                              const ds = formatDateStr(d);
                              const dayQ = (questsByDate.get(ds) || []).filter(q => {
                                if (!q.startTime || q.allDay) return false;
                                const [hh] = q.startTime.split(':').map(Number);
                                return hh === h;
                              });
                              return (
                                <div
                                  key={i}
                                  className="border-l border-primary/10 p-0.5 relative cursor-pointer hover:bg-primary/3 transition-colors"
                                  onClick={() => {
                                    const dateStr = ds;
                                    setCreateFormData(prev => ({
                                      ...prev,
                                      startDate: dateStr,
                                      endDate: dateStr,
                                      startTime: `${String(h).padStart(2, '0')}:00`,
                                    }));
                                    setIsCreateOpen(true);
                                  }}
                                >
                                  {dayQ.map(q => {
                                    const colors = q.completed
                                      ? { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-muted' }
                                      : getCategoryColor(q.category);
                                    return (
                                      <div
                                        key={q.id}
                                        className={`${colors.bg} ${colors.text} border-l-2 ${colors.border} text-[10px] px-1.5 py-1 rounded-r-md mb-0.5 truncate cursor-pointer hover:brightness-125 ${q.completed ? 'line-through' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); openEditDialog(q); }}
                                        title={q.title}
                                      >
                                        {q.startTime} {q.title}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {weekDates.some(d => formatDateStr(d) === todayStr) && (
                          <div
                            className="absolute left-[60px] right-0 h-[2px] bg-red-500 z-10 pointer-events-none"
                            style={{ top: `${((currentHour * 60 + currentMinute) / (24 * 60)) * 100}%` }}
                          >
                            <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {calendarZoom === 'day' && (() => {
                const ds = formatDateStr(calendarDay);
                const dayQuests = questsByDate.get(ds) || [];
                const untimedQuests = dayQuests.filter(q => q.allDay || !q.startTime);
                const currentHour = nowDate.getHours();
                const currentMinute = nowDate.getMinutes();
                const isDayToday = ds === todayStr;

                return (
                  <div>
                    {untimedQuests.length > 0 && (
                      <div className="mb-2 p-2 bg-primary/5 rounded-lg space-y-1">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">All Day / Unscheduled</div>
                        {untimedQuests.map(q => renderChip(q))}
                      </div>
                    )}

                    <div className="relative max-h-[600px] overflow-y-auto">
                      {HOURS.map(h => {
                        const hourQuests = dayQuests.filter(q => {
                          if (!q.startTime || q.allDay) return false;
                          const [hh] = q.startTime.split(':').map(Number);
                          return hh === h;
                        });
                        return (
                          <div key={h} className="grid grid-cols-[60px_1fr] border-b border-primary/5 min-h-[52px]">
                            <div className="text-[10px] text-muted-foreground text-right pr-3 pt-1 font-mono">
                              {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                            </div>
                            <div
                              className="border-l border-primary/10 p-1 cursor-pointer hover:bg-primary/5 transition-colors space-y-0.5"
                              onClick={() => {
                                setCreateFormData(prev => ({
                                  ...prev,
                                  startDate: ds,
                                  endDate: ds,
                                  startTime: `${String(h).padStart(2, '0')}:00`,
                                }));
                                setIsCreateOpen(true);
                              }}
                            >
                              {hourQuests.map(q => {
                                const colors = q.completed
                                  ? { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-muted' }
                                  : getCategoryColor(q.category);
                                return (
                                  <div
                                    key={q.id}
                                    className={`${colors.bg} ${colors.text} border-l-2 ${colors.border} text-xs px-2 py-1.5 rounded-r-md truncate cursor-pointer hover:brightness-125 ${q.completed ? 'line-through' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); openEditDialog(q); }}
                                  >
                                    <span className="font-mono text-[10px] mr-1.5">{q.startTime}</span>
                                    {q.title}
                                    {q.category && q.category !== 'general' && (
                                      <span className="ml-2 text-[9px] opacity-70">{mergedCategories.find(c => c.value === q.category)?.label || q.category}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {isDayToday && (
                        <div
                          className="absolute left-[60px] right-0 h-[2px] bg-red-500 z-10 pointer-events-none"
                          style={{ top: `${((currentHour * 60 + currentMinute) / (24 * 60)) * 100}%` }}
                        >
                          <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedDate && (() => {
              const selDateObj = (() => {
                const [y, m, d] = selectedDate.split('-').map(Number);
                return new Date(y, m - 1, d);
              })();
              const selDateLabel = selDateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
              const selDayQuests = (questsByDate.get(selectedDate) || []).sort((a, b) => {
                if (!a.startTime && !b.startTime) return 0;
                if (!a.startTime) return -1;
                if (!b.startTime) return 1;
                return a.startTime.localeCompare(b.startTime);
              });

              return (
                <div className="mt-4 glassmorphic rounded-xl border border-primary/20 overflow-hidden">
                  <div className="p-3 flex items-center justify-between border-b border-primary/10">
                    <h3 className="text-sm font-orbitron text-primary">{selDateLabel}</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(null)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-3">
                    {selDayQuests.length > 0 ? (
                      <div className="space-y-3">
                        {selDayQuests.map((q, idx) => (
                          <QuestItem
                            key={q.id}
                            quest={q}
                            index={idx}
                            section="calendar-detail"
                            onToggle={() => toggleQuestCompletion(q.id)}
                            onDelete={() => handleDeleteMission(q)}
                            onEdit={() => openEditDialog(q)}
                            onStart={() => handleStartMission(q)}
                            onResume={() => handleResumeMission(q)}
                            onDone={() => handleDoneMission(q)}
                            onRestart={restartMissionTimer}
                            elapsedSeconds={missionElapsedTimes[q.id]}
                            breakSeconds={missionBreakTimes[q.id]}
                            isTimerActive={activeTimerQuest?.id === q.id}
                            timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== q.id}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-muted-foreground text-sm mb-3">No missions scheduled</p>
                      </div>
                    )}

                    <button
                      type="button"
                      className="w-full mt-3 text-xs font-mono px-3 py-2 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center justify-center gap-1.5"
                      onClick={() => {
                        setCreateFormData(prev => ({
                          ...prev,
                          startDate: selectedDate,
                          endDate: selectedDate,
                        }));
                        setIsCreateOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Mission
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Board View */}
      {!activeCustomView && viewMode === 'board' && (<>
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
              {filteredTodayMissions.length > 0 ? (
                groupMissionsByRitual(filteredTodayMissions).map((group, visualIdx) => {
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
                {filteredUpcomingMissions.length > 0 ? (
                  groupMissionsByRitual(filteredUpcomingMissions).map((group, visualIdx) => {
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
              {filteredCompletedMissions.length > 0 ? (
                groupMissionsByRitual(filteredCompletedMissions).map((group, visualIdx) => {
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
                {groupMissionsByRitual(filteredInboxMissions).map((group, visualIdx) => {
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
                {filteredInboxMissions.length === 0 && (
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

      {/* List View — Schedule-style chronological list */}
      {!activeCustomView && viewMode === 'list' && (
        <div className="space-y-4">
          {nextOnboardingMission && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-orbitron text-primary">Onboarding</h3>
                <div className="flex-1 h-px bg-primary/20" />
              </div>
              <div className="space-y-3">
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
                  section="list-onboarding"
                  onToggle={() => {}}
                  onStart={() => navigate(`/onboarding?mission=${nextOnboardingMission.id}`)}
                  timerBlocked={!!activeTimerQuest}
                />
              </div>
            </div>
          )}
          {listViewGrouped.length > 0 ? (
            listViewGrouped.map(group => (
              <div key={group.dateKey}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-orbitron text-primary">{group.label}</h3>
                  <div className="flex-1 h-px bg-primary/20" />
                </div>
                <div className="space-y-3">
                  {group.missions.map((mission, idx) => (
                    <QuestItem
                      key={mission.id}
                      quest={mission}
                      index={idx}
                      section="list"
                      onToggle={() => toggleQuestCompletion(mission.id)}
                      onDelete={() => handleDeleteMission(mission)}
                      onEdit={() => openEditDialog(mission)}
                      onStart={() => handleStartMission(mission)}
                      onResume={() => handleResumeMission(mission)}
                      onDone={() => handleDoneMission(mission)}
                      onRestart={restartMissionTimer}
                      elapsedSeconds={missionElapsedTimes[mission.id]}
                      breakSeconds={missionBreakTimes[mission.id]}
                      isTimerActive={activeTimerQuest?.id === mission.id}
                      timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== mission.id}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : !nextOnboardingMission ? (
            <div className="glassmorphic rounded-xl p-8 text-center neon-border">
              <p className="text-muted-foreground">No missions found{searchQuery ? ' matching your search' : ''}.</p>
            </div>
          ) : null}

          <div className="flex items-center justify-center pt-2">
            <button
              onClick={() => setShowListCompleted(!showListCompleted)}
              className="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-md hover:bg-primary/10"
            >
              {showListCompleted ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Hide completed
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Show completed
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
