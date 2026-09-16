import { ReactNode, useRef, useEffect, useLayoutEffect } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import MissionTimer from "../dashboard/MissionTimer";
import { useLYFEOS } from "../../lib/context";
import { useLocation } from "wouter";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { displayName, activeTimerQuest, timerStartedAt, timerPausedElapsed, timerIsPaused, isOnBreak, breakStartedAt, breakElapsed, endMissionTimer, pauseResumeTimer } = useLYFEOS();
  const [location, navigate] = useLocation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [location]);

  useLayoutEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (editing || event.altKey || (!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      navigate("/search");
    };
    window.addEventListener("keydown", openSearch);
    document.documentElement.dataset.lyfeosSearchShortcutReady = "true";
    return () => {
      window.removeEventListener("keydown", openSearch);
      delete document.documentElement.dataset.lyfeosSearchShortcutReady;
    };
  }, [navigate]);

  
  const rawPage = location.split('/')[1] || 'dashboard';
  const pageAliases: Record<string, string> = {
    'calendar': 'missions',
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
    <div className="flex flex-col h-[100dvh] bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="flex min-h-0 flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} displayName={displayName} />
        
        <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
          <main id="main-content" ref={scrollContainerRef} tabIndex={-1} className="relative min-h-0 flex-grow overflow-y-auto safe-area-top">
            <div className="bg-background lg:hidden">
              <div className="flex items-center justify-center py-3">
                <span className="text-2xl text-white font-orbitron font-bold">LYFE<span className="text-primary">OS</span></span>
              </div>
            </div>
            {activeTimerQuest && (
              <div className="z-30 flex justify-center px-4 lg:px-6 pt-2 pb-2">
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
          </main>
        </div>
      </div>
      
      <MobileNav currentPage={currentPage} />
    </div>
    
  );
}
