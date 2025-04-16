import { useState, useEffect } from 'react';
import { Plus, Info, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Mission {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  xpValue: number;
}

export default function MissionLogSystem() {
  const [missions, setMissions] = useState<Mission[]>(() => {
    // Try to load from localStorage
    const savedMissions = localStorage.getItem('missions');
    return savedMissions ? JSON.parse(savedMissions) : [
      {
        id: '1',
        title: 'Complete project documentation',
        description: 'Write up summary of recent project changes and document API endpoints',
        completed: false,
        xpValue: 10
      },
      {
        id: '2',
        title: 'Schedule team meeting',
        description: 'Organize weekly planning session with design and development teams',
        completed: false,
        xpValue: 5
      },
      {
        id: '3',
        title: 'Workout session',
        description: 'Complete 30-minute strength training routine',
        completed: false,
        xpValue: 15
      }
    ];
  });
  
  const [xp, setXp] = useState<number>(() => {
    const savedXp = localStorage.getItem('missionXp');
    return savedXp ? parseInt(savedXp) : 0;
  });
  
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  
  // Save missions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('missions', JSON.stringify(missions));
  }, [missions]);
  
  // Save XP to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('missionXp', xp.toString());
  }, [xp]);
  
  const handleAddMission = () => {
    if (!newMissionTitle.trim()) return;
    
    const newMission: Mission = {
      id: Date.now().toString(),
      title: newMissionTitle,
      description: 'New mission added. Click the info icon to add details.',
      completed: false,
      xpValue: 10
    };
    
    setMissions([...missions, newMission]);
    setNewMissionTitle('');
  };
  
  const handleToggleComplete = (id: string) => {
    setMissions(missions.map(mission => {
      if (mission.id === id) {
        const newCompleted = !mission.completed;
        
        // Award XP if completing the mission
        if (newCompleted && !mission.completed) {
          setXp(current => current + mission.xpValue);
        }
        // Remove XP if uncompleting the mission
        else if (!newCompleted && mission.completed) {
          setXp(current => current - mission.xpValue);
        }
        
        return {
          ...mission,
          completed: newCompleted
        };
      }
      return mission;
    }));
  };
  
  const openMissionInfo = (mission: Mission) => {
    setSelectedMission(mission);
    setInfoDialogOpen(true);
  };
  
  return (
    <div className="glassmorphic rounded-xl p-4 neon-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Mission Log</h2>
        <Badge variant="outline" className="bg-primary/10 text-primary px-2 py-1 font-mono">
          XP: {xp}
        </Badge>
      </div>
      
      {/* New Mission Input */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Add new mission..."
          value={newMissionTitle}
          onChange={(e) => setNewMissionTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddMission()}
          className="flex-grow"
        />
        <Button onClick={handleAddMission} size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Mission List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {missions.map((mission) => (
          <div 
            key={mission.id} 
            className={cn(
              "flex items-center gap-2 p-3 rounded-md transition-all duration-200",
              "bg-surface bg-opacity-30 hover:bg-opacity-40 border border-primary/10",
              mission.completed && "bg-opacity-20"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 rounded-md border",
                mission.completed ? "bg-primary/20 border-primary" : "border-primary/30"
              )}
              onClick={() => handleToggleComplete(mission.id)}
            >
              {mission.completed && <Check className="h-3 w-3 text-primary" />}
            </Button>
            
            <span className={cn(
              "flex-grow text-sm",
              mission.completed && "line-through text-muted-foreground"
            )}>
              {mission.title}
            </span>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-primary/70 hover:text-primary"
              onClick={() => openMissionInfo(mission)}
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      
      {/* Mission Info Dialog */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMission?.title}</DialogTitle>
            <DialogDescription>
              {selectedMission?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground">XP Value:</span>
            <Badge variant="outline" className="font-mono">
              {selectedMission?.xpValue}
            </Badge>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setInfoDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              variant="default"
              disabled={true} // Placeholder for now
            >
              View Full Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}