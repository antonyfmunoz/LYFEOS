import { useState, useMemo } from "react";
import { useLYFEOS } from "../lib/context";
import QuestItem from "../components/dashboard/QuestItem";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Calendar, Zap, Star, Clock, Bell, Edit3 } from "lucide-react";
import { Quest } from "@/lib/types";

interface MissionFormData {
  title: string;
  description: string;
  energyCost: number;
  experienceReward: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dueDate: string;
  notificationEnabled: boolean;
  notificationTime: string;
}

const defaultFormData: MissionFormData = {
  title: "",
  description: "",
  energyCost: 1,
  experienceReward: 10,
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  dueDate: "",
  notificationEnabled: false,
  notificationTime: "15",
};

export default function QuestsPage() {
  usePageTitle('Missions');
  
  const { quests, toggleQuestCompletion, createQuest, updateQuest, deleteQuest } = useLYFEOS();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<MissionFormData>(defaultFormData);

  const today = new Date().toISOString().split('T')[0];

  const { todayMissions, upcomingMissions, completedMissions } = useMemo(() => {
    const active = quests.filter(q => !q.completed);
    const completed = quests.filter(q => q.completed);
    
    const todayItems = active.filter(q => {
      if (!q.dueDate && !q.startDate) return true;
      const relevantDate = q.startDate || q.dueDate;
      return relevantDate === today;
    });
    
    const upcomingItems = active.filter(q => {
      const relevantDate = q.startDate || q.dueDate;
      if (!relevantDate) return false;
      return relevantDate > today;
    });
    
    return {
      todayMissions: todayItems,
      upcomingMissions: upcomingItems,
      completedMissions: completed,
    };
  }, [quests, today]);

  const resetForm = () => {
    setFormData(defaultFormData);
  };

  const openEditDialog = (quest: Quest) => {
    setEditingQuest(quest);
    setFormData({
      title: quest.title,
      description: quest.description,
      energyCost: quest.energyCost,
      experienceReward: quest.experienceReward,
      startDate: quest.startDate || "",
      startTime: quest.startTime || "",
      endDate: quest.endDate || "",
      endTime: quest.endTime || "",
      dueDate: quest.dueDate || "",
      notificationEnabled: quest.notificationEnabled || false,
      notificationTime: quest.notificationTime || "15",
    });
    setIsEditOpen(true);
  };

  const handleCreateMission = async () => {
    if (!formData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: formData.title.trim(),
        description: formData.description.trim() || "No description",
        energyCost: formData.energyCost,
        experienceReward: formData.experienceReward,
        startDate: formData.startDate || null,
        startTime: formData.startTime || null,
        endDate: formData.endDate || null,
        endTime: formData.endTime || null,
        dueDate: formData.dueDate || null,
        notificationEnabled: formData.notificationEnabled,
        notificationTime: formData.notificationEnabled ? formData.notificationTime : null,
      });
      
      resetForm();
      setIsCreateOpen(false);
    } catch (error) {
      console.error("Failed to create mission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMission = async () => {
    if (!editingQuest || !formData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await updateQuest(editingQuest.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || "No description",
        energyCost: formData.energyCost,
        experienceReward: formData.experienceReward,
        startDate: formData.startDate || null,
        startTime: formData.startTime || null,
        endDate: formData.endDate || null,
        endTime: formData.endTime || null,
        dueDate: formData.dueDate || null,
        notificationEnabled: formData.notificationEnabled,
        notificationTime: formData.notificationEnabled ? formData.notificationTime : null,
      });
      
      resetForm();
      setEditingQuest(null);
      setIsEditOpen(false);
    } catch (error) {
      console.error("Failed to update mission:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const MissionForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="title">Mission Title</Label>
        <Input
          id="title"
          placeholder="Enter mission title..."
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          className="bg-background/50 border-primary/30"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="What needs to be done?"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="bg-background/50 border-primary/30 min-h-[80px]"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Start Date
          </Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="startTime" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Start Time
          </Label>
          <Input
            id="startTime"
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="endDate" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            End Date
          </Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="endTime" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            End Time
          </Label>
          <Input
            id="endTime"
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="dueDate" className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-400" />
          Due Date (Deadline)
        </Label>
        <Input
          id="dueDate"
          type="date"
          value={formData.dueDate}
          onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
          className="bg-background/50 border-primary/30"
        />
      </div>
      
      <div className="glassmorphic rounded-lg p-4 border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <Label htmlFor="notification" className="flex items-center gap-2 cursor-pointer">
            <Bell className="h-4 w-4" />
            Notification Reminder
          </Label>
          <Switch
            id="notification"
            checked={formData.notificationEnabled}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, notificationEnabled: checked }))}
          />
        </div>
        
        {formData.notificationEnabled && (
          <div className="space-y-2">
            <Label htmlFor="notificationTime" className="text-sm text-muted-foreground">
              Remind me before start
            </Label>
            <select
              id="notificationTime"
              value={formData.notificationTime}
              onChange={(e) => setFormData(prev => ({ ...prev, notificationTime: e.target.value }))}
              className="w-full bg-background/50 border border-primary/30 rounded-md px-3 py-2 text-sm"
            >
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="energyCost" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Energy Cost
          </Label>
          <Input
            id="energyCost"
            type="number"
            min={1}
            max={10}
            value={formData.energyCost}
            onChange={(e) => setFormData(prev => ({ ...prev, energyCost: parseInt(e.target.value) || 1 }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="xpReward" className="flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            XP Reward
          </Label>
          <Input
            id="xpReward"
            type="number"
            min={5}
            max={100}
            step={5}
            value={formData.experienceReward}
            onChange={(e) => setFormData(prev => ({ ...prev, experienceReward: parseInt(e.target.value) || 10 }))}
            className="bg-background/50 border-primary/30"
          />
        </div>
      </div>
      
      <Button 
        onClick={isEdit ? handleUpdateMission : handleCreateMission} 
        className="w-full mt-4"
        disabled={!formData.title.trim() || isSubmitting}
      >
        {isSubmitting ? (isEdit ? "Updating..." : "Creating...") : (isEdit ? "Update Mission" : "Create Mission")}
      </Button>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Missions</h1>
          <p className="text-muted-foreground">Complete missions to earn XP and reach your goals.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Mission
            </Button>
          </DialogTrigger>
          <DialogContent className="glassmorphic border-primary/30 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl">Create New Mission</DialogTitle>
            </DialogHeader>
            <MissionForm />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          resetForm();
          setEditingQuest(null);
        }
      }}>
        <DialogContent className="glassmorphic border-primary/30 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Edit Mission
            </DialogTitle>
          </DialogHeader>
          <MissionForm isEdit />
        </DialogContent>
      </Dialog>
      
      {/* Today's Missions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron">Today's Missions</h2>
          <div className="text-xs bg-transparent border border-primary/30 text-primary px-2 py-1 rounded-md">
            {todayMissions.length} ACTIVE
          </div>
        </div>
        
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
          <div className="glassmorphic rounded-xl p-6 text-center neon-border mb-4">
            <span className="material-icons text-3xl text-muted-foreground mb-2">task_alt</span>
            <p className="text-muted-foreground">No missions for today. Create one to get started!</p>
          </div>
        )}
      </div>
      
      {/* Upcoming Missions */}
      {upcomingMissions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-orbitron">Upcoming Missions</h2>
            <div className="text-xs bg-transparent border border-blue-500/30 text-blue-400 px-2 py-1 rounded-md">
              {upcomingMissions.length} SCHEDULED
            </div>
          </div>
          
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
      )}
      
      {/* Completed Missions */}
      {completedMissions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-orbitron">Completed</h2>
            <div className="text-xs bg-transparent border border-[#36F1CD]/30 text-[#36F1CD] px-2 py-1 rounded-md">
              {completedMissions.length} COMPLETED
            </div>
          </div>
          
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
      )}
    </>
  );
}
