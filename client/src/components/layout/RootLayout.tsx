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
  const { username, activeTimerQuest, missionElapsedTimes, endMissionTimer } = useLYFEOS();
  const [location] = useLocation();
  
  const currentPage = location.split('/')[1] || 'dashboard';
  
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-grow overflow-hidden">
        <Sidebar currentPage={currentPage} username={username} />
        
        <div className="flex-grow overflow-y-auto">
          <div className="sticky top-0 z-40 flex items-center justify-center py-4 lg:hidden bg-background/95 backdrop-blur-sm border-b border-primary/20">
            <span className="text-2xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
          </div>
          
          {activeTimerQuest && (
            <div className="sticky top-[57px] lg:top-0 z-30 px-4 lg:px-6 pt-2 pb-2 bg-background/50 backdrop-blur-sm">
              <MissionTimer
                initialSeconds={missionElapsedTimes[activeTimerQuest.id] || 0}
                onEnd={endMissionTimer}
                missionTitle={activeTimerQuest.title}
              />
            </div>
          )}
          
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </div>
        
        <AICompanionPanel />
      </div>
      
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
