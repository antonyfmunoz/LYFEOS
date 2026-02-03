import React, { useMemo } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Clock, CheckCircle2, ArrowLeft, Calendar, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MissionArchivePage() {
  usePageTitle('Mission Archive');

  const { quests } = useLYFEOS();
  const [, navigate] = useLocation();

  const today = new Date().toISOString().split('T')[0];

  const archivedMissionsByDate = useMemo(() => {
    const completed = quests.filter(q => q.completed && q.completedAt && q.completedAt !== today);
    
    const grouped: Record<string, typeof completed> = {};
    completed.forEach(quest => {
      const date = quest.completedAt || 'Unknown';
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(quest);
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    );

    return sortedDates.map(date => ({
      date,
      missions: grouped[date]
    }));
  }, [quests, today]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const totalArchived = archivedMissionsByDate.reduce((sum, group) => sum + group.missions.length, 0);

  return (
    <>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={() => navigate('/missions')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Mission Archive</h1>
        <p className="text-[#7DAAB2]">Review your completed missions from previous days</p>
      </div>
            
      {archivedMissionsByDate.length > 0 ? (
        <div className="space-y-6">
          <div className="glassmorphic rounded-xl p-4 border border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Archive className="h-5 w-5 text-primary" />
              <span className="font-medium">Total Archived Missions</span>
            </div>
            <span className="text-lg font-orbitron text-primary">{totalArchived}</span>
          </div>

          {archivedMissionsByDate.map(({ date, missions }) => (
            <div key={date} className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
              <div className="p-4 flex items-center justify-between border-b border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-medium">{formatDate(date)}</h2>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {missions.length} {missions.length === 1 ? 'mission' : 'missions'}
                </span>
              </div>
              
              <div className="px-4 pb-4 space-y-3 pt-4">
                {missions.map((mission) => (
                  <div 
                    key={mission.id}
                    className="p-3 rounded-lg bg-card/30 border border-slate-700/30"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <h3 className="font-medium">{mission.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#7DAAB2]">
                        <div className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          <span>-{mission.energyCost} EP</span>
                        </div>
                        <div className="flex items-center gap-1 text-primary">
                          <Star className="h-3 w-3" />
                          <span>+{mission.experienceReward} XP</span>
                        </div>
                      </div>
                    </div>
                    
                    {mission.description && (
                      <p className="text-sm text-[#7DAAB2] ml-6">
                        {mission.description}
                      </p>
                    )}

                    {(mission.startDate || mission.endDate) && (
                      <div className="flex items-center gap-2 mt-2 ml-6 text-xs text-[#7DAAB2]">
                        <Clock className="h-3 w-3" />
                        {mission.startDate && (
                          <span>
                            {mission.startDate}
                            {mission.startTime && ` ${mission.startTime}`}
                          </span>
                        )}
                        {mission.startDate && mission.endDate && <span>-</span>}
                        {mission.endDate && (
                          <span>
                            {mission.endDate}
                            {mission.endTime && ` ${mission.endTime}`}
                          </span>
                        )}
                      </div>
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
            Completed missions from previous days will appear here. Missions completed today will be archived tomorrow.
          </p>
          <Button
            variant="outline"
            className="border-primary/30 hover:bg-primary/10"
            onClick={() => navigate('/missions')}
          >
            Go to Missions
          </Button>
        </div>
      )}
    </>
  );
}
