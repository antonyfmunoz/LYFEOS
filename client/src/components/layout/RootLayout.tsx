import { ReactNode, useRef, useEffect, useCallback } from "react";
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

  const updateAppHeight = useCallback(() => {
    const vh = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${vh}px`);
  }, []);

  useEffect(() => {
    updateAppHeight();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateAppHeight);
      vv.addEventListener('scroll', updateAppHeight);
    }
    window.addEventListener('resize', updateAppHeight);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateAppHeight);
        vv.removeEventListener('scroll', updateAppHeight);
      }
      window.removeEventListener('resize', updateAppHeight);
    };
  }, [updateAppHeight]);
  
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
    <div className="flex flex-col" style={{ height: 'var(--app-height, 100dvh)' }}>
      <div className="flex flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} username={username} />
        
        <div className="flex-grow flex flex-col overflow-hidden">
          <div ref={scrollContainerRef} className="flex-grow overflow-y-auto relative safe-area-top">
            <div className="bg-background lg:hidden">
              <div className="flex items-center justify-center py-3">
                <span className="text-2xl text-white font-orbitron font-bold">LYFE<span className="text-primary">OS</span></span>
              </div>
            </div>
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
            
            <div className="p-4 lg:p-6 main-content-padding">
              <div className="hidden lg:flex flex-col items-center mb-4">
                <span className="text-2xl text-white font-orbitron font-bold">LYFE<span className="text-primary">OS</span></span>
                <p className="text-muted-foreground text-sm mt-1">Your personal life operating system</p>
              </div>
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
