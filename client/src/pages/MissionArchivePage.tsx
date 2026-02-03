import { useMemo } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Clock, CheckCircle2, ArrowLeft, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MissionArchivePage() {
  usePageTitle('Mission Archive');

  const { quests } = useLYFEOS();
  const [, navigate] = useLocation();

  const archivedMissions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return quests
      .filter(quest => {
        if (!quest.completed || !quest.completedAt) return false;
        const completedDate = new Date(quest.completedAt);
        completedDate.setHours(0, 0, 0, 0);
        return completedDate < today;
      })
      .sort((a, b) => {
        const dateA = new Date(a.completedAt!);
        const dateB = new Date(b.completedAt!);
        return dateB.getTime() - dateA.getTime();
      });
  }, [quests]);

  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: typeof archivedMissions } = {};
    
    archivedMissions.forEach(mission => {
      const completedDate = new Date(mission.completedAt!);
      const dateKey = completedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(mission);
    });
    
    return groups;
  }, [archivedMissions]);

  const dateKeys = Object.keys(groupedByDate);

  return (
    <>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Mission Archive</h1>
        <p className="text-[#7DAAB2]">Review your completed missions from previous days</p>
      </div>
      
      {dateKeys.length > 0 ? (
        <div className="space-y-6">
          {dateKeys.map((dateKey) => (
            <div key={dateKey} className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
              <div className="p-4 flex items-center justify-between border-b border-primary/20 bg-primary/5">
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 text-primary mr-3" />
                  <h2 className="text-lg font-medium">{dateKey}</h2>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {groupedByDate[dateKey].length} {groupedByDate[dateKey].length === 1 ? 'mission' : 'missions'}
                </span>
              </div>
              
              <div className="px-4 pb-4 space-y-3 pt-4">
                {groupedByDate[dateKey].map((mission) => (
                  <div 
                    key={mission.id}
                    className="p-3 rounded-lg bg-card/30 border border-slate-700/30"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center flex-1">
                        <CheckCircle2 className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                        <h3 className="font-medium">{mission.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className="flex items-center text-xs text-primary">
                          <Star className="h-3 w-3 mr-1" />
                          +{mission.experienceReward} XP
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                          <span className="text-xs text-[#7DAAB2] font-mono">
                            {new Date(mission.completedAt!).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {mission.description && (
                      <p className="text-sm text-[#7DAAB2] line-clamp-2 ml-6">
                        {mission.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Archived Missions Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Complete missions to see them archived here. Missions completed today will appear here tomorrow.
          </p>
        </div>
      )}
    </>
  );
}
