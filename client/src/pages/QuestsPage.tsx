import { useState, useMemo, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import QuestItem from "../components/dashboard/QuestItem";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Zap, Star, Bell, Edit3, X, ChevronDown, ChevronRight, Target, Calendar, CheckCircle2, GraduationCap, Inbox } from "lucide-react";
import { Quest, QuestNotification } from "@/lib/types";

const ONBOARDING_MISSIONS = [
  { id: 0, title: "Access & Quickstart", xp: 100 },
  { id: 1, title: "Archetype Calibration", xp: 150 },
  { id: 2, title: "Identity & Direction", xp: 75 },
  { id: 3, title: "Craft & Mastery", xp: 60 },
  { id: 4, title: "Capacity & Constraints", xp: 55 },
  { id: 5, title: "Baselines & States", xp: 70 },
  { id: 6, title: "History & Roots", xp: 50 },
  { id: 7, title: "Systems & Rituals", xp: 65 },
];

interface MissionFormData {
  title: string;
  description: string;
  experienceReward: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  notifications: QuestNotification[];
}

const defaultFormData: MissionFormData = {
  title: "",
  description: "",
  experienceReward: 10,
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  notifications: [],
};

export default function QuestsPage() {
  usePageTitle('Missions');
  const [, navigate] = useLocation();
  
  const { quests, toggleQuestCompletion, createQuest, updateQuest, deleteQuest } = useLYFEOS();
  const { user } = useAuth();
  
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
  
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [inboxExpanded, setInboxExpanded] = useState(true);

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
    
    // Today's missions: exclude 'todo' category (those go to inbox)
    const todayItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (!q.startDate) return true;
      return q.startDate === today;
    });
    
    const upcomingItems = active.filter(q => {
      if (q.category === 'todo') return false;
      if (!q.startDate) return false;
      return q.startDate > today;
    });
    
    return {
      todayMissions: todayItems,
      upcomingMissions: upcomingItems,
      completedMissions: completed,
      inboxMissions: inboxItems,
    };
  }, [quests, today]);

  const openEditDialog = (quest: Quest) => {
    setEditingQuest(quest);
    setEditFormData({
      title: quest.title,
      description: quest.description,
      experienceReward: quest.experienceReward,
      startDate: quest.startDate || "",
      startTime: quest.startTime || "",
      endDate: quest.endDate || "",
      endTime: quest.endTime || "",
      notifications: quest.notifications || [],
    });
    setIsEditOpen(true);
  };

  const handleCreateMission = async () => {
    if (!createFormData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: createFormData.title.trim(),
        description: createFormData.description.trim() || "No description",
        experienceReward: createFormData.experienceReward,
        startDate: createFormData.startDate || null,
        startTime: createFormData.startTime || null,
        endDate: createFormData.endDate || null,
        endTime: createFormData.endTime || null,
        notificationEnabled: createFormData.notifications.length > 0,
        notificationTime: null,
        notifications: createFormData.notifications,
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
        description: editFormData.description.trim() || "No description",
        experienceReward: editFormData.experienceReward,
        startDate: editFormData.startDate || null,
        startTime: editFormData.startTime || null,
        endDate: editFormData.endDate || null,
        endTime: editFormData.endTime || null,
        notificationEnabled: editFormData.notifications.length > 0,
        notificationTime: null,
        notifications: editFormData.notifications,
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

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Missions</h1>
          <p className="text-muted-foreground">Complete missions to earn XP and reach your goals.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setCreateFormData(defaultFormData);
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Mission
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
                <Label htmlFor="create-title">Mission Title</Label>
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
                  <Label>Start Date</Label>
                  <DatePicker
                    value={createFormData.startDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, startDate: date }))}
                    placeholder="Select date"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <TimePicker
                    value={createFormData.startTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, startTime: time }))}
                    placeholder="Select time"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Due</Label>
                  <DatePicker
                    value={createFormData.endDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, endDate: date }))}
                    placeholder="Select date"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Time Due</Label>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => setCreateFormData(prev => ({
                      ...prev,
                      notifications: [...prev.notifications, { date: "", time: "" }]
                    }))}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
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
              
              <Button 
                onClick={handleCreateMission} 
                className="w-full mt-4"
                disabled={!createFormData.title.trim() || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Mission"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
              <Label htmlFor="edit-title">Mission Title</Label>
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
                <Label>Start Date</Label>
                <DatePicker
                  value={editFormData.startDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, startDate: date }))}
                  placeholder="Select date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimePicker
                  value={editFormData.startTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, startTime: time }))}
                  placeholder="Select time"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Due</Label>
                <DatePicker
                  value={editFormData.endDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, endDate: date }))}
                  placeholder="Select date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Time Due</Label>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setEditFormData(prev => ({
                    ...prev,
                    notifications: [...prev.notifications, { date: "", time: "" }]
                  }))}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
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
            
            <Button 
              onClick={handleUpdateMission} 
              className="w-full mt-4"
              disabled={!editFormData.title.trim() || isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update Mission"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Today's Missions */}
      <Collapsible open={todayExpanded} onOpenChange={setTodayExpanded} className="mb-6">
        <div className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
          <CollapsibleTrigger asChild>
            <div className="p-4 cursor-pointer hover:bg-primary/5 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {todayExpanded ? (
                    <ChevronDown className="h-5 w-5 text-primary" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary" />
                  )}
                  <Target className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-orbitron">Today's Missions</h2>
                </div>
                <div className="text-xs bg-transparent border border-primary/30 text-primary px-2 py-1 rounded-md">
                  {todayMissions.length} ACTIVE
                </div>
              </div>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              {todayMissions.length > 0 ? (
                todayMissions.map((quest) => (
                  <QuestItem 
                    key={quest.id}
                    quest={quest}
                    onToggle={() => toggleQuestCompletion(quest.id)}
                    onDelete={() => deleteQuest(quest.id)}
                    onEdit={() => openEditDialog(quest)}
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
      
      {/* Upcoming Missions */}
      {(upcomingMissions.length > 0 || incompleteOnboardingMissions.length > 0) && (
        <Collapsible open={upcomingExpanded} onOpenChange={setUpcomingExpanded} className="mb-6">
          <div className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
            <CollapsibleTrigger asChild>
              <div className="p-4 cursor-pointer hover:bg-primary/5 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {upcomingExpanded ? (
                      <ChevronDown className="h-5 w-5 text-primary" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-primary" />
                    )}
                    <Calendar className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-orbitron">Upcoming Missions</h2>
                  </div>
                  <div className="text-xs bg-transparent border border-primary/30 text-primary px-2 py-1 rounded-md">
                    {upcomingMissions.length + incompleteOnboardingMissions.length} SCHEDULED
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                {incompleteOnboardingMissions.map((mission) => (
                  <div 
                    key={`onboarding-${mission.id}`}
                    className="p-3 rounded-lg border border-primary/20 bg-card/30 hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => navigate('/onboarding')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="text-sm font-medium text-foreground">{mission.title}</h3>
                          <p className="text-xs text-muted-foreground">Onboarding Mission</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <Star className="h-3 w-3" />
                          <span>+{mission.xp} XP</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {upcomingMissions.map((quest) => (
                  <QuestItem 
                    key={quest.id}
                    quest={quest}
                    onToggle={() => toggleQuestCompletion(quest.id)}
                    onDelete={() => deleteQuest(quest.id)}
                    onEdit={() => openEditDialog(quest)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      
      {/* Completed Missions */}
      {completedMissions.length > 0 && (
        <Collapsible open={completedExpanded} onOpenChange={setCompletedExpanded} className="mb-6">
          <div className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
            <CollapsibleTrigger asChild>
              <div className="p-4 cursor-pointer hover:bg-primary/5 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {completedExpanded ? (
                      <ChevronDown className="h-5 w-5 text-primary" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-primary" />
                    )}
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-orbitron">Completed Missions</h2>
                  </div>
                  <div className="text-xs bg-transparent border border-primary/30 text-primary px-2 py-1 rounded-md">
                    {completedMissions.length} COMPLETED
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                {completedMissions.map((quest) => (
                  <QuestItem 
                    key={quest.id}
                    quest={quest}
                    onToggle={() => toggleQuestCompletion(quest.id)}
                    onDelete={() => deleteQuest(quest.id)}
                    onEdit={() => openEditDialog(quest)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      
      {/* Mission Archive - missions from to-do ideas */}
      {inboxMissions.length > 0 && (
        <Collapsible open={inboxExpanded} onOpenChange={setInboxExpanded} className="mb-6">
          <div className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
            <CollapsibleTrigger asChild>
              <div className="p-4 cursor-pointer hover:bg-primary/5 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {inboxExpanded ? (
                      <ChevronDown className="h-5 w-5 text-primary" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-primary" />
                    )}
                    <Inbox className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-orbitron">Mission Archive</h2>
                  </div>
                  <div className="text-xs bg-transparent border border-primary/30 text-primary px-2 py-1 rounded-md">
                    {inboxMissions.length} QUEUED
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="px-4 pb-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Missions created from your to-do ideas. Edit to schedule or complete them directly.
                </p>
                <div className="space-y-3">
                  {inboxMissions.map((quest) => (
                    <QuestItem 
                      key={quest.id}
                      quest={quest}
                      onToggle={() => toggleQuestCompletion(quest.id)}
                      onDelete={() => deleteQuest(quest.id)}
                      onEdit={() => openEditDialog(quest)}
                    />
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </>
  );
}
