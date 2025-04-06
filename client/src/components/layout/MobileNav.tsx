import { Link } from "wouter";
import { useEffect, useRef } from "react";

interface MobileNavProps {
  currentPage: string;
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Home" },
    { id: "quests", icon: "star", label: "Quests" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "codex", icon: "book", label: "Codex" },
    { id: "systems", icon: "settings", label: "Systems" },
  ];
  
  const indicatorRef = useRef<HTMLDivElement>(null);
  
  // Update the position of the indicator based on the current page
  useEffect(() => {
    if (indicatorRef.current) {
      const index = navItems.findIndex(item => item.id === currentPage);
      const position = index >= 0 ? index * 100 : 0;
      indicatorRef.current.style.transform = `translateX(${position}%)`;
    }
  }, [currentPage, navItems]);

  return (
    <div className="lg:hidden border-t border-primary border-opacity-20 glassmorphic relative">
      <div 
        ref={indicatorRef}
        className="absolute bottom-0 left-0 h-0.5 w-1/5 bg-primary shadow-[0_0_10px_rgba(0,224,255,0.7)] transition-transform duration-300"
      ></div>
      
      <div className="flex justify-around">
        {navItems.map((item) => (
          <Link key={item.id} href={`/${item.id}`}>
            <a className={`flex flex-col items-center py-3 px-4 ${
              currentPage === item.id ? "text-primary" : "text-[#7DAAB2]"
            }`}>
              <span className="material-icons text-sm">{item.icon}</span>
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
