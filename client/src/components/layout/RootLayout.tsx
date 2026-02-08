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
  const { username, activeTimerQuest, timerStartedAt, timerPausedElapsed, timerIsPaused, isOnBreak, breakStartedAt, breakElapsed, endMissionTimer, pauseResumeTimer } = useLYFEOS();
  const [location] = useLocation();
  
  const currentPage = location.split('/')[1] || 'dashboard';
  
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} username={username} />
        
        <div className="flex-grow flex flex-col overflow-hidden">
          <div className="shrink-0 lg:hidden bg-background border-b border-primary/20 z-40">
            <div className="flex items-center justify-center py-4">
              <span className="text-2xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
            </div>
          </div>
          
          <div className="flex-grow overflow-y-auto relative">
            {activeTimerQuest && (
              <div className="sticky top-0 z-30 lg:hidden flex justify-center px-4 pt-2 pb-2">
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
              <div className="sticky top-0 z-30 flex justify-center px-6 pt-2 pb-2 hidden lg:block">
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
        
        <AICompanionPanel />
      </div>
      
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
