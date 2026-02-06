import { ReactNode } from "react";
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
  const { username, activeTimerQuest, timerStartedAt, timerPausedElapsed, timerIsPaused, endMissionTimer, pauseResumeTimer } = useLYFEOS();
  const [location] = useLocation();
  
  const currentPage = location.split('/')[1] || 'dashboard';
  
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} username={username} />
        
        <div className="flex-grow flex flex-col overflow-hidden">
          <div className="shrink-0 lg:hidden bg-background/95 backdrop-blur-sm border-b border-primary/20 z-40">
            <div className="flex items-center justify-center py-4">
              <span className="text-2xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
            </div>
          </div>
          {activeTimerQuest && (
            <div className="shrink-0 lg:hidden px-4 pt-2 pb-2 bg-background/80 backdrop-blur-sm z-30">
              <MissionTimer
                timerStartedAt={timerStartedAt}
                timerPausedElapsed={timerPausedElapsed}
                timerIsPaused={timerIsPaused}
                onEnd={endMissionTimer}
                onPauseResume={pauseResumeTimer}
                missionTitle={activeTimerQuest.title}
              />
            </div>
          )}
          
          {activeTimerQuest && (
            <div className="shrink-0 px-6 pt-2 pb-2 bg-background/50 backdrop-blur-sm z-30 hidden lg:block">
              <MissionTimer
                timerStartedAt={timerStartedAt}
                timerPausedElapsed={timerPausedElapsed}
                timerIsPaused={timerIsPaused}
                onEnd={endMissionTimer}
                onPauseResume={pauseResumeTimer}
                missionTitle={activeTimerQuest.title}
              />
            </div>
          )}
          
          <div className="flex-grow overflow-y-auto p-4 lg:p-6">
            {children}
          </div>
        </div>
        
        <AICompanionPanel />
      </div>
      
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
