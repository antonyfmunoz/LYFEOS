import { ReactNode, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AICompanionPanel from "../ai/AICompanionPanel";
import MissionTimer from "../dashboard/MissionTimer";
import { useLYFEOS } from "../../lib/context";
import { useLocation } from "wouter";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { username, activeTimerQuest, timerStartedAt, timerPausedElapsed, timerIsPaused, isOnBreak, breakStartedAt, breakElapsed, endMissionTimer, pauseResumeTimer } = useLYFEOS();
  const [location] = useLocation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [location]);
  
  const rawPage = location.split('/')[1] || 'dashboard';
  const pageAliases: Record<string, string> = {
    'tracker': 'chronilog',
    'goals-archive': 'chronilog',
    'knowledge-vault': 'chronilog',
    'timeline': 'chronilog',
    'rolodex': 'chronilog',
    'mission-archive': 'chronilog',
    'journal-archive': 'chronilog',
    'rituals-archive': 'chronilog',
    'enhanced-mission': 'chronilog',
    'energy': 'profile',
    'attention': 'profile',
    'time': 'profile',
    'health': 'profile',
    'streak': 'profile',
    'experience': 'profile',
    'efficiency': 'profile',
  };
  const currentPage = pageAliases[rawPage] || rawPage;
  
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} username={username} />
        
        <div className="flex-grow flex flex-col overflow-hidden">
          <div className="shrink-0 bg-background z-40">
            <div className="flex items-center justify-center py-4">
              <span className="text-2xl text-white font-orbitron font-bold">LYFE<span className="text-primary">OS</span></span>
            </div>
          </div>
          
          <div ref={scrollContainerRef} className="flex-grow overflow-y-auto relative">
            {activeTimerQuest && (
              <div className="z-30 lg:hidden flex justify-center px-4 pt-2 pb-2">
                <MissionTimer
                  timerStartedAt={timerStartedAt}
                  timerPausedElapsed={timerPausedElapsed}
                  timerIsPaused={timerIsPaused}
                  isOnBreak={isOnBreak}
                  breakStartedAt={breakStartedAt}
                  breakElapsed={breakElapsed}
                  onEnd={endMissionTimer}
                  onPauseResume={pauseResumeTimer}
                  missionTitle={activeTimerQuest.title}
                  missionDescription={activeTimerQuest.description}
                  missionCategory={activeTimerQuest.category}
                  missionXP={activeTimerQuest.experienceReward}
                  missionEnergyCost={activeTimerQuest.energyCost}
                  missionAttentionCost={activeTimerQuest.attentionCost}
                  missionTimeCost={activeTimerQuest.timeCost}
                  missionDifficulty={activeTimerQuest.difficulty}
                />
              </div>
            )}
            
            {activeTimerQuest && (
              <div className="z-30 flex justify-center px-6 pt-2 pb-2 hidden lg:block">
                <MissionTimer
                  timerStartedAt={timerStartedAt}
                  timerPausedElapsed={timerPausedElapsed}
                  timerIsPaused={timerIsPaused}
                  isOnBreak={isOnBreak}
                  breakStartedAt={breakStartedAt}
                  breakElapsed={breakElapsed}
                  onEnd={endMissionTimer}
                  onPauseResume={pauseResumeTimer}
                  missionTitle={activeTimerQuest.title}
                  missionDescription={activeTimerQuest.description}
                  missionCategory={activeTimerQuest.category}
                  missionXP={activeTimerQuest.experienceReward}
                  missionEnergyCost={activeTimerQuest.energyCost}
                  missionAttentionCost={activeTimerQuest.attentionCost}
                  missionTimeCost={activeTimerQuest.timeCost}
                  missionDifficulty={activeTimerQuest.difficulty}
                />
              </div>
            )}
            
            <div className="p-4 lg:p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
      
      <AICompanionPanel />
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
