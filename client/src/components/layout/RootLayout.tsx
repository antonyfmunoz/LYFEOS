import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AICompanionPanel from "../ai/AICompanionPanel";
import { useLifeOS } from "../../lib/context";
import { useLocation } from "wouter";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { username } = useLifeOS();
  const [location] = useLocation();
  
  // Extract current page from location
  const currentPage = location.split('/')[1] || 'dashboard';
  
  return (
    <div className="flex flex-col h-screen">
      {/* Main content area */}
      <div className="flex flex-grow overflow-hidden">
        {/* Desktop sidebar */}
        <Sidebar currentPage={currentPage} username={username} />
        
        {/* Main content */}
        <div className="flex-grow overflow-y-auto p-4 lg:p-6">
          {/* Mobile header (visible on mobile only) */}
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <span className="text-2xl text-primary font-orbitron font-bold">Life<span className="text-white">OS</span></span>
          </div>
          
          {/* Page content */}
          {children}
        </div>
        
        {/* AI Companion panel (desktop only) */}
        <AICompanionPanel />
      </div>
      
      {/* Mobile navigation */}
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
