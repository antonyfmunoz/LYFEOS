import { Link } from "wouter";
import { useState, useEffect } from "react";

interface SidebarProps {
  currentPage: string;
  username: string;
}

export default function Sidebar({ currentPage, username }: SidebarProps) {
  const [animatedItems, setAnimatedItems] = useState<string[]>([]);
  
  // Add staggered animation to nav items on mount
  useEffect(() => {
    const navItems = ["dashboard", "quests", "ai", "codex", "systems"];
    let timer: ReturnType<typeof setTimeout>;
    
    navItems.forEach((item, index) => {
      timer = setTimeout(() => {
        setAnimatedItems(prev => [...prev, item]);
      }, 100 * (index + 1));
    });
    
    return () => clearTimeout(timer);
  }, []);
  
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "quests", icon: "star", label: "Quests" },
    { id: "ai", icon: "smart_toy", label: "AI Companion" },
    { id: "codex", icon: "book", label: "Codex" },
    { id: "systems", icon: "settings", label: "Systems" },
  ];

  return (
    <div className="hidden lg:flex lg:flex-col w-64 border-r border-opacity-20 border-primary p-4 glassmorphic hud-panel">
      {/* App logo */}
      <div className="flex items-center mb-8">
        <span className="text-3xl font-orbitron font-bold text-gradient glow">Life<span className="text-white">OS</span></span>
      </div>

      {/* User profile section */}
      <div className="flex items-center mb-8 glassmorphic rounded-lg p-3 hud-corner">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-primary neon-glow">
          {/* User avatar */}
          <div className="bg-primary/20 w-full h-full flex items-center justify-center">
            <span className="material-icons text-primary">person</span>
          </div>
        </div>
        <div className="ml-3">
          <p className="font-orbitron text-sm text-[#D6F4FF] text-glow">COMMANDER</p>
          <p className="text-[#7DAAB2] text-xs font-rajdhani">{username}</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-grow">
        <ul className="space-y-3">
          {navItems.map((item) => (
            <li 
              key={item.id} 
              className={`transform transition-all duration-500 ${
                animatedItems.includes(item.id) 
                  ? "translate-x-0 opacity-100" 
                  : "translate-x-[-20px] opacity-0"
              }`}
            >
              <Link href={`/${item.id}`}
                className={`flex items-center py-2.5 px-4 rounded-lg transition-all duration-300 relative overflow-hidden
                  ${currentPage === item.id
                    ? "bg-[#001E26] border border-primary/50 neon-border text-primary font-medium shadow-[0_0_8px_rgba(0,224,255,0.4)]"
                    : "hover:bg-[#001E26]/60 text-[#7DAAB2] hover:text-[#D6F4FF] hover:shadow-[0_0_5px_rgba(0,224,255,0.2)]"
                  }`}
              >
                {currentPage === item.id && (
                  <span className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 opacity-30"></span>
                )}
                <span className={`material-icons mr-3 ${currentPage === item.id ? "text-primary" : ""}`}>
                  {item.icon}
                </span>
                <span className="font-rajdhani font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* System status */}
      <div className="mt-6 glassmorphic rounded-lg p-3 hud-corner">
        <div className="flex items-center justify-between">
          <span className="text-[#7DAAB2] text-xs font-rajdhani">SYSTEM STATUS</span>
          <span className="text-xs font-mono text-[#36F1CD] flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#36F1CD] mr-1 pulse"></span>
            ONLINE
          </span>
        </div>
        <div className="text-xs text-[#7DAAB2] mt-2 font-mono flex justify-between">
          <span>v0.9.0-alpha</span>
          <span className="text-primary/70">HUNTER TERMINAL</span>
        </div>
      </div>
    </div>
  );
}
