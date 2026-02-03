import { useState, useMemo } from "react";
import { useLYFEOS } from "../lib/context";
import QuestItem from "../components/dashboard/QuestItem";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Zap, Star, Bell, Edit3 } from "lucide-react";
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
  
  const [createFormData, setCreateFormData] = useState<MissionFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<MissionFormData>(defaultFormData);

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

  const openEditDialog = (quest: Quest) => {
    setEditingQuest(quest);
    setEditFormData({
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
    if (!createFormData.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: createFormData.title.trim(),
        description: createFormData.description.trim() || "No description",
        energyCost: createFormData.energyCost,
        experienceReward: createFormData.experienceReward,
        startDate: createFormData.startDate || null,
        startTime: createFormData.startTime || null,
        endDate: createFormData.endDate || null,
        endTime: createFormData.endTime || null,
        dueDate: createFormData.dueDate || null,
        notificationEnabled: createFormData.notificationEnabled,
        notificationTime: createFormData.notificationEnabled ? createFormData.notificationTime : null,
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
        energyCost: editFormData.energyCost,
        experienceReward: editFormData.experienceReward,
        startDate: editFormData.startDate || null,
        startTime: editFormData.startTime || null,
        endDate: editFormData.endDate || null,
        endTime: editFormData.endTime || null,
        dueDate: editFormData.dueDate || null,
        notificationEnabled: editFormData.notificationEnabled,
        notificationTime: editFormData.notificationEnabled ? editFormData.notificationTime : null,
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
          <DialogContent className="glassmorphic border-primary/30 max-h-[90vh] overflow-y-auto">
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
                  <Label>End Date</Label>
                  <DatePicker
                    value={createFormData.endDate}
                    onChange={(date) => setCreateFormData(prev => ({ ...prev, endDate: date }))}
                    placeholder="Select date"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <TimePicker
                    value={createFormData.endTime}
                    onChange={(time) => setCreateFormData(prev => ({ ...prev, endTime: time }))}
                    placeholder="Select time"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-orange-400">Due Date (Deadline)</Label>
                <DatePicker
                  value={createFormData.dueDate}
                  onChange={(date) => setCreateFormData(prev => ({ ...prev, dueDate: date }))}
                  placeholder="Select deadline"
                />
              </div>
              
              <div className="glassmorphic rounded-lg p-4 border border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="create-notification" className="flex items-center gap-2 cursor-pointer">
                    <Bell className="h-4 w-4" />
                    Notification Reminder
                  </Label>
                  <Switch
                    id="create-notification"
                    checked={createFormData.notificationEnabled}
                    onCheckedChange={(checked) => setCreateFormData(prev => ({ ...prev, notificationEnabled: checked }))}
                  />
                </div>
                
                {createFormData.notificationEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="create-notificationTime" className="text-sm text-muted-foreground">
                      Remind me before start
                    </Label>
                    <select
                      id="create-notificationTime"
                      value={createFormData.notificationTime}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, notificationTime: e.target.value }))}
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
                  <Label htmlFor="create-energyCost" className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Energy Cost
                  </Label>
                  <Input
                    id="create-energyCost"
                    type="number"
                    min={1}
                    max={10}
                    value={createFormData.energyCost}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, energyCost: parseInt(e.target.value) || 1 }))}
                    className="bg-background/50 border-primary/30"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="create-xpReward" className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    XP Reward
                  </Label>
                  <Input
                    id="create-xpReward"
                    type="number"
                    min={5}
                    max={100}
                    step={5}
                    value={createFormData.experienceReward}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, experienceReward: parseInt(e.target.value) || 10 }))}
                    className="bg-background/50 border-primary/30"
                  />
                </div>
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
        <DialogContent className="glassmorphic border-primary/30 max-h-[90vh] overflow-y-auto">
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
                <Label>End Date</Label>
                <DatePicker
                  value={editFormData.endDate}
                  onChange={(date) => setEditFormData(prev => ({ ...prev, endDate: date }))}
                  placeholder="Select date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimePicker
                  value={editFormData.endTime}
                  onChange={(time) => setEditFormData(prev => ({ ...prev, endTime: time }))}
                  placeholder="Select time"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-orange-400">Due Date (Deadline)</Label>
              <DatePicker
                value={editFormData.dueDate}
                onChange={(date) => setEditFormData(prev => ({ ...prev, dueDate: date }))}
                placeholder="Select deadline"
              />
            </div>
            
            <div className="glassmorphic rounded-lg p-4 border border-primary/20">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="edit-notification" className="flex items-center gap-2 cursor-pointer">
                  <Bell className="h-4 w-4" />
                  Notification Reminder
                </Label>
                <Switch
                  id="edit-notification"
                  checked={editFormData.notificationEnabled}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, notificationEnabled: checked }))}
                />
              </div>
              
              {editFormData.notificationEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="edit-notificationTime" className="text-sm text-muted-foreground">
                    Remind me before start
                  </Label>
                  <select
                    id="edit-notificationTime"
                    value={editFormData.notificationTime}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, notificationTime: e.target.value }))}
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
                <Label htmlFor="edit-energyCost" className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Energy Cost
                </Label>
                <Input
                  id="edit-energyCost"
                  type="number"
                  min={1}
                  max={10}
                  value={editFormData.energyCost}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, energyCost: parseInt(e.target.value) || 1 }))}
                  className="bg-background/50 border-primary/30"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-xpReward" className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  XP Reward
                </Label>
                <Input
                  id="edit-xpReward"
                  type="number"
                  min={5}
                  max={100}
                  step={5}
                  value={editFormData.experienceReward}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, experienceReward: parseInt(e.target.value) || 10 }))}
                  className="bg-background/50 border-primary/30"
                />
              </div>
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
