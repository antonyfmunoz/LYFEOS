import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AICompanionPanel from "../ai/AICompanionPanel";
import { useLYFEOS } from "../../lib/context";
import { useLocation } from "wouter";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { username } = useLYFEOS();
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
        <div className="flex-grow overflow-y-auto">
          {/* Mobile header (visible on mobile only) - sticky */}
          <div className="sticky top-0 z-40 flex items-center justify-center py-4 lg:hidden bg-background/95 backdrop-blur-sm border-b border-primary/20">
            <span className="text-2xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
          </div>
          
          {/* Page content */}
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </div>
        
        {/* AI Companion panel (desktop only) */}
        <AICompanionPanel />
      </div>
      
      {/* Mobile navigation */}
      <MobileNav currentPage={currentPage} />
    </div>
  );
}
