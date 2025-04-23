import { ReactNode, useState, useRef, useEffect } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AICompanionPanel from "../ai/AICompanionPanel";
import { QuickActionMenu } from "../ui/quick-action-menu";
import { useLYFEOS } from "../../lib/context";
import { useAuth } from "../../lib/authContext";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const { username, stats } = useLYFEOS();
  const { user } = useAuth();
  const [location] = useLocation();
  
  // Fetch user profile data
  const { data: profileData } = useQuery({
    queryKey: ["/api/users", user?.id, "profile"],
    queryFn: async () => {
      if (!user?.id) return null;
      const data = await apiRequest(`/api/users/${user.id}/profile`);
      console.log("Profile data in RootLayout:", data);
      return data;
    },
    enabled: !!user?.id,
  });
  
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
    <DndProvider backend={HTML5Backend}>
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
                  className={`flex items-center justify-center h-10 w-10 rounded-full border border-primary/50 bg-background/30 text-primary hover:bg-primary/10 transition backdrop-blur-sm overflow-hidden ${showProfileDropdown ? 'ring-1 ring-primary' : ''}`}
                  aria-label="Open profile menu"
                  aria-expanded={showProfileDropdown}
                  aria-haspopup="true"
                  style={{ boxShadow: 'var(--primary-shadow)' }}
                >
                  {profileData?.profilePicture ? (
                    <img 
                      src={profileData.profilePicture} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: profileData?.avatarColor || "var(--primary)" }}
                    >
                      <span className="material-icons text-background text-lg">person</span>
                    </div>
                  )}
                </button>
                
                {showProfileDropdown && (
                  <div 
                    ref={dropdownRef}
                    className="absolute right-0 mt-2 w-64 rounded-md glassmorphic p-2 shadow-lg z-10"
                    style={{ boxShadow: 'var(--primary-shadow)', border: '1px solid var(--primary-border)' }}
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="profile-menu-button"
                  >
                    <div className="px-4 py-3 border-b border-primary/20">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/50">
                          {profileData?.profilePicture ? (
                            <img 
                              src={profileData.profilePicture} 
                              alt="Profile" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div 
                              className="w-full h-full flex items-center justify-center"
                              style={{ backgroundColor: profileData?.avatarColor || "var(--primary)" }}
                            >
                              <span className="material-icons text-background text-sm">person</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-orbitron">{profileData?.displayName || username}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="material-icons text-primary text-xs">auto_graph</span>
                            <p className="text-xs text-muted-foreground">Level {stats.experience.level}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-2 pt-2 border-t border-primary/10">
                        <div className="text-xs text-muted-foreground mb-1 flex justify-between">
                          <span>XP: {stats.experience.current}/{stats.experience.max}</span>
                          <span className="text-primary">{Math.round((stats.experience.current / stats.experience.max) * 100)}%</span>
                        </div>
                        <div className="h-1 bg-primary/30 rounded-full">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-500" 
                            style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="py-1">
                      <Link 
                        href="/profile"
                        onClick={closeDropdown}
                        className="flex w-full items-center px-4 py-2 text-sm hover:bg-primary/10 rounded-md transition"
                        role="menuitem"
                      >
                        <span className="material-icons text-primary text-sm mr-2">person</span>
                        Profile
                      </Link>

                      <Link
                        href="/dashboard"
                        onClick={closeDropdown} 
                        className="flex w-full items-center px-4 py-2 text-sm hover:bg-primary/10 rounded-md transition"
                        role="menuitem"
                      >
                        <span className="material-icons text-primary text-sm mr-2">logout</span>
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
    </DndProvider>
  );
}
