import { useState, useMemo } from "react";
import { useLYFEOS } from "../lib/context";
import QuestItem from "../components/dashboard/QuestItem";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Calendar, Zap, Star } from "lucide-react";

export default function QuestsPage() {
  usePageTitle('Missions');
  
  const { quests, toggleQuestCompletion, createQuest, deleteQuest } = useLYFEOS();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMission, setNewMission] = useState({
    title: "",
    description: "",
    energyCost: 1,
    experienceReward: 10,
    dueDate: "",
  });

  const today = new Date().toISOString().split('T')[0];

  const { todayMissions, upcomingMissions, completedMissions } = useMemo(() => {
    const active = quests.filter(q => !q.completed);
    const completed = quests.filter(q => q.completed);
    
    const todayItems = active.filter(q => {
      if (!q.dueDate) return true;
      return q.dueDate === today;
    });
    
    const upcomingItems = active.filter(q => {
      if (!q.dueDate) return false;
      return q.dueDate > today;
    });
    
    return {
      todayMissions: todayItems,
      upcomingMissions: upcomingItems,
      completedMissions: completed,
    };
  }, [quests, today]);

  const handleCreateMission = async () => {
    if (!newMission.title.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createQuest({
        title: newMission.title.trim(),
        description: newMission.description.trim() || "No description",
        energyCost: newMission.energyCost,
        experienceReward: newMission.experienceReward,
        dueDate: newMission.dueDate || null,
      });
      
      setNewMission({
        title: "",
        description: "",
        energyCost: 1,
        experienceReward: 10,
        dueDate: "",
      });
      setIsCreateOpen(false);
    } catch (error) {
      console.error("Failed to create mission:", error);
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
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Mission
            </Button>
          </DialogTrigger>
          <DialogContent className="glassmorphic border-primary/30">
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl">Create New Mission</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Mission Title</Label>
                <Input
                  id="title"
                  placeholder="Enter mission title..."
                  value={newMission.title}
                  onChange={(e) => setNewMission(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-background/50 border-primary/30"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What needs to be done?"
                  value={newMission.description}
                  onChange={(e) => setNewMission(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-background/50 border-primary/30 min-h-[80px]"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dueDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Due Date
                </Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={newMission.dueDate}
                  onChange={(e) => setNewMission(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="bg-background/50 border-primary/30"
                  min={today}
                />
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
                    value={newMission.energyCost}
                    onChange={(e) => setNewMission(prev => ({ ...prev, energyCost: parseInt(e.target.value) || 1 }))}
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
                    value={newMission.experienceReward}
                    onChange={(e) => setNewMission(prev => ({ ...prev, experienceReward: parseInt(e.target.value) || 10 }))}
                    className="bg-background/50 border-primary/30"
                  />
                </div>
              </div>
              
              <Button 
                onClick={handleCreateMission} 
                className="w-full mt-4"
                disabled={!newMission.title.trim() || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Mission"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
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
            />
          ))}
        </div>
      )}
    </>
  );
}
