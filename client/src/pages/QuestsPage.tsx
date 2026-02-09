import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useWidgetState } from "@/hooks/use-widget-state";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import update from 'immutability-helper';
import QuestItem, { QUEST_DND_TYPE, DragItem } from "../components/dashboard/QuestItem";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Zap, Star, Bell, BellOff, BellRing, Edit3, X, ChevronDown, ChevronRight, Target, Calendar, Clock, CheckCircle2, GraduationCap, Inbox, Info, Archive, Undo2, Repeat } from "lucide-react";
import { StatInfoDialog } from "@/components/ui/stat-info-dialog";
import { useToast } from "@/hooks/use-toast";
import { Quest, QuestNotification } from "@/lib/types";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ONBOARDING_MISSIONS = [
  { id: 0, title: "Access & Quickstart", xp: 100, difficulty: "D", duration: 10, description: "Log in, explore the dashboard, and complete your first quick mission to get familiar with LYFEOS." },
  { id: 1, title: "Archetype Calibration", xp: 150, difficulty: "D", duration: 15, description: "Discover your player archetype through a guided assessment to personalize your LYFEOS experience." },
  { id: 2, title: "Identity & Direction", xp: 75, difficulty: "D", duration: 8, description: "Define your core identity pillars and set your life direction compass." },
  { id: 3, title: "Craft & Mastery", xp: 60, difficulty: "D", duration: 6, description: "Identify your key skills and craft areas to track mastery progression." },
  { id: 4, title: "Capacity & Constraints", xp: 55, difficulty: "D", duration: 6, description: "Set your daily energy, attention, and time capacity limits for balanced resource management." },
  { id: 5, title: "Baselines & States", xp: 70, difficulty: "D", duration: 7, description: "Establish your baseline stats and current life state for accurate tracking." },
  { id: 6, title: "History & Roots", xp: 50, difficulty: "D", duration: 5, description: "Record your background and personal history to inform your growth trajectory." },
  { id: 7, title: "Systems & Rituals", xp: 65, difficulty: "D", duration: 7, description: "Set up your daily rituals and recurring systems for consistent progress." },
];

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
  repeatFrequency: string;
  repeatInterval: number;
  repeatDays: string[];
  repeatEndDate: string;
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
  repeatFrequency: "daily",
  repeatInterval: 1,
  repeatDays: [],
  repeatEndDate: "",
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

function DroppableSection({ section, onDropQuest, children, className }: { section: string; onDropQuest: (item: DragItem, targetSection: string) => void; children: React.ReactNode; className?: string }) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: QUEST_DND_TYPE,
    canDrop: (item: DragItem) => item.section !== section,
    drop: (item: DragItem) => {
      if (item.section !== section) {
        onDropQuest(item, section);
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

export default function QuestsPage() {
  usePageTitle('Missions');
  const [, navigate] = useLocation();
  
  const { quests, toggleQuestCompletion, createQuest, updateQuest, deleteQuest, refetchQuests, activeTimerQuest, missionElapsedTimes, startMissionTimer, resumeMissionTimer, restartMissionTimer } = useLYFEOS();
  const { user } = useAuth();
  const { toast } = useToast();
  const pushNotifs = usePushNotifications();
  
  const { data: userProfile } = useQuery({
    queryKey: ["/api/profile"],
    enabled: !!user?.id,
    staleTime: 0,
  });
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [createFormData, setCreateFormData] = useState<MissionFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<MissionFormData>(defaultFormData);
  
  const [todayExpanded, setTodayExpanded] = useWidgetState("quests.today", true);
  const [upcomingExpanded, setUpcomingExpanded] = useWidgetState("quests.upcoming", true);
  const [completedExpanded, setCompletedExpanded] = useWidgetState("quests.completed", true);
  const [inboxExpanded, setInboxExpanded] = useWidgetState("quests.inbox", true);
  const [archivedExpanded, setArchivedExpanded] = useWidgetState("quests.archived", false);
  const [onboardingInfoOpen, setOnboardingInfoOpen] = useState<Record<number, boolean>>({});
  const [terminatedInfoOpen, setTerminatedInfoOpen] = useState<Record<string | number, boolean>>({});
  const [originalDates, setOriginalDates] = useState<Record<string, { startDate?: string; endDate?: string; startTime?: string; endTime?: string }>>({});
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
  
  const completedOnboardingMissions = (userProfile as any)?.completedOnboardingMissions || [];
  const incompleteOnboardingMissions = ONBOARDING_MISSIONS.filter(
    m => !completedOnboardingMissions.includes(m.id)
  );
  
  const { todayMissions, upcomingMissions, completedMissions, inboxMissions } = useMemo(() => {
    const active = quests.filter(q => !q.completed);
    
    const completed = quests.filter(q => {
      if (!q.completed || !q.completedAt) return false;
      const completedDate = new Date(q.completedAt);
      const completedLocalDate = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}-${String(completedDate.getDate()).padStart(2, '0')}`;
      return completedLocalDate === today;
    });
    
    // Inbox missions: missions created from to-do ideas (category='todo')
    const inboxItems = active.filter(q => q.category === 'todo');
    
    const todayItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (!q.startDate) return true;
      return q.startDate <= today;
    });
    
    const sevenDaysFromNow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    
    const upcomingItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (!q.startDate) return false;
      return q.startDate > today && q.startDate <= sevenDaysFromNow;
    });
    
    const archivedFutureItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (!q.startDate) return false;
      return q.startDate > sevenDaysFromNow;
    });
    
    const sortByOrder = (a: Quest, b: Quest) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0);
    return {
      todayMissions: todayItems.sort(sortByOrder),
      upcomingMissions: upcomingItems.sort(sortByOrder),
      completedMissions: completed.sort(sortByOrder),
      inboxMissions: [...inboxItems, ...archivedFutureItems].sort(sortByOrder),
    };
  }, [quests, today]);

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
    queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/quests`] });
  }, [todayMissions, upcomingMissions, completedMissions, inboxMissions, user?.id]);

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

  const openEditDialog = (quest: Quest) => {
    setEditingQuest(quest);
    setEditFormData({
      title: quest.title,
      description: quest.description,
      experienceReward: quest.experienceReward,
      difficulty: quest.difficulty || "D",
      category: quest.category || "general",
      startDate: quest.startDate || "",
      startTime: quest.startTime || "",
      endDate: quest.endDate || "",
      endTime: quest.endTime || "",
      notifications: quest.notifications || [],
      isRitualized: quest.isRitualized || false,
      repeatFrequency: quest.repeatFrequency || "daily",
      repeatInterval: quest.repeatInterval || 1,
      repeatDays: quest.repeatDays || [],
      repeatEndDate: quest.repeatEndDate || "",
    });
    setIsEditOpen(true);
  };

  const handleCreateMission = async () => {
    if (!createFormData.title.trim() || !createFormData.description.trim() || !createFormData.startDate || !createFormData.startTime || !createFormData.endDate || !createFormData.endTime) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: createFormData.title.trim(),
        description: createFormData.description.trim() || "No description",
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
        repeatFrequency: createFormData.isRitualized ? createFormData.repeatFrequency : null,
        repeatInterval: createFormData.isRitualized ? createFormData.repeatInterval : null,
        repeatDays: createFormData.isRitualized && createFormData.repeatFrequency === "weekly" ? createFormData.repeatDays : null,
        repeatEndDate: createFormData.isRitualized && createFormData.repeatEndDate ? createFormData.repeatEndDate : null,
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
    if (!editingQuest || !editFormData.title.trim() || !editFormData.startDate || !editFormData.startTime || !editFormData.endDate || !editFormData.endTime) return;
    
    setIsSubmitting(true);
    try {
      await updateQuest(editingQuest.id, {
        title: editFormData.title.trim(),
        description: editFormData.description.trim() || "No description",
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
        repeatFrequency: editFormData.isRitualized ? editFormData.repeatFrequency : null,
        repeatInterval: editFormData.isRitualized ? editFormData.repeatInterval : null,
        repeatDays: editFormData.isRitualized && editFormData.repeatFrequency === "weekly" ? editFormData.repeatDays : null,
        repeatEndDate: editFormData.isRitualized && editFormData.repeatEndDate ? editFormData.repeatEndDate : null,
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

  return (
    <div className="pb-20">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Missions</h1>
          <p className="text-muted-foreground">Complete missions to earn XP and reach your goals.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {pushNotifs.isSupported && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={`relative ${pushNotifs.isSubscribed ? 'text-primary' : 'text-muted-foreground'}`}>
                  {pushNotifs.isSubscribed ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                  {pushNotifs.isSubscribed && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 glassmorphic border-primary/20" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Push Notifications</h4>
                    <Switch
                      checked={pushNotifs.isSubscribed}
                      disabled={pushNotifs.loading}
                      onCheckedChange={async (checked) => {
                        if (checked) {
                          const ok = await pushNotifs.subscribe();
                          toast({
                            title: ok ? "Notifications enabled" : "Could not enable notifications",
                            description: ok ? "You'll receive mission reminders on this device." : "Please allow notifications in your browser settings.",
                          });
                        } else {
                          await pushNotifs.unsubscribe();
                          toast({ title: "Notifications disabled" });
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pushNotifs.isSubscribed 
                      ? "You'll get reminders for missions with notifications set." 
                      : "Enable to receive mission reminders even when the app is closed."}
                  </p>
                  {pushNotifs.isSubscribed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      disabled={pushNotifs.loading}
                      onClick={async () => {
                        const ok = await pushNotifs.sendTestNotification();
                        toast({
                          title: ok ? "Test notification sent!" : "Failed to send test",
                          description: ok ? "Check your notifications." : "Try again later.",
                        });
                      }}
                    >
                      <BellRing className="h-3 w-3 mr-1" />
                      Send Test Notification
                    </Button>
                  )}
                  {pushNotifs.permission === 'denied' && (
                    <p className="text-xs text-destructive">
                      Notifications are blocked. Please enable them in your browser settings.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setCreateFormData(defaultFormData);
        }}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10">
              Create Mission
            </Button>
          </DialogTrigger>
          <DialogContent 
            className="glassmorphic border-primary/30 w-full h-full max-w-full max-h-full left-0 top-0 translate-x-0 translate-y-0 rounded-none sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl">Create New Mission</DialogTitle>
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
                <Label htmlFor="create-description">Description <span className="text-primary">*</span></Label>
                <Textarea
                  id="create-description"
                  placeholder="What needs to be done?"
                  value={createFormData.description}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-background/50 border-primary/30 min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                  <Select value={createFormData.category} onValueChange={(val) => setCreateFormData(prev => ({ ...prev, category: val }))}>
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MISSION_CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date <span className="text-primary">*</span></Label>
                  <DatePicker
                    value={createFormData.startDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, startDate: date }))}
                    placeholder="Select date"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Start Time <span className="text-primary">*</span></Label>
                  <TimePicker
                    value={createFormData.startTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, startTime: time }))}
                    placeholder="Select time"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Due <span className="text-primary">*</span></Label>
                  <DatePicker
                    value={createFormData.endDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, endDate: date }))}
                    placeholder="Select date"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Time Due <span className="text-primary">*</span></Label>
                  <TimePicker
                    value={createFormData.endTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, endTime: time }))}
                    placeholder="Select time"
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
                          />
                          <TimePicker
                            value={notification.time}
                            onChange={(time) => {
                              const updated = [...createFormData.notifications];
                              updated[index] = { ...updated[index], time };
                              setCreateFormData(prev => ({ ...prev, notifications: updated }));
                            }}
                            placeholder="Time"
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
                    <div className="grid grid-cols-2 gap-3">
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
                      />
                    </div>
                  </div>
                )}
              </div>

              {createFormData.isRitualized && createFormData.repeatFrequency === "weekly" && createFormData.repeatDays.length === 0 && (
                <p className="text-xs text-destructive">Please select at least one day for weekly repeat.</p>
              )}

              <button 
                onClick={handleCreateMission} 
                className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
                disabled={!createFormData.title.trim() || !createFormData.description.trim() || !createFormData.startDate || !createFormData.startTime || !createFormData.endDate || !createFormData.endTime || isSubmitting || (createFormData.isRitualized && createFormData.repeatFrequency === "weekly" && createFormData.repeatDays.length === 0)}
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
          className="glassmorphic border-primary/30 w-full h-full max-w-full max-h-full left-0 top-0 translate-x-0 translate-y-0 rounded-none sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Edit Mission
            </DialogTitle>
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
              <Textarea
                id="edit-description"
                placeholder="What needs to be done?"
                value={editFormData.description}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                className="bg-background/50 border-primary/30 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                <Select value={editFormData.category} onValueChange={(val) => setEditFormData(prev => ({ ...prev, category: val }))}>
                  <SelectTrigger className="bg-background/50 border-primary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MISSION_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date <span className="text-primary">*</span></Label>
                <DatePicker
                  value={editFormData.startDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, startDate: date }))}
                  placeholder="Select date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Start Time <span className="text-primary">*</span></Label>
                <TimePicker
                  value={editFormData.startTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, startTime: time }))}
                  placeholder="Select time"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Due <span className="text-primary">*</span></Label>
                <DatePicker
                  value={editFormData.endDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, endDate: date }))}
                  placeholder="Select date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Time Due <span className="text-primary">*</span></Label>
                <TimePicker
                  value={editFormData.endTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, endTime: time }))}
                  placeholder="Select time"
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
                        />
                        <TimePicker
                          value={notification.time}
                          onChange={(time) => {
                            const updated = [...editFormData.notifications];
                            updated[index] = { ...updated[index], time };
                            setEditFormData(prev => ({ ...prev, notifications: updated }));
                          }}
                          placeholder="Time"
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
                  <div className="grid grid-cols-2 gap-3">
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
                    />
                  </div>
                </div>
              )}
            </div>

            {editFormData.isRitualized && editFormData.repeatFrequency === "weekly" && editFormData.repeatDays.length === 0 && (
              <p className="text-xs text-destructive">Please select at least one day for weekly repeat.</p>
            )}

            <button 
              onClick={handleUpdateMission} 
              className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
              disabled={!editFormData.title.trim() || !editFormData.startDate || !editFormData.startTime || !editFormData.endDate || !editFormData.endTime || isSubmitting || (editFormData.isRitualized && editFormData.repeatFrequency === "weekly" && editFormData.repeatDays.length === 0)}
            >
              {isSubmitting ? "Updating..." : "Update Mission"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      
      <DndProvider backend={HTML5Backend}>
      {/* Today's Missions */}
      <DroppableSection section="today" onDropQuest={handleCrossSectionDrop} className="mb-6">
      <Collapsible open={todayExpanded} onOpenChange={setTodayExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Today's Missions</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Today's Missions"
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
              {todayMissions.length > 0 ? (
                todayMissions.map((quest, idx) => (
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
                    isTimerActive={activeTimerQuest?.id === quest.id}
                    timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                  />
                ))
              ) : (
                <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                  <span className="material-icons text-3xl text-muted-foreground mb-2">task_alt</span>
                  <p className="text-muted-foreground">No missions for today. Create one to get started!</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      </DroppableSection>
      
      {/* Future Missions */}
      <DroppableSection section="upcoming" onDropQuest={handleCrossSectionDrop} className="mb-6">
        <Collapsible open={upcomingExpanded} onOpenChange={setUpcomingExpanded}>
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron">Future Missions</h2>
                <StatInfoDialog
                  trigger={
                    <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="Future Missions"
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
                  upcomingMissions.map((quest, idx) => (
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
                      isTimerActive={activeTimerQuest?.id === quest.id}
                      timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                    />
                  ))
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
      
      {/* Completed Missions */}
      <DroppableSection section="completed" onDropQuest={handleCrossSectionDrop} className="mb-6">
      <Collapsible open={completedExpanded} onOpenChange={setCompletedExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Completed Missions</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Completed Missions"
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
                completedMissions.map((quest, idx) => (
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
                  />
                ))
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
      
      {/* Mission Archive - onboarding missions and to-do ideas */}
      <DroppableSection section="inbox" onDropQuest={handleCrossSectionDrop} className="mb-6">
        <Collapsible open={inboxExpanded} onOpenChange={setInboxExpanded}>
          <div className="glassmorphic rounded-xl overflow-hidden neon-border">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Inbox className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron">Archived Missions</h2>
                <StatInfoDialog
                  trigger={
                    <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="Archived Missions"
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
                {incompleteOnboardingMissions.map((mission) => {
                  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
                  const xpMultiplier = difficultyMultipliers[mission.difficulty] || 1;
                  const adjustedXp = Math.floor(mission.xp * xpMultiplier);
                  const isInfoOpen = onboardingInfoOpen[mission.id] || false;
                  return (
                    <div 
                      key={`onboarding-${mission.id}`}
                      className="glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border"
                    >
                      <div className="flex items-start">
                        <div className="ml-2 flex-grow">
                          <div className="flex justify-between items-start">
                            <h3 className="font-medium">{mission.title}</h3>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              <span className="h-6 w-6 inline-flex items-center justify-center text-[10px] font-mono rounded border bg-primary/20 border-primary/50 text-primary">
                                {mission.difficulty}
                              </span>
                              {mission.description && (
                                <button
                                  className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                                  onClick={() => setOnboardingInfoOpen(prev => ({ ...prev, [mission.id]: !prev[mission.id] }))}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{((mission.duration / 1440) * 100).toFixed(1)}% ET</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{((mission.duration / 1440) * 100).toFixed(1)}% AT</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{((mission.duration / 1440) * 100).toFixed(1)}% TT</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs mt-1 text-muted-foreground">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            <span>{mission.duration} min</span>
                          </div>
                          {isInfoOpen && mission.description && (
                            <p className="text-muted-foreground text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                              {mission.description}
                            </p>
                          )}
                          <button
                            disabled={!!activeTimerQuest}
                            className="mt-2 text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/onboarding?mission=${mission.id}`);
                            }}
                          >
                            Start
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {inboxMissions.map((quest, idx) => (
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
                    isTimerActive={activeTimerQuest?.id === quest.id}
                    timerBlocked={!!activeTimerQuest && activeTimerQuest.id !== quest.id}
                  />
                ))}
                {inboxMissions.length === 0 && incompleteOnboardingMissions.length === 0 && (
                  <div className="glassmorphic rounded-xl p-6 text-center neon-border">
                    <p className="text-muted-foreground">No archived missions. Drag a mission here to archive it.</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </DroppableSection>

      {/* Terminated Missions - recently deleted, held for 24 hours */}
      <DroppableSection section="terminated" onDropQuest={handleCrossSectionDrop} className="mb-6">
      <Collapsible open={archivedExpanded} onOpenChange={setArchivedExpanded}>
        <div className="glassmorphic rounded-xl overflow-hidden neon-border">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-orbitron">Terminated Missions</h2>
              <StatInfoDialog
                trigger={
                  <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                }
                title="Terminated Missions"
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
                              {quest.category && quest.category !== "general" && quest.category !== "onboarding" && (
                                <span className="text-[10px] font-mono h-6 px-1.5 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary opacity-50 capitalize">
                                  {quest.category}
                                </span>
                              )}
                              <span className="text-[10px] font-mono h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary opacity-50">
                                {quest.difficulty || 'D'}
                              </span>
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
                          <div className="flex items-center gap-3 mt-1 flex-wrap opacity-50">
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.energyCost ?? 0) / 1440) * 100).toFixed(1)}% ET</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.attentionCost ?? 0) / 1440) * 100).toFixed(1)}% AT</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((quest.timeCost ?? 0) / 1440) * 100).toFixed(1)}% TT</span>
                            <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
                            <span className="text-muted-foreground text-xs">{hoursLeft}h left</span>
                          </div>
                          {terminatedInfoOpen[quest.id] && (
                            <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 opacity-60 space-y-2">
                              {quest.description && (
                                <p className="text-muted-foreground">{quest.description}</p>
                              )}
                              <div className="border-t border-primary/10 pt-2 space-y-1">
                                {quest.category && quest.category !== "general" && quest.category !== "onboarding" && (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono capitalize">{quest.category}</span> — {
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
                                      } as Record<string, string>)[quest.category] || 'Auto-classified mission category.'
                                    }
                                  </p>
                                )}
                                {(quest.difficulty || 'D') && (
                                  <p className="text-muted-foreground text-xs">
                                    <span className="text-primary font-mono">Rank {quest.difficulty || 'D'}</span> — {
                                      quest.difficulty === 'S' ? 'Extreme effort. Multi-day or life-changing.' :
                                      quest.difficulty === 'A' ? 'High effort. Significant commitment.' :
                                      quest.difficulty === 'B' ? 'Moderate effort. Requires focus and planning.' :
                                      quest.difficulty === 'C' ? 'Light effort. Simple but requires attention.' :
                                      'Minimal effort. Quick and easy.'
                                    }
                                  </p>
                                )}
                              </div>
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
      </DndProvider>

    </div>
  );
}
