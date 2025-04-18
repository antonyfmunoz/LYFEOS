import { ReactNode, useState, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AICompanionPanel from "../ai/AICompanionPanel";
import { QuickActionMenu } from "../ui/quick-action-menu";
import { useLYFEOS } from "../../lib/context";
import { useLocation } from "wouter";
import { Link } from "wouter";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { username, stats } = useLYFEOS();
  const [location] = useLocation();
  
  // Profile dropdown state and refs
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Extract current page from location
  const currentPage = location.split('/')[1] || 'dashboard';
  
  // Toggle profile dropdown
  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };
  
  // Close dropdown
  const closeDropdown = () => {
    setShowProfileDropdown(false);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showProfileDropdown &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node) &&
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowProfileDropdown(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileDropdown]);
  
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
            <span className="text-2xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
            
            {/* Profile Icon with dropdown */}
            <div className="relative">
              <button 
                ref={buttonRef}
                onClick={toggleProfileDropdown}
                className={`flex items-center justify-center h-10 w-10 rounded-full border border-[#22D3EE]/50 bg-[#001E26]/30 text-primary hover:bg-[#22D3EE]/10 transition backdrop-blur-sm ${showProfileDropdown ? 'ring-1 ring-[#22D3EE]' : ''}`}
                aria-label="Open profile menu"
                aria-expanded={showProfileDropdown}
                aria-haspopup="true"
                style={{ boxShadow: '0 0 8px rgba(34, 211, 238, 0.3)' }}
              >
                <span className="material-icons text-[#22D3EE] text-lg">person</span>
              </button>
              
              {showProfileDropdown && (
                <div 
                  ref={dropdownRef}
                  className="absolute right-0 mt-2 w-64 rounded-md glassmorphic p-2 shadow-lg z-10"
                  style={{ boxShadow: '0 0 15px rgba(34, 211, 238, 0.15)', border: '1px solid rgba(34, 211, 238, 0.3)' }}
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="profile-menu-button"
                >
                  <div className="px-4 py-3 border-b border-primary/20">
                    <div>
                      <p className="text-sm font-orbitron">{username}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="material-icons text-[#22D3EE] text-xs">auto_graph</span>
                        <p className="text-xs text-[#7DAAB2]">Level {stats.experience.level}</p>
                      </div>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-primary/10">
                      <div className="text-xs text-[#7DAAB2] mb-1 flex justify-between">
                        <span>XP: {stats.experience.current}/{stats.experience.max}</span>
                        <span className="text-[#22D3EE]">{Math.round((stats.experience.current / stats.experience.max) * 100)}%</span>
                      </div>
                      <div className="h-1 bg-[#22D3EE]/30 rounded-full">
                        <div 
                          className="h-full bg-[#22D3EE] rounded-full transition-all duration-500" 
                          style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="py-1">
                    <Link 
                      href="/profile"
                      onClick={closeDropdown}
                      className="flex w-full items-center px-4 py-2 text-sm hover:bg-[#22D3EE]/10 rounded-md transition"
                      role="menuitem"
                    >
                      <span className="material-icons text-[#22D3EE] text-sm mr-2">person</span>
                      Profile
                    </Link>
                    <Link 
                      href="/systems"
                      onClick={closeDropdown}
                      className="flex w-full items-center px-4 py-2 text-sm hover:bg-[#22D3EE]/10 rounded-md transition"
                      role="menuitem"
                    >
                      <span className="material-icons text-[#22D3EE] text-sm mr-2">settings</span>
                      Settings
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={closeDropdown} 
                      className="flex w-full items-center px-4 py-2 text-sm hover:bg-[#22D3EE]/10 rounded-md transition"
                      role="menuitem"
                    >
                      <span className="material-icons text-[#22D3EE] text-sm mr-2">logout</span>
                      Logout
                    </Link>
                  </div>
                </div>
              )}
            </div>
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
